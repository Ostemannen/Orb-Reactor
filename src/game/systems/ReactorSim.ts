import { BOARD, PHYSICS, RULES, stageValueScale } from '../config/balance';
import type { Orb, OrbKind, Peg, StageProgress, StageSetup, StageTally } from '../entities/types';
import { emptyTally } from '../entities/types';
import { PEG_DEFS } from '../../data/pegs';
import { MODIFIER_MAP, type ModifierDef } from '../../data/modifiers';
import type { Mods } from '../../data/upgrades';
import { Rng, mixSeed } from '../utils/rng';

export type HitVia = 'orb' | 'bomb' | 'chain';

export type SimEvent =
  | { t: 'hit'; peg: Peg; energy: number; score: number; combo: number; via: HitVia; x: number; y: number }
  | { t: 'crack'; peg: Peg }
  | { t: 'reactorHit'; peg: Peg }
  | { t: 'reactorActivate'; peg: Peg; energy: number; rearmed: boolean }
  | { t: 'mult'; peg: Peg; mult: number }
  | { t: 'split'; peg: Peg; count: number }
  | { t: 'bomb'; x: number; y: number; radius: number }
  | { t: 'chain'; from: Peg; to: Peg }
  | { t: 'portal'; from: Peg; to: Peg }
  | { t: 'boost'; peg: Peg }
  | { t: 'wall'; x: number; y: number }
  | { t: 'credits'; amount: number; x: number; y: number; reason: string }
  | { t: 'bonusEnergy'; amount: number; reason: string }
  | { t: 'orbExit'; orb: Orb }
  | { t: 'orbFizzle'; orb: Orb }
  | { t: 'nudge'; orb: Orb }
  | { t: 'pegRemoved'; peg: Peg; order: number }
  | { t: 'launch'; orb: Orb };

export interface SimOptions {
  mods: Mods;
  practice?: boolean;
}

interface PendingBomb { x: number; y: number; radius: number; t: number; value: number; second: boolean }
interface PendingChain { peg: Peg; t: number; value: number; from: Peg }

/**
 * Deterministic reactor-chamber simulation: physics, peg rules, combo and
 * stage resources. It has no rendering dependencies so it can also run
 * headless for balance testing.
 */
export class ReactorSim {
  readonly setup: StageSetup;
  readonly mods: Mods;
  readonly practice: boolean;
  readonly pegs: Peg[] = [];
  readonly pegById = new Map<number, Peg>();
  orbs: Orb[] = [];
  events: SimEvent[] = [];

  time = 0;
  shotTime = 0;
  inShot = false;

  energy = 0;
  score = 0;
  credits = 0;
  shotsLeft: number;
  shotsFired = 0;
  shotEnergy = 0;

  combo = 0;
  comboTimer = 0;
  multBonus = 0;
  hitsThisShot = 0;
  carryCombo = 0;
  emergencyUsed = false;
  tally: StageTally = emptyTally();
  shotTally: StageTally = emptyTally();

  private firstSplitDone = false;
  private comboCreditCounter = 0;
  private pendingBombs: PendingBomb[] = [];
  private pendingChains: PendingChain[] = [];
  private rng: Rng;
  private nextOrbId = 1;
  private accumulator = 0;

  // Derived constants
  readonly gravity: number;
  readonly restitution: number;
  readonly orbRadius: number;
  readonly launchSpeed: number;
  readonly valueScale: number;
  readonly chargedMul: number;
  readonly bombRadius: number;
  readonly comboStep: number;
  readonly creditMul: number;
  readonly shieldMul: number;
  readonly echoSplit: boolean;
  readonly fragileMult: boolean;
  readonly reactorHits: number;
  readonly modifierDefs: ModifierDef[];

