import Phaser from 'phaser';
import { BOARD, PHYSICS } from '../config/balance';
import type { Peg, StageProgress, StageSetup } from '../entities/types';
import { ReactorSim, clampAngle, type SimEvent } from '../systems/ReactorSim';
import { generatePracticeStage, generateStage } from '../systems/BoardGenerator';
import { PEG_DEFS } from '../../data/pegs';
import type { CosmeticDef } from '../../data/cosmetics';
import { computeMods, type Mods } from '../../data/upgrades';
import type { AudioSystem } from '../systems/AudioSystem';
import { TEX, createTextures, pegTextureKey } from './textures';
import { randomSeed } from '../utils/rng';
import { stageConfig } from '../../data/stages';

export interface VisualConfig {
  orb: CosmeticDef;
  trail: CosmeticDef;
  theme: CosmeticDef;
  background: CosmeticDef;
  hit: CosmeticDef;
  shake: boolean;
  reducedFx: boolean;
  numbers: boolean;
  autoFast: boolean;
}

export interface HudState {
  energy: number;
  target: number;
  score: number;
  credits: number;
  combo: number;
  mult: number;
  shotsLeft: number;
  shotsTotal: number;
  inShot: boolean;
  canLaunch: boolean;
  fast: boolean;
  shotTime: number;
}

export interface BoardHost {
  audio: AudioSystem;
  visuals(): VisualConfig;
  hud(state: HudState): void;
  onLaunch(): void;
  onShotResolved(): void;
  onSimEvents?(events: SimEvent[]): void;
}

type SceneMode = 'idle' | 'attract' | 'play' | 'practice';

interface PegView {
  peg: Peg;
  glow: Phaser.GameObjects.Image;
  body: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Graphics;
  scale: number;
  flash: number;
  removing: boolean;
}

interface OrbView {
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  ring?: Phaser.GameObjects.Image;
  trail: { x: number; y: number }[];
  lx: number;
  ly: number;
}

const PRISM = [0xff4f6d, 0xffc43d, 0x4dff9a, 0x3db8ff, 0xb65cff];

export class BoardScene extends Phaser.Scene {
  sim?: ReactorSim;
  mode: SceneMode = 'idle';
  private host!: BoardHost;
  private zoom = 1;
  private pegViews = new Map<number, PegView>();
  private orbViews = new Map<number, OrbView>();
  private bgG!: Phaser.GameObjects.Graphics;
  private trailG!: Phaser.GameObjects.Graphics;
  private aimG!: Phaser.GameObjects.Graphics;
  private fxG!: Phaser.GameObjects.Graphics;
  private launcherBarrel!: Phaser.GameObjects.Image;
  private launcherCore!: Phaser.GameObjects.Image;
  private flashRect!: Phaser.GameObjects.Rectangle;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private shards!: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkTint = 0xffffff;
  private texts: Phaser.GameObjects.Text[] = [];
  private textCursor = 0;
  private aimAngle = 0;
  private aiming = false;
  private inputEnabled = false;
  private fast = false;
  private resolving = false;
  private attractTimer = 0;
  private keys?: Record<string, Phaser.Input.Keyboard.Key>;
  private visuals!: VisualConfig;
  private lastPredictKey = '';
  private predicted: { points: { x: number; y: number }[]; hit?: { x: number; y: number } } = { points: [] };
  private initialPegCount = 0;
  private ready = false;
  private pendingStart?: () => void;

  constructor() {
    super('board');
  }

  init(): void {
    this.host = this.registry.get('host') as BoardHost;
    this.zoom = (this.registry.get('zoom') as number) ?? 1;
  }

