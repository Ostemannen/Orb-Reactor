import { BOARD, RULES, stageTarget } from '../config/balance';
import type { PegSpec, PegType, StageSetup } from '../entities/types';
import { Rng } from '../utils/rng';
import { PEG_DEFS } from '../../data/pegs';
import { stageConfig, SECTOR_LAYOUTS } from '../../data/stages';
import { MODIFIER_MAP } from '../../data/modifiers';
import type { Mods } from '../../data/upgrades';

interface Pt { x: number; y: number }
interface Zone { x: number; y: number; r: number }

const F = BOARD.field;
const MIN_SEP = 40;

export interface GenerateOptions {
  stage: number;
  seed: number;
  modifiers: string[];
  mods: Mods;
  unlocked: Set<string>;
  baseShots: number;
  targetMul?: number;
}

/** Build a complete, reproducible stage from a seed. */
export function generateStage(opts: GenerateOptions): StageSetup {
  const rng = new Rng(opts.seed);
  const cfg = stageConfig(opts.stage);
  const layouts = [...cfg.layouts];
  if (!cfg.core && opts.unlocked.has('sectors') && opts.stage >= 2) layouts.push(...SECTOR_LAYOUTS);
  const layout = rng.pick(layouts);

  // ── Peg counts ────────────────────────────────────────────────────────
  const counts: Record<PegType, number> = {
    standard: 0, charged: 0, multiplier: 0, split: 0, bomb: 0, booster: 0, portal: 0, reactor: 0, converter: 0, shield: 0,
  };
  for (const [k, v] of Object.entries(cfg.mix)) counts[k as PegType] = v ?? 0;
  const m = opts.mods;
  counts.charged += m.extraCharged;
  counts.reactor += m.extraReactors;
  counts.multiplier += m.extraMult;
  counts.bomb += m.extraBombs;
  counts.split += m.extraSplits;
  counts.converter += m.extraConverters;
  for (const id of opts.modifiers) {
    const mod = MODIFIER_MAP[id];
    if (!mod) continue;
    for (const [k, v] of Object.entries(mod.pegScale ?? {})) counts[k as PegType] = Math.round(counts[k as PegType] * (v ?? 1));
    for (const [k, v] of Object.entries(mod.pegAdd ?? {})) counts[k as PegType] += v ?? 0;
  }
  // Locked peg types fall back to simpler pieces so the board stays full.
  for (const t of Object.keys(counts) as PegType[]) {
    const unlock = PEG_DEFS[t].unlock;
    if (unlock && !opts.unlocked.has(unlock)) {
      if (t === 'shield') counts.standard += counts.shield;
      if (t === 'converter') counts.charged += Math.ceil(counts.converter / 2);
      counts[t] = 0;
    }
  }
  counts.portal = Math.floor(counts.portal / 2) * 2;
  counts.reactor = Math.min(counts.reactor, 4);

  const pegs: PegSpec[] = [];
  let nextId = 1;
  const zones: Zone[] = [];
  const add = (type: PegType, x: number, y: number, extra: Partial<PegSpec> = {}) => {
    const p: PegSpec = { id: nextId++, type, x: Math.round(x), y: Math.round(y), ...extra };
    pegs.push(p);
    return p;
  };

  // ── Big pieces first: reactor nodes, portals, boosters ────────────────
  const isCore = layout === 'core';
  const reactorSpots: Pt[] = isCore
    ? [{ x: 270, y: 500 }, { x: 120, y: 300 }, { x: 420, y: 300 }, { x: 270, y: 760 }]
    : rng.shuffle([
        { x: 150, y: 470 }, { x: 390, y: 470 }, { x: 270, y: 640 }, { x: 270, y: 330 },
        { x: 130, y: 700 }, { x: 410, y: 700 },
      ]);
  for (let i = 0; i < counts.reactor && i < reactorSpots.length; i++) {
    const s = reactorSpots[i];
    const jx = isCore && i === 0 ? 0 : rng.range(-26, 26);
    const jy = isCore && i === 0 ? 0 : rng.range(-20, 20);
    add('reactor', s.x + jx, s.y + jy);
    zones.push({ x: s.x + jx, y: s.y + jy, r: 58 });
  }

  const portalPairs = counts.portal / 2;
  const portalSlots = rng.shuffle([
    [{ x: 56, y: 330 }, { x: 484, y: 610 }],
    [{ x: 484, y: 330 }, { x: 56, y: 610 }],
    [{ x: 56, y: 760 }, { x: 484, y: 250 }],
    [{ x: 484, y: 760 }, { x: 56, y: 250 }],
  ]);
  for (let i = 0; i < portalPairs && i < portalSlots.length; i++) {
    const [a, b] = portalSlots[i];
    const ay = a.y + rng.range(-30, 30);
    const by = b.y + rng.range(-30, 30);
    const pa = add('portal', a.x, ay);
    const pb = add('portal', b.x, by);
    pa.pair = pb.id;
    pb.pair = pa.id;
    zones.push({ x: a.x, y: ay, r: 52 }, { x: b.x, y: by, r: 52 });
  }

  for (let i = 0; i < counts.booster; i++) {
    for (let tries = 0; tries < 30; tries++) {
      const x = rng.range(80, 460);
      const y = rng.range(560, 820);
      if (zones.some((z) => Math.hypot(z.x - x, z.y - y) < z.r + 30)) continue;
      add('booster', x, y);
      zones.push({ x, y, r: 52 });
      break;
    }
  }

  // ── Moving groups ─────────────────────────────────────────────────────
  const moverPegs: PegSpec[] = [];
  for (let i = 0; i < cfg.movers; i++) {
    for (let tries = 0; tries < 40; tries++) {
      const cx = rng.range(150, 390);
      const cy = rng.range(300, 720);
      if (zones.some((z) => Math.hypot(z.x - cx, z.y - cy) < z.r + 80)) continue;
      const kind = rng.chance(0.55) ? 'orbit' : 'slide';
      if (kind === 'orbit') {
        const radius = 50;
        const n = 6;
        const speed = rng.pick([-0.9, 0.9, -0.7, 0.7]);
        for (let k = 0; k < n; k++) {
          const phase = (k / n) * Math.PI * 2;
          moverPegs.push(add('standard', cx + Math.cos(phase) * radius, cy + Math.sin(phase) * radius, {
            motion: { kind: 'orbit', cx, cy, radius, speed, phase },
          }));
        }
        zones.push({ x: cx, y: cy, r: 82 });
      } else {
        const n = 4;
        const phase = rng.range(0, Math.PI * 2);
        for (let k = 0; k < n; k++) {
          const x = cx + (k - (n - 1) / 2) * 46;
          moverPegs.push(add('standard', x, cy, { motion: { kind: 'slide', axis: 'x', amp: 46, speed: 1.1, phase } }));
        }
        zones.push({ x: cx, y: cy, r: 0 });
        // A slider sweeps a horizontal band; keep it clear.
        for (let k = -3; k <= 3; k++) zones.push({ x: cx + k * 40, y: cy, r: 34 });
      }
      break;
    }
  }

  // ── Pattern points ────────────────────────────────────────────────────
  const raw = layoutPoints(layout, rng);
  const placed: Pt[] = [];
  for (const p of raw) {
    if (p.x < F.left || p.x > F.right || p.y < F.top || p.y > F.bottom) continue;
    if (zones.some((z) => Math.hypot(z.x - p.x, z.y - p.y) < z.r)) continue;
    if (placed.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_SEP)) continue;
    if (moverPegs.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_SEP + 10)) continue;
    placed.push(p);
  }

  const smallTypes: PegType[] = ['charged', 'multiplier', 'split', 'bomb', 'converter', 'shield'];
  const specialTotal = smallTypes.reduce((s, t) => s + counts[t], 0);
  const wanted = Math.min(placed.length, specialTotal + counts.standard);
  // Drop surplus points randomly but deterministically.
  rng.shuffle(placed);
  const usable = placed.slice(0, wanted);
  // Specials prefer the middle band of the board so they are reachable.
  const order = [...usable].sort((a, b) => scoreSpot(b, rng) - scoreSpot(a, rng));
  const typeQueue: PegType[] = [];
  for (const t of smallTypes) for (let i = 0; i < counts[t]; i++) typeQueue.push(t);
  rng.shuffle(typeQueue);
  const specialSpots = order.slice(0, typeQueue.length);
  const specialSet = new Set(specialSpots);
  specialSpots.forEach((p, i) => add(typeQueue[i], p.x, p.y));
  for (const p of usable) if (!specialSet.has(p)) add('standard', p.x, p.y);

  // A charged peg on every moving group makes them worth aiming at.
  if (moverPegs.length) moverPegs[0].type = 'charged';

  const relief = opts.modifiers.length ? 1 - m.modifierRelief : 1;
  let targetMul = (opts.targetMul ?? 1) * relief;
  for (const id of opts.modifiers) targetMul *= MODIFIER_MAP[id]?.targetMul ?? 1;

  return {
    stage: opts.stage,
    seed: opts.seed,
    target: Math.max(10, Math.round((stageTarget(opts.stage) * targetMul) / 5) * 5),
    shots: Math.max(1, opts.baseShots + m.extraShots),
    modifiers: opts.modifiers,
    layout,
    pegs,
    isCore,
  };
}

