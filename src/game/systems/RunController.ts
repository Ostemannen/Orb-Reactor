import type { BoardHost, BoardScene, HudState, VisualConfig } from '../scenes/BoardScene';
import type { AudioSystem } from './AudioSystem';
import type { ProfileService } from '../../state/ProfileService';
import { saveRun, loadRun, emptyRunTally, RUN_VERSION, type RunState, type StageClearSummary } from '../../state/run';
import { todayKey } from '../../state/profile';
import { MODES, type ModeId } from '../../data/modes';
import { computeMods, UPGRADE_MAP, type Mods } from '../../data/upgrades';
import { MODIFIER_MAP } from '../../data/modifiers';
import { generatePracticeStage, generateStage, rollModifiers } from './BoardGenerator';
import { rollDraft } from './UpgradeSystem';
import { ECONOMY, RULES } from '../config/balance';
import { hashString, mixSeed, randomSeed } from '../utils/rng';
import type { StageSetup } from '../entities/types';
import type { SimEvent } from './ReactorSim';
import type { AchievementDef } from '../../data/achievements';
import { COSMETIC_MAP, type CosmeticSlot } from '../../data/cosmetics';
import { CAMPAIGN_MODS, OBJECTIVES, getLevel, levelSetup, objectiveValue, shotBonus, starsFor, type LevelDef } from '../../data/campaign';

const CAMPAIGN_CREDITS_PER_STAR = 2;

/** What the UI needs to render the end-of-run screen. */
export interface RunSummary {
  run: RunState;
  /** Final stage energy vs target when the run ended on a failed stage. */
  failed?: { energy: number; target: number };
  victory: boolean;
  stageReached: number;
  creditsBanked: number;
  salvage: number;
  modeBonus: number;
  newAchievements: AchievementDef[];
  newBest: boolean;
}

export interface StageIntro {
  stage: number;
  target: number;
  shots: number;
  modifiers: string[];
  layout: string;
  isCore: boolean;
  resumed: boolean;
  mode: ModeId;
  endless: boolean;
}

export interface ObjectiveProgress {
  value: number;
  target: number;
  icon: string;
  label: string;
}

export interface LevelResult {
  def: LevelDef;
  won: boolean;
  value: number;
  score: number;
  stars: number;
  newStars: number;
  credits: number;
  bestBefore: number;
  shotsLeft: number;
  bonus: number;
}

/** UI callbacks the controller drives. Implemented by the DOM UI layer. */
export interface RunUI {
  hud(state: HudState, run: RunState | null, objective?: ObjectiveProgress): void;
  showLevelIntro(def: LevelDef, onGo: () => void): void;
  showLevelResult(result: LevelResult): void;
  showSaga(focus?: number): void;
  showStageIntro(info: StageIntro, onGo: () => void): void;
  showDraft(run: RunState): void;
  showVictory(run: RunState): void;
  showRunOver(summary: RunSummary): void;
  onShotFired(): void;
  enterGameplay(practice: boolean): void;
  showMenu(): void;
}

const DAILY_CONTENT = ['peg_portal', 'peg_shield', 'peg_converter', 'sectors'];
const ALL_CONTENT = ['peg_portal', 'peg_shield', 'peg_converter', 'sectors', 'pool_1', 'pool_2'];

export class RunController implements BoardHost {
  run: RunState | null = null;
  /** Active campaign level, when playing the saga map. */
  level: LevelDef | null = null;
  scene?: BoardScene;
  ui!: RunUI;
  practiceMods: Mods = computeMods([]);
  /** Cosmetic try-on from the shop screen; visual only. */
  previewOverride: Partial<Record<CosmeticSlot, string>> = {};
  private currentSetup?: StageSetup;
  private runAchievements: AchievementDef[] = [];

  constructor(public audio: AudioSystem, public profile: ProfileService) {
    profile.onAchievement((a) => this.runAchievements.push(a));
  }

  attachScene(scene: BoardScene): void {
    this.scene = scene;
  }

  // ── BoardHost ───────────────────────────────────────────────────────────

