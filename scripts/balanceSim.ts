declare const process: { env: Record<string, string | undefined> };
/**
 * Headless balance simulation. Plays stages with a naive aiming policy
 * (random) and a greedy one (best of N sampled angles) and reports energy
 * versus target, so stage targets in balance.ts can be tuned with data.
 *
 * Run: npm run sim
 */
import { generateStage } from '../src/game/systems/BoardGenerator';
import { ReactorSim } from '../src/game/systems/ReactorSim';
import { computeMods } from '../src/data/upgrades';
import { stageConfig } from '../src/data/stages';
import { RULES } from '../src/game/config/balance';
import { Rng } from '../src/game/utils/rng';

const unlocked = new Set(['peg_portal', 'peg_shield', 'peg_converter']);

function playShot(sim: ReactorSim, angle: number): number {
  sim.launch(angle);
  let t = 0;
  while (!sim.shotResolved() && t < 60) {
    sim.step(1 / 240);
    t += 1 / 240;
  }
  sim.endShot();
  sim.events.length = 0;
  return t;
}

function runStage(stage: number, seed: number, policy: 'random' | 'greedy', upgrades: string[]) {
  const mods = computeMods(upgrades);
  const setup = generateStage({ stage, seed, modifiers: [], mods, unlocked, baseShots: RULES.baseShots });
  const sim = new ReactorSim(setup, { mods }, stageConfig(stage).reactorHits);
  const rng = new Rng(seed);
  let time = 0;
  let maxShot = 0;
  while (sim.shotsLeft > 0 && sim.energy < sim.target) {
    let angle = rng.range(-1.3, 1.3);
    if (policy === 'greedy') {
      let best = -1;
      for (let i = 0; i < 6; i++) {
        const a = rng.range(-1.3, 1.3);
        const clone = new ReactorSim(setup, { mods }, stageConfig(stage).reactorHits, sim.snapshot());
        const before = clone.energy;
        playShot(clone, a);
        if (clone.energy - before > best) { best = clone.energy - before; angle = a; }
      }
    }
    const e0 = sim.energy;
    time += playShot(sim, angle);
    maxShot = Math.max(maxShot, sim.energy - e0);
  }
  return { cleared: sim.energy >= sim.target, energy: sim.energy, target: sim.target, shots: sim.shotsFired, time, maxShot, pegs: setup.pegs.length };
}

const N = Number(process.env.N ?? 24);
const upgrades = (process.env.UP ?? '').split(',').filter(Boolean);
if (!process.env.RUNS) for (const policy of ['random', 'greedy'] as const) {
  console.log(`\n== policy: ${policy}  upgrades: ${upgrades.join(',') || 'none'}`);
  for (let stage = 1; stage <= 10; stage++) {
    let clears = 0, energy = 0, time = 0, shots = 0, maxShot = 0, pegs = 0, target = 0;
    for (let i = 0; i < N; i++) {
      const r = runStage(stage, 1000 + i * 7919 + stage, policy, upgrades);
      clears += r.cleared ? 1 : 0;
      energy += r.energy / r.shots;
      time += r.time;
      shots += r.shots;
      maxShot += r.maxShot;
      pegs += r.pegs;
      target = r.target;
    }
    console.log(`stage ${String(stage).padStart(2)} target ${String(target).padStart(5)} clear ${(100 * clears / N).toFixed(0).padStart(3)}%  energy/shot ${(energy / N).toFixed(0).padStart(5)}  best shot ${(maxShot / N).toFixed(0).padStart(5)}  shots ${(shots / N).toFixed(1)}  sec/shot ${(time / shots).toFixed(1)}  pegs ${(pegs / N).toFixed(0)}`);
  }
}

// ── Full-run simulation: greedy-ish aim (best of 3) + synergy-weighted upgrade picks ──
if (process.env.RUNS) {
  const { rollDraft } = await import('../src/game/systems/UpgradeSystem');
  const runs = Number(process.env.RUNS);
  const reached: number[] = [];
  for (let r = 0; r < runs; r++) {
    const ups: string[] = [];
    let stage = 1;
    const rng = new Rng(9000 + r);
    for (; stage <= 12; stage++) {
      const mods = computeMods(ups);
      const setup = generateStage({ stage, seed: 5000 + r * 101 + stage, modifiers: [], mods, unlocked, baseShots: RULES.baseShots });
      const sim = new ReactorSim(setup, { mods }, stageConfig(stage).reactorHits);
      while (sim.shotsLeft > 0 && sim.energy < sim.target) {
        let angle = 0, best = -1;
        for (let i = 0; i < 3; i++) {
          const a = rng.range(-1.3, 1.3);
          const clone = new ReactorSim(setup, { mods }, stageConfig(stage).reactorHits, sim.snapshot());
          playShot(clone, a);
          if (clone.energy > best) { best = clone.energy; angle = a; }
        }
        playShot(sim, angle);
      }
      if (sim.energy < sim.target) break;
      const offer = rollDraft(r * 31 + stage, ups, unlocked, mods.draftSize, 0);
      ups.push(offer[0]);
    }
    reached.push(stage);
  }
  const hist = new Map<number, number>();
  for (const s of reached) hist.set(s, (hist.get(s) ?? 0) + 1);
  console.log('\nFull runs (best-of-3 aim):', [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([s, n]) => `failed@${s}:${n}`).join('  '));
  console.log('win rate (cleared 10):', (reached.filter((s) => s > 10).length / runs * 100).toFixed(0) + '%');
}