function scoreSpot(p: Pt, rng: Rng): number {
  const midY = (F.top + F.bottom) / 2;
  return -Math.abs(p.y - midY) / 400 + rng.next() * 1.2;
}

function layoutPoints(layout: string, rng: Rng): Pt[] {
  const pts: Pt[] = [];
  const W = F.right - F.left;
  const cx = BOARD.width / 2;
  switch (layout) {
    case 'grid': {
      const dx = 50, dy = 48;
      for (let row = 0, y = F.top + 10; y < F.bottom; row++, y += dy) {
        const off = row % 2 ? dx / 2 : 0;
        for (let x = F.left + 12 + off; x < F.right; x += dx) pts.push({ x, y });
      }
      break;
    }
    case 'diamonds': {
      const centers: Pt[] = [];
      for (let y = F.top + 60; y < F.bottom - 30; y += 150) {
        const n = (Math.round(y) / 150) % 2 ? 3 : 2;
        for (let i = 0; i < n; i++) centers.push({ x: F.left + ((i + 0.5) * W) / n, y });
      }
      for (const c of centers) {
        for (let i = -2; i <= 2; i++) {
          const rowN = 3 - Math.abs(i);
          for (let j = 0; j < rowN; j++) pts.push({ x: c.x + (j - (rowN - 1) / 2) * 46, y: c.y + i * 40 });
        }
      }
      break;
    }
    case 'arches': {
      for (let y = F.top + 30, k = 0; y < F.bottom; y += 78, k++) {
        const span = k % 2 ? 1 : -1;
        for (let x = F.left + 10 + (k % 2) * 21; x <= F.right; x += 42) {
          const t = (x - cx) / (W / 2);
          pts.push({ x, y: y + span * 46 * (1 - t * t) - 23 * span });
        }
      }
      break;
    }
    case 'waves': {
      const phase = rng.range(0, Math.PI * 2);
      for (let y = F.top + 20, k = 0; y < F.bottom; y += 56, k++) {
        for (let x = F.left + 10 + (k % 2) * 22; x <= F.right; x += 44) {
          pts.push({ x, y: y + Math.sin(x / 60 + phase + k) * 18 });
        }
      }
      break;
    }
    case 'rings': {
      const centers: Pt[] = [
        { x: 150, y: 280 }, { x: 390, y: 280 }, { x: 270, y: 450 },
        { x: 150, y: 620 }, { x: 390, y: 620 }, { x: 270, y: 790 },
      ];
      for (const c of centers) {
        const r = rng.pick([62, 70]);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * Math.PI * 2 + rng.range(0, 0.4);
          pts.push({ x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r });
        }
        pts.push(c);
      }
      for (let y = F.top + 20; y < F.bottom; y += 52) for (let x = F.left + 10; x <= F.right; x += 52) pts.push({ x, y });
      break;
    }
    case 'funnel': {
      for (let k = 0; k < 3; k++) {
        const top = F.top + 30 + k * 230;
        for (let i = 0; i < 6; i++) {
          pts.push({ x: F.left + 12 + i * 34, y: top + i * 26 });
          pts.push({ x: F.right - 12 - i * 34, y: top + i * 26 });
        }
      }
      for (let y = F.top + 40; y < F.bottom; y += 50) for (let x = F.left + 30; x <= F.right; x += 48) pts.push({ x, y: y + rng.range(-6, 6) });
      break;
    }
    case 'core': {
      for (const [r, n] of [[96, 12], [150, 18], [205, 22]] as const) {
        const rot = rng.range(0, Math.PI);
        for (let i = 0; i < n; i++) {
          const a = rot + (i / n) * Math.PI * 2;
          pts.push({ x: 270 + Math.cos(a) * r, y: 500 + Math.sin(a) * r * 1.25 });
        }
      }
      for (let y = F.top + 10; y < F.bottom; y += 50) for (let x = F.left + 12; x <= F.right; x += 50) pts.push({ x, y });
      break;
    }
    case 'spiral': {
      const turns = 3.2;
      for (let t = 0.4; t < turns * Math.PI * 2; t += 0.32) {
        const r = 18 + t * 12;
        pts.push({ x: cx + Math.cos(t) * r, y: 500 + Math.sin(t) * r * 1.3 });
      }
      for (let y = F.top + 10; y < F.bottom; y += 54) for (let x = F.left + 12; x <= F.right; x += 54) pts.push({ x, y });
      break;
    }
    case 'vortex': {
      for (const dir of [1, -1]) {
        for (let t = 0.6; t < 16; t += 0.36) {
          const r = 14 + t * 13;
          pts.push({ x: cx + Math.cos(dir * t) * r, y: 500 + Math.sin(dir * t) * r * 1.35 });
        }
      }
      break;
    }
    case 'hexfield': {
      const centers: Pt[] = [];
      for (let y = F.top + 60; y < F.bottom; y += 130) for (let x = F.left + 60 + ((y / 130) % 2) * 60; x < F.right; x += 150) centers.push({ x, y });
      for (const c of centers) {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          pts.push({ x: c.x + Math.cos(a) * 46, y: c.y + Math.sin(a) * 46 });
        }
        pts.push(c);
      }
      break;
    }
    default: {
      for (let y = F.top + 10; y < F.bottom; y += 54) for (let x = F.left + 12; x < F.right; x += 54) pts.push({ x, y });
    }
  }
  return pts;
}

