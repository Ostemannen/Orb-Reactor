import type { PegType } from '../game/entities/types';

export interface StageConfig {
  /** Base peg counts (before modifiers / upgrades / unlock filtering). */
  mix: Partial<Record<PegType, number>>;
  /** Layout families this stage may draw from. */
  layouts: string[];
  /** Hits needed on reactor nodes. */
  reactorHits: number;
  /** Number of moving peg groups. */
  movers: number;
  /** Core stages are hand-shaped set pieces around a central reactor. */
  core?: boolean;
}

/**
 * Stage table for the 10-stage run. Difficulty rises through target growth
 * (see balance.ts), denser layouts, fewer easy standard pegs and more
 * advanced pieces — not through hidden randomness.
 */
export const STAGES: StageConfig[] = [
  { mix: { standard: 72, charged: 8, multiplier: 2, split: 1, bomb: 2, booster: 1, reactor: 1, converter: 1, portal: 0 },
    layouts: ['grid', 'lattice45'], reactorHits: 2, movers: 0 },
  { mix: { standard: 70, charged: 6, multiplier: 2, split: 2, bomb: 2, booster: 2, reactor: 1, converter: 1, portal: 2, shield: 2 },
    layouts: ['grid', 'diamonds', 'checker', 'crosses'], reactorHits: 2, movers: 0 },
  { mix: { standard: 68, charged: 7, multiplier: 3, split: 2, bomb: 3, booster: 2, reactor: 1, converter: 1, portal: 2, shield: 3 },
    layouts: ['diamonds', 'arches', 'waves', 'chevrons', 'pyramid'], reactorHits: 2, movers: 0 },
  { mix: { standard: 66, charged: 7, multiplier: 3, split: 2, bomb: 3, booster: 2, reactor: 2, converter: 1, portal: 2, shield: 4 },
    layouts: ['arches', 'waves', 'rings', 'zigzag', 'columns'], reactorHits: 3, movers: 1 },
  { mix: { standard: 60, charged: 8, multiplier: 3, split: 2, bomb: 4, booster: 3, reactor: 1, converter: 2, portal: 2, shield: 4 },
    layouts: ['core'], reactorHits: 3, movers: 1, core: true },
  { mix: { standard: 62, charged: 7, multiplier: 3, split: 3, bomb: 3, booster: 2, reactor: 2, converter: 1, portal: 2, shield: 5 },
    layouts: ['rings', 'grid', 'waves', 'funnel', 'scatter', 'ladder'], reactorHits: 3, movers: 1 },
  { mix: { standard: 60, charged: 7, multiplier: 3, split: 3, bomb: 4, booster: 3, reactor: 2, converter: 2, portal: 2, shield: 6 },
    layouts: ['funnel', 'diamonds', 'rings', 'chevrons', 'crosses'], reactorHits: 3, movers: 2 },
  { mix: { standard: 58, charged: 8, multiplier: 4, split: 3, bomb: 4, booster: 3, reactor: 2, converter: 2, portal: 4, shield: 6 },
    layouts: ['waves', 'arches', 'funnel', 'zigzag', 'columns'], reactorHits: 4, movers: 2 },
  { mix: { standard: 56, charged: 8, multiplier: 4, split: 3, bomb: 4, booster: 3, reactor: 2, converter: 2, portal: 4, shield: 7 },
    layouts: ['rings', 'funnel', 'grid', 'scatter', 'pyramid', 'ladder'], reactorHits: 4, movers: 2 },
  { mix: { standard: 54, charged: 9, multiplier: 4, split: 3, bomb: 5, booster: 3, reactor: 2, converter: 2, portal: 4, shield: 7 },
    layouts: ['core'], reactorHits: 4, movers: 2, core: true },
];

/** Layouts added by the "Sector Maps" lab unlock. */
export const SECTOR_LAYOUTS = [
  'spiral', 'vortex', 'hexfield', 'heart', 'star', 'flower', 'galaxy', 'pinwheel', 'atom', 'bubbles', 'hourglass', 'maze', 'dna', 'bullseye',
];

export const LAYOUT_NAMES: Record<string, string> = {
  grid: 'Lattice Sector',
  diamonds: 'Crystal Sector',
  arches: 'Arch Sector',
  waves: 'Wave Sector',
  rings: 'Ring Sector',
  funnel: 'Funnel Sector',
  core: 'Reactor Core',
  spiral: 'Spiral Sector',
  vortex: 'Vortex Sector',
  hexfield: 'Hex Sector',
  practice: 'Training Chamber',
  lattice45: 'Diamond Lattice',
  chevrons: 'Chevron Sector',
  zigzag: 'Zigzag Sector',
  columns: 'Pillar Sector',
  crosses: 'Cross Sector',
  pyramid: 'Pyramid Sector',
  hourglass: 'Hourglass Sector',
  heart: 'Heart Sector',
  star: 'Star Sector',
  flower: 'Bloom Sector',
  galaxy: 'Galaxy Sector',
  pinwheel: 'Pinwheel Sector',
  atom: 'Atom Sector',
  bubbles: 'Bubble Sector',
  ladder: 'Ladder Sector',
  checker: 'Checker Sector',
  scatter: 'Scatter Field',
  maze: 'Maze Sector',
  dna: 'Helix Sector',
  bullseye: 'Bullseye Sector',
};

export function stageConfig(stage: number): StageConfig {
  if (stage <= STAGES.length) return STAGES[stage - 1];
  // Endless: reuse late-game configs with escalating hardness.
  const base = STAGES[6 + ((stage - 11) % 4)];
  return { ...base, reactorHits: Math.min(5, base.reactorHits + 1), movers: 2 };
}
