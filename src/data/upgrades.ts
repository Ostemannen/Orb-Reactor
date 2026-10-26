import { PHYSICS, RULES, ECONOMY } from '../game/config/balance';

/**
 * Aggregated run modifiers. Upgrades are pure data: each one adds numbers to
 * these fields, so stacking is always additive and easy to reason about.
 */
export interface Mods {
  orbSpeed: number;
  orbSize: number;
  orbBounce: number;
  gravity: number;
  lifetime: number;
  magnet: number;
  startCombo: number;
  wallCombo: number;
  standardEnergy: number;
  chargedMul: number;
  reactorMul: number;
  reactorBonus: number;
  reactorHitsLess: number;
  chainChance: number;
  firstHitsBonus: number;
  shieldBreaker: number;
  energyMul: number;
  multPegBonus: number;
  comboWindow: number;
  comboStep: number;
  comboKeep: number;
  comboDecayKeep: number;
  overdriveScore: number;
  comboCredits: number;
  splitValue: number;
  splitCount: number;
  sparkOnSplit: number;
  miniFull: number;
  maxOrbs: number;
  miniLifetime: number;
  bombRadius: number;
  bombEnergy: number;
  aftershock: number;
  overfillCredits: number;
  shotCredits: number;
  precision: number;
  surplus: number;
  creditMul: number;
  converterEnergy: number;
  converterRate: number;
  interest: number;
  extraShots: number;
  rerolls: number;
  revealModifier: number;
  modifierRelief: number;
  emergency: number;
  scope: number;
  draftSize: number;
  scoreMul: number;
  extraCharged: number;
  extraReactors: number;
  extraMult: number;
  extraBombs: number;
  extraSplits: number;
  extraConverters: number;
}

export function baseMods(): Mods {
  return {
    orbSpeed: 1, orbSize: 1, orbBounce: 0, gravity: 1, lifetime: PHYSICS.baseLifetime, magnet: 0,
    startCombo: 0, wallCombo: 0,
    standardEnergy: 0, chargedMul: 1, reactorMul: 1, reactorBonus: 0, reactorHitsLess: 0,
    chainChance: 0, firstHitsBonus: 0, shieldBreaker: 0, energyMul: 1,
    multPegBonus: RULES.multPegBonus, comboWindow: RULES.comboWindow, comboStep: RULES.comboStep,
    comboKeep: 0, comboDecayKeep: RULES.comboDecayKeep, overdriveScore: 0, comboCredits: 0,
    splitValue: RULES.splitValue, splitCount: 2, sparkOnSplit: 0, miniFull: 0, maxOrbs: RULES.maxOrbs,
    miniLifetime: 0, bombRadius: 1, bombEnergy: 1, aftershock: 0,
    overfillCredits: 0, shotCredits: 0, precision: 0, surplus: 0, creditMul: 1,
    converterEnergy: 0, converterRate: ECONOMY.converterRate, interest: 0,
    extraShots: 0, rerolls: 0, revealModifier: 0, modifierRelief: 0, emergency: 0, scope: 0, draftSize: 3,
    scoreMul: 1,
    extraCharged: 0, extraReactors: 0, extraMult: 0, extraBombs: 0, extraSplits: 0, extraConverters: 0,
  };
}

export type UpgradeCategory = 'orb' | 'energy' | 'combo' | 'split' | 'economy' | 'utility';
export type BuildTag = 'split' | 'combo' | 'bomb' | 'reactor' | 'credit' | 'orb' | 'utility';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;
  category: UpgradeCategory;
  tags: BuildTag[];
  rarity: Rarity;
  max: number;
  desc: string;
  mods: Partial<Mods>;
  /** Lab node required for this upgrade to enter the draft pool. */
  unlock?: string;
}

