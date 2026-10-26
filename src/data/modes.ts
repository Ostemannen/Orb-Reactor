export type ModeId = 'standard' | 'daily' | 'practice' | 'hardcore' | 'chaos';

export interface ModeDef {
  id: ModeId;
  name: string;
  tagline: string;
  desc: string;
  unlock?: string;
  baseShots: number;
  targetMul: number;
  creditMul: number;
  /** Modifier schedule. */
  modifiers: { fromStage: number; always: boolean; doubleFrom?: number };
  /** Whether meta progression (lab power) applies. */
  usesLabPower: boolean;
  metaRewards: boolean;
}

export const MODES: Record<ModeId, ModeDef> = {
  standard: {
    id: 'standard', name: 'Standard Run', tagline: '10 stages. One reactor. Your build.',
    desc: 'The main experience. Clear 10 stages, then push into endless overdrive.',
    baseShots: 5, targetMul: 1, creditMul: 1, modifiers: { fromStage: 3, always: false }, usesLabPower: true, metaRewards: true,
  },
  daily: {
    id: 'daily', name: 'Daily Reactor', tagline: 'Same seed for everyone. One attempt per day.',
    desc: 'A seeded daily run with fixed conditions: every peg type, a seeded starting upgrade and modifiers from stage 2. Lab power upgrades are disabled so every attempt is fair. Credits +25%.',
    baseShots: 5, targetMul: 1, creditMul: 1.25, modifiers: { fromStage: 2, always: true }, usesLabPower: false, metaRewards: true,
  },
  practice: {
    id: 'practice', name: 'Practice Chamber', tagline: 'Unlimited shots. Every peg type. No pressure.',
    desc: 'Test aim and peg interactions freely. No credits, stats or achievements except practice ones.',
    baseShots: 99, targetMul: 1, creditMul: 0, modifiers: { fromStage: 99, always: false }, usesLabPower: false, metaRewards: false,
  },
  hardcore: {
    id: 'hardcore', name: 'Hardcore', tagline: '4 shots per stage. Higher targets. More credits.',
    desc: 'Only 4 shots per stage and targets +10%. Credits +50%.', unlock: 'challenge_hardcore',
    baseShots: 4, targetMul: 1.1, creditMul: 1.5, modifiers: { fromStage: 3, always: false }, usesLabPower: true, metaRewards: true,
  },
  chaos: {
    id: 'chaos', name: 'Chaos Core', tagline: 'Modifiers everywhere. Twice as many later.',
    desc: 'Every stage has a modifier, and from stage 4 two of them stack. Credits +40%.', unlock: 'challenge_chaos',
    baseShots: 5, targetMul: 1, creditMul: 1.4, modifiers: { fromStage: 1, always: true, doubleFrom: 4 }, usesLabPower: true, metaRewards: true,
  },
};
