/**
 * Independent difficulty check for the calibrated campaign: plays each level
 * with a weaker policy (best of 2 random aims, different seeds) and reports
 * pass rate and star distribution per 30-level band.
 *
 * Run: node scripts/sim.mjs scripts/verifyCampaign.ts
 */
import { getLevel, levelCount, levelSetup, objectiveValue, shotBonus, starsFor, CAMPAIGN_MODS } from '../src/data/campaign';
import { ReactorSim } from '../src/game/systems/ReactorSim';
import { stageConfig } from '../src/data/stages';
import { Rng } from '../src/game/utils/rng';

function playShot(sim: ReactorSim, angle: number): void {
  sim.launch(angle);
  let t = 0;
  while (!sim.shotResolved() && t < 40) { sim.step(1 / 240); t += 1 / 240; }
  sim.endShot();
  sim.events.length = 0;
}

const band = new Map<number, { tries: number; pass: number; stars: number[] }>();
for (let n = 1; n <= levelCount(); n++) {
  const def = getLevel(n)!;
  const setup = levelSetup(def, def.target);
  const hits = stageConfig(setup.stage).reactorHits;
  const b = Math.floor((n - 1) / 30);
  const entry = band.get(b) ?? { tries: 0, pass: 0, stars: [0, 0, 0, 0, 0, 0, 0] };
  for (let r = 0; r < 4; r++) {
    const rng = new Rng(n * 7121 + r * 13 + 99);
    const sim = new ReactorSim(setup, { mods: CAMPAIGN_MODS }, hits);
    while (sim.shotsLeft > 0 && objectiveValue(def.objective, sim) < def.target) {
      let best = -1, angle = 0;
      for (let i = 0; i < 2; i++) {
        const a = rng.range(-1.25, 1.25);
        const c = new ReactorSim(setup, { mods: CAMPAIGN_MODS }, hits, sim.snapshot());
        playShot(c, a);
        const v = objectiveValue(def.objective, c);
        if (v > best) { best = v; angle = a; }
      }
      playShot(sim, angle);
    }
    entry.tries++;
    if (objectiveValue(def.objective, sim) >= def.target) {
      entry.pass++;
      entry.stars[starsFor(def, sim.score + sim.shotsLeft * shotBonus(def))]++;
    }
  }
  band.set(b, entry);
}
for (const [b, e] of band) {
  console.log(`levels ${b * 30 + 1}-${b * 30 + 30}: pass ${(100 * e.pass / e.tries).toFixed(0)}%  stars 1-6: ${e.stars.slice(1).join('/')}`);
}
