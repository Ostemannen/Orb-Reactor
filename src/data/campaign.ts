import type { PegType, StageSetup } from '../game/entities/types';
import { generateStage } from '../game/systems/BoardGenerator';
import type { ReactorSim } from '../game/systems/ReactorSim';
import { computeMods, type Mods } from './upgrades';
import { MODIFIERS } from './modifiers';
import { Rng, hashString } from '../game/utils/rng';
import calibrated from './campaignLevels.json';

/**
 * Campaign ("saga") mode: a fixed map of hand-tuned-by-simulation levels.
 * Each level is a pure aim puzzle with its own objective, a shot limit and
 * a 1–3 star rating. There are no lives, timers or paid boosters.
 */
export const LEVELS_PER_WORLD = 15;
export const CAMPAIGN_LENGTH = 300;

export type ObjectiveKind = 'energy' | 'charged' | 'reactors' | 'shields' | 'clear' | 'combo';

export const OBJECTIVES: Record<ObjectiveKind, { icon: string; label: (t: number) => string; short: string }> = {
  energy: { icon: '⚡', label: (t) => `Charge the reactor with ${t} energy`, short: 'energy' },
  charged: { icon: '⚡', label: (t) => `Hit ${t} charged pegs`, short: 'charged' },
  reactors: { icon: '◎', label: (t) => `Activate ${t} reactor node${t > 1 ? 's' : ''}`, short: 'reactors' },
  shields: { icon: '⬡', label: (t) => `Break ${t} shield pegs`, short: 'shields' },
  clear: { icon: '▦', label: (t) => `Clear ${t}% of the pegs`, short: '% cleared' },
  combo: { icon: '⛓', label: (t) => `Reach a ${t} combo in one shot`, short: 'combo' },
};

export const WORLDS = [
  'Ignition Bay', 'Lattice Works', 'Crystal Caverns', 'Arc Foundry', 'Wave Station',
  'Ring Nebula', 'Funnel Depths', 'Spiral Spire', 'Vortex Rift', 'Hex Citadel',
  'Plasma Gardens', 'Cryo Vault', 'Magma Core', 'Static Fields', 'Prism Reach',
  'Graviton Well', 'Echo Chamber', 'Quantum Loom', 'Singularity Gate', 'Omega Reactor',
];

/** Peg types introduced at a level, shown as a "new mechanic" tip. */
export const INTRODUCTIONS: Record<number, { peg?: PegType; text: string }> = {
  1: { text: 'Drag to aim, release to fire. Hit pegs to charge the reactor.' },
  2: { peg: 'charged', text: 'Gold charged pegs are worth three times as much.' },
  4: { peg: 'multiplier', text: 'Pink multiplier pegs boost everything else in the shot — hit them early!' },
  6: { peg: 'bomb', text: 'Bombs trigger every peg around them. Chain them together.' },
  9: { peg: 'reactor', text: 'Reactor nodes need several hits, but pay out a huge burst.' },
  12: { peg: 'split', text: 'Split pegs turn one orb into two.' },
  16: { peg: 'portal', text: 'Portals warp your orb across the chamber, keeping its speed.' },
  31: { peg: 'shield', text: 'Shield pegs crack on the first hit and pay big on the second.' },
  46: { peg: 'converter', text: 'Converter pegs turn your combo into credits.' },
  61: { text: 'New sectors unlocked: spiral, vortex and hex chambers.' },
  76: { text: 'Stage modifiers now appear on some levels. Read them before you shoot!' },
};

export interface LevelPlan {
  n: number;
  world: number;
  worldName: string;
  /** Position inside the world, 0-based. The last one is a boss level. */
  index: number;
  boss: boolean;
  /** Difficulty tier used for peg mix / value (1–10). */
  tier: number;
  objective: ObjectiveKind;
  shots: number;
  seed: number;
  modifiers: string[];
  unlocked: string[];
}

export interface LevelDef extends LevelPlan {
  target: number;
  /** Score needed for 2 and 3 stars. */
  stars: [number, number];
}

