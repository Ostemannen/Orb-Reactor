/**
 * Calibrates the campaign: plays every level with a simulated, moderately
 * skilled player and writes src/data/campaignLevels.json with each level's
 * board variant, objective target and star thresholds.
 *
 * Run: npm run levels            (all levels)
 *      FROM=1 TO=30 npm run levels (a range, merged into the existing table)
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { CAMPAIGN_LENGTH, CAMPAIGN_MODS, LEVELS_PER_WORLD, STAR_STEPS, levelSetup, objectiveValue, planLevel, shotBonus, type ObjectiveKind } from '../src/data/campaign';
import { ReactorSim } from '../src/game/systems/ReactorSim';
import { stageConfig } from '../src/data/stages';
import { Rng } from '../src/game/utils/rng';

declare const process: { env: Record<string, string | undefined> };

const OUT = 'src/data/campaignLevels.json';
const MIN_METRIC: Record<ObjectiveKind, number> = { energy: 40, charged: 4, reactors: 1, shields: 3, clear: 25, combo: 6 };
const RUNS = 3;
const SAMPLES = 3;

function playShot(sim: ReactorSim, angle: number): void {
  sim.launch(angle);
  let t = 0;
  while (!sim.shotResolved() && t < 40) {
    sim.step(1 / 240);
    t += 1 / 240;
  }
  sim.endShot();
  sim.events.length = 0;
}

function median(a: number[]): number {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

function calibrate(n: number) {
  for (let variant = 0; variant < 8; variant++) {
    let plan = planLevel(n, variant);
    // After several bad boards, fall back to a plain energy objective.
    const override: ObjectiveKind | undefined = variant >= 5 && plan.objective !== 'energy' ? 'energy' : undefined;
    if (override) plan = planLevel(n, variant, override);
    const setup = levelSetup(plan);
    const hits = stageConfig(setup.stage).reactorHits;
    const histories: { metric: number; score: number }[][] = [];
    for (let r = 0; r < RUNS; r++) {
      const rng = new Rng(n * 977 + r * 31 + variant);
      const sim = new ReactorSim(setup, { mods: CAMPAIGN_MODS }, hits);
      const hist: { metric: number; score: number }[] = [];
      while (sim.shotsLeft > 0) {
        let best = -1;
        let angle = 0;
        for (let i = 0; i < SAMPLES; i++) {
          const a = rng.range(-1.25, 1.25);
          const clone = new ReactorSim(setup, { mods: CAMPAIGN_MODS }, hits, sim.snapshot());
          playShot(clone, a);
          const v = objectiveValue(plan.objective, clone) + clone.score * 1e-6;
          if (v > best) { best = v; angle = a; }
        }
        playShot(sim, angle);
        hist.push({ metric: objectiveValue(plan.objective, sim), score: sim.score });
      }
      histories.push(hist);
    }
    const finals = histories.map((h) => h[h.length - 1].metric);
    const m = median(finals);
    if (m < MIN_METRIC[plan.objective]) continue;

    // Difficulty: share of what the simulated player reaches. Rises slowly, saws up inside a world.
    let k = 0.5 + 0.33 * (n / CAMPAIGN_LENGTH) + 0.08 * (plan.index / (LEVELS_PER_WORLD - 1));
    if (plan.boss) k += 0.05;
    if (n <= 3) k = 0.4;
    k = Math.min(0.93, k);
    let target = m * k;
    if (plan.objective === 'energy') target = Math.max(30, Math.round(target / 5) * 5);
    else if (plan.objective === 'clear') target = Math.min(95, Math.round(target / 5) * 5);
    else target = Math.max(1, Math.floor(target));

    // Final score if the level ends as soon as the target is met, plus unused-shot bonus.
    const scores: number[] = [];
    for (const h of histories) {
      const i = h.findIndex((x) => x.metric >= target);
      if (i < 0) continue;
      scores.push(h[i].score + (h.length - 1 - i) * shotBonus(plan));
    }
    if (scores.length < 2) continue;
    const ms = median(scores);
    const stars = STAR_STEPS.map((k) => Math.round((ms * k) / 100) * 100);
    return { v: variant, t: target, s: stars, ...(override ? { o: override } : {}) };
  }
  throw new Error(`Level ${n}: no playable variant found`);
}

const from = Number(process.env.FROM ?? 1);
const to = Number(process.env.TO ?? CAMPAIGN_LENGTH);
let table: Record<string, unknown> = {};
try {
  table = JSON.parse(readFileSync(OUT, 'utf8'));
} catch {
  table = {};
}
const t0 = Date.now();
for (let n = from; n <= to; n++) {
  table[n] = calibrate(n);
  if (n % 15 === 0) console.log(`level ${n} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
const sorted = Object.fromEntries(Object.entries(table).sort((a, b) => Number(a[0]) - Number(b[0])));
writeFileSync(OUT, JSON.stringify(sorted) + '\n');
console.log(`wrote ${Object.keys(sorted).length} levels to ${OUT}`);
