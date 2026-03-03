// Single source of truth for gesture tuning across the app.
// Hooks import defaults from here, but callers can override per-use.

export const gestureParams = {
  doubleTap: {
    thresholdMs: 280,  // max time between taps
    maxDeltaPx: 12,    // max distance between taps
  },

  drag: {
    thresholdPx: 6,            // tap vs drag threshold
    capturePointer: true,      // keep drag events even if pointer leaves element
    preventDefaultOnDrag: true // stop scroll/text selection during drag
  },

  longPress: {
    ms: 450,             // hold time to trigger
    moveThresholdPx: 8,  // cancel if moved more than this
    capturePointer: true,
  },
};

// Tiny helper for overrides (shallow merge)
export function withGestureDefaults(kind, override) {
  return { ...(gestureParams[kind] || {}), ...(override || {}) };
}