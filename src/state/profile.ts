import { DEFAULT_LOADOUT, COSMETIC_MAP, type CosmeticSlot } from '../data/cosmetics';
import { LAB_MAP } from '../data/meta';

export const PROFILE_VERSION = 2;
const KEY = 'orb-reactor.profile';
const CORRUPT_KEY = 'orb-reactor.profile.corrupt';

export interface ProfileStats {
  totalRuns: number;
  bestStage: number;
  highScore: number;
  totalCredits: number;
  totalPegs: number;
  totalReactors: number;
  totalBombs: number;
  totalSplits: number;
  longestCombo: number;
  bestMult: number;
  dailyRuns: number;
  practiceShots: number;
  victories: number;
  totalShots: number;
  playSeconds: number;
}

export interface Settings {
  sfx: boolean;
  music: boolean;
  sfxVolume: number;
  musicVolume: number;
  track: string;
  shake: boolean;
  reducedFx: boolean;
  numbers: boolean;
  autoFast: boolean;
}

export interface Profile {
  version: number;
  credits: number;
  lab: Record<string, number>;
  cosmetics: { owned: string[]; equipped: Record<CosmeticSlot, string> };
  stats: ProfileStats;
  achievements: Record<string, number>;
  titles: string[];
  activeTitle: string;
  daily: { lastDate: string; results: Record<string, { score: number; stage: number }> };
  settings: Settings;
  tutorialDone: boolean;
  /** Campaign map progress: highest unlocked level, best stars and score per level. */
  campaign: { unlocked: number; stars: Record<string, number>; best: Record<string, number> };
}

export function defaultProfile(): Profile {
  return {
    version: PROFILE_VERSION,
    credits: 0,
    lab: {},
    cosmetics: { owned: Object.values(DEFAULT_LOADOUT), equipped: { ...DEFAULT_LOADOUT } },
    stats: {
      totalRuns: 0, bestStage: 0, highScore: 0, totalCredits: 0, totalPegs: 0, totalReactors: 0, totalBombs: 0,
      totalSplits: 0, longestCombo: 0, bestMult: 1, dailyRuns: 0, practiceShots: 0, victories: 0, totalShots: 0, playSeconds: 0,
    },
    achievements: {},
    titles: ['Rookie Operator'],
    activeTitle: 'Rookie Operator',
    daily: { lastDate: '', results: {} },
    settings: {
      sfx: true, music: true, sfxVolume: 0.8, musicVolume: 0.45, track: 'track_1', shake: true, reducedFx: false, numbers: true, autoFast: true,
    },
    tutorialDone: false,
    campaign: { unlocked: 1, stars: {}, best: {} },
  };
}

type Migration = (p: Record<string, unknown>) => Record<string, unknown>;
/** Migrations keyed by the version they upgrade FROM. */
const MIGRATIONS: Record<number, Migration> = {
  1: (p) => {
    // v1 stored settings.sound as a single flag.
    const s = (p.settings ?? {}) as Record<string, unknown>;
    if (typeof s.sound === 'boolean') {
      s.sfx = s.sound;
      s.music = s.sound;
      delete s.sound;
    }
    return { ...p, settings: s, version: 2 };
  },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Fill missing/invalid fields from defaults, keeping valid stored values. */
function sanitize<T>(stored: unknown, def: T): T {
  if (Array.isArray(def)) return (Array.isArray(stored) ? stored : def) as T;
  if (isObj(def)) {
    const out: Record<string, unknown> = {};
    const src = isObj(stored) ? stored : {};
    for (const k of Object.keys(def)) out[k] = sanitize(src[k], (def as Record<string, unknown>)[k]);
    // Keep dynamic maps (lab levels, achievements, daily results) as-is when def is empty.
    if (Object.keys(def).length === 0 && isObj(stored)) return stored as T;
    return out as T;
  }
  if (typeof def === 'number') return (typeof stored === 'number' && Number.isFinite(stored) ? stored : def) as T;
  if (typeof def === 'boolean') return (typeof stored === 'boolean' ? stored : def) as T;
  if (typeof def === 'string') return (typeof stored === 'string' ? stored : def) as T;
  return def;
}

export interface LoadResult {
  profile: Profile;
  recovered: boolean;
}

export function loadProfile(): LoadResult {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return { profile: defaultProfile(), recovered: false };
  }
  if (!raw) return { profile: defaultProfile(), recovered: false };
  try {
    let data = JSON.parse(raw) as Record<string, unknown>;
    if (!isObj(data)) throw new Error('not an object');
    let v = typeof data.version === 'number' ? data.version : 1;
    while (v < PROFILE_VERSION && MIGRATIONS[v]) {
      data = MIGRATIONS[v](data);
      v++;
    }
    const p = sanitize(data, defaultProfile());
    p.version = PROFILE_VERSION;
    // Drop unknown ids, guarantee defaults are owned and equipped items are valid.
    p.cosmetics.owned = Array.from(new Set([...Object.values(DEFAULT_LOADOUT), ...p.cosmetics.owned.filter((id) => COSMETIC_MAP[id])]));
    for (const slot of Object.keys(DEFAULT_LOADOUT) as CosmeticSlot[]) {
      const id = p.cosmetics.equipped[slot];
      if (!p.cosmetics.owned.includes(id) || COSMETIC_MAP[id]?.slot !== slot) p.cosmetics.equipped[slot] = DEFAULT_LOADOUT[slot];
    }
    for (const k of Object.keys(p.lab)) {
      const node = LAB_MAP[k];
      const lvl = p.lab[k];
      if (!node || typeof lvl !== 'number') delete p.lab[k];
      else p.lab[k] = Math.max(0, Math.min(node.costs.length, Math.floor(lvl)));
    }
    p.credits = Math.max(0, Math.floor(p.credits));
    p.campaign.unlocked = Math.max(1, Math.floor(p.campaign.unlocked));
    for (const k of Object.keys(p.campaign.stars)) {
      const v = p.campaign.stars[k];
      if (typeof v !== 'number' || v < 1 || v > 3) delete p.campaign.stars[k];
    }
    return { profile: p, recovered: false };
  } catch {
    try {
      localStorage.setItem(CORRUPT_KEY, raw);
    } catch {
      /* storage full or unavailable */
    }
    return { profile: defaultProfile(), recovered: true };
  }
}

export function saveProfile(p: Profile): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable: progress lives in memory for this session */
  }
}

export function resetProfile(): Profile {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return defaultProfile();
}

export function labLevel(p: Profile, id: string): number {
  return p.lab[id] ?? 0;
}

export function unlockedSet(p: Profile): Set<string> {
  return new Set(Object.keys(p.lab).filter((k) => p.lab[k] > 0));
}

export function todayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
