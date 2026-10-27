export type PegType =
  | 'standard'
  | 'charged'
  | 'multiplier'
  | 'split'
  | 'bomb'
  | 'booster'
  | 'portal'
  | 'reactor'
  | 'converter'
  | 'shield';

export type PegMotion =
  | { kind: 'orbit'; cx: number; cy: number; radius: number; speed: number; phase: number }
  | { kind: 'slide'; axis: 'x' | 'y'; amp: number; speed: number; phase: number };

/** Static description of a peg as produced by the board generator. */
export interface PegSpec {
  id: number;
  type: PegType;
  x: number;
  y: number;
  motion?: PegMotion;
  /** Paired portal id. */
  pair?: number;
}

export type PegState = 'idle' | 'lit' | 'spent' | 'gone';

/** Runtime peg. */
export interface Peg {
  id: number;
  type: PegType;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  r: number;
  motion?: PegMotion;
  pair?: number;
  state: PegState;
  /** Hits remaining before activation (reactor, shield). */
  hp: number;
  maxHp: number;
  activationsLeft: number;
  /** Has generated first-hit energy this shot (persistent pegs). */
  touchedThisShot: boolean;
  /** Global cooldown before it can register another hit. */
  cooldown: number;
}

export type OrbKind = 'main' | 'mini' | 'spark';

export interface Orb {
  id: number;
  kind: OrbKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  /** Value factor applied to everything this orb generates. */
  value: number;
  gen: number;
  age: number;
  lifetime: number;
  stall: number;
  nudges: number;
  portalCd: number;
  /** Collisions disabled until this age (last-resort unstick). */
  ghostUntil: number;
  alive: boolean;
  /** Per-peg contact cooldowns. */
  cds: Map<number, number>;
}

export interface StageModifierRef {
  id: string;
}

/** Everything needed to build a stage deterministically. */
export interface StageSetup {
  stage: number;
  seed: number;
  target: number;
  shots: number;
  modifiers: string[];
  layout: string;
  pegs: PegSpec[];
  isCore: boolean;
}

/** Persisted mid-stage progress so refresh can resume exactly. */
export interface StageProgress {
  energy: number;
  score: number;
  credits: number;
  shotsLeft: number;
  shotsFired: number;
  pegs: { id: number; state: PegState; hp: number; activationsLeft: number }[];
  carryCombo: number;
  emergencyUsed: boolean;
  tally: StageTally;
}

export interface StageTally {
  pegsHit: number;
  charged: number;
  shields: number;
  bombs: number;
  splits: number;
  reactors: number;
  teleports: number;
  bestCombo: number;
  bestMult: number;
  maxOrbs: number;
}

export function emptyTally(): StageTally {
  return { pegsHit: 0, charged: 0, shields: 0, bombs: 0, splits: 0, reactors: 0, teleports: 0, bestCombo: 0, bestMult: 1, maxOrbs: 1 };
}
