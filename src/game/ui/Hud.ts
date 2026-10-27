import type { HudState } from '../scenes/BoardScene';
import type { RunState } from '../../state/run';
import type { ObjectiveProgress } from '../systems/RunController';
import { MODIFIER_MAP } from '../../data/modifiers';
import { RULES } from '../config/balance';
import { $, esc, fmt } from './dom';

/** In-game heads-up display. Updates DOM only when values change. */
export class Hud {
  private last: Record<string, string> = {};
  private lastCombo = 0;
  private els: Record<string, HTMLElement>;
  practice = false;
  modifiers: string[] = [];

  constructor(root: HTMLElement, bottomRoot: HTMLElement) {
    root.innerHTML = `
      <div id="hud" class="hud hidden">
        <div class="hud-row">
          <div class="hud-stage"><span class="lbl" id="h-stage-lbl">STAGE</span><b id="h-stage">1</b><span class="dim" id="h-of">/10</span></div>
          <button class="mod-chips" id="h-mods" aria-label="Stage modifiers"></button>
          <div class="hud-stat"><span class="lbl">SCORE</span><b id="h-score">0</b></div>
          <div class="hud-stat credits"><span class="lbl">CREDITS</span><b id="h-credits">0</b></div>
          <button class="icon-btn" id="h-pause" aria-label="Pause">❚❚</button>
        </div>
        <div class="energy" id="h-energy-bar">
          <div class="energy-fill" id="h-fill"></div>
          <div class="energy-text"><b id="h-energy">0</b><span class="dim"> / </span><span id="h-target">100</span> <span class="bolt" id="h-bolt">⚡</span></div>
          <div class="energy-flag" id="h-flag">CHARGED</div>
        </div>
      </div>`;
    bottomRoot.innerHTML = `
      <div id="bottombar" class="bottombar hidden">
        <div class="combo" id="h-combo-wrap"><span class="lbl">COMBO</span><b id="h-combo">0</b><span class="mult" id="h-mult">×1.0</span></div>
        <div class="shots" id="h-shots" aria-label="Shots remaining"></div>
        <button class="icon-btn fast" id="h-fast" aria-label="Fast resolve">⏩</button>
        <button class="icon-btn" id="h-help" aria-label="Peg guide">?</button>
      </div>`;
    this.els = {};
    for (const id of ['h-stage', 'h-of', 'h-stage-lbl', 'h-mods', 'h-score', 'h-credits', 'h-fill', 'h-energy', 'h-target', 'h-bolt', 'h-flag', 'h-combo', 'h-mult', 'h-combo-wrap', 'h-shots', 'h-fast', 'h-energy-bar']) {
      this.els[id] = $(`#${id}`);
    }
  }

  private set(id: string, value: string, html = false): void {
    if (this.last[id] === value) return;
    this.last[id] = value;
    if (html) this.els[id].innerHTML = value;
    else this.els[id].textContent = value;
  }

  reset(): void {
    this.last = {};
    this.lastCombo = 0;
  }

  setStage(stage: number, endless: boolean, modifiers: string[]): void {
    this.modifiers = modifiers;
    if (this.practice) {
      this.set('h-stage-lbl', 'MODE');
      this.set('h-stage', 'PRACTICE');
      this.set('h-of', '');
    } else {
      this.set('h-stage-lbl', endless ? 'OVERDRIVE' : 'STAGE');
      this.set('h-stage', String(stage));
      this.set('h-of', endless ? '' : `/${RULES.runLength}`);
    }
    const chips = modifiers.map((id) => MODIFIER_MAP[id]).filter(Boolean)
      .map((m) => `<span class="mod-chip" title="${esc(m.name)}">${esc(m.icon)}<i>${esc(m.name)}</i></span>`).join('');
    this.set('h-mods', chips, true);
    this.els['h-mods'].classList.toggle('hidden', !modifiers.length);
  }

  /** Campaign level header. */
  setLevel(n: number, modifiers: string[]): void {
    this.setStage(n, true, modifiers);
    this.set('h-stage-lbl', 'LEVEL');
  }

  update(s: HudState, run: RunState | null, objective?: ObjectiveProgress): void {
    const score = (run?.score ?? 0) + s.score;
    const credits = (run?.credits ?? 0) + s.credits;
    this.set('h-score', fmt(score));
    this.set('h-credits', this.practice ? '—' : fmt(credits));
    const value = objective ? objective.value : s.energy;
    const target = objective ? objective.target : s.target;
    this.set('h-energy', fmt(Math.floor(value)));
    this.set('h-target', this.practice ? '∞' : `${fmt(target)}${objective && objective.label !== 'energy' ? ` ${objective.label}` : ''}`);
    this.set('h-bolt', objective ? objective.icon : '⚡');
    this.set('h-flag', objective ? 'GOAL MET' : 'CHARGED');
    const ratio = this.practice ? Math.min(1, s.energy / 2000) : Math.min(1, value / target);
    const w = `${(ratio * 100).toFixed(1)}%`;
    if (this.last.fill !== w) {
      this.last.fill = w;
      this.els['h-fill'].style.width = w;
    }
    const charged = !this.practice && value >= target;
    this.els['h-energy-bar'].classList.toggle('charged', charged);
    this.set('h-combo', String(s.combo));
    this.set('h-mult', `×${s.mult.toFixed(1)}`);
    if (s.combo > this.lastCombo) {
      const el = this.els['h-combo-wrap'];
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
    this.els['h-combo-wrap'].classList.toggle('hot', s.combo >= 10);
    this.lastCombo = s.combo;

    const pips = this.practice
      ? `<span class="shots-inf">∞ shots</span>`
      : Array.from({ length: s.shotsTotal }, (_, i) => {
          const live = i < s.shotsLeft;
          const flying = s.inShot && i === s.shotsLeft;
          return `<i class="pip${live ? ' live' : ''}${flying ? ' flying' : ''}${live && i === s.shotsLeft - 1 && s.canLaunch ? ' next' : ''}"></i>`;
        }).join('');
    this.set('h-shots', pips, true);
    this.els['h-fast'].classList.toggle('visible', s.inShot && s.shotTime > 1.2);
    this.els['h-fast'].classList.toggle('on', s.fast);
  }
}