  visuals(): VisualConfig {
    const p = this.profile;
    const s = p.profile.settings;
    const pick = (slot: CosmeticSlot) => {
      const id = this.previewOverride[slot];
      return (id && COSMETIC_MAP[id]) || p.equipped(slot);
    };
    return {
      orb: pick('orb'), trail: pick('trail'), theme: pick('theme'), background: pick('background'),
      hit: pick('hit'), shake: s.shake, reducedFx: s.reducedFx, numbers: s.numbers, autoFast: s.autoFast,
    };
  }

  hud(state: HudState): void {
    const sim = this.scene?.sim;
    if (this.level && sim) {
      const d = this.level;
      const o = OBJECTIVES[d.objective];
      this.ui.hud(state, null, { value: objectiveValue(d.objective, sim), target: d.target, icon: o.icon, label: o.short });
      return;
    }
    this.ui.hud(state, this.run);
  }

  onLaunch(): void {
    const p = this.profile.profile;
    p.stats.totalShots++;
    if (this.level) {
      // Campaign shots only count toward lifetime stats.
    } else if (!this.run) {
      p.stats.practiceShots++;
      if (p.stats.practiceShots === 10) this.profile.checkAchievements({});
    } else {
      this.run.tally.shotsFired++;
      // Persist the spent shot immediately so quitting mid-shot can't refund it.
      const sim = this.scene?.sim;
      if (sim) {
        this.run.stageProgress = sim.snapshot();
        saveRun(this.run);
      }
    }
    if (!p.tutorialDone) {
      p.tutorialDone = true;
      this.profile.save();
    }
    this.ui.onShotFired();
  }

  onSimEvents(_events: SimEvent[]): void {
    /* Stats are aggregated from sim tallies at shot end. */
  }

  onShotResolved(): void {
    const sim = this.scene?.sim;
    if (!sim) return;
    const p = this.profile.profile;
    const shot = sim.shotTally;
    if (shot.bestCombo > p.stats.longestCombo) p.stats.longestCombo = shot.bestCombo;
    if (shot.bestMult > p.stats.bestMult) p.stats.bestMult = shot.bestMult;

    if (this.level) {
      this.levelShotResolved();
      return;
    }
    if (!this.run) {
      // Practice: only practice achievements; keep shooting.
      this.profile.save();
      this.scene?.setInputEnabled(true);
      return;
    }
    this.profile.checkAchievements({ shot });

    const run = this.run;
    if (sim.energy >= sim.target) {
      this.stageClear();
    } else if (sim.shotsLeft <= 0) {
      this.mergeStage(false);
      this.scene?.setInputEnabled(false);
      this.endRun(false);
    } else {
      run.stageProgress = sim.snapshot();
      saveRun(run);
      this.profile.save();
      this.scene?.setInputEnabled(true);
    }
  }

  // ── Run lifecycle ───────────────────────────────────────────────────────

  hasSavedRun(): RunState | null {
    return loadRun();
  }

  dailyAvailable(): boolean {
    return this.profile.profile.daily.lastDate !== todayKey();
  }

  isModeUnlocked(mode: ModeId): boolean {
    const m = MODES[mode];
    return !m.unlock || this.profile.level(m.unlock) > 0;
  }

  startRun(modeId: ModeId): void {
    this.level = null;
    const mode = MODES[modeId];
    const prof = this.profile;
    const today = todayKey();
    let seed = randomSeed();
    let unlocked = [...prof.unlocked].filter((u) => ALL_CONTENT.includes(u));
    const usesLab = mode.usesLabPower;
    if (modeId === 'daily') {
      seed = hashString(`orb-reactor-daily-${today}`);
      unlocked = [...DAILY_CONTENT];
      prof.profile.daily.lastDate = today;
      prof.save();
    }
    const run: RunState = {
      version: RUN_VERSION,
      id: `${Date.now().toString(36)}-${seed.toString(36)}`,
      mode: modeId,
      seed,
      dailyDate: modeId === 'daily' ? today : undefined,
      unlocked,
      scoreBonus: usesLab ? 0.05 * prof.level('score_amp') : 0,
      rareLuck: usesLab ? prof.level('luck') : 0,
      rerollTokens: usesLab ? prof.level('reroll') : 0,
      stage: 1,
      phase: 'stage',
      upgrades: [],
      credits: usesLab ? 5 * prof.level('seed_fund') : 0,
      score: 0,
      tally: emptyRunTally(),
      history: [],
      startedAt: Date.now(),
      endless: false,
    };
    if (modeId === 'daily') {
      // Seeded starting upgrade: same for every player today.
      const start = rollDraft(mixSeed(seed, 777), [], new Set(unlocked), 1, 0)[0];
      if (start) run.upgrades.push(start);
    }
    this.run = run;
    this.runAchievements = [];
    saveRun(run);
    this.ui.enterGameplay(false);
    this.startStage(false);
  }

