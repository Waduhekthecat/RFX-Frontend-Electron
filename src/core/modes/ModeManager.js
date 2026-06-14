import { RFX_MODES } from "./modes";

export class ModeManager {
  constructor() {
    this.currentMode = RFX_MODES.PERFORM;
    this.subscribers = new Set();
  }

  getMode() {
    return this.currentMode;
  }

  setMode(nextMode) {
    if (!Object.values(RFX_MODES).includes(nextMode)) {
      console.warn("Invalid RFX mode:", nextMode);
      return;
    }

    if (this.currentMode === nextMode) return;

    const previousMode = this.currentMode;
    this.currentMode = nextMode;

    this.notify({
      previousMode,
      currentMode: nextMode,
    });
  }

  toggleMode(mode) {
    if (this.currentMode === mode) {
      this.setMode(RFX_MODES.PERFORM);
    } else {
      this.setMode(mode);
    }
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify(event) {
    for (const callback of this.subscribers) {
      callback(event);
    }
  }
}