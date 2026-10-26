import { RARITY_WEIGHTS } from '../config/balance';
import { UPGRADES, UPGRADE_MAP, TAG_LABELS, type BuildTag, type UpgradeDef } from '../../data/upgrades';
import { Rng } from '../utils/rng';

export function stacksOf(owned: string[], id: string): number {
  let n = 0;
  for (const u of owned) if (u === id) n++;
  return n;
}

export function eligibleUpgrades(owned: string[], unlocked: Set<string>): UpgradeDef[] {
  return UPGRADES.filter((u) => (!u.unlock || unlocked.has(u.unlock)) && stacksOf(owned, u.id) < u.max);
}

export function tagCounts(owned: string[]): Map<BuildTag, number> {
  const counts = new Map<BuildTag, number>();
  for (const id of owned) {
    const u = UPGRADE_MAP[id];
    if (!u) continue;
    for (const t of u.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return counts;
}

/**
 * Draft `size` distinct upgrades. Weighted by rarity, gently biased toward
 * tags the player already owns so synergies surface without being forced.
 */
export function rollDraft(seed: number, owned: string[], unlocked: Set<string>, size: number, rareLuck: number): string[] {
  const rng = new Rng(seed);
  const pool = eligibleUpgrades(owned, unlocked);
  const tags = tagCounts(owned);
  const picks: string[] = [];
  const weight = (u: UpgradeDef) => {
    if (picks.includes(u.id)) return 0;
    let w: number = RARITY_WEIGHTS[u.rarity];
    if (u.rarity === 'rare') w *= 1 + 0.35 * rareLuck;
    const synergy = u.tags.reduce((s, t) => s + Math.min(3, tags.get(t) ?? 0), 0);
    w *= 1 + 0.18 * synergy;
    w *= Math.pow(0.75, stacksOf(owned, u.id));
    return w;
  };
  for (let i = 0; i < size; i++) {
    const u = rng.weighted(pool, weight);
    if (!u) break;
    picks.push(u.id);
  }
  return picks;
}

/** Human-readable build tendency summary, strongest first. */
export function buildSummary(owned: string[]): { tag: BuildTag; label: string; count: number }[] {
  return [...tagCounts(owned).entries()]
    .filter(([t]) => t !== 'utility')
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, label: TAG_LABELS[tag], count }));
}

export function archetypeName(owned: string[]): string {
  const top = buildSummary(owned);
  if (!top.length) return 'Unaligned Core';
  const names: Record<BuildTag, string> = {
    split: 'Fission Engine', combo: 'Chain Resonator', bomb: 'Demolition Core', reactor: 'Fusion Reactor',
    credit: 'Profit Turbine', orb: 'Ballistic Core', utility: 'Toolkit',
  };
  if (top.length > 1 && top[1].count === top[0].count) return `${names[top[0].tag]} / ${top[1].label}`;
  return names[top[0].tag];
}
