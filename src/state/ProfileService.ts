import { loadProfile, saveProfile, resetProfile, labLevel, unlockedSet, type Profile } from './profile';
import { ACHIEVEMENTS, type AchContext, type AchievementDef } from '../data/achievements';
import { COSMETIC_MAP, COSMETICS, type CosmeticSlot } from '../data/cosmetics';
import { LAB_MAP } from '../data/meta';

type Listener = () => void;
type AchListener = (a: AchievementDef) => void;

/** Owns the persistent profile: saving, achievements, lab purchases and cosmetics. */
export class ProfileService {
  profile: Profile;
  readonly recoveredFromCorrupt: boolean;
  private listeners: Listener[] = [];
  private achListeners: AchListener[] = [];

  constructor() {
    const r = loadProfile();
    this.profile = r.profile;
    this.recoveredFromCorrupt = r.recovered;
    if (r.recovered) this.save();
  }

  onChange(l: Listener): void {
    this.listeners.push(l);
  }

  onAchievement(l: AchListener): void {
    this.achListeners.push(l);
  }

  save(): void {
    saveProfile(this.profile);
    for (const l of this.listeners) l();
  }

  reset(): void {
    this.profile = resetProfile();
    this.save();
  }

  get unlocked(): Set<string> {
    return unlockedSet(this.profile);
  }

  level(id: string): number {
    return labLevel(this.profile, id);
  }

  labPurchases(): number {
    return Object.values(this.profile.lab).reduce((s, v) => s + v, 0);
  }

  // ── Lab ─────────────────────────────────────────────────────────────────

  nextLabCost(id: string): number | null {
    const node = LAB_MAP[id];
    if (!node) return null;
    const lvl = this.level(id);
    return lvl < node.costs.length ? node.costs[lvl] : null;
  }

  canBuyLab(id: string): boolean {
    const node = LAB_MAP[id];
    const cost = this.nextLabCost(id);
    if (!node || cost === null) return false;
    if (node.requires && this.level(node.requires) <= 0) return false;
    return this.profile.credits >= cost;
  }

  buyLab(id: string): boolean {
    if (!this.canBuyLab(id)) return false;
    const cost = this.nextLabCost(id)!;
    this.profile.credits -= cost;
    this.profile.lab[id] = this.level(id) + 1;
    // Lab nodes that grant cosmetics.
    for (const c of COSMETICS) if (c.source.kind === 'lab' && c.source.id === id) this.grantCosmetic(c.id);
    this.checkAchievements({});
    this.save();
    return true;
  }

  // ── Cosmetics ───────────────────────────────────────────────────────────

  owns(id: string): boolean {
    return this.profile.cosmetics.owned.includes(id);
  }

  grantCosmetic(id: string): boolean {
    if (!COSMETIC_MAP[id] || this.owns(id)) return false;
    this.profile.cosmetics.owned.push(id);
    return true;
  }

  equip(id: string): boolean {
    const c = COSMETIC_MAP[id];
    if (!c || !this.owns(id)) return false;
    this.profile.cosmetics.equipped[c.slot] = id;
    this.save();
    return true;
  }

  equipped(slot: CosmeticSlot) {
    return COSMETIC_MAP[this.profile.cosmetics.equipped[slot]];
  }

  cosmeticsEarned(): number {
    return this.profile.cosmetics.owned.filter((id) => COSMETIC_MAP[id]?.source.kind !== 'default').length;
  }

  // ── Campaign ────────────────────────────────────────────────────────────

  campaignSummary(): { highest: number; stars: number; perfect: number } {
    const c = this.profile.campaign;
    const stars = Object.values(c.stars);
    return { highest: c.unlocked - 1, stars: stars.reduce((a, b) => a + b, 0), perfect: stars.filter((s) => s >= 6).length };
  }

  /** Record a completed level. Returns how many new stars were earned. */
  recordLevel(n: number, stars: number, score: number): number {
    const c = this.profile.campaign;
    const prev = c.stars[n] ?? 0;
    if (stars > prev) c.stars[n] = stars;
    if (score > (c.best[n] ?? 0)) c.best[n] = score;
    c.unlocked = Math.max(c.unlocked, n + 1);
    return Math.max(0, stars - prev);
  }

  // ── Achievements ────────────────────────────────────────────────────────

  /** Evaluate all locked achievements against a context. Returns newly unlocked. */
  checkAchievements(partial: Partial<AchContext>): AchievementDef[] {
    const p = this.profile;
    const ctx: AchContext = {
      stats: p.stats,
      labPurchases: this.labPurchases(),
      cosmeticsEarned: this.cosmeticsEarned(),
      campaign: this.campaignSummary(),
      ...partial,
    };
    const unlocked: AchievementDef[] = [];
    // Loop because a reward (e.g. a cosmetic) can unlock another achievement.
    for (let pass = 0; pass < 3; pass++) {
      let any = false;
      for (const a of ACHIEVEMENTS) {
        if (p.achievements[a.id]) continue;
        let ok = false;
        try {
          ok = a.check(ctx);
        } catch {
          ok = false;
        }
        if (!ok) continue;
        p.achievements[a.id] = Date.now();
        if (a.reward.credits) {
          p.credits += a.reward.credits;
          p.stats.totalCredits += a.reward.credits;
        }
        if (a.reward.cosmetic) this.grantCosmetic(a.reward.cosmetic);
        if (a.reward.title && !p.titles.includes(a.reward.title)) p.titles.push(a.reward.title);
        unlocked.push(a);
        any = true;
      }
      if (!any) break;
      ctx.cosmeticsEarned = this.cosmeticsEarned();
    }
    if (unlocked.length) {
      this.save();
      for (const a of unlocked) for (const l of this.achListeners) l(a);
    }
    return unlocked;
  }
}