  constructor(setup: StageSetup, opts: SimOptions, reactorHits: number, progress?: StageProgress) {
    this.setup = setup;
    this.mods = opts.mods;
    this.practice = !!opts.practice;
    const m = this.mods;
    this.modifierDefs = setup.modifiers.map((id) => MODIFIER_MAP[id]).filter(Boolean);
    const modProduct = (key: keyof ModifierDef) =>
      this.modifierDefs.reduce((acc, d) => acc * ((d[key] as number | undefined) ?? 1), 1);

    this.gravity = PHYSICS.gravity * Math.max(0.5, m.gravity) * modProduct('gravityMul');
    this.restitution = Math.min(0.92, PHYSICS.pegRestitution + m.orbBounce);
    this.orbRadius = PHYSICS.orbRadius * m.orbSize;
    this.launchSpeed = PHYSICS.launchSpeed * m.orbSpeed;
    this.valueScale = stageValueScale(setup.stage);
    this.chargedMul = m.chargedMul * modProduct('chargedMul');
    this.bombRadius = RULES.bombRadius * m.bombRadius * modProduct('bombRadiusMul');
    this.comboStep = m.comboStep * modProduct('comboStepMul');
    this.creditMul = m.creditMul * modProduct('creditMul');
    this.shieldMul = modProduct('shieldMul');
    this.echoSplit = this.modifierDefs.some((d) => d.echoSplit);
    this.fragileMult = this.modifierDefs.some((d) => d.fragileMult);
    this.reactorHits = Math.max(1, reactorHits - m.reactorHitsLess);

    for (const spec of setup.pegs) {
      const def = PEG_DEFS[spec.type];
      const maxHp = spec.type === 'reactor' ? this.reactorHits : def.hits;
      const peg: Peg = {
        id: spec.id, type: spec.type, x: spec.x, y: spec.y, baseX: spec.x, baseY: spec.y, vx: 0, vy: 0,
        r: def.radius, motion: spec.motion, pair: spec.pair, state: 'idle', hp: maxHp, maxHp,
        activationsLeft: spec.type === 'reactor' ? m.reactorBonus : 0, touchedThisShot: false, cooldown: 0,
      };
      this.pegs.push(peg);
      this.pegById.set(peg.id, peg);
    }
    this.shotsLeft = setup.shots;
    this.rng = new Rng(setup.seed);

    if (progress) {
      this.energy = progress.energy;
      this.score = progress.score;
      this.credits = progress.credits;
      this.shotsLeft = progress.shotsLeft;
      this.shotsFired = progress.shotsFired;
      this.carryCombo = progress.carryCombo;
      this.emergencyUsed = progress.emergencyUsed;
      this.tally = { ...progress.tally };
      for (const p of progress.pegs) {
        const peg = this.pegById.get(p.id);
        if (!peg) continue;
        peg.state = p.state === 'lit' ? 'idle' : p.state === 'spent' ? 'gone' : p.state;
        peg.hp = p.hp;
        peg.activationsLeft = p.activationsLeft;
      }
    }
    this.updatePegMotion(0);
  }

  // ── Public API ──────────────────────────────────────────────────────────

  get multiplier(): number {
    return 1 + this.combo * this.comboStep + this.multBonus;
  }

  get target(): number {
    return this.setup.target;
  }

  canLaunch(): boolean {
    return !this.inShot && this.shotsLeft > 0;
  }

  /** Launch a shot. `angle` is measured from straight down, positive = right. */
  launch(angle: number): boolean {
    if (!this.canLaunch()) return false;
    const a = clampAngle(angle);
    if (!this.practice && this.shotsLeft === 1 && this.energy < this.target && this.mods.emergency > 0 && !this.emergencyUsed) {
      const bonus = Math.round(this.target * this.mods.emergency);
      this.energy += bonus;
      this.emergencyUsed = true;
      this.events.push({ t: 'bonusEnergy', amount: bonus, reason: 'Emergency Charge' });
    }
    if (!this.practice) this.shotsLeft--;
    this.shotsFired++;
    this.inShot = true;
    this.shotTime = 0;
    this.shotEnergy = 0;
    this.combo = this.mods.startCombo + this.carryCombo;
    this.carryCombo = 0;
    this.comboTimer = this.mods.comboWindow;
    this.multBonus = 0;
    this.hitsThisShot = 0;
    this.firstSplitDone = false;
    this.comboCreditCounter = 0;
    this.shotTally = emptyTally();
    this.rng = new Rng(mixSeed(this.setup.seed, this.shotsFired));
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const orb = this.spawnOrb('main', BOARD.launcherX + dx * 30, BOARD.launcherY + dy * 30, dx * this.launchSpeed, dy * this.launchSpeed, 1, 0);
    this.events.push({ t: 'launch', orb });
    return true;
  }

