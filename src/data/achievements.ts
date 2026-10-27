import type { StageTally } from '../game/entities/types';

export interface AchContext {
  stats: {
    totalRuns: number; bestStage: number; highScore: number; totalCredits: number; totalPegs: number;
    totalReactors: number; totalBombs: number; totalSplits: number; longestCombo: number; dailyRuns: number;
    practiceShots: number; victories: number;
  };
  labPurchases: number;
  cosmeticsEarned: number;
  run?: { mode: string; stage: number; score: number; pegsHit: number; upgrades: number; victory: boolean };
  stage?: { stage: number; cleared: boolean; shotsLeft: number; shotsFired: number; energy: number; target: number; tally: StageTally; mode: string };
  shot?: StageTally;
  campaign: { highest: number; stars: number; perfect: number };
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  reward: { credits?: number; cosmetic?: string; title?: string };
  check: (c: AchContext) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_light', name: 'First Light', icon: '☀', desc: 'Clear Stage 1.', reward: { credits: 10 },
    check: (c) => !!c.stage?.cleared },
  { id: 'stage_5', name: 'Core Breach', icon: '◎', desc: 'Reach Stage 5.', reward: { cosmetic: 'orb_neon' },
    check: (c) => (c.run?.stage ?? 0) >= 5 && c.run?.mode !== 'practice' },
  { id: 'stage_10', name: 'Reactor Master', icon: '♛', desc: 'Clear Stage 10 and win a run.', reward: { cosmetic: 'orb_golden', title: 'Reactor Master' },
    check: (c) => !!c.run?.victory },
  { id: 'stage_15', name: 'Endless Operator', icon: '∞', desc: 'Reach Stage 15 in endless overdrive.', reward: { credits: 100, title: 'Endless Operator' },
    check: (c) => (c.run?.stage ?? 0) >= 15 },
  { id: 'pegs_100', name: 'Pinball Wizard', icon: '⋯', desc: 'Hit 100 pegs in one run.', reward: { credits: 15 },
    check: (c) => (c.run?.pegsHit ?? 0) >= 100 },
  { id: 'pegs_5000', name: 'Peg Pulverizer', icon: '▦', desc: 'Hit 5,000 pegs in total.', reward: { credits: 60 },
    check: (c) => c.stats.totalPegs >= 5000 },
  { id: 'bombs_10', name: 'Demolition Day', icon: '✹', desc: 'Trigger 10 bombs in a single stage.', reward: { credits: 25 },
    check: (c) => (c.stage?.tally.bombs ?? 0) >= 10 },
  { id: 'combo_20', name: 'Chain Reaction', icon: '⛓', desc: 'Reach a 20 combo.', reward: { credits: 10 },
    check: (c) => (c.shot?.bestCombo ?? 0) >= 20 },
  { id: 'combo_50', name: 'Prismatic', icon: '◇', desc: 'Reach a 50 combo.', reward: { cosmetic: 'hit_prism' },
    check: (c) => (c.shot?.bestCombo ?? 0) >= 50 },
  { id: 'mult_5', name: 'Multiplied', icon: '×', desc: 'Reach a ×5 shot multiplier.', reward: { credits: 20 },
    check: (c) => (c.shot?.bestMult ?? 0) >= 5 },
  { id: 'mult_10', name: 'Combo x10', icon: '✕', desc: 'Reach a ×10 shot multiplier.', reward: { credits: 50, title: 'Multiplier Maniac' },
    check: (c) => (c.shot?.bestMult ?? 0) >= 10 },
  { id: 'one_left', name: 'One in the Chamber', icon: '①', desc: 'Clear a stage with exactly one shot remaining.', reward: { credits: 15 },
    check: (c) => !!c.stage?.cleared && c.stage.shotsLeft === 1 },
  { id: 'clutch', name: 'Clutch Save', icon: '⚠', desc: 'Clear a stage on your final shot.', reward: { credits: 15 },
    check: (c) => !!c.stage?.cleared && c.stage.shotsLeft === 0 },
  { id: 'one_shot', name: 'One and Done', icon: '➹', desc: 'Clear a stage with a single shot.', reward: { credits: 25 },
    check: (c) => !!c.stage?.cleared && c.stage.shotsFired === 1 && c.stage.stage >= 2 },
  { id: 'overfill_200', name: 'Meltdown Margin', icon: '⤒', desc: 'Overfill a reactor target by 200%.', reward: { credits: 40 },
    check: (c) => !!c.stage?.cleared && c.stage.energy >= c.stage.target * 3 },
  { id: 'reactors_3', name: 'Grid Online', icon: '❂', desc: 'Activate 3 reactor nodes in one stage.', reward: { credits: 25 },
    check: (c) => (c.stage?.tally.reactors ?? 0) >= 3 },
  { id: 'orbs_8', name: 'Orb Storm', icon: '⁂', desc: 'Have 8 orbs in the chamber at once.', reward: { credits: 30 },
    check: (c) => (c.shot?.maxOrbs ?? 0) >= 8 },
  { id: 'teleport_5', name: 'Wormhole Surfer', icon: '◌', desc: 'Teleport 5 times in a single shot.', reward: { credits: 20 },
    check: (c) => (c.shot?.teleports ?? 0) >= 5 },
  { id: 'score_100k', name: 'Six Figures', icon: '✪', desc: 'Score 100,000 in one run.', reward: { credits: 40 },
    check: (c) => (c.run?.score ?? 0) >= 100000 },
  { id: 'collector', name: 'Collector', icon: '❖', desc: 'Hold 10 upgrades in a single run.', reward: { credits: 25 },
    check: (c) => (c.run?.upgrades ?? 0) >= 10 },
  { id: 'daily_1', name: 'Daily Operator', icon: '☼', desc: 'Complete a Daily Reactor.', reward: { cosmetic: 'accent_ember' },
    check: (c) => c.stats.dailyRuns >= 1 },
  { id: 'runs_10', name: 'Shift Veteran', icon: '⌛', desc: 'Finish 10 runs.', reward: { cosmetic: 'bg_nebula' },
    check: (c) => c.stats.totalRuns >= 10 },
  { id: 'credits_1000', name: 'Venture Capital', icon: '¢', desc: 'Earn 1,000 credits in total.', reward: { title: 'Financier' },
    check: (c) => c.stats.totalCredits >= 1000 },
  { id: 'lab_first', name: 'Lab Access', icon: '⌬', desc: 'Buy your first Reactor Lab upgrade.', reward: { credits: 10 },
    check: (c) => c.labPurchases >= 1 },
  { id: 'lab_8', name: 'Head Scientist', icon: '⚗', desc: 'Own 8 Reactor Lab upgrades.', reward: { credits: 50, title: 'Head Scientist' },
    check: (c) => c.labPurchases >= 8 },
  { id: 'first_cosmetic', name: 'New Look', icon: '✧', desc: 'Unlock your first cosmetic.', reward: { credits: 10 },
    check: (c) => c.cosmeticsEarned >= 1 },
  { id: 'hardcore_5', name: 'Hardened', icon: '☠', desc: 'Reach Stage 5 in Hardcore mode.', reward: { credits: 60, title: 'Hardened' },
    check: (c) => c.run?.mode === 'hardcore' && c.run.stage >= 5 },
  { id: 'level_10', name: 'Saga Begins', icon: '➊', desc: 'Complete campaign level 10.', reward: { credits: 15 },
    check: (c) => c.campaign.highest >= 10 },
  { id: 'level_50', name: 'World Walker', icon: '⌖', desc: 'Complete campaign level 50.', reward: { credits: 50 },
    check: (c) => c.campaign.highest >= 50 },
  { id: 'level_100', name: 'Saga Hero', icon: '⚑', desc: 'Complete campaign level 100.', reward: { credits: 100, title: 'Saga Hero' },
    check: (c) => c.campaign.highest >= 100 },
  { id: 'level_300', name: 'Reactor Legend', icon: '♜', desc: 'Complete all 300 campaign levels.', reward: { credits: 300, title: 'Reactor Legend' },
    check: (c) => c.campaign.highest >= 300 },
  { id: 'stars_300', name: 'Star Collector', icon: '★', desc: 'Earn 300 campaign stars.', reward: { credits: 60 },
    check: (c) => c.campaign.stars >= 300 },
  { id: 'stars_1000', name: 'Constellation', icon: '✶', desc: 'Earn 1,000 campaign stars.', reward: { credits: 150, title: 'Star Forger' },
    check: (c) => c.campaign.stars >= 1000 },
  { id: 'perfect_1', name: 'Six-Star Shot', icon: '✯', desc: 'Get all 6 stars on a campaign level.', reward: { credits: 20 },
    check: (c) => c.campaign.perfect >= 1 },
  { id: 'perfect_25', name: 'Perfectionist', icon: '✷', desc: 'Get all 6 stars on 25 campaign levels.', reward: { credits: 80, title: 'Perfectionist' },
    check: (c) => c.campaign.perfect >= 25 },
  { id: 'practice_10', name: 'Lab Rat', icon: '⚙', desc: 'Fire 10 orbs in Practice mode.', reward: { credits: 5 },
    check: (c) => c.stats.practiceShots >= 10 },
];

export const ACHIEVEMENT_MAP: Record<string, AchievementDef> = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));
