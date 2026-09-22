import './polyfills';
import './styles.css';
import { Game } from './game/Game';

const root = document.getElementById('app');
if (root) {
  try {
    const game = new Game(root);
    game.start();
    // handy for poking at the game from the dev console
    (window as unknown as { flyEscapeLab: Game }).flyEscapeLab = game;
  } catch (err) {
    console.error(err);
    const msg = document.createElement('p');
    msg.className = 'noscript';
    msg.textContent = `Sorry, the game could not start in this browser (${err instanceof Error ? err.message : String(err)}).`;
    root.appendChild(msg);
  }
}