  /** Advance real time; runs fixed sub-steps. */
  update(frameDt: number, timeScale = 1): void {
    this.accumulator += Math.min(frameDt, 0.05) * timeScale;
    let steps = 0;
    while (this.accumulator >= PHYSICS.dt && steps < 40) {
      this.step(PHYSICS.dt);
      this.accumulator -= PHYSICS.dt;
      steps++;
    }
    if (steps >= 40) this.accumulator = 0;
  }

  shotResolved(): boolean {
    return this.inShot && this.orbs.length === 0 && this.pendingBombs.length === 0 && this.pendingChains.length === 0;
  }

  /** Finish the current shot: clear spent pegs and reset shot-level state. */
  endShot(): { shotEnergy: number; tally: StageTally } {
    this.carryCombo = Math.floor(this.combo * this.mods.comboKeep);
    let order = 0;
    // Clear in top-to-bottom order for a satisfying sweep.
    const sorted = [...this.pegs].sort((a, b) => a.y - b.y);
    for (const p of sorted) {
      p.touchedThisShot = false;
      if (p.state === 'spent') {
        p.state = 'gone';
        this.events.push({ t: 'pegRemoved', peg: p, order: order++ });
      } else if (p.state === 'lit') {
        p.state = 'idle';
      }
    }
    this.inShot = false;
    const result = { shotEnergy: this.shotEnergy, tally: this.shotTally };
    this.combo = 0;
    this.multBonus = 0;
    return result;
  }

  snapshot(): StageProgress {
    return {
      energy: this.energy, score: this.score, credits: this.credits, shotsLeft: this.shotsLeft,
      shotsFired: this.shotsFired, carryCombo: this.carryCombo, emergencyUsed: this.emergencyUsed,
      tally: { ...this.tally },
      pegs: this.pegs
        .filter((p) => p.state !== 'idle' || p.hp !== p.maxHp || (p.type === 'reactor' && p.activationsLeft !== this.mods.reactorBonus))
        .map((p) => ({ id: p.id, state: p.state, hp: p.hp, activationsLeft: p.activationsLeft })),
    };
  }

  /** Add credits with all multipliers applied. */
  addCredits(base: number, x: number, y: number, reason: string): number {
    if (this.practice || base <= 0) return 0;
    const amount = Math.max(1, Math.round(base * this.creditMul));
    this.credits += amount;
    this.events.push({ t: 'credits', amount, x, y, reason });
    return amount;
  }

