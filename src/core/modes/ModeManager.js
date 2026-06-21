import { MODE_INTENT_BY_MODE, RFX_MODES } from "./Modes.js";

export class ModeManager {
  constructor({ dispatchIntent } = {}) {
    this.currentMode = RFX_MODES.PERFORM;
    this.subscribers = new Set();
    this.dispatchIntent =
      typeof dispatchIntent === "function" ? dispatchIntent : null;
  }

  getMode() {
    return this.currentMode;
  }

  setDispatchIntent(dispatchIntent) {
    this.dispatchIntent =
      typeof dispatchIntent === "function" ? dispatchIntent : null;
  }

  setMode(
    nextMode,
    { dispatchIfUnchanged = false, source = "unknown" } = {}
  ) {
    if (!Object.values(RFX_MODES).includes(nextMode)) {
      console.warn("Invalid RFX mode:", nextMode);
      return;
    }

    if (this.currentMode === nextMode) {
      if (dispatchIfUnchanged) {
        const intentName = MODE_INTENT_BY_MODE[nextMode];
        if (intentName && this.dispatchIntent) {
          console.log("[MODE → RFX INTENT]", {
            source,
            mode: nextMode,
            name: intentName,
          });
          void this.dispatchIntent({ name: intentName });
        }
      }
      return;
    }

    const previousMode = this.currentMode;
    this.currentMode = nextMode;

    const intentName = MODE_INTENT_BY_MODE[nextMode];
    if (intentName && this.dispatchIntent) {
      console.log("[MODE → RFX INTENT]", {
        source,
        previousMode,
        mode: nextMode,
        name: intentName,
      });
      void this.dispatchIntent({ name: intentName });
    }

    this.notify({
      previousMode,
      currentMode: nextMode,
      intentName: intentName || null,
    });
  }

  toggleMode(mode, options) {
    if (this.currentMode === mode) {
      this.setMode(RFX_MODES.PERFORM, options);
    } else {
      this.setMode(mode, options);
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

export const modeManager = new ModeManager();
