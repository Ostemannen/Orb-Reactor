import Phaser from 'phaser';
import './styles.css';
import { BOARD } from './game/config/balance';
import { BoardScene } from './game/scenes/BoardScene';
import { AudioSystem } from './game/systems/AudioSystem';
import { RunController } from './game/systems/RunController';
import { ProfileService } from './state/ProfileService';
import { UI } from './game/ui/UI';

function boot(): void {
  const audio = new AudioSystem();
  const profile = new ProfileService();
  const controller = new RunController(audio, profile);
  const ui = new UI(controller, profile, audio);
  controller.ui = ui;
  ui.applySettings();

  // Render the chamber at device resolution (capped) for crisp neon on phones.
  const fit = Math.min(window.innerWidth / BOARD.width, window.innerHeight / BOARD.height);
  const zoom = Math.max(1, Math.min(2, Math.round((window.devicePixelRatio || 1) * fit * 4) / 4));

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game-root',
    width: BOARD.width * zoom,
    height: BOARD.height * zoom,
    transparent: true,
    banner: false,
    disableContextMenu: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, powerPreference: 'high-performance' },
    input: { activePointers: 2 },
    fps: { target: 60 },
    scene: [BoardScene],
    callbacks: {
      preBoot: (g) => {
        g.registry.set('host', controller);
        g.registry.set('zoom', zoom);
      },
    },
  });

  ui.setResizeHook(() => requestAnimationFrame(() => {
    game.scale.getParentBounds();
    game.scale.refresh();
  }));

  game.events.once(Phaser.Core.Events.READY, () => {
    const scene = game.scene.getScene('board') as BoardScene;
    controller.attachScene(scene);
    scene.startAttract();
    ui.showMenu();
    document.getElementById('boot')?.classList.add('done');
    setTimeout(() => document.getElementById('boot')?.remove(), 600);
  });

  // Keep the page from scrolling / zooming while playing on touch devices.
  document.addEventListener('touchmove', (e) => {
    const t = e.target as HTMLElement;
    if (!t.closest('.scroll')) e.preventDefault();
  }, { passive: false });
  document.addEventListener('gesturestart', (e) => e.preventDefault());

  // Expose for debugging in development builds only.
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).orb = { controller, profile, game };
}

boot();
