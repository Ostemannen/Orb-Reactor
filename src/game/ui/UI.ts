import type { LevelResult, ObjectiveProgress, RunController, RunSummary, RunUI, StageIntro } from '../systems/RunController';
import type { ProfileService } from '../../state/ProfileService';
import type { AudioSystem } from '../systems/AudioSystem';
import type { HudState } from '../scenes/BoardScene';
import type { RunState } from '../../state/run';
import { Hud } from './Hud';
import { $, esc, fmt, fmtTime, hex } from './dom';
import { MODES, type ModeId } from '../../data/modes';
import { UPGRADE_MAP, type UpgradeDef } from '../../data/upgrades';
import { MODIFIER_MAP } from '../../data/modifiers';
import { PEG_DEFS, PEG_ORDER } from '../../data/pegs';
import { LAB_NODES, MUSIC_TRACKS } from '../../data/meta';
import { COSMETICS, COSMETIC_MAP, SLOT_LABELS, type CosmeticDef, type CosmeticSlot } from '../../data/cosmetics';
import { ACHIEVEMENTS, ACHIEVEMENT_MAP } from '../../data/achievements';
import { LAYOUT_NAMES } from '../../data/stages';
import { RULES } from '../config/balance';
import { archetypeName, buildSummary, stacksOf } from '../systems/UpgradeSystem';
import { todayKey } from '../../state/profile';
import { INTRODUCTIONS, LEVELS_PER_WORLD, OBJECTIVES, WORLDS, getLevel, levelCount, type LevelDef } from '../../data/campaign';

type Screen = 'menu' | 'game' | 'overlay';

const CATEGORY_LABEL: Record<string, string> = {
  orb: 'Orb', energy: 'Energy', combo: 'Combo', split: 'Split / Chain', economy: 'Economy', utility: 'Utility',
};

/**
 * DOM layer for menus, overlays and the HUD. The Phaser canvas renders only
 * the reactor chamber; everything textual lives here so it stays crisp,
 * accessible and responsive on small screens.
 */
export class UI implements RunUI {
  private screens: HTMLElement;
  private toasts: HTMLElement;
  private hudCtl: Hud;
  private screen: Screen = 'menu';
  private cosmeticTab: CosmeticSlot = 'orb';
  private selectedUpgrade: string | null = null;
  private onResize?: () => void;

