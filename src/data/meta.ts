/**
 * Reactor Lab: permanent, modest progression bought with credits.
 * Power increases are deliberately small; most nodes unlock variety.
 */
export interface LabNode {
  id: string;
  name: string;
  icon: string;
  desc: string;
  /** Cost per level. Length = max level. */
  costs: number[];
  requires?: string;
  group: 'Content' | 'Schematics' | 'Calibration' | 'Archive';
}

export const LAB_NODES: LabNode[] = [
  { id: 'peg_portal', name: 'Portal Pairs', icon: '◌', group: 'Content', costs: [40],
    desc: 'Portal pegs start appearing in stage generation. Unlocks the Portal Storm modifier.' },
  { id: 'peg_shield', name: 'Shield Pegs', icon: '⬡', group: 'Content', costs: [60],
    desc: 'Two-hit shield pegs join the chamber. Unlocks Shield Breaker and the Shield Wall modifier.' },
  { id: 'peg_converter', name: 'Converter Pegs', icon: '¢', group: 'Content', costs: [70],
    desc: 'Converter pegs turn combo into credits. Unlocks Mint and Converter Coil upgrades.' },
  { id: 'sectors', name: 'Sector Maps', icon: '◈', group: 'Content', costs: [110],
    desc: 'Adds 14 exotic sector layouts to Reactor Runs: spiral, vortex, hex, heart, star, galaxy, atom, helix and more.' },
  { id: 'pool_1', name: 'Advanced Schematics', icon: '⌬', group: 'Schematics', costs: [120],
    desc: 'Adds 5 advanced upgrades to the draft pool (Reactor Seed, Capacitor, Multiplier Field, Reactor Efficiency, …).' },
  { id: 'pool_2', name: 'Forbidden Schematics', icon: '⍟', group: 'Schematics', costs: [240], requires: 'pool_1',
    desc: 'Adds 4 rare upgrades to the pool: Trident, Aftershock, Compound Interest, Talent Scout.' },
  { id: 'luck', name: 'Rare Resonance', icon: '✧', group: 'Calibration', costs: [100, 200],
    desc: 'Rare upgrades appear 35% more often per level.' },
  { id: 'score_amp', name: 'Score Amplifier', icon: '✪', group: 'Calibration', costs: [40, 90, 160],
    desc: '+5% score per level. Score only — never energy.' },
  { id: 'seed_fund', name: 'Seed Fund', icon: '⛁', group: 'Calibration', costs: [50, 100, 150],
    desc: 'Start each run with +5 credits per level (spendable on rerolls).' },
  { id: 'reroll', name: 'Reroll Token', icon: '⟳', group: 'Calibration', costs: [150],
    desc: 'One free extra reroll per run.' },
  { id: 'proto_wing', name: 'Prototype Wing', icon: '✦', group: 'Archive', costs: [75],
    desc: 'Unlocks the Circuit Trail cosmetic.' },
  { id: 'music_2', name: 'Track: Plasma Drift', icon: '♪', group: 'Archive', costs: [60],
    desc: 'Unlocks a second music track.' },
  { id: 'music_3', name: 'Track: Core Meltdown', icon: '♫', group: 'Archive', costs: [120], requires: 'music_2',
    desc: 'Unlocks a third, faster music track.' },
  { id: 'challenge_hardcore', name: 'Challenge: Hardcore', icon: '☠', group: 'Archive', costs: [150],
    desc: 'Unlocks Hardcore mode: 4 shots per stage, +10% targets, +50% credits.' },
  { id: 'challenge_chaos', name: 'Challenge: Chaos Core', icon: '✺', group: 'Archive', costs: [200],
    desc: 'Unlocks Chaos mode: modifiers from stage 1, double modifiers from stage 4, +40% credits.' },
];

export const LAB_MAP: Record<string, LabNode> = Object.fromEntries(LAB_NODES.map((n) => [n.id, n]));

export const MUSIC_TRACKS = [
  { id: 'track_1', name: 'Reactor Hum', unlock: undefined as string | undefined },
  { id: 'track_2', name: 'Plasma Drift', unlock: 'music_2' },
  { id: 'track_3', name: 'Core Meltdown', unlock: 'music_3' },
];