  /**
   * Predict the aim path for the guide. Stops at the first peg contact, or
   * continues through one bounce when the Trajectory Scope upgrade is owned.
   */
  predict(angle: number, extended: boolean): { points: { x: number; y: number }[]; hit?: { x: number; y: number } } {
    const a = clampAngle(angle);
    const r = this.orbRadius;
    let x = BOARD.launcherX + Math.sin(a) * 30;
    let y = BOARD.launcherY + Math.cos(a) * 30;
    let vx = Math.sin(a) * this.launchSpeed;
    let vy = Math.cos(a) * this.launchSpeed;
    const pts = [{ x, y }];
    const dt = 1 / 120;
    let bounces = 0;
    let hit: { x: number; y: number } | undefined;
    const maxT = extended ? 1.6 : 1.1;
    for (let t = 0; t < maxT; t += dt) {
      vy += this.gravity * dt;
      x += vx * dt;
      y += vy * dt;
      if (x < r) { x = r; vx = -vx * PHYSICS.wallRestitution; }
      if (x > BOARD.width - r) { x = BOARD.width - r; vx = -vx * PHYSICS.wallRestitution; }
      if (y > BOARD.height) break;
      let collided = false;
      for (const p of this.pegs) {
        if (p.state === 'gone' || !PEG_DEFS[p.type].solid) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < r + p.r) {
          const nx = dx / (d || 1);
          const ny = dy / (d || 1);
          x = p.x + nx * (r + p.r);
          y = p.y + ny * (r + p.r);
          const vn = vx * nx + vy * ny;
          if (vn < 0) {
            vx -= (1 + this.restitution) * vn * nx;
            vy -= (1 + this.restitution) * vn * ny;
          }
          collided = true;
          if (!hit) hit = { x, y };
          break;
        }
      }
      if (Math.floor(t / dt) % 2 === 0) pts.push({ x, y });
      if (collided) {
        bounces++;
        pts.push({ x, y });
        if (!extended || bounces >= 2) break;
      }
    }
    return { points: pts, hit };
  }

  // ── Simulation ──────────────────────────────────────────────────────────

  private spawnOrb(kind: OrbKind, x: number, y: number, vx: number, vy: number, value: number, gen: number): Orb {
    const scale = kind === 'main' ? 1 : kind === 'mini' ? PHYSICS.miniScale : PHYSICS.sparkScale;
    const lifetime =
      kind === 'spark' ? PHYSICS.sparkLifetime + this.mods.miniLifetime
      : kind === 'mini' ? Math.max(6, this.mods.lifetime * 0.6) + this.mods.miniLifetime
      : this.mods.lifetime;
    const orb: Orb = {
      id: this.nextOrbId++, kind, x, y, vx, vy, r: this.orbRadius * scale, value, gen, age: 0, lifetime,
      stall: 0, nudges: 0, portalCd: 0, ghostUntil: 0, alive: true, cds: new Map(),
    };
    this.orbs.push(orb);
    if (this.orbs.length > this.shotTally.maxOrbs) this.shotTally.maxOrbs = this.orbs.length;
    if (this.orbs.length > this.tally.maxOrbs) this.tally.maxOrbs = this.orbs.length;
    return orb;
  }

  private updatePegMotion(dt: number): void {
    for (const p of this.pegs) {
      const mo = p.motion;
      if (!mo || p.state === 'gone') continue;
      const px = p.x;
      const py = p.y;
      if (mo.kind === 'orbit') {
        const a = mo.phase + this.time * mo.speed;
        p.x = mo.cx + Math.cos(a) * mo.radius;
        p.y = mo.cy + Math.sin(a) * mo.radius;
      } else {
        const off = Math.sin(this.time * mo.speed + mo.phase) * mo.amp;
        if (mo.axis === 'x') p.x = p.baseX + off;
        else p.y = p.baseY + off;
      }
      if (dt > 0) {
        p.vx = (p.x - px) / dt;
        p.vy = (p.y - py) / dt;
      }
    }
  }

  step(dt: number): void {
    this.time += dt;
    this.updatePegMotion(dt);
    for (const p of this.pegs) if (p.cooldown > 0) p.cooldown -= dt;

    if (this.inShot) {
      this.shotTime += dt;
      if (this.combo > 0) {
        this.comboTimer -= dt;
        if (this.comboTimer <= 0) {
          this.combo = Math.floor(this.combo * Math.min(0.9, this.mods.comboDecayKeep));
          this.comboTimer = this.mods.comboWindow;
        }
      }
    }

    for (const orb of this.orbs) this.stepOrb(orb, dt);
    if (this.orbs.some((o) => !o.alive)) this.orbs = this.orbs.filter((o) => o.alive);

    for (const b of this.pendingBombs) {
      b.t -= dt;
      if (b.t <= 0) this.explode(b);
    }
    this.pendingBombs = this.pendingBombs.filter((b) => b.t > 0);
    for (const c of this.pendingChains) {
      c.t -= dt;
      if (c.t <= 0 && (c.peg.state === 'idle')) {
        this.events.push({ t: 'chain', from: c.from, to: c.peg });
        this.trigger(c.peg, null, 'chain', c.value);
      }
    }
    this.pendingChains = this.pendingChains.filter((c) => c.t > 0);
  }

  private stepOrb(o: Orb, dt: number): void {
    const m = this.mods;
    o.age += dt;
    if (o.portalCd > 0) o.portalCd -= dt;
    for (const [k, v] of o.cds) {
      if (v - dt <= 0) o.cds.delete(k);
      else o.cds.set(k, v - dt);
    }

    o.vy += this.gravity * dt;
    if (m.magnet > 0) {
      const range = 170;
      for (const p of this.pegs) {
        if (p.state !== 'idle' || (p.type !== 'charged' && p.type !== 'reactor')) continue;
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const d = Math.hypot(dx, dy);
        if (d < range && d > 1) {
          const a = 300 * m.magnet * (1 - d / range);
          o.vx += (dx / d) * a * dt;
          o.vy += (dy / d) * a * dt;
        }
      }
    }
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > PHYSICS.maxSpeed) {
      o.vx *= PHYSICS.maxSpeed / sp;
      o.vy *= PHYSICS.maxSpeed / sp;
    }
    o.x += o.vx * dt;
    o.y += o.vy * dt;

    // Walls
    let wallHit = false;
    if (o.x < o.r) { o.x = o.r; o.vx = Math.abs(o.vx) * PHYSICS.wallRestitution; wallHit = true; }
    else if (o.x > BOARD.width - o.r) { o.x = BOARD.width - o.r; o.vx = -Math.abs(o.vx) * PHYSICS.wallRestitution; wallHit = true; }
    if (o.y < o.r) { o.y = o.r; o.vy = Math.abs(o.vy) * PHYSICS.wallRestitution; wallHit = true; }
    if (wallHit && m.wallCombo > 0 && !o.cds.has(-1) && this.inShot) {
      o.cds.set(-1, 0.15);
      this.combo += m.wallCombo;
      this.comboTimer = m.comboWindow;
      this.events.push({ t: 'wall', x: o.x, y: o.y });
    }

    // Pegs
    for (const p of this.pegs) {
      if (p.state === 'gone') continue;
      const dx = o.x - p.x;
      const dy = o.y - p.y;
      const rr = o.r + p.r;
      if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
      const d = Math.hypot(dx, dy);
      if (p.type === 'portal') {
        if (d < p.r * 0.85 && o.portalCd <= 0) this.teleport(o, p);
        continue;
      }
      if (d >= rr || o.age < o.ghostUntil) continue;
      const nx = d > 0.0001 ? dx / d : 0;
      const ny = d > 0.0001 ? dy / d : -1;
      o.x = p.x + nx * rr;
      o.y = p.y + ny * rr;
      const rvx = o.vx - p.vx;
      const rvy = o.vy - p.vy;
      const vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = p.type === 'booster' ? PHYSICS.boosterRestitution : this.restitution;
        o.vx -= (1 + e) * vn * nx;
        o.vy -= (1 + e) * vn * ny;
        if (p.type === 'booster') {
          const s = Math.hypot(o.vx, o.vy);
          if (s < PHYSICS.boosterMinSpeed) {
            const k = PHYSICS.boosterMinSpeed / Math.max(1, s);
            o.vx *= k;
            o.vy *= k;
          }
        }
      }
      if (!o.cds.has(p.id)) {
        o.cds.set(p.id, 0.1);
        this.trigger(p, o, 'orb', o.value);
      }
    }

    // Exit / lifetime
    if (o.y > BOARD.height + o.r * 2) {
      o.alive = false;
      this.events.push({ t: 'orbExit', orb: o });
      return;
    }
    if (o.age > o.lifetime) {
      o.alive = false;
      this.events.push({ t: 'orbFizzle', orb: o });
      return;
    }

    // Stall safety
    const speed = Math.hypot(o.vx, o.vy);
    if (speed < PHYSICS.stallSpeed) o.stall += dt;
    else o.stall = Math.max(0, o.stall - dt * 2);
    if (o.stall > PHYSICS.stallTime) {
      o.stall = 0;
      o.nudges++;
      const dir = this.rng.next() < 0.5 ? -1 : 1;
      o.vx += dir * PHYSICS.stallNudge * (0.6 + this.rng.next() * 0.6);
      o.vy -= 60;
      this.events.push({ t: 'nudge', orb: o });
      if (o.nudges >= 3) {
        // Clear spent pegs the orb is wedged against.
        for (const p of this.pegs) {
          if (p.state === 'gone' || p.type === 'reactor') continue;
          if (Math.hypot(o.x - p.x, o.y - p.y) < o.r + p.r + 4) {
            if (p.state === 'idle') this.trigger(p, o, 'orb', o.value);
            if (!PEG_DEFS[p.type].persistent || p.type === 'booster' || p.type === 'multiplier') {
              p.state = 'gone';
              this.events.push({ t: 'pegRemoved', peg: p, order: 0 });
            }
          }
        }
      }
      if (o.nudges >= 5) o.ghostUntil = o.age + 0.4;
    }
  }

  private teleport(o: Orb, p: Peg): void {
    const out = p.pair !== undefined ? this.pegById.get(p.pair) : undefined;
    if (!out || out.state === 'gone') return;
    const sp = Math.max(1, Math.hypot(o.vx, o.vy));
    o.x = out.x + (o.vx / sp) * 4;
    o.y = out.y + (o.vy / sp) * 4;
    o.portalCd = 0.5;
    this.events.push({ t: 'portal', from: p, to: out });
    this.tally.teleports++;
    this.shotTally.teleports++;
    if (!p.touchedThisShot) {
      p.touchedThisShot = true;
      this.award(p, PEG_DEFS.portal.energy, PEG_DEFS.portal.score, o.value, 'orb');
    } else {
      this.bumpCombo(1);
    }
  }

  private bumpCombo(n: number): void {
    if (!this.inShot) return;
    this.combo += n;
    this.comboTimer = this.mods.comboWindow;
    if (this.combo > this.tally.bestCombo) this.tally.bestCombo = this.combo;
    if (this.combo > this.shotTally.bestCombo) this.shotTally.bestCombo = this.combo;
  }

  /** Core scoring for an energy-generating hit. */
  private award(p: Peg, baseEnergy: number, baseScore: number, value: number, via: HitVia, comboGain = 1): number {
    const m = this.mods;
    this.bumpCombo(comboGain);
    this.hitsThisShot++;
    const mult = this.multiplier;
    if (mult > this.tally.bestMult) this.tally.bestMult = mult;
    if (mult > this.shotTally.bestMult) this.shotTally.bestMult = mult;
    let e = baseEnergy * this.valueScale * value * mult * m.energyMul;
    if (via === 'bomb') e *= m.bombEnergy;
    if (this.hitsThisShot <= 5 && m.firstHitsBonus > 0) e += m.firstHitsBonus * this.valueScale * value;
    let s = baseScore * mult * value * m.scoreMul * this.valueScale;
    if (this.combo >= 5) s *= 1 + m.overdriveScore;
    this.energy += e;
    this.shotEnergy += e;
    this.score += Math.round(s);
    this.tally.pegsHit++;
    this.shotTally.pegsHit++;
    if (m.comboCredits > 0 && this.combo >= 8) {
      this.comboCreditCounter++;
      if (this.comboCreditCounter % 4 === 0) this.addCredits(m.comboCredits, p.x, p.y, 'Jackpot');
    }
    this.events.push({ t: 'hit', peg: p, energy: e, score: s, combo: this.combo, via, x: p.x, y: p.y });
    return e;
  }

  /** Trigger a peg from an orb contact, an explosion or a chain arc. */
  private trigger(p: Peg, o: Orb | null, via: HitVia, value: number): void {
    const def = PEG_DEFS[p.type];
    const m = this.mods;
    switch (p.type) {
      case 'standard':
      case 'charged': {
        if (p.state !== 'idle') return;
        p.state = 'spent';
        const base = p.type === 'standard' ? def.energy + m.standardEnergy : def.energy * this.chargedMul;
        this.award(p, base, def.score, value, via);
        if (p.type === 'standard' && m.chainChance > 0 && this.rng.chance(Math.min(0.9, m.chainChance))) {
          const target = this.nearestIdle(p, RULES.chainRadius);
          if (target) this.pendingChains.push({ peg: target, t: 0.08, value, from: p });
        }
        return;
      }
      case 'multiplier': {
        if (p.state === 'spent' || p.state === 'gone' || p.cooldown > 0) return;
        p.cooldown = 0.3;
        const full = !o || o.kind === 'main' || m.miniFull > 0;
        const add = m.multPegBonus * (full ? 1 : 0.5);
        this.multBonus += add;
        this.award(p, p.touchedThisShot ? 0 : def.energy, def.score, value, via);
        p.touchedThisShot = true;
        p.state = this.fragileMult ? 'spent' : 'lit';
        this.events.push({ t: 'mult', peg: p, mult: this.multiplier });
        return;
      }
      case 'split': {
        if (p.state !== 'idle') return;
        p.state = 'spent';
        this.award(p, def.energy, def.score, value, via);
        this.doSplit(p, o, value);
        return;
      }
      case 'bomb': {
        if (p.state !== 'idle') return;
        p.state = 'spent';
        this.award(p, def.energy, def.score, value, via);
        this.tally.bombs++;
        this.shotTally.bombs++;
        this.pendingBombs.push({ x: p.x, y: p.y, radius: this.bombRadius, t: 0.12, value, second: false });
        if (m.aftershock > 0) this.pendingBombs.push({ x: p.x, y: p.y, radius: this.bombRadius * 0.6, t: 0.5, value, second: true });
        return;
      }
      case 'booster': {
        if (via !== 'orb' || p.cooldown > 0) return;
        p.cooldown = 0.2;
        this.award(p, def.energy, def.score, value, via);
        this.events.push({ t: 'boost', peg: p });
        return;
      }
      case 'portal':
        return;
      case 'reactor': {
        if (p.state !== 'idle' || p.cooldown > 0) return;
        p.cooldown = 0.16;
        p.hp--;
        this.award(p, def.energy, def.score, value, via);
        if (p.hp > 0) {
          this.events.push({ t: 'reactorHit', peg: p });
          return;
        }
        const big = REACTOR_ENERGY * m.reactorMul * this.valueScale * Math.max(0.75, value) * this.multiplier * m.energyMul;
        this.energy += big;
        this.shotEnergy += big;
        this.score += Math.round(500 * this.valueScale * m.scoreMul * this.multiplier);
        this.tally.reactors++;
        this.shotTally.reactors++;
        this.bumpCombo(3);
        const rearm = p.activationsLeft > 0;
        if (rearm) {
          p.activationsLeft--;
          p.hp = p.maxHp;
        } else {
          p.state = 'spent';
        }
        this.events.push({ t: 'reactorActivate', peg: p, energy: big, rearmed: rearm });
        return;
      }
      case 'converter': {
        if (p.state !== 'idle') return;
        p.state = 'spent';
        this.award(p, def.energy, def.score, value, via);
        this.addCredits(Math.max(1, this.combo * m.converterRate), p.x, p.y, 'Converter');
        if (m.converterEnergy > 0) {
          const e = this.combo * m.converterEnergy * this.valueScale * m.energyMul;
          this.energy += e;
          this.shotEnergy += e;
          this.events.push({ t: 'hit', peg: p, energy: e, score: 0, combo: this.combo, via, x: p.x, y: p.y - 18 });
        }
        return;
      }
      case 'shield': {
        if (p.state !== 'idle' || p.cooldown > 0) return;
        p.cooldown = 0.12;
        if (p.hp > 1 && m.shieldBreaker <= 0) {
          p.hp--;
          this.award(p, 1, 10, value, via);
          this.events.push({ t: 'crack', peg: p });
          return;
        }
        p.hp = 0;
        p.state = 'spent';
        this.award(p, def.energy * this.shieldMul * (m.shieldBreaker > 0 ? 1.5 : 1), def.score, value, via);
        return;
      }
    }
  }

  private nearestIdle(from: Peg, radius: number): Peg | undefined {
    let best: Peg | undefined;
    let bestD = radius;
    for (const p of this.pegs) {
      if (p === from || p.state !== 'idle' || PEG_DEFS[p.type].persistent) continue;
      if (this.pendingChains.some((c) => c.peg === p)) continue;
      const d = Math.hypot(p.x - from.x, p.y - from.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  private doSplit(p: Peg, o: Orb | null, value: number): void {
    const m = this.mods;
    const echo = this.echoSplit && !this.firstSplitDone;
    const spark = !this.firstSplitDone ? m.sparkOnSplit : 0;
    this.firstSplitDone = true;
    const childValue = value * m.splitValue;
    let created = 0;
    if (o && o.gen < RULES.maxSplitGen) {
      const extra = Math.min(m.splitCount - 1 + (echo ? 1 : 0), m.maxOrbs - this.orbs.length);
      if (extra > 0) {
        const sp = Math.max(260, Math.hypot(o.vx, o.vy));
        const base = Math.atan2(o.vy, o.vx);
        o.kind = 'mini';
        o.r = this.orbRadius * PHYSICS.miniScale;
        o.value = childValue;
        o.gen++;
        o.lifetime = Math.max(o.lifetime, o.age + Math.max(6, m.lifetime * 0.6) + m.miniLifetime);
        const offsets = [-0.32, 0.32, -0.62, 0.62];
        o.vx = Math.cos(base + offsets[0]) * sp;
        o.vy = Math.sin(base + offsets[0]) * sp;
        for (let i = 0; i < extra; i++) {
          const a = base + offsets[(i + 1) % offsets.length];
          const c = this.spawnOrb('mini', o.x, o.y, Math.cos(a) * sp, Math.sin(a) * sp, childValue, o.gen);
          c.cds = new Map(o.cds);
          created++;
        }
      }
    } else if (!o && this.orbs.length < m.maxOrbs) {
      // Split peg set off by an explosion or arc: drop a mini orb from it.
      this.spawnOrb('mini', p.x, p.y + p.r + 8, (this.rng.next() - 0.5) * 160, 120, childValue, 1);
      created++;
    }
    for (let i = 0; i < spark && this.orbs.length < m.maxOrbs + 2; i++) {
      const a = -Math.PI / 2 + (this.rng.next() - 0.5) * 1.6;
      this.spawnOrb('spark', p.x, p.y, Math.cos(a) * 420, Math.sin(a) * 420, Math.max(0.3, value * 0.45), RULES.maxSplitGen);
      created++;
    }
    if (created > 0) {
      this.tally.splits += created;
      this.shotTally.splits += created;
      this.events.push({ t: 'split', peg: p, count: created });
    }
  }

  private explode(b: PendingBomb): void {
    this.events.push({ t: 'bomb', x: b.x, y: b.y, radius: b.radius });
    for (const p of this.pegs) {
      if (p.state !== 'idle' || p.type === 'portal' || p.type === 'booster') continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d - p.r < b.radius && d > 0.5) this.trigger(p, null, 'bomb', b.value);
    }
    const push = b.second ? 220 : 360;
    for (const o of this.orbs) {
      const dx = o.x - b.x;
      const dy = o.y - b.y;
      const d = Math.hypot(dx, dy);
      if (d < b.radius && d > 0.5) {
        const k = push * (1 - d / b.radius);
        o.vx += (dx / d) * k;
        o.vy += (dy / d) * k;
      }
    }
  }
}

/** Base energy of a reactor node activation. */
export const REACTOR_ENERGY = 30;

export function clampAngle(a: number): number {
  return Math.max(-PHYSICS.maxAimFromDown, Math.min(PHYSICS.maxAimFromDown, a));
}