  constructor(private ctl: RunController, private prof: ProfileService, private audio: AudioSystem) {
    this.screens = $('#screens');
    this.toasts = $('#toasts');
    this.hudCtl = new Hud($('#hud-root'), $('#bottom-root'));
    $('#h-pause').addEventListener('click', () => this.showPause());
    $('#h-help').addEventListener('click', () => this.showCodex(true));
    $('#h-fast').addEventListener('click', () => {
      const s = this.ctl.scene;
      if (s) s.setFast(!s.isFast);
    });
    $('#h-mods').addEventListener('click', () => this.showModifierInfo());
    this.screens.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('pointerdown', () => this.audio.unlock(), { capture: true });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.screen === 'game') this.showPause();
        else if (this.screen === 'overlay' && this.overlayBack) this.overlayBack();
      }
    });
    prof.onAchievement((a) => this.toast(a.icon, `Achievement: ${a.name}`, this.rewardText(a.reward)));
    this.applyAccent();
    this.applyBackground();
  }

  setResizeHook(fn: () => void): void {
    this.onResize = fn;
  }

  // ── Click routing (event delegation) ────────────────────────────────────

  private actions: Record<string, (el: HTMLElement) => void> = {};
  private overlayBack?: () => void;

  private handleClick(e: Event): void {
    const el = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!el || el.hasAttribute('disabled')) return;
    const fn = this.actions[el.dataset.action!];
    if (fn) {
      this.audio.click();
      fn(el);
    }
  }

  private render(html: string, actions: Record<string, (el: HTMLElement) => void>, cls = ''): void {
    this.actions = actions;
    this.screens.innerHTML = `<div class="screen ${cls}">${html}</div>`;
    const scroller = this.screens.querySelector('.scroll');
    if (scroller) scroller.scrollTop = 0;
  }

  private clear(): void {
    this.screens.innerHTML = '';
    this.actions = {};
    this.overlayBack = undefined;
  }

  private setMode(screen: Screen): void {
    this.screen = screen;
    const inGame = screen !== 'menu';
    document.body.classList.toggle('in-game', inGame);
    $('#hud').classList.toggle('hidden', !inGame);
    $('#bottombar').classList.toggle('hidden', !inGame);
    this.audio.setAmbient(!inGame);
    this.onResize?.();
  }

  // ── Theming ─────────────────────────────────────────────────────────────

  applyAccent(): void {
    const a = this.prof.equipped('accent').look.css ?? ['#36e2ff', '#0b8fb0'];
    document.documentElement.style.setProperty('--accent', a[0]);
    document.documentElement.style.setProperty('--accent-deep', a[1]);
  }

  applyBackground(): void {
    const b = this.prof.equipped('background').look.css ?? ['#050816', '#0b1430'];
    document.documentElement.style.setProperty('--bg', b[0]);
    document.documentElement.style.setProperty('--bg2', b[1]);
  }

  // ── Toasts / dialogs ────────────────────────────────────────────────────

  toast(icon: string, title: string, sub = ''): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${esc(icon)}</span><div><b>${esc(title)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    this.toasts.appendChild(el);
    this.audio.achievement();
    setTimeout(() => el.classList.add('out'), 2800);
    setTimeout(() => el.remove(), 3300);
  }

  private rewardText(r: { credits?: number; cosmetic?: string; title?: string }): string {
    const parts: string[] = [];
    if (r.credits) parts.push(`+${r.credits} credits`);
    if (r.cosmetic) parts.push(`Cosmetic: ${COSMETIC_MAP[r.cosmetic]?.name ?? r.cosmetic}`);
    if (r.title) parts.push(`Title: ${r.title}`);
    return parts.join(' · ');
  }

  private confirm(title: string, body: string, yes: string, onYes: () => void, onNo: () => void, danger = false): void {
    const prevActions = this.actions;
    const prevBack = this.overlayBack;
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    layer.innerHTML = `<div class="dialog"><h3>${esc(title)}</h3><p>${esc(body)}</p>
      <div class="row"><button class="btn ghost" data-d="no">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-d="yes">${esc(yes)}</button></div></div>`;
    document.body.appendChild(layer);
    const close = () => {
      layer.remove();
      this.actions = prevActions;
      this.overlayBack = prevBack;
    };
    layer.addEventListener('click', (e) => {
      const d = (e.target as HTMLElement).closest('[data-d]') as HTMLElement | null;
      if (!d && e.target !== layer) return;
      this.audio.click();
      close();
      if (d?.dataset.d === 'yes') onYes();
      else onNo();
    });
  }

  // ── HUD (RunUI) ─────────────────────────────────────────────────────────

  hud(state: HudState, run: RunState | null, objective?: ObjectiveProgress): void {
    this.hudCtl.update(state, run, objective);
  }

  onShotFired(): void {
    document.querySelector('.coach')?.classList.add('gone');
  }

  enterGameplay(practice: boolean): void {
    this.clear();
    this.hudCtl.practice = practice;
    this.hudCtl.reset();
    this.setMode('game');
  }

  // ── Main menu ───────────────────────────────────────────────────────────

  showMenu(): void {
    this.setMode('menu');
    this.ctl.previewOverride = {};
    const p = this.prof.profile;
    const saved = this.ctl.hasSavedRun();
    const dailyOk = this.ctl.dailyAvailable();
    const achCount = Object.keys(p.achievements).length;
    const todayRes = p.daily.results[todayKey()];
    const camp = this.prof.campaignSummary();
    const html = `
      <div class="menu-top">
        <div class="pill credits-pill" title="Credits">¢ <b>${fmt(p.credits)}</b></div>
        <div class="pill title-pill">${esc(p.activeTitle)}</div>
      </div>
      <div class="menu-center">
        <h1 class="logo"><span class="logo-orb">ORB</span><span class="logo-reactor">REACTOR</span></h1>
        <p class="tagline">Great games. Fair mechanics. No bullshit.</p>
        ${this.prof.recoveredFromCorrupt ? `<p class="notice">Your save file was unreadable, so a fresh profile was started. The damaged data was kept aside.</p>` : ''}
        <div class="menu-buttons">
          <button class="btn primary big" data-action="saga">▶ Play <small>Level ${Math.min(p.campaign.unlocked, levelCount())} · ★ ${camp.stars}</small></button>
          ${saved ? `<button class="btn" data-action="continue">Continue Reactor Run <small>${esc(MODES[saved.mode].name)} · Stage ${saved.stage}</small></button>` : ''}
          <button class="btn" data-action="play">${saved ? 'New Reactor Run' : 'Reactor Run'} <small>Roguelite · 10 stages · draft upgrades</small></button>
          <button class="btn" data-action="daily">☼ Daily Reactor <small>${dailyOk ? 'Available today' : todayRes ? `Done · ${fmt(todayRes.score)} pts` : 'Done today'}</small></button>
          <div class="row">
            <button class="btn" data-action="practice">Practice</button>
            <button class="btn" data-action="challenges">Challenges</button>
          </div>
        </div>
      </div>
      <nav class="menu-nav">
        <button class="nav-btn" data-action="lab"><span>⌬</span>Lab</button>
        <button class="nav-btn" data-action="cosmetics"><span>✦</span>Style</button>
        <button class="nav-btn" data-action="achievements"><span>★</span>${achCount}/${ACHIEVEMENTS.length}</button>
        <button class="nav-btn" data-action="stats"><span>▤</span>Stats</button>
        <button class="nav-btn" data-action="settings"><span>⚙</span>Settings</button>
      </nav>`;
    this.render(html, {
      continue: () => {
        if (!this.ctl.resumeRun()) {
          this.toast('⚠', 'Saved run could not be restored', 'Starting fresh.');
          this.showMenu();
        }
      },
      saga: () => this.showSaga(),
      play: () => this.startMode('standard'),
      daily: () => this.showDaily(),
      practice: () => this.ctl.startPractice(),
      challenges: () => this.showChallenges(),
      lab: () => this.showLab(),
      cosmetics: () => this.showCosmetics(),
      achievements: () => this.showAchievements(),
      stats: () => this.showStats(),
      settings: () => this.showSettings(() => this.showMenu()),
    }, 'menu');
  }

  private startMode(mode: ModeId): void {
    const saved = this.ctl.hasSavedRun();
    const go = () => this.ctl.startRun(mode);
    if (saved) {
      this.confirm('Abandon saved run?', `Your ${MODES[saved.mode].name} at stage ${saved.stage} will end. Credits earned so far are still banked.`, 'Abandon & start',
        () => { this.ctl.abandonSavedRun(); this.ctl.startRun(mode); }, () => undefined, true);
      return;
    }
    go();
  }

  private panel(title: string, body: string, footer = '', back = 'back'): string {
    return `<div class="panel">
      <header class="panel-head"><button class="icon-btn" data-action="${back}" aria-label="Back">‹</button><h2>${esc(title)}</h2><span class="spacer"></span></header>
      <div class="scroll">${body}</div>
      ${footer ? `<footer class="panel-foot">${footer}</footer>` : ''}
    </div>`;
  }

  private showDaily(): void {
    const p = this.prof.profile;
    const ok = this.ctl.dailyAvailable();
    const res = p.daily.results[todayKey()];
    const history = Object.entries(p.daily.results).sort((a, b) => (a[0] < b[0] ? 1 : -1)).slice(0, 7);
    const body = `
      <div class="hero-card daily">
        <div class="hero-icon">☼</div>
        <h3>Daily Reactor · ${esc(todayKey())}</h3>
        <p>${esc(MODES.daily.desc)}</p>
        <p class="dim">One attempt per day per profile. Everyone gets the same boards today.</p>
      </div>
      ${res ? `<div class="result-line">Today: <b>${fmt(res.score)}</b> points · reached stage <b>${res.stage}</b></div>` : ''}
      ${history.length ? `<h4 class="section">Recent dailies</h4><ul class="list">${history.map(([d, r]) => `<li><span>${esc(d)}</span><span>Stage ${r.stage}</span><b>${fmt(r.score)}</b></li>`).join('')}</ul>` : ''}`;
    const footer = ok
      ? `<button class="btn primary big" data-action="go">Start today's reactor</button>`
      : `<button class="btn big" disabled>Attempt used — a new reactor arrives tomorrow</button>`;
    this.render(this.panel('Daily Reactor', body, footer), { back: () => this.showMenu(), go: () => this.startMode('daily') }, 'overlay');
    this.overlayBack = () => this.showMenu();
  }

  private showChallenges(): void {
    const modes: ModeId[] = ['hardcore', 'chaos'];
    const body = modes.map((id) => {
      const m = MODES[id];
      const unlocked = this.ctl.isModeUnlocked(id);
      return `<div class="card mode-card ${unlocked ? '' : 'locked'}">
        <h3>${esc(m.name)}</h3><p class="tag">${esc(m.tagline)}</p><p>${esc(m.desc)}</p>
        ${unlocked ? `<button class="btn primary" data-action="start" data-mode="${id}">Start ${esc(m.name)}</button>`
          : `<button class="btn" disabled>Unlock in the Reactor Lab</button>`}
      </div>`;
    }).join('');
    this.render(this.panel('Challenges', `<p class="lead">Challenge modes remix the rules. They are unlocked with credits in the Reactor Lab — never sold.</p>${body}`), {
      back: () => this.showMenu(),
      start: (el) => this.startMode(el.dataset.mode as ModeId),
    }, 'overlay');
    this.overlayBack = () => this.showMenu();
  }

  // ── Stage intro ─────────────────────────────────────────────────────────

  showStageIntro(info: StageIntro, onGo: () => void): void {
    this.hudCtl.setStage(info.stage, info.endless, info.modifiers);
    this.screen = 'overlay';
    const mods = info.modifiers.map((id) => MODIFIER_MAP[id]).filter(Boolean);
    const first = !this.prof.profile.tutorialDone;
    const practice = info.mode === 'practice';
    const title = practice ? 'Practice Chamber' : info.endless ? `Overdrive ${info.stage}` : `Stage ${info.stage}`;
    const html = `
      <div class="intro-card ${info.isCore ? 'core' : ''}">
        <div class="intro-kicker">${practice ? 'Unlimited shots · every peg type' : esc(LAYOUT_NAMES[info.layout] ?? 'Sector')}${info.isCore ? ' · CORE STAGE' : ''}</div>
        <h2>${esc(title)}${!practice && !info.endless ? `<span class="dim"> / ${RULES.runLength}</span>` : ''}</h2>
        ${practice ? `<p>Test angles, bounces and peg combos freely. Tap <b>?</b> any time for the peg guide.</p>` : `
        <div class="intro-goal">
          <div><span class="lbl">ENERGY TARGET</span><b class="energy-num">${fmt(info.target)} ⚡</b></div>
          <div><span class="lbl">SHOTS</span><b>${info.shots}</b></div>
        </div>`}
        ${mods.map((m) => `<div class="modifier"><span class="mod-icon">${esc(m.icon)}</span><div><b>${esc(m.name)}</b><p>${esc(m.desc)}</p></div></div>`).join('')}
        ${info.resumed ? `<p class="dim">Run restored — continuing where you left off.</p>` : ''}
        ${first && !practice ? `<div class="howto"><div>☝ <b>Drag</b> on the chamber to aim</div><div>⤓ <b>Release</b> to fire the orb</div><div>⚡ Fill the energy bar before your shots run out</div></div>` : ''}
        <button class="btn primary big" data-action="go">${info.resumed ? 'Resume' : 'Engage'}</button>
      </div>`;
    this.render(html, {
      go: () => {
        this.clear();
        this.screen = 'game';
        if (first && !practice) this.showCoach();
        onGo();
      },
    }, 'intro');
  }

  private showCoach(): void {
    const el = document.createElement('div');
    el.className = 'coach';
    el.innerHTML = `<div class="coach-hand">☝</div><p>Drag to aim · release to fire</p>`;
    $('#stage-wrap').appendChild(el);
    setTimeout(() => el.classList.add('gone'), 9000);
    setTimeout(() => el.remove(), 9600);
  }

  private showModifierInfo(): void {
    const mods = this.hudCtl.modifiers.map((id) => MODIFIER_MAP[id]).filter(Boolean);
    for (const m of mods) this.toast(m.icon, m.name, m.desc);
  }

  // ── Draft ───────────────────────────────────────────────────────────────

  showDraft(run: RunState): void {
    this.setMode('game');
    this.screen = 'overlay';
    this.selectedUpgrade = null;
    this.renderDraft(run);
  }

  private upgradeCard(u: UpgradeDef, owned: string[], selected: boolean): string {
    const stacks = stacksOf(owned, u.id);
    return `<button class="upg-card rarity-${u.rarity} ${selected ? 'selected' : ''}" data-action="select" data-id="${u.id}" aria-pressed="${selected}">
      <span class="upg-icon">${esc(u.icon)}</span>
      <span class="upg-body">
        <span class="upg-top"><b>${esc(u.name)}</b><span class="rarity">${u.rarity}</span></span>
        <span class="upg-desc">${esc(u.desc)}</span>
        <span class="upg-meta">${esc(CATEGORY_LABEL[u.category])}${stacks ? ` · owned ${stacks}/${u.max}` : u.max > 1 ? ` · stacks ×${u.max}` : ''}</span>
      </span>
    </button>`;
  }

  private renderDraft(run: RunState): void {
    const d = run.draft!;
    const clear = run.lastClear;
    const owned = run.upgrades;
    const build = buildSummary(owned);
    const mods = this.ctl.mods();
    const cost = this.ctl.rerollCost();
    const canReroll = cost.kind !== 'credits' || run.credits >= cost.cost;
    const forecast = mods.revealModifier > 0 ? this.ctl.previewModifiers() : [];
    const creditsGained = clear ? clear.credits.reduce((s, c) => s + c.amount, 0) : 0;
    const scoreGained = clear ? clear.score.reduce((s, c) => s + c.amount, 0) : 0;
    const html = `
      <div class="panel draft">
        <header class="draft-head">
          ${clear ? `<div class="clear-badge">STAGE ${clear.stage} CLEARED</div>
          <div class="clear-stats">
            <span>⚡ <b>${fmt(clear.energy)}</b><span class="dim">/${fmt(clear.target)}</span></span>
            <span class="gold">¢ +${fmt(creditsGained)}</span>
            <span>✪ +${fmt(scoreGained)}</span>
          </div>
          <details class="breakdown"><summary>Reward breakdown</summary>
            <ul>${clear.credits.map((c) => `<li><span>${esc(c.label)}</span><b class="gold">+${fmt(c.amount)} ¢</b></li>`).join('')}
            ${clear.score.map((c) => `<li><span>${esc(c.label)}</span><b>+${fmt(c.amount)}</b></li>`).join('')}</ul>
          </details>` : `<div class="clear-badge">UPGRADE</div>`}
        </header>
        <div class="scroll">
          <h3 class="draft-title">Choose an upgrade <span class="dim">for stage ${run.stage}</span></h3>
          <div class="upg-list">${d.options.map((id) => this.upgradeCard(UPGRADE_MAP[id], owned, this.selectedUpgrade === id)).join('')}</div>
          ${forecast.length ? `<div class="forecast">☂ Next stage: ${forecast.map((id) => `<b>${esc(MODIFIER_MAP[id].icon)} ${esc(MODIFIER_MAP[id].name)}</b> — ${esc(MODIFIER_MAP[id].desc)}`).join('<br>')}</div>` : ''}
          <div class="build">
            <div class="build-head"><span class="lbl">YOUR BUILD</span><b>${esc(archetypeName(owned))}</b></div>
            ${build.length ? `<div class="chips">${build.map((b) => `<span class="chip tag-${b.tag}">${esc(b.label)} ${'●'.repeat(Math.min(6, b.count))}</span>`).join('')}</div>` : `<p class="dim">No upgrades yet — your first pick sets the direction.</p>`}
            ${owned.length ? `<div class="owned">${this.ownedIcons(owned)}</div>` : ''}
          </div>
        </div>
        <footer class="panel-foot">
          <div class="foot-info"><span class="gold">¢ ${fmt(run.credits)}</span></div>
          <button class="btn" data-action="reroll" ${canReroll ? '' : 'disabled'}>⟳ Reroll <small>${cost.kind === 'free' ? `free ×${d.freeRerolls}` : cost.kind === 'token' ? `token ×${run.rerollTokens}` : `${cost.cost} ¢`}</small></button>
          <button class="btn primary" data-action="confirm" ${this.selectedUpgrade ? '' : 'disabled'}>Confirm</button>
        </footer>
      </div>`;
    this.render(html, {
      select: (el) => {
        this.selectedUpgrade = el.dataset.id!;
        this.renderDraft(run);
      },
      reroll: () => {
        if (this.ctl.reroll()) {
          this.selectedUpgrade = null;
          this.renderDraft(this.ctl.run!);
        } else this.audio.deny();
      },
      confirm: () => {
        if (!this.selectedUpgrade) return;
        const id = this.selectedUpgrade;
        this.selectedUpgrade = null;
        this.ctl.pickUpgrade(id);
      },
    }, 'overlay draft-screen');
  }

  private ownedIcons(owned: string[]): string {
    const counts = new Map<string, number>();
    for (const id of owned) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts.entries()].map(([id, n]) => {
      const u = UPGRADE_MAP[id];
      return `<span class="owned-icon rarity-${u.rarity}" title="${esc(u.name)}: ${esc(u.desc)}">${esc(u.icon)}${n > 1 ? `<i>${n}</i>` : ''}</span>`;
    }).join('');
  }

  // ── Victory / run over ──────────────────────────────────────────────────

  showVictory(run: RunState): void {
    this.setMode('game');
    this.screen = 'overlay';
    const html = `
      <div class="panel result victory">
        <div class="scroll">
          <div class="result-hero"><div class="hero-icon">♛</div><h2>Reactor Stabilized</h2><p>All ${RULES.runLength} stages cleared. Outstanding operating.</p></div>
          <div class="big-score"><span class="lbl">SCORE</span><b>${fmt(run.score)}</b></div>
          <p class="lead">Cash out now with a <b class="gold">+${40} ¢</b> victory bonus, or push into <b>Endless Overdrive</b> — targets keep climbing and everything you earn is kept.</p>
          <div class="owned">${this.ownedIcons(run.upgrades)}</div>
        </div>
        <footer class="panel-foot">
          <button class="btn" data-action="cash">Cash out</button>
          <button class="btn primary" data-action="endless">Endless Overdrive ▶</button>
        </footer>
      </div>`;
    this.render(html, { cash: () => this.ctl.endRun(true), endless: () => this.ctl.continueEndless() }, 'overlay');
  }

  showRunOver(s: RunSummary): void {
    this.setMode('game');
    this.screen = 'overlay';
    const run = s.run;
    const t = run.tally;
    const mode = MODES[run.mode];
    const stats: [string, string][] = [
      ['Stages cleared', String(t.stagesCleared)],
      ['Pegs hit', fmt(t.pegsHit)],
      ['Best combo', String(t.bestCombo)],
      ['Best multiplier', `×${t.bestMult.toFixed(1)}`],
      ['Bombs triggered', String(t.bombs)],
      ['Split orbs', String(t.splits)],
      ['Reactors activated', String(t.reactors)],
      ['Teleports', String(t.teleports)],
      ['Shots fired', String(t.shotsFired)],
      ['Total energy', fmt(t.energyTotal)],
    ];
    const title = s.victory ? 'Run Complete' : 'Reactor Offline';
    const html = `
      <div class="panel result ${s.victory ? 'victory' : 'fail'}">
        <div class="scroll">
          <div class="result-hero">
            <div class="hero-icon">${s.victory ? '♛' : '⏻'}</div>
            <h2>${title}</h2>
            <p>${esc(mode.name)} · reached ${run.endless ? 'overdrive ' : ''}stage <b>${s.stageReached}</b></p>
            ${s.failed ? `<p class="dim">Final stage: ${fmt(s.failed.energy)} / ${fmt(s.failed.target)} ⚡ — ${Math.round((s.failed.energy / s.failed.target) * 100)}% charged</p>` : ''}
          </div>
          <div class="big-score"><span class="lbl">FINAL SCORE${s.newBest ? ' · <em>NEW BEST</em>' : ''}</span><b>${fmt(run.score)}</b></div>
          ${mode.metaRewards ? `<div class="banked">
            <span class="lbl">CREDITS BANKED</span><b class="gold">+${fmt(s.creditsBanked)} ¢</b>
            ${s.salvage > 0 ? `<small>includes peg salvage +${fmt(s.salvage)}</small>` : ''}
            ${s.modeBonus > 0 ? `<small>includes ${esc(mode.name)} bonus +${fmt(s.modeBonus)}</small>` : ''}
            ${s.victory ? `<small>includes victory bonus +40</small>` : ''}
          </div>` : ''}
          <div class="build">
            <div class="build-head"><span class="lbl">BUILD</span><b>${esc(archetypeName(run.upgrades))}</b></div>
            ${run.upgrades.length ? `<div class="owned">${this.ownedIcons(run.upgrades)}</div>` : `<p class="dim">No upgrades drafted.</p>`}
          </div>
          <div class="stat-grid">${stats.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
          ${s.newAchievements.length ? `<h4 class="section">Achievements unlocked</h4><ul class="list ach">${s.newAchievements.map((a) => `<li><span class="ach-icon">${esc(a.icon)}</span><span><b>${esc(a.name)}</b><small>${esc(this.rewardText(a.reward))}</small></span></li>`).join('')}</ul>` : ''}
        </div>
        <footer class="panel-foot">
          <button class="btn" data-action="menu">Menu</button>
          ${run.mode === 'daily' ? '' : `<button class="btn primary" data-action="retry">Retry ${esc(mode.name)}</button>`}
        </footer>
      </div>`;
    this.render(html, {
      menu: () => this.ctl.quitToMenu(),
      retry: () => this.ctl.startRun(run.mode),
    }, 'overlay');
  }

  // ── Campaign map ────────────────────────────────────────────────────────

  showSaga(focus?: number): void {
    this.setMode('menu');
    this.screen = 'overlay';
    const c = this.prof.profile.campaign;
    const total = levelCount();
    const sum = this.prof.campaignSummary();
    const current = Math.min(c.unlocked, total);
    const worlds = Math.ceil(total / LEVELS_PER_WORLD);
    let body = '';
    for (let w = 1; w <= worlds; w++) {
      const first = (w - 1) * LEVELS_PER_WORLD + 1;
      const last = Math.min(total, w * LEVELS_PER_WORLD);
      let worldStars = 0;
      for (let n = first; n <= last; n++) worldStars += c.stars[n] ?? 0;
      const lockedWorld = first > c.unlocked;
      body += `<section class="world ${lockedWorld ? 'locked' : ''}">
        <header class="world-head"><span class="world-num">WORLD ${w}</span><b>${esc(WORLDS[(w - 1) % WORLDS.length])}</b>
        <span class="world-stars">★ ${worldStars}/${(last - first + 1) * 3}</span></header>
        <div class="path">`;
      for (let n = first; n <= last; n++) {
        const i = n - first;
        const stars = c.stars[n] ?? 0;
        const locked = n > c.unlocked;
        const boss = i === LEVELS_PER_WORLD - 1;
        const x = Math.round(Math.sin(i * 0.9) * 92);
        const def = getLevel(n);
        const icon = def ? OBJECTIVES[def.objective].icon : '';
        body += `<button class="node ${locked ? 'locked' : ''} ${n === current ? 'current' : ''} ${boss ? 'boss' : ''} ${stars ? 'done' : ''}"
          style="--x:${x}px" data-action="${locked ? 'lockedLevel' : 'level'}" data-n="${n}" ${n === (focus ?? current) ? 'id="focus-node"' : ''}
          aria-label="Level ${n}${locked ? ' (locked)' : `, ${stars} stars`}">
          <span class="node-num">${locked ? '🔒' : n}</span>
          ${!locked && def && def.objective !== 'energy' ? `<span class="node-obj">${esc(icon)}</span>` : ''}
          <span class="node-stars">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}">★</i>`).join('')}</span>
        </button>`;
      }
      body += `</div></section>`;
    }
    const html = `<div class="panel saga">
      <header class="panel-head"><button class="icon-btn" data-action="back" aria-label="Back">‹</button><h2>Campaign</h2><span class="spacer"></span>
        <span class="pill">★ <b>${sum.stars}</b></span><span class="pill credits-pill">¢ <b>${fmt(this.prof.profile.credits)}</b></span></header>
      <div class="scroll saga-scroll">${body}</div>
      <footer class="panel-foot"><button class="btn primary big" data-action="level" data-n="${current}">Play level ${current}</button></footer>
    </div>`;
    this.render(html, {
      back: () => this.showMenu(),
      level: (el) => this.ctl.startLevel(Number(el.dataset.n)),
      lockedLevel: () => {
        this.audio.deny();
        this.toast('🔒', 'Level locked', `Complete level ${c.unlocked} to continue.`);
      },
    }, 'overlay saga-screen');
    this.overlayBack = () => this.showMenu();
    requestAnimationFrame(() => document.getElementById('focus-node')?.scrollIntoView({ block: 'center' }));
  }

  private starRow(stars: number, big = false): string {
    return `<div class="star-row ${big ? 'big' : ''}">${[1, 2, 3].map((k) => `<i class="${k <= stars ? 'on' : ''}" style="--d:${k * 0.18}s">★</i>`).join('')}</div>`;
  }

  showLevelIntro(def: LevelDef, onGo: () => void): void {
    this.hudCtl.setLevel(def.n, def.modifiers);
    this.screen = 'overlay';
    const o = OBJECTIVES[def.objective];
    const intro = INTRODUCTIONS[def.n];
    const best = this.prof.profile.campaign.stars[def.n] ?? 0;
    const mods = def.modifiers.map((id) => MODIFIER_MAP[id]).filter(Boolean);
    const html = `
      <div class="intro-card ${def.boss ? 'core' : ''}">
        <div class="intro-kicker">World ${def.world} · ${esc(def.worldName)}${def.boss ? ' · BOSS LEVEL' : ''}</div>
        <h2>Level ${def.n}</h2>
        <div class="objective"><span class="obj-icon">${esc(o.icon)}</span><b>${esc(o.label(def.target))}</b></div>
        <div class="intro-goal">
          <div><span class="lbl">SHOTS</span><b>${def.shots}</b></div>
          <div><span class="lbl">★★ / ★★★</span><b class="small-num">${fmt(def.stars[0])} / ${fmt(def.stars[1])}</b></div>
        </div>
        ${best ? this.starRow(best) : ''}
        ${intro ? `<div class="howto">${intro.peg ? `<span class="peg-swatch peg-${intro.peg}" style="--c:${hex(PEG_DEFS[intro.peg].color)}">${esc(PEG_DEFS[intro.peg].glyph)}</span>` : '💡'} <span>${esc(intro.text)}</span></div>` : ''}
        ${mods.map((m) => `<div class="modifier"><span class="mod-icon">${esc(m.icon)}</span><div><b>${esc(m.name)}</b><p>${esc(m.desc)}</p></div></div>`).join('')}
        <p class="dim small">Unused shots after the goal is met become bonus score.</p>
        <div class="row"><button class="btn" data-action="map">Map</button><button class="btn primary big" data-action="go">Play</button></div>
      </div>`;
    this.render(html, {
      go: () => {
        this.clear();
        this.screen = 'game';
        if (def.n === 1 && !this.prof.profile.tutorialDone) this.showCoach();
        onGo();
      },
      map: () => this.ctl.quitToMap(),
    }, 'intro');
  }

  showLevelResult(r: LevelResult): void {
    this.screen = 'overlay';
    const def = r.def;
    const o = OBJECTIVES[def.objective];
    const next = getLevel(def.n + 1);
    const html = `
      <div class="intro-card result-card ${r.won ? 'win' : 'lose'}">
        <div class="intro-kicker">Level ${def.n} · ${esc(def.worldName)}</div>
        <h2>${r.won ? (r.stars === 3 ? 'Perfect!' : 'Level Complete') : 'Out of Shots'}</h2>
        ${r.won ? this.starRow(r.stars, true) : `<p class="fail-line">${esc(o.icon)} ${fmt(r.value)} / ${fmt(def.target)} — so close. Retrying is always free.</p>`}
        ${r.won ? `<div class="big-score"><span class="lbl">SCORE${r.score > r.bestBefore && r.bestBefore > 0 ? ' · <em>NEW BEST</em>' : ''}</span><b>${fmt(r.score)}</b></div>
          ${r.bonus > 0 ? `<p class="dim">Includes ${r.shotsLeft} unused shot${r.shotsLeft > 1 ? 's' : ''}: +${fmt(r.bonus)}</p>` : ''}
          ${r.stars < 3 ? `<p class="dim small">Next star at ${fmt(def.stars[r.stars - 1])} points</p>` : ''}
          ${r.credits > 0 ? `<p class="gold">+${r.credits} ¢${r.newStars ? ` for ${r.newStars} new star${r.newStars > 1 ? 's' : ''}` : ''}</p>` : ''}` : ''}
        <div class="row">
          <button class="btn" data-action="map">Map</button>
          <button class="btn" data-action="retry">Retry</button>
          ${r.won && next ? `<button class="btn primary" data-action="next">Next ▶</button>` : ''}
        </div>
      </div>`;
    this.render(html, {
      map: () => this.ctl.quitToMap(),
      retry: () => this.ctl.restartLevel(),
      next: () => this.ctl.startLevel(def.n + 1),
    }, 'intro');
  }

  // ── Pause ───────────────────────────────────────────────────────────────

  showPause(): void {
    if (this.screen !== 'game') return;
    this.screen = 'overlay';
    const scene = this.ctl.scene;
    scene?.setInputEnabled(false);
    scene?.scene.pause();
    const campaign = !!this.ctl.level;
    const practice = !this.ctl.run && !campaign;
    const resume = () => {
      this.clear();
      this.screen = 'game';
      scene?.scene.resume();
      if (scene?.sim && !scene.sim.inShot) scene.setInputEnabled(true);
    };
    const html = `<div class="panel pause">
      <header class="panel-head"><h2>Paused</h2></header>
      <div class="scroll stack">
        <button class="btn primary big" data-action="resume">Resume</button>
        ${practice ? `<button class="btn" data-action="reset">Reset board</button>` : ''}
        <button class="btn" data-action="codex">Peg guide</button>
        <button class="btn" data-action="settings">Settings</button>
        ${campaign ? `<button class="btn" data-action="restart">Restart level</button><button class="btn" data-action="map">Quit to map</button>`
          : practice ? `<button class="btn" data-action="exit">Exit practice</button>`
          : `<button class="btn" data-action="menu">Save & quit to menu</button><button class="btn danger" data-action="abandon">Abandon run</button>`}
      </div></div>`;
    this.render(html, {
      resume,
      reset: () => { resume(); this.ctl.resetPractice(); },
      codex: () => this.showCodex(false, () => { this.screen = 'game'; this.showPause(); }),
      settings: () => this.showSettings(() => { this.screen = 'game'; this.showPause(); }),
      exit: () => { scene?.scene.resume(); this.ctl.quitToMenu(); },
      restart: () => { scene?.scene.resume(); this.ctl.restartLevel(); },
      map: () => { scene?.scene.resume(); this.ctl.quitToMap(); },
      menu: () => { scene?.scene.resume(); this.ctl.quitToMenu(); },
      abandon: () => this.confirm('Abandon this run?', 'The run ends now. Credits earned so far are still banked.', 'Abandon run',
        () => { scene?.scene.resume(); this.ctl.abandonRun(); }, () => undefined, true),
    }, 'overlay');
    this.overlayBack = resume;
  }

  // ── Codex ───────────────────────────────────────────────────────────────

  showCodex(fromHud: boolean, back?: () => void): void {
    const scene = this.ctl.scene;
    if (fromHud) {
      if (this.screen !== 'game') return;
      scene?.setInputEnabled(false);
      scene?.scene.pause();
    }
    this.screen = 'overlay';
    const unlocked = this.prof.unlocked;
    const close = () => {
      if (back) return back();
      this.clear();
      this.screen = 'game';
      scene?.scene.resume();
      if (scene?.sim && !scene.sim.inShot) scene.setInputEnabled(true);
    };
    const pegs = PEG_ORDER.map((t) => {
      const d = PEG_DEFS[t];
      const locked = d.unlock && !unlocked.has(d.unlock);
      return `<li class="codex-item ${locked ? 'locked' : ''}">
        <span class="peg-swatch peg-${t}" style="--c:${hex(d.color)}">${esc(d.glyph)}</span>
        <span><b>${esc(d.name)}</b><small>${esc(d.description)}${locked ? ' (Unlock in the Reactor Lab.)' : ''}</small></span></li>`;
    }).join('');
    const tips = `<ul class="tips">
      <li><b>Combo</b> grows with every hit and adds +${RULES.comboStep}× to the multiplier per step. It decays if the orb goes quiet.</li>
      <li><b>Multiplier</b> applies to all energy and score during the shot.</li>
      <li>Hit pegs are cleared when the shot ends, opening new paths.</li>
      <li>Hold <b>⏩</b> during long shots, or enable auto fast-forward in settings.</li>
      <li>Keyboard: ←/→ or A/D to aim (Shift = fine), Space to fire, P to pause.</li></ul>`;
    this.render(this.panel('Peg Guide', `<ul class="codex">${pegs}</ul><h4 class="section">How energy works</h4>${tips}`), { back: close }, 'overlay');
    this.overlayBack = close;
  }

  // ── Lab ─────────────────────────────────────────────────────────────────

  showLab(): void {
    const p = this.prof;
    const groups = ['Content', 'Schematics', 'Calibration', 'Archive'] as const;
    const body = `<p class="lead">Spend credits on permanent unlocks. Power upgrades are kept small on purpose — skill and builds matter most.</p>` +
      groups.map((g) => `<h4 class="section">${g}</h4><div class="lab-grid">${LAB_NODES.filter((n) => n.group === g).map((n) => {
        const lvl = p.level(n.id);
        const max = n.costs.length;
        const cost = p.nextLabCost(n.id);
        const reqMissing = n.requires && p.level(n.requires) <= 0;
        const afford = p.canBuyLab(n.id);
        const done = cost === null;
        return `<div class="card lab-node ${done ? 'done' : ''}">
          <div class="lab-head"><span class="lab-icon">${esc(n.icon)}</span><b>${esc(n.name)}</b>${max > 1 ? `<span class="lvl">${lvl}/${max}</span>` : ''}</div>
          <p>${esc(n.desc)}</p>
          ${done ? `<button class="btn" disabled>✓ Owned</button>`
            : reqMissing ? `<button class="btn" disabled>Requires ${esc(LAB_NODES.find((x) => x.id === n.requires)?.name ?? '')}</button>`
            : `<button class="btn ${afford ? 'primary' : ''}" data-action="buy" data-id="${n.id}" ${afford ? '' : 'disabled'}>¢ ${fmt(cost!)}</button>`}
        </div>`;
      }).join('')}</div>`).join('');
    const head = `<div class="pill credits-pill">¢ <b>${fmt(p.profile.credits)}</b></div>`;
    this.render(this.panel('Reactor Lab', body, head), {
      back: () => this.showMenu(),
      buy: (el) => {
        if (p.buyLab(el.dataset.id!)) {
          this.audio.upgrade();
          const scroll = this.screens.querySelector('.scroll')?.scrollTop ?? 0;
          this.showLab();
          const sc = this.screens.querySelector('.scroll');
          if (sc) sc.scrollTop = scroll;
        } else this.audio.deny();
      },
    }, 'overlay');
    this.overlayBack = () => this.showMenu();
  }

  // ── Cosmetics ───────────────────────────────────────────────────────────

  private swatch(c: CosmeticDef): string {
    const l = c.look;
    const colors = (l.css ?? (l.colors ?? [l.glow ?? 0x8fe9ff, l.core ?? 0xffffff]).map(hex));
    switch (c.slot) {
      case 'orb':
        return `<span class="sw sw-orb" style="--core:${hex(l.core ?? 0xffffff)};--glow:${hex(l.glow ?? 0x8fe9ff)};--ring:${l.ring ? hex(l.ring) : 'transparent'}"></span>`;
      case 'trail':
        return `<span class="sw sw-trail" style="background:linear-gradient(90deg,transparent,${colors.join(',')})"></span>`;
      case 'hit':
        return `<span class="sw sw-hit sw-${esc(l.style ?? 'spark')}"></span>`;
      default:
        return `<span class="sw sw-block" style="background:linear-gradient(135deg,${colors.join(',')})"></span>`;
    }
  }

  private sourceText(c: CosmeticDef): string {
    const s = c.source;
    if (s.kind === 'achievement') return `Earn: ${ACHIEVEMENT_MAP[s.id]?.name ?? s.id} — ${ACHIEVEMENT_MAP[s.id]?.desc ?? ''}`;
    if (s.kind === 'lab') return `Unlock in the Reactor Lab (${LAB_NODES.find((n) => n.id === s.id)?.name ?? s.id})`;
    if (s.kind === 'shop') return `Shop item · ${s.price}`;
    return 'Default';
  }

  showCosmetics(): void {
    const p = this.prof;
    const slots = Object.keys(SLOT_LABELS) as CosmeticSlot[];
    const tab = this.cosmeticTab;
    const items = COSMETICS.filter((c) => c.slot === tab);
    const equippedId = p.profile.cosmetics.equipped[tab];
    const previewId = this.ctl.previewOverride[tab];
    const body = `
      <div class="fair-banner">Cosmetics change looks only — never physics, energy, credits, score, upgrades or shots.</div>
      <div class="tabs" role="tablist">${slots.map((s) => `<button class="tab ${s === tab ? 'on' : ''}" data-action="tab" data-slot="${s}">${esc(SLOT_LABELS[s])}</button>`).join('')}</div>
      <div class="cos-grid">${items.map((c) => {
        const owned = p.owns(c.id);
        const equipped = equippedId === c.id;
        const shop = c.source.kind === 'shop';
        const previewing = previewId === c.id;
        let action = '';
        if (equipped) action = `<button class="btn" disabled>✓ Equipped</button>`;
        else if (owned) action = `<button class="btn primary" data-action="equip" data-id="${c.id}">Equip</button>`;
        else if (shop) action = `<button class="btn" data-action="preview" data-id="${c.id}">${previewing ? 'Previewing' : 'Preview'}</button><button class="btn" disabled title="Payments are not available in this build">${esc((c.source as { price: string }).price)}</button>`;
        else action = `<button class="btn" data-action="preview" data-id="${c.id}">${previewing ? 'Previewing' : 'Preview'}</button>`;
        return `<div class="card cos-item ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}">
          ${this.swatch(c)}
          <div class="cos-info"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small>${owned ? '' : `<small class="src">${esc(this.sourceText(c))}</small>`}</div>
          <div class="cos-actions">${action}</div>
        </div>`;
      }).join('')}</div>
      <div class="store-note"><b>Cosmetic Shop</b><p>Store purchases are disabled in this build — no payment system is connected and nothing is ever charged. Shop items can be previewed on the reactor behind this screen. Everything else is earned by playing.</p></div>`;
    this.render(this.panel('Cosmetics', body), {
      back: () => {
        this.ctl.previewOverride = {};
        this.refreshVisuals();
        this.showMenu();
      },
      tab: (el) => {
        this.cosmeticTab = el.dataset.slot as CosmeticSlot;
        this.showCosmetics();
      },
      equip: (el) => {
        p.equip(el.dataset.id!);
        delete this.ctl.previewOverride[this.cosmeticTab];
        this.refreshVisuals();
        this.showCosmetics();
      },
      preview: (el) => {
        const id = el.dataset.id!;
        if (this.ctl.previewOverride[this.cosmeticTab] === id) delete this.ctl.previewOverride[this.cosmeticTab];
        else this.ctl.previewOverride[this.cosmeticTab] = id;
        this.refreshVisuals();
        this.showCosmetics();
      },
    }, 'overlay cosmetics-screen');
    this.overlayBack = () => this.actions.back?.(document.body);
  }

  refreshVisuals(): void {
    const over = this.ctl.previewOverride;
    const accent = over.accent ? COSMETIC_MAP[over.accent] : this.prof.equipped('accent');
    const bg = over.background ? COSMETIC_MAP[over.background] : this.prof.equipped('background');
    const a = accent.look.css ?? ['#36e2ff', '#0b8fb0'];
    const b = bg.look.css ?? ['#050816', '#0b1430'];
    const root = document.documentElement.style;
    root.setProperty('--accent', a[0]);
    root.setProperty('--accent-deep', a[1]);
    root.setProperty('--bg', b[0]);
    root.setProperty('--bg2', b[1]);
    this.ctl.scene?.applyVisuals();
  }

  // ── Achievements / stats ────────────────────────────────────────────────

  showAchievements(): void {
    const got = this.prof.profile.achievements;
    const n = Object.keys(got).length;
    const body = `<p class="lead">${n} of ${ACHIEVEMENTS.length} unlocked.</p><ul class="list ach">${ACHIEVEMENTS.map((a) => `
      <li class="${got[a.id] ? 'got' : 'locked'}"><span class="ach-icon">${esc(a.icon)}</span>
      <span><b>${esc(a.name)}</b><small>${esc(a.desc)}</small><small class="reward">${esc(this.rewardText(a.reward))}</small></span>
      <span class="ach-state">${got[a.id] ? '✓' : ''}</span></li>`).join('')}</ul>`;
    this.render(this.panel('Achievements', body), { back: () => this.showMenu() }, 'overlay');
    this.overlayBack = () => this.showMenu();
  }

  showStats(): void {
    const s = this.prof.profile.stats;
    const rows: [string, string][] = [
      ['Total runs', fmt(s.totalRuns)], ['Victories', fmt(s.victories)], ['Best stage reached', fmt(s.bestStage)],
      ['Highest score', fmt(s.highScore)], ['Total credits earned', fmt(s.totalCredits)], ['Total pegs hit', fmt(s.totalPegs)],
      ['Reactor nodes activated', fmt(s.totalReactors)], ['Bombs triggered', fmt(s.totalBombs)], ['Split orbs created', fmt(s.totalSplits)],
      ['Longest combo', fmt(s.longestCombo)], ['Best multiplier', `×${s.bestMult.toFixed(1)}`], ['Daily runs completed', fmt(s.dailyRuns)],
      ['Orbs fired', fmt(s.totalShots)], ['Time in runs', fmtTime(s.playSeconds)],
    ];
    const body = `<div class="stat-grid big">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>`;
    this.render(this.panel('Statistics', body), { back: () => this.showMenu() }, 'overlay');
    this.overlayBack = () => this.showMenu();
  }

  // ── Settings ────────────────────────────────────────────────────────────

  showSettings(back: () => void): void {
    const p = this.prof.profile;
    const s = p.settings;
    const toggle = (key: keyof typeof s, label: string, hint = '') =>
      `<label class="setting"><span><b>${esc(label)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</span>
       <input type="checkbox" data-key="${key}" ${s[key] ? 'checked' : ''}><i class="switch"></i></label>`;
    const slider = (key: 'sfxVolume' | 'musicVolume', label: string) =>
      `<label class="setting"><span><b>${esc(label)}</b></span><input type="range" min="0" max="1" step="0.05" data-key="${key}" value="${s[key]}"></label>`;
    const tracks = MUSIC_TRACKS.map((t) => {
      const ok = !t.unlock || this.prof.level(t.unlock) > 0;
      return `<option value="${t.id}" ${s.track === t.id ? 'selected' : ''} ${ok ? '' : 'disabled'}>${esc(t.name)}${ok ? '' : ' (locked)'}</option>`;
    }).join('');
    const titles = p.titles.map((t) => `<option ${p.activeTitle === t ? 'selected' : ''}>${esc(t)}</option>`).join('');
    const body = `
      <h4 class="section">Audio</h4>
      ${toggle('sfx', 'Sound effects')}${slider('sfxVolume', 'Effects volume')}
      ${toggle('music', 'Music')}${slider('musicVolume', 'Music volume')}
      <label class="setting"><span><b>Music track</b><small>Unlock more in the Reactor Lab</small></span><select data-key="track">${tracks}</select></label>
      <h4 class="section">Gameplay & visuals</h4>
      ${toggle('autoFast', 'Auto fast-forward', 'Long shots speed up after a few seconds')}
      ${toggle('numbers', 'Energy numbers', 'Floating +energy text on hits')}
      ${toggle('shake', 'Screen shake')}
      ${toggle('reducedFx', 'Reduced effects', 'Fewer particles and flashes; better for older phones')}
      <h4 class="section">Profile</h4>
      <label class="setting"><span><b>Title</b><small>Earned through achievements</small></span><select data-key="activeTitle">${titles}</select></label>
      <button class="btn danger" data-action="reset">Reset all progress</button>
      <p class="dim small">ORB REACTOR · cosmetic-only monetization · no ads · no energy timers.</p>`;
    this.render(this.panel('Settings', body), {
      back,
      reset: () => this.confirm('Reset all progress?', 'Credits, lab unlocks, cosmetics, stats and achievements will be erased. This cannot be undone.', 'Erase everything', () => {
        this.prof.reset();
        this.ctl.abandonSavedRunSilently();
        this.applySettings();
        this.refreshVisuals();
        this.toast('⟲', 'Progress reset');
        this.showMenu();
      }, () => undefined, true),
    }, 'overlay');
    this.overlayBack = back;
    this.screens.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-key]').forEach((input) => {
      input.addEventListener('change', () => this.updateSetting(input));
      if (input.type === 'range') input.addEventListener('input', () => this.updateSetting(input));
    });
  }

  private updateSetting(input: HTMLInputElement | HTMLSelectElement): void {
    const p = this.prof.profile;
    const key = input.dataset.key!;
    if (key === 'activeTitle') {
      p.activeTitle = input.value;
    } else {
      const s = p.settings as unknown as Record<string, unknown>;
      if (input instanceof HTMLInputElement && input.type === 'checkbox') s[key] = input.checked;
      else if (input instanceof HTMLInputElement && input.type === 'range') s[key] = Number(input.value);
      else s[key] = input.value;
    }
    this.prof.save();
    this.applySettings();
  }

  applySettings(): void {
    const s = this.prof.profile.settings;
    this.audio.configure(s);
    document.body.classList.toggle('reduced-fx', s.reducedFx);
    this.ctl.scene?.applyVisuals();
  }
}
