import type { StageProgress } from '../game/entities/types';
import type { ModeId } from '../data/modes';
import { UPGRADE_MAP } from '../data/upgrades';

export const RUN_VERSION = 1;
const KEY = 'orb-reactor.run';

export interface RunTally {
  pegsHit: number;
  bombs: number;
  splits: number;
  reactors: number;
  teleports: number;
  bestCombo: number;
  bestMult: number;
  stagesCleared: number;
  energyTotal: number;
  shotsFired: number;
  creditsFromStages: number;
}

export interface DraftState {
  options: string[];
  freeRerolls: number;
  paidRerolls: number;
  /** Increments with each reroll so results are reproducible. */
  rollIndex: number;
}

export interface StageRecord {
  stage: number;
  energy: number;
  target: number;
  shots: number;
  modifiers: string[];
}

/** Current run. Separate from the persistent profile. */
export interface RunState {
  version: number;
  id: string;
  mode: ModeId;
  seed: number;
  dailyDate?: string;
  /** Content unlocked when the run started (keeps generation reproducible). */
  unlocked: string[];
  /** Lab power snapshot for this run. */
  scoreBonus: number;
  rareLuck: number;
  rerollTokens: number;
  stage: number;
  phase: 'stage' | 'draft';
  upgrades: string[];
  credits: number;
  score: number;
  tally: RunTally;
  history: StageRecord[];
  stageProgress?: StageProgress;
  draft?: DraftState;
  lastClear?: StageClearSummary;
  startedAt: number;
  endless: boolean;
  /** Stage 10 cleared this run. */
  won?: boolean;
  /** Victory screen is pending a continue / cash-out choice. */
  victoryPending?: boolean;
}

export interface StageClearSummary {
  stage: number;
  energy: number;
  target: number;
  shotsLeft: number;
  credits: { label: string; amount: number }[];
  score: { label: string; amount: number }[];
}

export function emptyRunTally(): RunTally {
  return {
    pegsHit: 0, bombs: 0, splits: 0, reactors: 0, teleports: 0, bestCombo: 0, bestMult: 1, stagesCleared: 0,
    energyTotal: 0, shotsFired: 0, creditsFromStages: 0,
  };
}

export function saveRun(run: RunState | null): void {
  try {
    if (!run || run.mode === 'practice') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}

/** Load a saved run; returns null for anything malformed rather than crashing. */
export function loadRun(): RunState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const r = JSON.parse(raw) as RunState;
    if (!r || r.version !== RUN_VERSION || typeof r.seed !== 'number' || typeof r.stage !== 'number') return null;
    if (!Array.isArray(r.upgrades) || !r.upgrades.every((u) => UPGRADE_MAP[u])) return null;
    if (r.phase !== 'stage' && r.phase !== 'draft') return null;
    if (!r.tally || !Array.isArray(r.history) || !Array.isArray(r.unlocked)) return null;
    if (r.phase === 'draft' && !r.victoryPending && (!r.draft || !r.draft.options.every((u) => UPGRADE_MAP[u]))) return null;
    return r;
  } catch {
    return null;
  }
}