  resumeRun(): boolean {
    const run = loadRun();
    if (!run) return false;
    this.run = run;
    this.runAchievements = [];
    this.ui.enterGameplay(false);
    if (run.victoryPending) {
      this.scene?.startAttract();
      this.ui.showVictory(run);
    } else if (run.phase === 'draft') {
      this.scene?.startAttract();
      this.ui.showDraft(run);
    } else {
      this.startStage(true);
    }
    return true;
  }

  // ── Campaign ────────────────────────────────────────────────────────────

  startLevel(n: number): void {
    const def = getLevel(n);
    if (!def || n > this.profile.profile.campaign.unlocked) return;
    this.run = null;
    this.level = def;
    this.ui.enterGameplay(false);
    this.scene?.startStage(levelSetup(def, def.target), CAMPAIGN_MODS, undefined, false);
    this.ui.showLevelIntro(def, () => this.scene?.setInputEnabled(true));
  }

  restartLevel(): void {
    if (this.level) this.startLevel(this.level.n);
  }

  quitToMap(): void {
    const n = this.level?.n;
    this.level = null;
    this.run = null;
    this.scene?.setInputEnabled(false);
    this.scene?.startAttract();
    this.ui.showSaga(n);
  }

  private levelShotResolved(): void {
    const sim = this.scene!.sim!;
    const def = this.level!;
    const value = objectiveValue(def.objective, sim);
    const won = value >= def.target;
    if (!won && sim.shotsLeft > 0) {
      this.profile.save();
      this.scene?.setInputEnabled(true);
      return;
    }
    this.scene?.setInputEnabled(false);
    const p = this.profile;
    const st = p.profile.stats;
    st.totalPegs += sim.tally.pegsHit;
    st.totalReactors += sim.tally.reactors;
    st.totalBombs += sim.tally.bombs;
    st.totalSplits += sim.tally.splits;
    const bonus = won ? sim.shotsLeft * shotBonus(def) : 0;
    const score = sim.score + bonus;
    const bestBefore = p.profile.campaign.best[def.n] ?? 0;
    let stars = 0;
    let newStars = 0;
    let credits = 0;
    if (won) {
      stars = starsFor(def, score);
      newStars = p.recordLevel(def.n, stars, score);
      // Credits only for stars earned for the first time, so replaying never farms.
      credits = newStars * CAMPAIGN_CREDITS_PER_STAR + (bestBefore === 0 ? sim.credits : 0);
      p.profile.credits += credits;
      st.totalCredits += credits;
      st.highScore = Math.max(st.highScore, score);
      this.audio.stageClear();
    } else {
      this.audio.runOver();
    }
    p.checkAchievements({ shot: sim.shotTally });
    p.save();
    this.ui.showLevelResult({ def, won, value, score, stars, newStars, credits, bestBefore, shotsLeft: sim.shotsLeft, bonus });
  }

  startPractice(): void {
    this.run = null;
    this.level = null;
    this.practiceMods = computeMods([]);
    this.ui.enterGameplay(true);
    this.scene?.startStage(generatePracticeStage(), this.practiceMods, undefined, true);
    this.ui.showStageIntro(
      { stage: 0, target: 0, shots: 0, modifiers: [], layout: 'practice', isCore: false, resumed: false, mode: 'practice', endless: false },
      () => this.scene?.setInputEnabled(true),
    );
  }

  resetPractice(): void {
    this.scene?.resetPractice(this.practiceMods);
    this.scene?.setInputEnabled(true);
  }