/** A fixed chamber showing every peg type for practice mode. */
export function generatePracticeStage(): StageSetup {
  const pegs: PegSpec[] = [];
  let id = 1;
  const add = (type: PegType, x: number, y: number, extra: Partial<PegSpec> = {}) => {
    const p: PegSpec = { id: id++, type, x, y, ...extra };
    pegs.push(p);
    return p;
  };
  add('reactor', 270, 470);
  const pa = add('portal', 56, 330);
  const pb = add('portal', 484, 640);
  pa.pair = pb.id;
  pb.pair = pa.id;
  add('booster', 140, 770);
  add('booster', 400, 770);
  const specials: [PegType, number, number][] = [
    ['charged', 170, 260], ['charged', 370, 260], ['multiplier', 270, 300], ['split', 270, 210],
    ['bomb', 150, 420], ['bomb', 390, 420], ['converter', 270, 640], ['shield', 200, 560], ['shield', 340, 560],
    ['multiplier', 120, 600], ['charged', 420, 560], ['split', 270, 760],
  ];
  const taken = new Set<string>();
  for (const [t, x, y] of specials) {
    add(t, x, y);
    taken.add(`${x},${y}`);
  }
  for (let row = 0, y = 180; y < 840; row++, y += 52) {
    for (let x = 60 + (row % 2) * 28; x < 490; x += 56) {
      const near = pegs.some((p) => Math.hypot(p.x - x, p.y - y) < (p.type === 'reactor' ? 62 : p.type === 'portal' || p.type === 'booster' ? 50 : 40));
      if (!near) add('standard', x, y);
    }
  }
  return {
    stage: 1, seed: 1, target: 999999, shots: 99, modifiers: [], layout: 'practice', pegs, isCore: false,
  };
}

/** Pick stage modifiers deterministically. */
export function rollModifiers(
  stage: number,
  seed: number,
  unlocked: Set<string>,
  opts: { always?: boolean; count?: number; fromStage?: number } = {},
): string[] {
  const rng = new Rng(seed ^ 0x5bd1e995);
  const from = opts.fromStage ?? RULES.modifierFromStage;
  if (stage < from) return [];
  const always = opts.always || stage >= RULES.modifierAlwaysFrom;
  if (!always && !rng.chance(RULES.modifierChance)) return [];
  const pool = Object.values(MODIFIER_MAP).filter((m) => !m.requires || !PEG_DEFS[m.requires].unlock || unlocked.has(PEG_DEFS[m.requires].unlock!));
  rng.shuffle(pool);
  return pool.slice(0, opts.count ?? 1).map((m) => m.id);
}