  create(): void {
    createTextures(this);
    const cam = this.cameras.main;
    cam.setZoom(this.zoom);
    cam.centerOn(BOARD.width / 2, BOARD.height / 2);

    this.bgG = this.add.graphics().setDepth(0);
    this.trailG = this.add.graphics().setDepth(4).setBlendMode(Phaser.BlendModes.ADD);
    this.fxG = this.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    this.aimG = this.add.graphics().setDepth(8);

    this.add.image(BOARD.launcherX, BOARD.launcherY - 6, 'launcher_base').setScale(0.5).setDepth(9);
    this.launcherBarrel = this.add.image(BOARD.launcherX, BOARD.launcherY, 'launcher_barrel').setOrigin(0.5, 0.18).setScale(0.5).setDepth(10);
    this.launcherCore = this.add.image(BOARD.launcherX, BOARD.launcherY, 'glow').setScale(0.55).setDepth(11).setBlendMode(Phaser.BlendModes.ADD);

    this.flashRect = this.add.rectangle(0, 0, BOARD.width, BOARD.height, 0xffffff, 0).setOrigin(0).setDepth(20).setBlendMode(Phaser.BlendModes.ADD);

    this.sparks = this.add.particles(0, 0, 'spark', {
      emitting: false, lifespan: { min: 260, max: 520 }, speed: { min: 70, max: 260 }, scale: { start: 0.65, end: 0 },
      alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, gravityY: 300,
      tint: { onEmit: () => this.sparkTint },
    }).setDepth(7);
    this.shards = this.add.particles(0, 0, 'shard', {
      emitting: false, lifespan: { min: 300, max: 600 }, speed: { min: 90, max: 280 }, scale: { start: 0.55, end: 0.1 },
      rotate: { min: 0, max: 360 }, alpha: { start: 1, end: 0 }, blendMode: Phaser.BlendModes.ADD, gravityY: 260,
      tint: { onEmit: () => PRISM[Math.floor(Math.random() * PRISM.length)] },
    }).setDepth(7);

    for (let i = 0; i < 36; i++) {
      const t = this.add.text(0, 0, '', {
        fontFamily: 'Rajdhani, "Segoe UI", system-ui, sans-serif', fontSize: '22px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#050816', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(12).setVisible(false).setResolution(Math.max(1, this.zoom));
      this.texts.push(t);
    }

    this.setupInput();
    this.applyVisuals();
    this.ready = true;
    this.pendingStart?.();
    this.pendingStart = undefined;
  }

  // ── Public API used by the run controller / UI ──────────────────────────

  applyVisuals(): void {
    this.visuals = this.host.visuals();
    this.drawBackground();
    for (const [, v] of this.orbViews) this.styleOrb(v);
  }

  /** Start a playable stage. */
  startStage(setup: StageSetup, mods: Mods, progress?: StageProgress, practice = false): void {
    const run = () => {
      this.mode = practice ? 'practice' : 'play';
      this.build(setup, mods, progress, practice);
      this.inputEnabled = false;
    };
    if (this.ready) run();
    else this.pendingStart = run;
  }

  /** Menu background: self-playing demo board. */
  startAttract(): void {
    const run = () => {
      this.mode = 'attract';
      const mods = computeMods([]);
      const setup = generateStage({
        stage: 3 + Math.floor(Math.random() * 4), seed: randomSeed(), modifiers: [], mods,
        unlocked: new Set(['peg_portal', 'peg_shield', 'peg_converter', 'sectors']), baseShots: 99,
      });
      this.build(setup, mods, undefined, true);
      this.attractTimer = 0.9;
      this.inputEnabled = false;
    };
    if (this.ready) run();
    else this.pendingStart = run;
  }

  resetPractice(mods: Mods): void {
    this.build(generatePracticeStage(), mods, undefined, true);
    this.mode = 'practice';
  }

  setInputEnabled(on: boolean): void {
    this.inputEnabled = on;
    if (!on) this.aiming = false;
  }

  setFast(on: boolean): void {
    this.fast = on;
  }

  get isFast(): boolean {
    return this.fast;
  }

  stopBoard(): void {
    this.mode = 'idle';
    this.clearBoard();
    this.sim = undefined;
  }

  // ── Building ────────────────────────────────────────────────────────────

  private clearBoard(): void {
    for (const v of this.pegViews.values()) {
      v.glow.destroy();
      v.body.destroy();
      v.ring?.destroy();
    }
    this.pegViews.clear();
    for (const v of this.orbViews.values()) this.destroyOrbView(v);
    this.orbViews.clear();
    this.trailG.clear();
    this.aimG.clear();
    this.fxG.clear();
    this.tweens.killAll();
    for (const t of this.texts) t.setVisible(false);
  }

  private build(setup: StageSetup, mods: Mods, progress: StageProgress | undefined, practice: boolean): void {
    this.clearBoard();
    this.fast = false;
    this.resolving = false;
    this.aiming = false;
    this.lastPredictKey = '';
    const hits = setup.layout === 'practice' ? 2 : stageConfig(setup.stage).reactorHits;
    this.sim = new ReactorSim(setup, { mods, practice }, hits, progress);
    this.sim.events.length = 0;
    this.initialPegCount = this.sim.pegs.filter((p) => p.state !== 'gone').length;
    for (const peg of this.sim.pegs) {
      if (peg.state === 'gone') continue;
      this.createPegView(peg);
    }
    // Pop-in sweep from the top for a lively stage start.
    for (const v of this.pegViews.values()) {
      const target = v.scale;
      v.body.setScale(0);
      v.glow.setAlpha(0);
      this.tweens.add({ targets: v.body, scale: target, duration: 260, delay: (v.peg.y - 140) * 0.7, ease: 'Back.Out' });
    }
    this.aimAngle = 0;
  }

  private createPegView(peg: Peg): void {
    const def = PEG_DEFS[peg.type];
    const glow = this.add.image(peg.x, peg.y, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(def.color).setDepth(1);
    glow.setScale((peg.r * 4.2) / 128);
    glow.setAlpha(0.4);
    const variant = peg.type === 'shield' && peg.hp < peg.maxHp ? '_cracked' : '';
    const body = this.add.image(peg.x, peg.y, pegTextureKey(peg.type, variant)).setDepth(2);
    const scale = 1 / TEX;
    body.setScale(scale);
    const view: PegView = { peg, glow, body, scale, flash: 0, removing: false };
    if (peg.type === 'reactor') {
      view.ring = this.add.graphics().setDepth(3);
      this.drawReactorRing(view);
    }
    if (peg.state === 'spent') this.setSpentLook(view);
    this.pegViews.set(peg.id, view);
  }

  private drawReactorRing(v: PegView): void {
    const g = v.ring;
    if (!g) return;
    const p = v.peg;
    g.clear();
    const segs = p.maxHp;
    const filled = p.maxHp - p.hp;
    const gap = 0.18;
    const R = p.r + 7;
    for (let i = 0; i < segs; i++) {
      const a0 = -Math.PI / 2 + (i / segs) * Math.PI * 2 + gap / 2;
      const a1 = -Math.PI / 2 + ((i + 1) / segs) * Math.PI * 2 - gap / 2;
      const on = i < filled;
      g.lineStyle(on ? 5 : 3, on ? 0xffffff : PEG_DEFS.reactor.color, on ? 1 : 0.45);
      g.beginPath();
      g.arc(0, 0, R, a0, a1);
      g.strokePath();
    }
    if (p.activationsLeft > 0) {
      g.fillStyle(0xffe27a, 1);
      for (let i = 0; i < p.activationsLeft; i++) g.fillCircle(-6 + i * 12, R + 9, 3);
    }
    g.setPosition(p.x, p.y);
  }

  private setSpentLook(v: PegView): void {
    v.body.setAlpha(0.38);
    v.glow.setAlpha(0.08);
  }

  // ── Input ───────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.host.audio.unlock();
      if (!this.canAim()) return;
      this.aiming = true;
      this.aimAt(p.worldX, p.worldY);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.canAim()) return;
      if (this.aiming || !p.wasTouch) this.aimAt(p.worldX, p.worldY);
    });
    const release = (p: Phaser.Input.Pointer) => {
      if (!this.aiming) return;
      this.aiming = false;
      if (!this.canAim()) return;
      if (p.worldY < 18) return; // dragged off the top: cancel
      this.aimAt(p.worldX, p.worldY);
      this.fire();
    };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys('LEFT,RIGHT,A,D,SHIFT') as Record<string, Phaser.Input.Keyboard.Key>;
      kb.addCapture('SPACE,LEFT,RIGHT');
      const fireKey = () => {
        if (!this.canAim()) return;
        const el = document.activeElement as HTMLElement | null;
        if (el && el !== document.body && el.tagName !== 'CANVAS') el.blur();
        this.fire();
      };
      kb.on('keydown-SPACE', fireKey);
      kb.on('keydown-ENTER', fireKey);
    }
  }

  private canAim(): boolean {
    return this.inputEnabled && (this.mode === 'play' || this.mode === 'practice') && !!this.sim && this.sim.canLaunch() && !this.resolving;
  }

  private aimAt(x: number, y: number): void {
    const dx = x - BOARD.launcherX;
    const dy = Math.max(12, y - BOARD.launcherY);
    this.aimAngle = clampAngle(Math.atan2(dx, dy));
  }

  private fire(): void {
    const sim = this.sim;
    if (!sim || !sim.canLaunch()) return;
    if (sim.launch(this.aimAngle)) {
      this.aimG.clear();
      this.tweens.add({ targets: this.launcherBarrel, scaleY: 0.42, duration: 70, yoyo: true });
      if (this.mode !== 'attract') this.host.onLaunch();
    }
  }

  // ── Frame loop ──────────────────────────────────────────────────────────

  update(_time: number, deltaMs: number): void {
    const sim = this.sim;
    const dt = deltaMs / 1000;
    if (!sim) return;

    if (this.keys && this.canAim()) {
      const fine = this.keys.SHIFT?.isDown ? 0.25 : 1;
      const speed = 1.15 * fine * dt;
      if (this.keys.LEFT.isDown || this.keys.A.isDown) this.aimAngle = clampAngle(this.aimAngle + speed);
      if (this.keys.RIGHT.isDown || this.keys.D.isDown) this.aimAngle = clampAngle(this.aimAngle - speed);
    }

    let scale = this.fast ? PHYSICS.fastScale : 1;
    if (this.visuals.autoFast && sim.inShot && sim.shotTime > PHYSICS.autoFastAfter) scale = Math.max(scale, 2);
    if (this.mode === 'attract') scale = 1;
    sim.update(dt, scale);
    this.consumeEvents();

    if (sim.shotResolved() && !this.resolving) {
      this.resolving = true;
      sim.endShot();
      this.consumeEvents();
      this.fast = false;
      this.time.delayedCall(this.mode === 'attract' ? 300 : 520, () => {
        this.resolving = false;
        if (this.mode === 'attract') {
          this.attractTimer = 1.1;
          const alive = sim.pegs.filter((p) => p.state !== 'gone').length;
          if (alive < this.initialPegCount * 0.35) this.startAttract();
        } else if (this.mode === 'play' || this.mode === 'practice') {
          this.host.onShotResolved();
        }
      });
    }

    if (this.mode === 'attract' && !sim.inShot && !this.resolving) {
      this.attractTimer -= dt;
      if (this.attractTimer <= 0) {
        this.aimAngle = (Math.random() * 2 - 1) * 1.1;
        this.fire();
      }
    }

    this.syncPegs(dt);
    this.syncOrbs();
    this.drawLauncher(dt);
    this.drawAim();
    if (this.mode === 'play' || this.mode === 'practice') {
      this.host.hud({
        energy: sim.energy, target: sim.target, score: sim.score, credits: sim.credits, combo: sim.combo,
        mult: sim.multiplier, shotsLeft: sim.shotsLeft, shotsTotal: sim.setup.shots, inShot: sim.inShot,
        canLaunch: sim.canLaunch() && !this.resolving, fast: this.fast || (this.visuals.autoFast && sim.shotTime > PHYSICS.autoFastAfter && sim.inShot),
        shotTime: sim.inShot ? sim.shotTime : 0,
      });
    }
  }

  private syncPegs(dt: number): void {
    const t = this.time.now / 1000;
    const pulse = this.visuals.reducedFx ? 0 : 1;
    for (const v of this.pegViews.values()) {
      const p = v.peg;
      if (v.removing) continue;
      if (p.motion) {
        v.body.setPosition(p.x, p.y);
        v.glow.setPosition(p.x, p.y);
      }
      if (p.type === 'portal' || p.type === 'reactor') v.body.rotation += dt * (p.type === 'portal' ? 2.2 : 0.4);
      if (v.flash > 0) {
        v.flash = Math.max(0, v.flash - dt * 3.2);
      }
      if (p.state === 'spent') continue;
      const base = p.state === 'lit' ? 0.85 : p.type === 'standard' ? 0.3 : 0.45;
      const wobble = pulse * Math.sin(t * 2.4 + p.id * 0.7) * 0.06;
      if (v.body.scale > 0.01 || this.tweens.isTweening(v.body)) v.glow.setAlpha(Math.min(1, base + wobble + v.flash));
    }
  }

  private syncOrbs(): void {
    const sim = this.sim!;
    const seen = new Set<number>();
    const g = this.trailG;
    g.clear();
    const trail = this.visuals.trail.look;
    const colors = trail.colors ?? [0x6fe3ff];
    const style = trail.style ?? 'line';
    const now = this.time.now;
    for (const o of sim.orbs) {
      seen.add(o.id);
      let v = this.orbViews.get(o.id);
      if (!v) {
        v = this.createOrbView();
        this.orbViews.set(o.id, v);
        v.lx = o.x;
        v.ly = o.y;
      }
      if (Math.hypot(o.x - v.lx, o.y - v.ly) > 70) v.trail.length = 0; // teleported
      v.lx = o.x;
      v.ly = o.y;
      v.trail.push({ x: o.x, y: o.y });
      const maxLen = this.visuals.reducedFx ? 8 : 16;
      while (v.trail.length > maxLen) v.trail.shift();
      const scale = (o.r * 2) / 64;
      v.core.setPosition(o.x, o.y).setScale(scale);
      v.glow.setPosition(o.x, o.y).setScale((o.r * 6) / 128);
      v.ring?.setPosition(o.x, o.y).setScale(scale * 1.15);
      if (o.kind === 'spark') v.glow.setTint(0xffe27a);
      const ghostFade = o.lifetime - o.age < 1 ? Math.max(0.2, o.lifetime - o.age) : 1;
      v.core.setAlpha(ghostFade);
      // Trail
      const n = v.trail.length;
      for (let i = 1; i < n; i++) {
        if (style === 'dash' && i % 2 === 0) continue;
        const a = i / n;
        // Rainbow cycles hues; two-tone trails fade from the secondary colour into the primary near the orb.
        const col = style === 'rainbow' ? colors[Math.floor(now / 90 + i) % colors.length] : colors[a > 0.5 || colors.length < 2 ? 0 : 1];
        g.lineStyle(o.r * 1.5 * a, col, 0.55 * a);
        g.lineBetween(v.trail[i - 1].x, v.trail[i - 1].y, v.trail[i].x, v.trail[i].y);
      }
    }
    for (const [id, v] of this.orbViews) {
      if (!seen.has(id)) {
        this.destroyOrbView(v);
        this.orbViews.delete(id);
      }
    }
  }

  private createOrbView(): OrbView {
    const glow = this.add.image(0, 0, 'glow').setBlendMode(Phaser.BlendModes.ADD).setDepth(5);
    const core = this.add.image(0, 0, 'orb').setDepth(6);
    const v: OrbView = { glow, core, trail: [], lx: 0, ly: 0 };
    this.styleOrb(v);
    return v;
  }

  private styleOrb(v: OrbView): void {
    const look = this.visuals.orb.look;
    v.core.setTint(look.core ?? 0xffffff);
    v.glow.setTint(look.glow ?? 0x8fe9ff);
    if (look.ring && !v.ring) v.ring = this.add.image(0, 0, 'orb_ring').setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    if (!look.ring && v.ring) {
      v.ring.destroy();
      v.ring = undefined;
    }
    v.ring?.setTint(look.ring ?? 0xffffff);
  }

  private destroyOrbView(v: OrbView): void {
    v.glow.destroy();
    v.core.destroy();
    v.ring?.destroy();
  }

  private drawLauncher(dt: number): void {
    const sim = this.sim!;
    const ready = sim.canLaunch() && !this.resolving && this.mode !== 'idle';
    const target = this.aimAngle;
    this.launcherBarrel.rotation = -target;
    const t = this.time.now / 1000;
    const k = ready ? 0.55 + Math.sin(t * 5) * 0.08 : 0.25;
    this.launcherCore.setScale(this.launcherCore.scale + (k - this.launcherCore.scale) * Math.min(1, dt * 10));
    this.launcherCore.setTint(ready ? (this.visuals.orb.look.glow ?? 0x8fe9ff) : 0x334466);
  }

  private drawAim(): void {
    const g = this.aimG;
    if (!this.canAim() || this.mode === 'attract') {
      if (this.lastPredictKey) g.clear();
      this.lastPredictKey = '';
      return;
    }
    const sim = this.sim!;
    const scope = sim.mods.scope > 0;
    const moving = sim.pegs.some((p) => p.motion && p.state !== 'gone');
    const key = `${this.aimAngle.toFixed(4)}|${scope}`;
    if (key !== this.lastPredictKey || moving) {
      this.predicted = sim.predict(this.aimAngle, scope);
      this.lastPredictKey = key;
    }
    g.clear();
    const pts = this.predicted.points;
    const n = pts.length;
    const col = this.visuals.orb.look.glow ?? 0x8fe9ff;
    for (let i = 1; i < n; i += 2) {
      const a = 1 - (i / n) * 0.75;
      g.fillStyle(col, a * 0.9);
      g.fillCircle(pts[i].x, pts[i].y, 2.6 * a + 1);
    }
    if (this.predicted.hit) {
      g.lineStyle(2, 0xffffff, 0.7);
      g.strokeCircle(this.predicted.hit.x, this.predicted.hit.y, sim.orbRadius);
    }
  }

  // ── Events → visuals & audio ────────────────────────────────────────────

  private consumeEvents(): void {
    const sim = this.sim!;
    if (!sim.events.length) return;
    const events = sim.events;
    sim.events = [];
    const audible = this.mode !== 'attract';
    const audio = this.host.audio;
    for (const e of events) {
      switch (e.t) {
        case 'hit': {
          const v = this.pegViews.get(e.peg.id);
          const def = PEG_DEFS[e.peg.type];
          if (v) {
            v.flash = 0.9;
            this.tweens.add({ targets: v.body, scale: v.scale * 1.35, duration: 70, yoyo: true });
            if (e.peg.state === 'spent') this.time.delayedCall(140, () => this.setSpentLook(v));
          }
          this.hitBurst(e.x, e.y, def.color, e.peg.type === 'charged' || e.peg.type === 'shield' ? 10 : 6);
          if (e.energy >= 0.5) this.floatText(e.x, e.y - 14, `+${Math.round(e.energy)}`, e.peg.type === 'charged' ? '#ffd35a' : '#bff4ff', e.energy > 30 ? 28 : 20);
          if (audible) {
            const kind = e.peg.type === 'charged' || e.peg.type === 'reactor' ? 'charged' : e.peg.type === 'shield' ? 'shield' : e.peg.type === 'booster' ? 'soft' : 'standard';
            audio.hit(e.combo, kind);
          }
          break;
        }
        case 'crack': {
          const v = this.pegViews.get(e.peg.id);
          v?.body.setTexture(pegTextureKey('shield', '_cracked'));
          if (audible) audio.crack();
          break;
        }
        case 'reactorHit': {
          const v = this.pegViews.get(e.peg.id);
          if (v) {
            this.drawReactorRing(v);
            this.ringPulse(e.peg.x, e.peg.y, PEG_DEFS.reactor.color, e.peg.r * 2.2, 260);
          }
          if (audible) audio.reactorHit();
          break;
        }
        case 'reactorActivate': {
          const v = this.pegViews.get(e.peg.id);
          if (v) {
            this.drawReactorRing(v);
            if (!e.rearmed) this.setSpentLook(v);
          }
          this.ringPulse(e.peg.x, e.peg.y, PEG_DEFS.reactor.color, 150, 520);
          this.ringPulse(e.peg.x, e.peg.y, 0xffffff, 90, 380);
          this.burst(e.peg.x, e.peg.y, PEG_DEFS.reactor.color, this.visuals.reducedFx ? 12 : 30);
          this.floatText(e.peg.x, e.peg.y - 34, `+${Math.round(e.energy)} REACTOR`, '#5dffe0', 30, 1100);
          this.flash(0x2effd1, 0.22);
          this.shake(160, 0.006);
          if (audible) audio.reactor();
          break;
        }
        case 'mult': {
          const v = this.pegViews.get(e.peg.id);
          if (v) v.flash = 1;
          this.floatText(e.peg.x, e.peg.y - 28, `×${e.mult.toFixed(1)}`, '#ff7fd4', 26);
          this.ringPulse(e.peg.x, e.peg.y, PEG_DEFS.multiplier.color, 46, 260);
          if (audible) audio.mult();
          break;
        }
        case 'split':
          this.ringPulse(e.peg.x, e.peg.y, PEG_DEFS.split.color, 60, 300);
          this.floatText(e.peg.x, e.peg.y - 28, `SPLIT ×${e.count + 1}`, '#8dff9f', 20);
          if (audible) audio.split();
          break;
        case 'bomb': {
          this.ringPulse(e.x, e.y, PEG_DEFS.bomb.color, e.radius, 340);
          this.ringPulse(e.x, e.y, 0xffd27a, e.radius * 0.6, 240);
          this.burst(e.x, e.y, PEG_DEFS.bomb.color, this.visuals.reducedFx ? 10 : 24);
          this.flash(0xff6a3a, 0.12);
          this.shake(140, 0.007);
          if (audible) audio.bomb();
          break;
        }
        case 'chain':
          this.lightning(e.from.x, e.from.y, e.to.x, e.to.y);
          if (audible) audio.chain();
          break;
        case 'portal':
          this.ringPulse(e.from.x, e.from.y, PEG_DEFS.portal.color, 44, 260);
          this.ringPulse(e.to.x, e.to.y, PEG_DEFS.portal.color, 44, 260);
          if (audible) audio.portal();
          break;
        case 'boost': {
          const v = this.pegViews.get(e.peg.id);
          if (v) {
            v.flash = 1;
            this.tweens.add({ targets: v.body, scale: v.scale * 1.25, duration: 80, yoyo: true });
          }
          this.ringPulse(e.peg.x, e.peg.y, PEG_DEFS.booster.color, 40, 200);
          if (audible) audio.boost();
          break;
        }
        case 'wall':
          if (!this.visuals.reducedFx) this.hitBurst(e.x, e.y, 0x8fe9ff, 3);
          break;
        case 'credits':
          this.floatText(e.x, e.y - 40, `+${e.amount} ¢`, '#ffe08a', 22, 1000);
          if (audible) audio.credits();
          break;
        case 'bonusEnergy':
          this.floatText(BOARD.width / 2, 200, `${e.reason.toUpperCase()} +${e.amount}`, '#ffb35a', 26, 1400);
          this.flash(0xffa040, 0.15);
          break;
        case 'orbExit':
          this.burst(e.orb.x, BOARD.height - 4, this.visuals.orb.look.glow ?? 0x8fe9ff, 6);
          break;
        case 'orbFizzle':
          this.burst(e.orb.x, e.orb.y, 0xffffff, 8);
          break;
        case 'pegRemoved': {
          const v = this.pegViews.get(e.peg.id);
          if (!v || v.removing) break;
          v.removing = true;
          this.pegViews.delete(e.peg.id);
          const delay = Math.min(500, e.order * 14);
          this.tweens.add({
            targets: [v.body, v.glow], alpha: 0, scale: v.scale * 1.6, duration: 200, delay,
            onStart: () => { if (!this.visuals.reducedFx && e.order % 3 === 0) this.hitBurst(e.peg.x, e.peg.y, PEG_DEFS[e.peg.type].color, 2); },
            onComplete: () => { v.body.destroy(); v.glow.destroy(); v.ring?.destroy(); },
          });
          break;
        }
        case 'launch':
          if (audible) audio.launch();
          break;
        case 'nudge':
          break;
      }
    }
    if (this.mode !== 'attract') this.host.onSimEvents?.(events);
  }

  // ── FX helpers ──────────────────────────────────────────────────────────

  private hitBurst(x: number, y: number, color: number, count: number): void {
    const style = this.visuals.hit.look.style;
    const n = this.visuals.reducedFx ? Math.ceil(count / 2) : count;
    if (style === 'prism') {
      this.shards.explode(n, x, y);
    } else if (style === 'nova') {
      this.ringPulse(x, y, color, 34, 260);
      this.sparkTint = color;
      this.sparks.explode(Math.ceil(n / 2), x, y);
    } else {
      this.sparkTint = color;
      this.sparks.explode(n, x, y);
    }
  }

  private burst(x: number, y: number, color: number, count: number): void {
    this.sparkTint = color;
    this.sparks.explode(count, x, y);
  }

  private ringPulse(x: number, y: number, color: number, radius: number, duration: number): void {
    const ring = this.add.image(x, y, 'ring').setTint(color).setBlendMode(Phaser.BlendModes.ADD).setDepth(6).setScale(0.05).setAlpha(0.9);
    this.tweens.add({ targets: ring, scale: radius / 112, alpha: 0, duration, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
  }

  private lightning(x1: number, y1: number, x2: number, y2: number): void {
    const g = this.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(3, 0x9fe8ff, 1);
    g.beginPath();
    g.moveTo(x1, y1);
    const segs = 5;
    for (let i = 1; i < segs; i++) {
      const t = i / segs;
      g.lineTo(x1 + (x2 - x1) * t + (Math.random() - 0.5) * 14, y1 + (y2 - y1) * t + (Math.random() - 0.5) * 14);
    }
    g.lineTo(x2, y2);
    g.strokePath();
    this.tweens.add({ targets: g, alpha: 0, duration: 220, onComplete: () => g.destroy() });
  }

  private floatText(x: number, y: number, text: string, color: string, size = 20, duration = 750): void {
    if (!this.visuals.numbers && !/[A-Z]/.test(text)) return;
    const t = this.texts[this.textCursor];
    this.textCursor = (this.textCursor + 1) % this.texts.length;
    this.tweens.killTweensOf(t);
    t.setText(text).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setScale(0.6).setVisible(true);
    this.tweens.add({ targets: t, scale: 1, duration: 120, ease: 'Back.Out' });
    this.tweens.add({ targets: t, y: y - 38, alpha: 0, duration, delay: 120, ease: 'Cubic.In', onComplete: () => t.setVisible(false) });
  }

  private flash(color: number, alpha: number): void {
    if (this.visuals.reducedFx) return;
    this.flashRect.setFillStyle(color, alpha);
    this.flashRect.setAlpha(1);
    this.tweens.add({ targets: this.flashRect, alpha: 0, duration: 260 });
  }

  private shake(duration: number, intensity: number): void {
    if (!this.visuals.shake || this.visuals.reducedFx || this.mode === 'attract') return;
    this.cameras.main.shake(duration, intensity);
  }

  // ── Background ──────────────────────────────────────────────────────────

  private drawBackground(): void {
    const g = this.bgG;
    g.clear();
    const theme = this.visuals.theme.look;
    const [frame, fill] = theme.colors ?? [0x1f6dff, 0x0b1a3a];
    const grid = this.visuals.background.look.colors?.[0] ?? 0x14305e;
    const W = BOARD.width;
    const H = BOARD.height;
    // Opaque base: additive glows must never punch alpha holes into a transparent canvas.
    g.fillStyle(fill, 1);
    g.fillRect(0, 0, W, H);
    g.lineStyle(1, grid, 0.45);
    for (let x = 0; x <= W; x += 30) g.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 30) g.lineBetween(0, y, W, y);
    // Circuit traces
    g.lineStyle(2, grid, 0.8);
    for (let i = 0; i < 6; i++) {
      const y = 180 + i * 120;
      g.lineBetween(0, y, 18, y);
      g.lineBetween(18, y, 18, y + 40);
      g.lineBetween(W, y + 60, W - 18, y + 60);
      g.lineBetween(W - 18, y + 60, W - 18, y + 100);
    }
    if (theme.style === 'retro') {
      g.lineStyle(1, 0xff4fa3, 0.12);
      for (let y = 0; y < H; y += 6) g.lineBetween(0, y, W, y);
    } else if (theme.style === 'ice') {
      g.lineStyle(1, 0xe0fbff, 0.12);
      for (let k = -H; k < W; k += 46) g.lineBetween(k, H, k + H * 0.6, 0);
    }
    // Neon walls
    for (const [w, a] of [[10, 0.12], [5, 0.3], [2, 1]] as const) {
      g.lineStyle(w, frame, a);
      g.lineBetween(1, 0, 1, H);
      g.lineBetween(W - 1, 0, W - 1, H);
      g.lineBetween(0, 1, W, 1);
    }
    // Exit drain
    for (let i = 0; i < 6; i++) {
      g.fillStyle(frame, 0.05 + i * 0.03);
      g.fillRect(0, H - 6 - i * 4, W, 4);
    }
    // Launch bay arc
    g.lineStyle(2, frame, 0.6);
    g.beginPath();
    g.arc(BOARD.launcherX, BOARD.launcherY - 6, 52, 0, Math.PI);
    g.strokePath();
  }
}