  quitToMenu(): void {
    if (this.run) saveRun(this.run);
    this.run = null;
    this.level = null;
    this.scene?.setInputEnabled(false);
    this.scene?.startAttract();
    this.ui.showMenu();
  }

  mods(): Mods {
    return computeMods(this.run?.upgrades ?? []);
  }

  modifiersFor(stage: number): string[] {
    const run = this.run!;
    const mode = MODES[run.mode];
    const doubled = mode.modifiers.doubleFrom !== undefined && stage >= mode.modifiers.doubleFrom;
    return rollModifiers(stage, mixSeed(run.seed, stage * 31), new Set(run.unlocked), {
      fromStage: mode.modifiers.fromStage, always: mode.modifiers.always, count: doubled ? 2 : 1,
    });
  }

  private startStage(resumed: boolean): void {
    const run = this.run!;
    const mode = MODES[run.mode];
    const mods = this.mods();
    const setup = generateStage({
      stage: run.stage,
      seed: mixSeed(run.seed, run.stage),
      modifiers: this.modifiersFor(run.stage),
      mods,
      unlocked: new Set(run.unlocked),
      baseShots: mode.baseShots,
      targetMul: mode.targetMul,
    });
    this.currentSetup = setup;
    run.phase = 'stage';
    saveRun(run);
    this.scene?.startStage(setup, mods, resumed ? run.stageProgress : undefined, false);
    this.profile.checkAchievements({ run: this.runCtx(false) });
    this.ui.showStageIntro(
      { stage: run.stage, target: setup.target, shots: setup.shots, modifiers: setup.modifiers, layout: setup.layout,
        isCore: setup.isCore, resumed: resumed && !!run.stageProgress, mode: run.mode, endless: run.endless },
      () => this.scene?.setInputEnabled(true),
    );
  }

  private runCtx(victory: boolean) {
    const run = this.run!;
    return { mode: run.mode, stage: run.stage, score: run.score, pegsHit: run.tally.pegsHit, upgrades: run.upgrades.length, victory };
  }

  private stageClear(): void {
    const run = this.run!;
    const sim = this.scene!.sim!;
    const m = sim.mods;
    const target = sim.target;
    const energy = sim.energy;
    const ratio = energy / target;
    const credits: { label: string; amount: number }[] = [];
    const score: { label: string; amount: number }[] = [];
    const cm = sim.creditMul;
    const addC = (label: string, base: number) => {
      if (base <= 0) return;
      credits.push({ label, amount: Math.max(1, Math.round(base * cm)) });
    };
    if (sim.credits > 0) credits.push({ label: 'Collected in stage', amount: sim.credits });
    addC('Stage clear', ECONOMY.stageClearBase + ECONOMY.stageClearPerStage * run.stage);
    if (m.overfillCredits > 0) addC('Overfill Tap', Math.min(20, Math.floor((ratio - 1) * 10)) * m.overfillCredits);
    if (m.shotCredits > 0) addC('Shot Refund', sim.shotsLeft * m.shotCredits);
    if (m.precision > 0 && ratio <= 1.3) addC('Precision Window', m.precision);
    if (m.surplus > 0) addC('Reactor Efficiency', Math.floor((energy - target) / 40) * m.surplus);
    if (m.interest > 0) {
      const sub = run.credits + credits.reduce((s, c) => s + c.amount, 0);
      addC('Compound Interest', Math.min(15, Math.floor(sub * m.interest)));
    }

    const scoreMul = 1 + run.scoreBonus;
    score.push({ label: 'Stage score', amount: sim.score });
    score.push({ label: 'Clear bonus', amount: Math.round(ECONOMY.stageClearScore * run.stage * scoreMul) });
    if (sim.shotsLeft > 0) score.push({ label: `${sim.shotsLeft} shot${sim.shotsLeft > 1 ? 's' : ''} left`, amount: Math.round(sim.shotsLeft * ECONOMY.shotLeftScore * run.stage * scoreMul) });
    const surplus = Math.max(0, energy - target);
    if (surplus > 0) score.push({ label: 'Surplus energy', amount: Math.round(surplus * 10 * (1 + m.surplus) * scoreMul) });
    if (run.scoreBonus > 0) score[0].amount = Math.round(score[0].amount * scoreMul);

    const creditTotal = credits.reduce((s, c) => s + c.amount, 0);
    run.credits += creditTotal;
    run.tally.creditsFromStages += creditTotal;
    run.score += score.reduce((s, c) => s + c.amount, 0);
    const t = sim.tally;
    this.mergeTally();
    run.tally.stagesCleared++;
    run.history.push({ stage: run.stage, energy: Math.round(energy), target, shots: sim.shotsFired, modifiers: this.currentSetup?.modifiers ?? [] });
    const summary: StageClearSummary = { stage: run.stage, energy: Math.round(energy), target, shotsLeft: sim.shotsLeft, credits, score };
    run.lastClear = summary;
    run.stageProgress = undefined;

    this.profile.checkAchievements({
      stage: { stage: run.stage, cleared: true, shotsLeft: sim.shotsLeft, shotsFired: sim.shotsFired, energy, target, tally: t, mode: run.mode },
      run: this.runCtx(false),
    });
    this.audio.stageClear();
    this.scene?.setInputEnabled(false);

    if (run.stage === RULES.runLength && !run.endless) {
      if (run.mode === 'daily') {
        this.endRun(true);
        return;
      }
      run.phase = 'draft';
      run.won = true;
      run.victoryPending = true;
      saveRun(run);
      this.audio.victory();
      this.profile.checkAchievements({ run: this.runCtx(true) });
      this.ui.showVictory(run);
      return;
    }
    this.openDraft();
  }

