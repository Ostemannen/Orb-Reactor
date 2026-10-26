import Phaser from 'phaser';
import { PEG_DEFS, PEG_ORDER } from '../../data/pegs';
import type { PegType } from '../entities/types';

/** Textures are drawn at 2× and displayed at 0.5 scale for crisp edges on high-DPI screens. */
export const TEX = 2;

const css = (c: number, a = 1) => `rgba(${(c >> 16) & 255},${(c >> 8) & 255},${c & 255},${a})`;

function lighten(c: number, k: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r + (255 - r) * k) << 16) | (Math.round(g + (255 - g) * k) << 8) | Math.round(b + (255 - b) * k);
}

function darken(c: number, k: number): number {
  const r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
  return (Math.round(r * (1 - k)) << 16) | (Math.round(g * (1 - k)) << 8) | Math.round(b * (1 - k));
}

function canvasTex(scene: Phaser.Scene, key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  draw(ctx);
  tex.refresh();
}

export function pegTextureKey(type: PegType, variant = ''): string {
  return `peg_${type}${variant}`;
}

export function createTextures(scene: Phaser.Scene): void {
  // Soft glow
  canvasTex(scene, 'glow', 128, 128, (ctx) => {
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
  canvasTex(scene, 'spark', 24, 24, (ctx) => {
    const g = ctx.createRadialGradient(12, 12, 0, 12, 12, 12);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.8)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 24, 24);
  });
  canvasTex(scene, 'shard', 16, 28, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(16, 14);
    ctx.lineTo(8, 28);
    ctx.lineTo(0, 14);
    ctx.closePath();
    ctx.fill();
  });
  canvasTex(scene, 'ring', 256, 256, (ctx) => {
    ctx.strokeStyle = 'rgba(255,255,255,1)';
    ctx.lineWidth = 10;
    ctx.shadowColor = 'white';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(128, 128, 112, 0, Math.PI * 2);
    ctx.stroke();
  });
  canvasTex(scene, 'disc', 64, 64, (ctx) => {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
  });
  // Orb core: bright centre with a subtle edge so tinting reads as glass.
  canvasTex(scene, 'orb', 64, 64, (ctx) => {
    const g = ctx.createRadialGradient(24, 22, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(235,240,255,1)');
    g.addColorStop(1, 'rgba(170,185,215,1)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
  });
  canvasTex(scene, 'orb_ring', 64, 64, (ctx) => {
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(32, 32, 28, 0, Math.PI * 2);
    ctx.stroke();
  });

  for (const type of PEG_ORDER) drawPeg(scene, type, '');
  drawPeg(scene, 'shield', '_cracked');
  drawLauncher(scene);
}

function drawPeg(scene: Phaser.Scene, type: PegType, variant: string): void {
  const def = PEG_DEFS[type];
  const r = def.radius * TEX;
  const pad = 6;
  const size = Math.ceil(r * 2 + pad * 2);
  const c = size / 2;
  const col = def.color;
  canvasTex(scene, pegTextureKey(type, variant), size, size, (ctx) => {
    ctx.save();
    if (type === 'booster') {
      ctx.lineWidth = r * 0.34;
      ctx.strokeStyle = css(col);
      ctx.beginPath();
      ctx.arc(c, c, r * 0.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = css(lighten(col, 0.7));
      ctx.beginPath();
      ctx.arc(c, c, r * 0.97, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = css(lighten(col, 0.5));
      ctx.beginPath();
      ctx.arc(c, c, r * 0.28, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'portal') {
      for (let i = 0; i < 4; i++) {
        ctx.strokeStyle = css(lighten(col, i * 0.18), 1 - i * 0.18);
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(c, c, r * (1 - i * 0.22), i * 0.9, i * 0.9 + Math.PI * 1.4);
        ctx.stroke();
      }
      const g = ctx.createRadialGradient(c, c, 0, c, c, r * 0.6);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, css(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'reactor') {
      const g = ctx.createRadialGradient(c, c, 0, c, c, r);
      g.addColorStop(0, css(lighten(col, 0.85)));
      g.addColorStop(0.35, css(col));
      g.addColorStop(0.7, css(darken(col, 0.55)));
      g.addColorStop(1, css(darken(col, 0.75)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css(lighten(col, 0.6));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(c, c, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c, c, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === 'shield') {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const g = ctx.createLinearGradient(0, c - r, 0, c + r);
      g.addColorStop(0, css(lighten(col, 0.6)));
      g.addColorStop(1, css(darken(col, 0.35)));
      ctx.fillStyle = g;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.stroke();
      if (variant === '_cracked') {
        ctx.strokeStyle = 'rgba(20,30,60,0.95)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(c - r * 0.6, c - r * 0.5);
        ctx.lineTo(c - r * 0.1, c - r * 0.05);
        ctx.lineTo(c - r * 0.3, c + r * 0.35);
        ctx.lineTo(c + r * 0.15, c + r * 0.7);
        ctx.moveTo(c - r * 0.1, c - r * 0.05);
        ctx.lineTo(c + r * 0.55, c - r * 0.3);
        ctx.stroke();
      }
    } else {
      const g = ctx.createRadialGradient(c - r * 0.3, c - r * 0.35, r * 0.1, c, c, r);
      g.addColorStop(0, css(lighten(col, 0.75)));
      g.addColorStop(0.5, css(col));
      g.addColorStop(1, css(darken(col, 0.35)));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(c, c, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = css(lighten(col, 0.65));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c, c, r - 1, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (def.glyph && type !== 'reactor' && type !== 'shield') {
      ctx.fillStyle = 'rgba(8,14,34,0.88)';
      ctx.font = `bold ${Math.round(r * 1.25)}px "Segoe UI Symbol", "Noto Sans Symbols 2", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.glyph, c, c + r * 0.06);
    }
    ctx.restore();
  });
}

function drawLauncher(scene: Phaser.Scene): void {
  canvasTex(scene, 'launcher_base', 140, 140, (ctx) => {
    const g = ctx.createRadialGradient(70, 60, 6, 70, 70, 66);
    g.addColorStop(0, '#2a3f73');
    g.addColorStop(0.7, '#101b3a');
    g.addColorStop(1, '#070d20');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(70, 70, 64, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#5fd8ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(70, 70, 62, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(95,216,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(70, 70, 46, 0, Math.PI * 2);
    ctx.stroke();
  });
  canvasTex(scene, 'launcher_barrel', 44, 110, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 44, 0);
    g.addColorStop(0, '#1b2b55');
    g.addColorStop(0.5, '#4d6fb8');
    g.addColorStop(1, '#1b2b55');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.roundRect(4, 0, 36, 110, 10);
    ctx.fill();
    ctx.strokeStyle = '#7fe6ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#7fe6ff';
    ctx.fillRect(10, 86, 24, 6);
  });
}
