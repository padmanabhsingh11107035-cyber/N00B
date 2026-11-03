import { Lane } from '../types';

export interface InputTarget {
  moveLeft: () => void;
  moveRight: () => void;
  jump: () => void;
  slide: () => void;
  pauseGame?: () => void;
  resumeGame?: () => void;
  cycleWeather?: () => void;
  getGameState: () => string;
}

/**
 * InputHandler handles all keyboard and swipe/drag inputs for the Subway Surfers game engine.
 * Ensures intuitive and consistent lateral movement:
 * - 'A' and 'ArrowLeft' map directly to the LEFT lane (decrementing lane index towards -1)
 * - 'D' and 'Right Arrow' map directly to the RIGHT lane (incrementing lane index towards +1)
 * - 'W', 'ArrowUp', and Space map to JUMP
 * - 'S' and 'ArrowDown' map to SLIDE
 */
export class InputHandler {
  private target: InputTarget;
  private isListening = false;
  private keydownListener: (e: KeyboardEvent) => void;

  constructor(target: InputTarget) {
    this.target = target;
    this.keydownListener = this.handleKeyDown.bind(this);
  }

  public attach() {
    if (this.isListening) return;
    window.addEventListener('keydown', this.keydownListener, { passive: false });
    this.isListening = true;
  }

  public detach() {
    if (!this.isListening) return;
    window.removeEventListener('keydown', this.keydownListener);
    this.isListening = false;
  }

  public handleKeyDown(e: KeyboardEvent) {
    // Only capture keys if not typing in an input or textarea
    if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

    switch (e.key) {
      // Left lane steer: 'A' or 'ArrowLeft' maps strictly to the LEFT lane
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        this.target.moveLeft();
        break;

      // Right lane steer: 'D' or 'ArrowRight' maps strictly to the RIGHT lane
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        this.target.moveRight();
        break;

      // Jump: 'W', 'ArrowUp', or Spacebar
      case 'ArrowUp':
      case 'w':
      case 'W':
      case ' ':
        e.preventDefault();
        this.target.jump();
        break;

      // Slide / Crouch dive: 'S' or 'ArrowDown'
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        this.target.slide();
        break;

      case 'Escape':
      case 'p':
      case 'P':
        e.preventDefault();
        if (this.target.getGameState() === 'playing') {
          this.target.pauseGame?.();
        } else if (this.target.getGameState() === 'paused') {
          this.target.resumeGame?.();
        }
        break;

      case 't':
      case 'T':
        // Atmospheric weather toggle shortcut
        e.preventDefault();
        this.target.cycleWeather?.();
        break;
    }
  }
}
