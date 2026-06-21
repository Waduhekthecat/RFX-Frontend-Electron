import {
  MODE_INTENT_BY_MODE,
  RFX_MODES,
  modeFromViewModel,
} from "./Modes.js";

export class ModeManager {
  constructor({ dispatchIntent } = {}) {
    this.currentMode = RFX_MODES.PERFORM;
    this.confirmedMode = null;
    this.lastViewModelSeq = 0;
    this.pendingMode = null;
    this.subscribers = new Set();
    this.dispatchIntent =
      typeof dispatchIntent === "function" ? dispatchIntent : null;
  }

  getMode() {
    return this.currentMode;
  }

  hasConfirmedMode() {
    return this.confirmedMode !== null;
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
      this.pendingMode = {
        mode: nextMode,
        afterSeq: this.lastViewModelSeq,
      };
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
      source,
      status: intentName ? "pending" : "local",
    });
  }

  resolveViewModelMode(rawMode, { seq = 0 } = {}) {
    const resolvedMode = modeFromViewModel(rawMode);
    if (!resolvedMode) {
      console.warn("[MODE ← RFX VM] Invalid mode:", rawMode);
      return false;
    }

    const viewModelSeq = Number(seq) || 0;
    const pending = this.pendingMode;

    if (
      pending &&
      viewModelSeq > 0 &&
      viewModelSeq <= pending.afterSeq
    ) {
      return false;
    }

    if (
      viewModelSeq > 0 &&
      this.lastViewModelSeq > 0 &&
      viewModelSeq < this.lastViewModelSeq
    ) {
      return false;
    }

    if (viewModelSeq > 0) {
      this.lastViewModelSeq = Math.max(this.lastViewModelSeq, viewModelSeq);
    }

    const previousMode = this.currentMode;
    const requestedMode = pending?.mode || null;
    const verified = requestedMode === null || requestedMode === resolvedMode;

    this.confirmedMode = resolvedMode;
    this.pendingMode = null;
    this.currentMode = resolvedMode;

    console.log("[MODE ← RFX VM]", {
      requestedMode,
      resolvedMode,
      verified,
      seq: viewModelSeq,
    });

    if (previousMode !== resolvedMode || requestedMode !== null) {
      this.notify({
        previousMode,
        currentMode: resolvedMode,
        requestedMode,
        intentName: null,
        source: "view-model",
        status: verified ? "verified" : "corrected",
        seq: viewModelSeq,
      });
    }

    return true;
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