  private mergeTally(): void {
    const run = this.run!;
    const sim = this.scene!.sim!;
    const t = sim.tally;
    run.tally.pegsHit += t.pegsHit;
    run.tally.bombs += t.bombs;
    run.tally.splits += t.splits;
    run.tally.reactors += t.reactors;
    run.tally.teleports += t.teleports;
    run.tally.bestCombo = Math.max(run.tally.bestCombo, t.bestCombo);
    run.tally.bestMult = Math.max(run.tally.bestMult, t.bestMult);
    run.tally.energyTotal += sim.energy;
  }

  /** Fold an unfinished stage's credits, score and stats into the run. */
  private mergeStage(clearProgress: boolean): void {
    const run = this.run!;
    const sim = this.scene?.sim;
    if (!sim || run.phase !== 'stage') return;
    run.credits += sim.credits;
    run.score += Math.round(sim.score * (1 + run.scoreBonus));
    this.mergeTally();
    if (clearProgress) run.stageProgress = undefined;
    run.phase = 'draft';
    run.victoryPending = false;
  }

  /** After a victory the player may continue into endless overdrive. */
  continueEndless(): void {
    if (!this.run) return;
    this.run.endless = true;
    this.run.victoryPending = false;
    this.openDraft();
  }

  private openDraft(): void {
    const run = this.run!;
    const mods = this.mods();
    run.stage++;
    run.phase = 'draft';
    run.draft = {
      options: rollDraft(mixSeed(run.seed, run.stage * 1000), run.upgrades, new Set(run.unlocked), mods.draftSize, run.rareLuck),
      freeRerolls: mods.rerolls,
      paidRerolls: 0,
      rollIndex: 0,
    };
    saveRun(run);
    this.ui.showDraft(run);
  }

  rerollCost(): { kind: 'free' | 'token' | 'credits'; cost: number } {
    const run = this.run!;
    const d = run.draft!;
    if (d.freeRerolls > 0) return { kind: 'free', cost: 0 };
    if (run.rerollTokens > 0) return { kind: 'token', cost: 0 };
    return { kind: 'credits', cost: ECONOMY.rerollBaseCost + ECONOMY.rerollCostStep * d.paidRerolls };
  }

  reroll(): boolean {
    const run = this.run;
    if (!run?.draft) return false;
    const c = this.rerollCost();
    if (c.kind === 'free') run.draft.freeRerolls--;
    else if (c.kind === 'token') run.rerollTokens--;
    else {
      if (run.credits < c.cost) return false;
      run.credits -= c.cost;
      run.draft.paidRerolls++;
    }
    run.draft.rollIndex++;
    const mods = this.mods();
    run.draft.options = rollDraft(mixSeed(run.seed, run.stage * 1000 + run.draft.rollIndex), run.upgrades, new Set(run.unlocked), mods.draftSize, run.rareLuck);
    saveRun(run);
    return true;
  }

