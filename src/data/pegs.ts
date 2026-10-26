import type { PegType } from '../game/entities/types';

export interface PegDef {
  type: PegType;
  name: string;
  /** Short glyph drawn on the peg. */
  glyph: string;
  radius: number;
  /** Primary colour (hex). Peg colours carry meaning and are never changed by cosmetics. */
  color: number;
  energy: number;
  score: number;
  /** Hits needed before activation. */
  hits: number;
  /** Persistent pegs stay on the board between shots. */
  persistent: boolean;
  /** Collides physically (portals are trigger zones). */
  solid: boolean;
  /** Lab node required for this peg to appear in stage generation. */
  unlock?: string;
  description: string;
}

export const PEG_DEFS: Record<PegType, PegDef> = {
  standard: {
    type: 'standard', name: 'Standard Peg', glyph: '', radius: 10, color: 0x39d0ff,
    energy: 2, score: 10, hits: 1, persistent: false, solid: true,
    description: 'Small energy on first hit. Cleared after the shot.',
  },
  charged: {
    type: 'charged', name: 'Charged Peg', glyph: '⚡', radius: 11, color: 0xffc02e,
    energy: 6, score: 30, hits: 1, persistent: false, solid: true,
    description: 'Three times the energy of a standard peg.',
  },
  multiplier: {
    type: 'multiplier', name: 'Multiplier Peg', glyph: '×', radius: 11, color: 0xff3fb8,
    energy: 2, score: 25, hits: 1, persistent: true, solid: true,
    description: 'Every hit adds +0.5× to the shot multiplier. Stays on the board and stacks.',
  },
  split: {
    type: 'split', name: 'Split Peg', glyph: '⑂', radius: 11, color: 0x5dff7a,
    energy: 2, score: 30, hits: 1, persistent: false, solid: true,
    description: 'Splits the orb into two mini orbs worth 60% each.',
  },
  bomb: {
    type: 'bomb', name: 'Bomb Peg', glyph: '✹', radius: 12, color: 0xff5a36,
    energy: 3, score: 40, hits: 1, persistent: false, solid: true,
    description: 'Explodes and triggers every peg nearby. Bombs chain into bombs.',
  },
  booster: {
    type: 'booster', name: 'Bounce Booster', glyph: '', radius: 15, color: 0x6d7bff,
    energy: 1, score: 5, hits: 1, persistent: true, solid: true,
    description: 'Fires the orb back with extra force. Permanent. Builds combo.',
  },
  portal: {
    type: 'portal', name: 'Portal Pair', glyph: '', radius: 15, color: 0xb36bff,
    energy: 2, score: 20, hits: 1, persistent: true, solid: false,
    unlock: 'peg_portal',
    description: 'Teleports the orb to its twin, keeping its velocity.',
  },
  reactor: {
    type: 'reactor', name: 'Reactor Node', glyph: '◎', radius: 21, color: 0x2effd1,
    energy: 2, score: 50, hits: 2, persistent: true, solid: true,
    description: 'Hit it repeatedly to activate for a huge energy burst. Progress carries over between shots.',
  },
  converter: {
    type: 'converter', name: 'Converter Peg', glyph: '¢', radius: 11, color: 0xffe08a,
    energy: 2, score: 25, hits: 1, persistent: false, solid: true,
    unlock: 'peg_converter',
    description: 'Converts your current combo into credits.',
  },
  shield: {
    type: 'shield', name: 'Shield Peg', glyph: '⬡', radius: 12, color: 0xc9d6ff,
    energy: 8, score: 45, hits: 2, persistent: false, solid: true,
    unlock: 'peg_shield',
    description: 'Cracks on the first hit, pays out big on the second. Cracks persist between shots.',
  },
};

export const PEG_ORDER: PegType[] = [
  'standard', 'charged', 'multiplier', 'split', 'bomb', 'booster', 'portal', 'reactor', 'converter', 'shield',
];