/** Deterministic level layout. `variant` lets the calibrator reroll a bad board. */
export function planLevel(n: number, variant = 0, objectiveOverride?: ObjectiveKind): LevelPlan {
  const world = Math.floor((n - 1) / LEVELS_PER_WORLD) + 1;
  const index = (n - 1) % LEVELS_PER_WORLD;
  const boss = index === LEVELS_PER_WORLD - 1;
  const rng = new Rng(hashString(`campaign-plan-${n}`));
  // Slow overall climb with a gentle sawtooth inside each world.
  const tier = Math.min(10, Math.max(1, Math.round(1 + (n / CAMPAIGN_LENGTH) * 7 + (index / LEVELS_PER_WORLD) * 2)));
  const unlocked: string[] = [];
  if (n >= 16) unlocked.push('peg_portal');
  if (n >= 31) unlocked.push('peg_shield');
  if (n >= 46) unlocked.push('peg_converter');
  if (n >= 61) unlocked.push('sectors');

  let objective: ObjectiveKind = 'energy';
  if (!boss && n > 5) {
    const pool: [ObjectiveKind, number][] = [['energy', 34], ['charged', 16], ['clear', 16], ['combo', 12]];
    if (n >= 9) pool.push(['reactors', 11]);
    if (n >= 31) pool.push(['shields', 11]);
    objective = rng.weighted(pool, (p) => p[1])![0];
  }
  if (objectiveOverride) objective = objectiveOverride;
  const modifiers: string[] = [];
  if (n >= 76 && (boss || rng.chance(0.35))) {
    const usable = MODIFIERS.filter((m) => !m.requires || unlocked.includes(m.requires === 'portal' ? 'peg_portal' : 'peg_shield'));
    modifiers.push(rng.pick(usable).id);
  }
  const shots = 5 + (objective === 'clear' || objective === 'shields' ? 1 : 0) + (boss ? 1 : 0) + (n <= 3 ? 1 : 0);
  return {
    n, world, worldName: WORLDS[(world - 1) % WORLDS.length], index, boss, tier, objective, shots,
    seed: hashString(`campaign-${n}-${variant}`), modifiers, unlocked,
  };
}

export const CAMPAIGN_MODS: Mods = computeMods([]);

/** Build the playable stage for a level plan. */
export function levelSetup(plan: LevelPlan, target = 999999): StageSetup {
  // Boss levels use the hand-shaped reactor-core sectors (stage 5 / 10 configs).
  const stage = plan.boss ? (plan.tier < 7 ? 5 : 10) : plan.tier === 5 || plan.tier === 10 ? plan.tier - 1 : plan.tier;
  const setup = generateStage({
    stage, seed: plan.seed, modifiers: plan.modifiers, mods: CAMPAIGN_MODS, unlocked: new Set(plan.unlocked), baseShots: plan.shots,
  });
  setup.target = plan.objective === 'energy' ? target : 999999;
  return setup;
}

/** Current value of a level's objective metric. */
export function objectiveValue(kind: ObjectiveKind, sim: ReactorSim): number {
  switch (kind) {
    case 'energy': return Math.floor(sim.energy);
    case 'charged': return sim.tally.charged;
    case 'reactors': return sim.tally.reactors;
    case 'shields': return sim.tally.shields;
    case 'clear': return Math.floor(sim.clearedPercent());
    case 'combo': return sim.tally.bestCombo;
  }
}

/** Bonus score per unused shot when a level is completed early. */
export function shotBonus(plan: LevelPlan): number {
  return 1500 + plan.tier * 500;
}

interface Calibrated { v: number; t: number; s: [number, number]; o?: ObjectiveKind }
const TABLE = calibrated as unknown as Record<string, Calibrated>;

export function getLevel(n: number): LevelDef | null {
  const c = TABLE[n];
  if (!c) return null;
  return { ...planLevel(n, c.v, c.o), target: c.t, stars: c.s };
}

export function levelCount(): number {
  return Object.keys(TABLE).length;
}

export function starsFor(def: LevelDef, score: number): number {
  return score >= def.stars[1] ? 3 : score >= def.stars[0] ? 2 : 1;
}