  pickUpgrade(id: string): void {
    const run = this.run;
    if (!run?.draft || !run.draft.options.includes(id) || !UPGRADE_MAP[id]) return;
    run.upgrades.push(id);
    run.draft = undefined;
    run.phase = 'stage';
    run.stageProgress = undefined;
    this.audio.upgrade();
    this.profile.checkAchievements({ run: this.runCtx(false) });
    saveRun(run);
    this.startStage(false);
  }

  /** Next stage modifiers, for the Forecast upgrade. */
  previewModifiers(): string[] {
    if (!this.run) return [];
    return this.modifiersFor(this.run.stage).filter((id) => MODIFIER_MAP[id]);
  }

  abandonRun(): void {
    if (!this.run) return;
    // Credits from the current stage are kept: no punishment for leaving.
    this.mergeStage(true);
    this.endRun(false);
  }

  /** Abandon a run saved from an earlier session, banking what it earned. */
  abandonSavedRun(): void {
    const run = loadRun();
    if (!run) return;
    if (run.phase === 'stage' && run.stageProgress) {
      run.credits += run.stageProgress.credits;
      run.score += run.stageProgress.score;
      run.tally.pegsHit += run.stageProgress.tally.pegsHit;
    }
    this.run = run;
    this.bankRun(false);
    this.run = null;
  }

  abandonSavedRunSilently(): void {
    saveRun(null);
    this.run = null;
  }

  endRun(victory: boolean): void {
    const run = this.run;
    if (!run) return;
    const summary = this.bankRun(victory);
    this.run = null;
    this.scene?.setInputEnabled(false);
    if (!summary.victory) this.audio.runOver();
    this.ui.showRunOver(summary);
  }

  /** Bank credits and stats for the current run and clear its save. */
  private bankRun(victory: boolean): RunSummary {
    const run = this.run!;
    const mode = MODES[run.mode];
    const prof = this.profile;
    const p = prof.profile;
    victory = victory || !!run.won;
    // In the draft phase `stage` already points at the next stage.
    const reached = run.phase === 'draft' && run.draft ? run.stage - 1 : run.stage;
    // Salvage: every run pays something, even a rough one.
    const salvage = Math.floor(run.tally.pegsHit / ECONOMY.salvagePegs);
    const modeBonus = Math.round((run.credits + salvage) * (mode.creditMul - 1));
    const banked = Math.max(0, Math.floor(run.credits + salvage + modeBonus + (victory ? ECONOMY.victoryBonus : 0)));
    const newBest = run.score > p.stats.highScore;
    if (mode.metaRewards) {
      p.credits += banked;
      p.stats.totalCredits += banked;
      p.stats.totalRuns++;
      p.stats.bestStage = Math.max(p.stats.bestStage, reached);
      p.stats.highScore = Math.max(p.stats.highScore, run.score);
      p.stats.totalPegs += run.tally.pegsHit;
      p.stats.totalReactors += run.tally.reactors;
      p.stats.totalBombs += run.tally.bombs;
      p.stats.totalSplits += run.tally.splits;
      p.stats.longestCombo = Math.max(p.stats.longestCombo, run.tally.bestCombo);
      p.stats.playSeconds += Math.round((Date.now() - run.startedAt) / 1000);
      if (victory) p.stats.victories++;
      if (run.mode === 'daily' && run.dailyDate) {
        p.stats.dailyRuns++;
        p.daily.results[run.dailyDate] = { score: run.score, stage: reached };
      }
    }
    prof.checkAchievements({ run: { ...this.runCtx(victory), stage: reached } });
    prof.save();
    saveRun(null);
    const sim = this.scene?.sim;
    const summary: RunSummary = {
      run, victory, salvage,
      failed: !victory && sim && sim.energy < sim.target ? { energy: Math.round(sim.energy), target: sim.target } : undefined, stageReached: reached, creditsBanked: mode.metaRewards ? banked : 0, modeBonus,
      newAchievements: [...this.runAchievements], newBest,
    };
    return summary;
  }
}
