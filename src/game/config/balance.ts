/**
 * Central balancing config. Every tunable number that shapes difficulty,
 * pacing or economy lives here so iteration happens in one place.
 */

export const BOARD = {
  width: 540,
  height: 900,
  launcherX: 270,
  launcherY: 58,
  /** Area where pegs may be placed. */
  field: { left: 34, right: 506, top: 150, bottom: 850 },
} as const;

export const PHYSICS = {
  /** Fixed simulation step (seconds). */
  dt: 1 / 240,
  gravity: 900,
  launchSpeed: 720,
  orbRadius: 9,
  pegRestitution: 0.62,
  wallRestitution: 0.82,
  maxSpeed: 1500,
  boosterRestitution: 1.08,
  boosterMinSpeed: 640,
  /** Orb considered stalled when slower than this… */
  stallSpeed: 38,
  /** …for this long (seconds). */
  stallTime: 0.55,
  stallNudge: 170,
  /** Aim angle limits measured from straight down (radians). */
  maxAimFromDown: (80 * Math.PI) / 180,
  baseLifetime: 14,
  sparkLifetime: 7,
  miniScale: 0.74,
  sparkScale: 0.6,
  /** Seconds before a shot auto-accelerates. */
  autoFastAfter: 9,
  fastScale: 2.6,
} as const;

export const RULES = {
  baseShots: 5,
  runLength: 10,
  /** Energy targets for stages 1..10. Endless stages scale from the last entry. */
  stageTargets: [100, 140, 190, 250, 330, 430, 560, 720, 920, 1180],
  endlessGrowth: 1.27,
  /** Peg value growth per stage (stage 1 = 1.0). */
  stageValueGrowth: 0.1,
  comboStep: 0.05,
  comboWindow: 1.0,
  comboDecayKeep: 0.5,
  multPegBonus: 0.5,
  maxOrbs: 6,
  maxSplitGen: 2,
  splitValue: 0.6,
  bombRadius: 82,
  chainRadius: 74,
  reactorBaseHits: 2,
  /** Stages from which modifiers can appear and become guaranteed. */
  modifierFromStage: 3,
  modifierAlwaysFrom: 6,
  modifierChance: 0.6,
} as const;

export const ECONOMY = {
  stageClearBase: 4,
  stageClearPerStage: 2,
  converterRate: 0.35,
  rerollBaseCost: 5,
  rerollCostStep: 3,
  victoryBonus: 40,
  /** One salvage credit per this many pegs hit in a run. */
  salvagePegs: 12,
  dailyCreditMul: 1.25,
  stageClearScore: 1000,
  shotLeftScore: 750,
} as const;

/** Rarity weights for upgrade drafting. */
export const RARITY_WEIGHTS = { common: 60, uncommon: 30, rare: 10 } as const;

export function stageTarget(stage: number): number {
  const t = RULES.stageTargets;
  if (stage <= t.length) return t[stage - 1];
  const extra = stage - t.length;
  return Math.round(t[t.length - 1] * Math.pow(RULES.endlessGrowth, extra) / 10) * 10;
}

export function stageValueScale(stage: number): number {
  return 1 + RULES.stageValueGrowth * (stage - 1);
}
