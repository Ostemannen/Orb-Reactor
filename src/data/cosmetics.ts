/**
 * Cosmetics change appearance only. Nothing in this file is ever read by the
 * simulation, scoring, economy or upgrade code.
 */
export type CosmeticSlot = 'orb' | 'trail' | 'theme' | 'background' | 'hit' | 'accent';

export interface CosmeticDef {
  id: string;
  slot: CosmeticSlot;
  name: string;
  desc: string;
  /** How it is obtained. */
  source: { kind: 'default' } | { kind: 'achievement'; id: string } | { kind: 'lab'; id: string } | { kind: 'shop'; price: string };
  /** Visual parameters consumed by the renderer. */
  look: {
    core?: number;
    glow?: number;
    ring?: number;
    style?: string;
    colors?: number[];
    /** CSS colours for UI accent / background. */
    css?: string[];
  };
}

export const SLOT_LABELS: Record<CosmeticSlot, string> = {
  orb: 'Orb Skin',
  trail: 'Trail',
  theme: 'Reactor Theme',
  background: 'Background',
  hit: 'Hit Effect',
  accent: 'UI Accent',
};

export const COSMETICS: CosmeticDef[] = [
  // Defaults
  { id: 'orb_default', slot: 'orb', name: 'Standard Orb', desc: 'Clean white plasma.', source: { kind: 'default' },
    look: { core: 0xffffff, glow: 0x8fe9ff } },
  { id: 'trail_default', slot: 'trail', name: 'Ion Trail', desc: 'A soft cyan streak.', source: { kind: 'default' },
    look: { colors: [0x6fe3ff], style: 'line' } },
  { id: 'theme_default', slot: 'theme', name: 'Core Standard', desc: 'The default reactor housing.', source: { kind: 'default' },
    look: { colors: [0x1f6dff, 0x0b1a3a], style: 'standard' } },
  { id: 'bg_default', slot: 'background', name: 'Deep Grid', desc: 'Dark navy with a circuit grid.', source: { kind: 'default' },
    look: { css: ['#050816', '#0b1430'], colors: [0x14305e] } },
  { id: 'hit_default', slot: 'hit', name: 'Spark Burst', desc: 'Classic spark particles.', source: { kind: 'default' },
    look: { style: 'spark' } },
  { id: 'accent_default', slot: 'accent', name: 'Reactor Cyan', desc: 'The standard interface accent.', source: { kind: 'default' },
    look: { css: ['#36e2ff', '#0b8fb0'] } },

  // Earnable
  { id: 'orb_neon', slot: 'orb', name: 'Neon Core Orb', desc: 'A magenta core wrapped in neon.', source: { kind: 'achievement', id: 'stage_5' },
    look: { core: 0xffe6ff, glow: 0xff3fd2, ring: 0xff9cf0 } },
  { id: 'orb_golden', slot: 'orb', name: 'Golden Spark Orb', desc: 'Molten gold for reactor masters.', source: { kind: 'achievement', id: 'stage_10' },
    look: { core: 0xfff4c2, glow: 0xffb300, ring: 0xffe27a } },
  { id: 'hit_prism', slot: 'hit', name: 'Prism Hit Effect', desc: 'Hits scatter into rainbow shards.', source: { kind: 'achievement', id: 'combo_50' },
    look: { style: 'prism' } },
  { id: 'trail_circuit', slot: 'trail', name: 'Circuit Trail', desc: 'A green data-stream trail.', source: { kind: 'lab', id: 'proto_wing' },
    look: { colors: [0x4dff9a, 0x00c46a], style: 'dash' } },
  { id: 'accent_ember', slot: 'accent', name: 'Daily Ember', desc: 'Warm orange accent for daily operators.', source: { kind: 'achievement', id: 'daily_1' },
    look: { css: ['#ff9d3c', '#b0520b'] } },
  { id: 'bg_nebula', slot: 'background', name: 'Nebula Deep', desc: 'A violet nebula behind the chamber.', source: { kind: 'achievement', id: 'runs_10' },
    look: { css: ['#0d0618', '#26103d'], colors: [0x3a1c5c] } },

  // Shop (cosmetic-only, purchases are disabled in this build)
  { id: 'orb_void', slot: 'orb', name: 'Void Orb', desc: 'A black hole with a violet rim.', source: { kind: 'shop', price: '$1.99' },
    look: { core: 0x1a0830, glow: 0xa05cff, ring: 0xd7b8ff } },
  { id: 'orb_ice', slot: 'orb', name: 'Cryo Orb', desc: 'Frozen plasma, pale and sharp.', source: { kind: 'shop', price: '$1.99' },
    look: { core: 0xeaffff, glow: 0x7fd8ff, ring: 0xbff3ff } },
  { id: 'trail_void', slot: 'trail', name: 'Void Trail', desc: 'A trail that eats the light.', source: { kind: 'shop', price: '$1.49' },
    look: { colors: [0x9b5cff, 0x2a0d55], style: 'line' } },
  { id: 'trail_rainbow', slot: 'trail', name: 'Spectrum Trail', desc: 'Cycles through every hue.', source: { kind: 'shop', price: '$1.49' },
    look: { colors: [0xff4f6d, 0xffc43d, 0x4dff9a, 0x3db8ff, 0xb65cff], style: 'rainbow' } },
  { id: 'theme_retro', slot: 'theme', name: 'Retro Reactor', desc: 'Warm 80s arcade cabinet housing.', source: { kind: 'shop', price: '$2.49' },
    look: { colors: [0xff4fa3, 0x2a0b2e], style: 'retro' } },
  { id: 'theme_ice', slot: 'theme', name: 'Ice Reactor', desc: 'Frosted cryogenic housing.', source: { kind: 'shop', price: '$2.49' },
    look: { colors: [0x9fe8ff, 0x0c2433], style: 'ice' } },
  { id: 'bg_aurora', slot: 'background', name: 'Aurora Field', desc: 'Green-teal aurora bands.', source: { kind: 'shop', price: '$1.99' },
    look: { css: ['#031412', '#06302a'], colors: [0x0e4a3e] } },
  { id: 'hit_nova', slot: 'hit', name: 'Nova Rings', desc: 'Every hit blooms into expanding rings.', source: { kind: 'shop', price: '$1.49' },
    look: { style: 'nova' } },
  { id: 'accent_mint', slot: 'accent', name: 'Mint Interface', desc: 'A cool mint interface accent.', source: { kind: 'shop', price: '$0.99' },
    look: { css: ['#5dffc4', '#0f9b6e'] } },
];

export const COSMETIC_MAP: Record<string, CosmeticDef> = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

export const DEFAULT_LOADOUT: Record<CosmeticSlot, string> = {
  orb: 'orb_default',
  trail: 'trail_default',
  theme: 'theme_default',
  background: 'bg_default',
  hit: 'hit_default',
  accent: 'accent_default',
};