export const UPGRADES: UpgradeDef[] = [
  // ── Orb ────────────────────────────────────────────────────────────────
  { id: 'overdrive_coil', name: 'Overdrive Coil', icon: '➹', category: 'orb', tags: ['orb'], rarity: 'common', max: 3,
    desc: 'Launch speed +10%. Reaches deeper and hits harder.', mods: { orbSpeed: 0.1 } },
  { id: 'wide_core', name: 'Wide Core', icon: '◯', category: 'orb', tags: ['orb'], rarity: 'common', max: 3,
    desc: 'Orb size +10%. Wider sweep, more contacts.', mods: { orbSize: 0.1 } },
  { id: 'elastic_shell', name: 'Elastic Shell', icon: '◠', category: 'orb', tags: ['orb', 'combo'], rarity: 'common', max: 3,
    desc: 'Orb bounciness +8%. Livelier rebounds keep chains going.', mods: { orbBounce: 0.05 } },
  { id: 'feather_core', name: 'Feather Core', icon: '❧', category: 'orb', tags: ['orb'], rarity: 'uncommon', max: 2,
    desc: 'Gravity −12%. Orbs hang in the chamber longer.', mods: { gravity: -0.12 } },
  { id: 'dense_core', name: 'Dense Core', icon: '●', category: 'orb', tags: ['orb'], rarity: 'uncommon', max: 1,
    desc: 'Heavier orb: gravity +15%, but standard pegs give +2 energy.', mods: { gravity: 0.15, standardEnergy: 2 } },
  { id: 'durable_plasma', name: 'Durable Plasma', icon: '♾', category: 'orb', tags: ['orb', 'combo'], rarity: 'uncommon', max: 2,
    desc: 'Orb lifetime +5s and every wall bounce adds +1 combo.', mods: { lifetime: 5, wallCombo: 1 } },
  { id: 'magnet_core', name: 'Magnet Core', icon: '⊛', category: 'orb', tags: ['orb', 'reactor'], rarity: 'uncommon', max: 2,
    desc: 'Orbs are gently pulled toward charged pegs and reactor nodes.', mods: { magnet: 1 } },
  { id: 'primed_core', name: 'Primed Core', icon: '✦', category: 'orb', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'Start every shot with +3 combo (+0.24× multiplier).', mods: { startCombo: 3 } },

  // ── Energy ─────────────────────────────────────────────────────────────
  { id: 'high_tension', name: 'High Tension', icon: '⚡', category: 'energy', tags: ['reactor'], rarity: 'common', max: 4,
    desc: 'Charged pegs give +25% energy.', mods: { chargedMul: 0.25 } },
  { id: 'dense_grid', name: 'Dense Grid', icon: '▦', category: 'energy', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'Standard pegs give +1 energy (+33%).', mods: { standardEnergy: 1 } },
  { id: 'charged_grid', name: 'Charged Grid', icon: '⚡', category: 'energy', tags: ['reactor'], rarity: 'uncommon', max: 3,
    desc: '+4 charged pegs appear on every board.', mods: { extraCharged: 4 } },
  { id: 'reactor_overflow', name: 'Reactor Overflow', icon: '↻', category: 'energy', tags: ['reactor'], rarity: 'uncommon', max: 2,
    desc: 'Reactor nodes re-arm after activating (+1 bonus activation each).', mods: { reactorBonus: 1 } },
  { id: 'hair_trigger', name: 'Hair Trigger', icon: '⌁', category: 'energy', tags: ['reactor'], rarity: 'common', max: 2,
    desc: 'Reactor nodes need 1 fewer hit to activate (minimum 1).', mods: { reactorHitsLess: 1 } },
  { id: 'reactor_amp', name: 'Reactor Amplifier', icon: '◎', category: 'energy', tags: ['reactor'], rarity: 'common', max: 3,
    desc: 'Reactor node activations give +60% energy.', mods: { reactorMul: 0.6 } },
  { id: 'reactor_seed', name: 'Reactor Seed', icon: '❂', category: 'energy', tags: ['reactor'], rarity: 'rare', max: 2,
    desc: '+1 reactor node on every board.', mods: { extraReactors: 1 }, unlock: 'pool_1' },
  { id: 'arc_link', name: 'Arc Link', icon: 'ϟ', category: 'energy', tags: ['combo', 'bomb'], rarity: 'uncommon', max: 3,
    desc: 'Standard pegs have a 15% chance to chain-trigger a nearby peg.', mods: { chainChance: 0.15 } },
  { id: 'ignition', name: 'Ignition', icon: '☄', category: 'energy', tags: ['orb'], rarity: 'common', max: 3,
    desc: 'The first 5 peg hits of each shot give +3 bonus energy.', mods: { firstHitsBonus: 3 } },
  { id: 'shield_breaker', name: 'Shield Breaker', icon: '⬡', category: 'energy', tags: ['reactor'], rarity: 'uncommon', max: 1,
    desc: 'Shield pegs activate on the first hit and pay +50%.', mods: { shieldBreaker: 1 }, unlock: 'peg_shield' },
  { id: 'overclock', name: 'Overclock', icon: '⚙', category: 'energy', tags: ['reactor'], rarity: 'rare', max: 3,
    desc: 'All energy +12%.', mods: { energyMul: 0.12 } },

  // ── Combo ──────────────────────────────────────────────────────────────
  { id: 'amplifier', name: 'Amplifier', icon: '×', category: 'combo', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'Multiplier pegs add +0.25× more per hit.', mods: { multPegBonus: 0.25 } },
  { id: 'multiplier_field', name: 'Multiplier Field', icon: '⊗', category: 'combo', tags: ['combo'], rarity: 'uncommon', max: 2,
    desc: '+2 multiplier pegs appear on every board.', mods: { extraMult: 2 }, unlock: 'pool_1' },
  { id: 'sustain', name: 'Sustain', icon: '∿', category: 'combo', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'Combo window +0.5s: chains decay slower during a shot.', mods: { comboWindow: 0.5 } },
  { id: 'harmonics', name: 'Harmonics', icon: '♫', category: 'combo', tags: ['combo'], rarity: 'uncommon', max: 3,
    desc: 'Each combo step is worth +0.02× more (0.08× → 0.10×).', mods: { comboStep: 0.02 } },
  { id: 'overdrive', name: 'Overdrive', icon: '»', category: 'combo', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'While combo is 5 or higher, hits give +50% score.', mods: { overdriveScore: 0.5 } },
  { id: 'jackpot_loop', name: 'Jackpot Loop', icon: '¤', category: 'combo', tags: ['combo', 'credit'], rarity: 'uncommon', max: 3,
    desc: 'While combo is 8 or higher, every 4th hit grants +1 credit.', mods: { comboCredits: 1 } },
  { id: 'capacitor', name: 'Capacitor', icon: '⊏', category: 'combo', tags: ['combo'], rarity: 'uncommon', max: 2,
    desc: '30% of your final combo carries into the next shot.', mods: { comboKeep: 0.3 }, unlock: 'pool_1' },
  { id: 'resonant_decay', name: 'Resonant Decay', icon: '≋', category: 'combo', tags: ['combo'], rarity: 'uncommon', max: 1,
    desc: 'When combo decays it keeps 80% instead of 50%.', mods: { comboDecayKeep: 0.3 } },

  // ── Split / chain ──────────────────────────────────────────────────────
  { id: 'twin_value', name: 'Twin Value', icon: '⑂', category: 'split', tags: ['split'], rarity: 'common', max: 3,
    desc: 'Split orbs retain +15% value (60% → 75%).', mods: { splitValue: 0.15 } },
  { id: 'fission', name: 'Fission', icon: '⁂', category: 'split', tags: ['split'], rarity: 'common', max: 2,
    desc: '+3 split pegs appear on every board.', mods: { extraSplits: 3 } },
  { id: 'full_spectrum', name: 'Full Spectrum', icon: '◐', category: 'split', tags: ['split', 'combo'], rarity: 'uncommon', max: 1,
    desc: 'Mini orbs activate multiplier pegs at full strength.', mods: { miniFull: 1 } },
  { id: 'spark_plug', name: 'Spark Plug', icon: '✧', category: 'split', tags: ['split'], rarity: 'uncommon', max: 2,
    desc: 'The first split each shot also releases a spark orb.', mods: { sparkOnSplit: 1 } },
  { id: 'trident', name: 'Trident', icon: 'Ψ', category: 'split', tags: ['split'], rarity: 'rare', max: 1,
    desc: 'Split pegs create 3 orbs instead of 2.', mods: { splitCount: 1 }, unlock: 'pool_2' },
  { id: 'containment', name: 'Containment Field', icon: '▣', category: 'split', tags: ['split'], rarity: 'uncommon', max: 2,
    desc: 'Up to +3 orbs on screen and split orbs last +3s.', mods: { maxOrbs: 3, miniLifetime: 3 } },
  { id: 'big_bang', name: 'Big Bang', icon: '✹', category: 'split', tags: ['bomb'], rarity: 'common', max: 3,
    desc: 'Bomb explosion radius +25%.', mods: { bombRadius: 0.25 } },
  { id: 'payload', name: 'Payload', icon: '☢', category: 'split', tags: ['bomb'], rarity: 'common', max: 3,
    desc: 'Pegs triggered by explosions give +40% energy.', mods: { bombEnergy: 0.4 } },
  { id: 'demolition', name: 'Demolition Crew', icon: '✺', category: 'split', tags: ['bomb'], rarity: 'uncommon', max: 2,
    desc: '+2 bomb pegs appear on every board.', mods: { extraBombs: 2 } },
  { id: 'aftershock', name: 'Aftershock', icon: '◉', category: 'split', tags: ['bomb'], rarity: 'rare', max: 1,
    desc: 'Bombs detonate a second time at 60% radius.', mods: { aftershock: 1 }, unlock: 'pool_2' },

  // ── Economy ────────────────────────────────────────────────────────────
  { id: 'overfill_tap', name: 'Overfill Tap', icon: '⤒', category: 'economy', tags: ['credit'], rarity: 'common', max: 3,
    desc: '+1 credit for every 10% you overfill the energy target (max +20).', mods: { overfillCredits: 1 } },
  { id: 'shot_refund', name: 'Shot Refund', icon: '↺', category: 'economy', tags: ['credit'], rarity: 'common', max: 3,
    desc: 'Each unspent shot at stage clear converts into +4 credits.', mods: { shotCredits: 4 } },
  { id: 'precision', name: 'Precision Window', icon: '⌖', category: 'economy', tags: ['credit'], rarity: 'common', max: 3,
    desc: 'Clear a stage with 100–130% of target energy for +10 credits.', mods: { precision: 10 } },
  { id: 'efficiency', name: 'Reactor Efficiency', icon: '♻', category: 'economy', tags: ['credit', 'reactor'], rarity: 'uncommon', max: 2,
    desc: 'Surplus energy pays 1 credit per 40 surplus and doubles surplus score.', mods: { surplus: 1 }, unlock: 'pool_1' },
  { id: 'investor', name: 'Investor', icon: '¢', category: 'economy', tags: ['credit'], rarity: 'uncommon', max: 3,
    desc: '+15% credits from all sources.', mods: { creditMul: 0.15 } },
  { id: 'converter_coil', name: 'Converter Coil', icon: '⇄', category: 'economy', tags: ['credit', 'combo'], rarity: 'uncommon', max: 1,
    desc: 'Converter pegs also give energy equal to combo × 3.', mods: { converterEnergy: 3 }, unlock: 'peg_converter' },
  { id: 'mint', name: 'Mint', icon: '⛁', category: 'economy', tags: ['credit'], rarity: 'common', max: 2,
    desc: '+1 converter peg per board and converters pay 40% more.', mods: { extraConverters: 1, converterRate: 0.14 }, unlock: 'peg_converter' },
  { id: 'compound', name: 'Compound Interest', icon: '%', category: 'economy', tags: ['credit'], rarity: 'rare', max: 2,
    desc: 'On stage clear, gain 6% of your run credits (max +15).', mods: { interest: 0.06 }, unlock: 'pool_2' },

  // ── Utility ────────────────────────────────────────────────────────────
  { id: 'extra_cell', name: 'Extra Cell', icon: '+', category: 'utility', tags: ['utility'], rarity: 'uncommon', max: 3,
    desc: '+1 shot every stage.', mods: { extraShots: 1 } },
  { id: 'reroll_chip', name: 'Reroll Chip', icon: '⟳', category: 'utility', tags: ['utility'], rarity: 'common', max: 2,
    desc: '+1 free reroll on every upgrade screen.', mods: { rerolls: 1 } },
  { id: 'forecast', name: 'Forecast', icon: '☂', category: 'utility', tags: ['utility'], rarity: 'common', max: 1,
    desc: 'Reveal the next stage modifier while drafting. Modifier stages need 8% less energy.', mods: { revealModifier: 1, modifierRelief: 0.08 } },
  { id: 'emergency', name: 'Emergency Charge', icon: '⚠', category: 'utility', tags: ['utility'], rarity: 'common', max: 2,
    desc: 'If your last shot starts below target, instantly gain 12% of the target.', mods: { emergency: 0.12 } },
  { id: 'scope', name: 'Trajectory Scope', icon: '⌇', category: 'utility', tags: ['utility', 'orb'], rarity: 'uncommon', max: 1,
    desc: 'The aim guide also shows the path after the first bounce.', mods: { scope: 1 } },
  { id: 'talent_scout', name: 'Talent Scout', icon: '★', category: 'utility', tags: ['utility'], rarity: 'rare', max: 1,
    desc: 'Upgrade screens offer 4 choices instead of 3.', mods: { draftSize: 1 }, unlock: 'pool_2' },
  { id: 'showman', name: 'Showman', icon: '✪', category: 'utility', tags: ['combo'], rarity: 'common', max: 3,
    desc: 'All score +25%.', mods: { scoreMul: 0.25 } },
];

export const UPGRADE_MAP: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

export const TAG_LABELS: Record<BuildTag, string> = {
  split: 'Split', combo: 'Combo', bomb: 'Bomb', reactor: 'Reactor', credit: 'Credit', orb: 'Orb', utility: 'Utility',
};

/** Fold a list of picked upgrade ids into a Mods object. */
export function computeMods(upgradeIds: string[], extra?: Partial<Mods>): Mods {
  const m = baseMods();
  const add = (mods: Partial<Mods>) => {
    for (const k of Object.keys(mods) as (keyof Mods)[]) m[k] += mods[k] as number;
  };
  for (const id of upgradeIds) {
    const u = UPGRADE_MAP[id];
    if (u) add(u.mods);
  }
  if (extra) add(extra);
  return m;
}
