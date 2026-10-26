import type { PegType } from '../game/entities/types';

export interface ModifierDef {
  id: string;
  name: string;
  icon: string;
  /** Player-facing explanation. Must describe the real effect. */
  desc: string;
  targetMul?: number;
  chargedMul?: number;
  bombRadiusMul?: number;
  comboStepMul?: number;
  creditMul?: number;
  gravityMul?: number;
  shieldMul?: number;
  echoSplit?: boolean;
  fragileMult?: boolean;
  /** Changes to the peg mix (multiplier on base counts or flat additions). */
  pegScale?: Partial<Record<PegType, number>>;
  pegAdd?: Partial<Record<PegType, number>>;
  /** Peg type required for this modifier to make sense. */
  requires?: PegType;
}

export const MODIFIERS: ModifierDef[] = [
  { id: 'high_voltage', name: 'High Voltage', icon: '⚡',
    desc: 'Charged pegs give +50% energy, and 3 extra spawn.', chargedMul: 1.5, pegAdd: { charged: 3 } },
  { id: 'volatile_core', name: 'Volatile Core', icon: '✹',
    desc: 'Bomb radius +50% and 2 extra bombs spawn.', bombRadiusMul: 1.5, pegAdd: { bomb: 2 } },
  { id: 'tight_reactor', name: 'Tight Reactor', icon: '▤',
    desc: '40% fewer standard pegs. Target −10%.', pegScale: { standard: 0.6 }, targetMul: 0.9 },
  { id: 'echo_split', name: 'Echo Split', icon: '⑂',
    desc: 'The first split each shot creates one extra mini orb. +1 split peg.', echoSplit: true, pegAdd: { split: 1 } },
  { id: 'fragile_grid', name: 'Fragile Grid', icon: '⌗',
    desc: 'Multiplier pegs self-destruct after one hit instead of staying. +2 multiplier pegs.', fragileMult: true, pegAdd: { multiplier: 2 } },
  { id: 'rich_circuit', name: 'Rich Circuit', icon: '¢',
    desc: 'All credits earned this stage +60%.', creditMul: 1.6 },
  { id: 'overheat', name: 'Overheat', icon: '♨',
    desc: 'Target +15%, but every combo step is worth 50% more.', targetMul: 1.15, comboStepMul: 1.5 },
  { id: 'low_gravity', name: 'Low Gravity', icon: '☾',
    desc: 'Gravity −25%. Orbs float and linger.', gravityMul: 0.75 },
  { id: 'portal_storm', name: 'Portal Storm', icon: '◌',
    desc: 'Two extra portal pairs warp across the chamber.', pegAdd: { portal: 4 }, requires: 'portal' },
  { id: 'shield_wall', name: 'Shield Wall', icon: '⬡',
    desc: 'Many standard pegs become shields. Shields pay double.', shieldMul: 2, pegScale: { standard: 0.75 }, pegAdd: { shield: 8 }, requires: 'shield' },
];

export const MODIFIER_MAP: Record<string, ModifierDef> = Object.fromEntries(MODIFIERS.map((m) => [m.id, m]));
