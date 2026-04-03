import { clamp01 } from "../DomainHelpers";
const EPSILON = 0.001;

function nowMs() {
  return Date.now();
}


function ensureSlice(slice) {
  if (slice && typeof slice === "object" && slice.byKey && typeof slice.byKey === "object") {
    return slice;
  }
  return createContinuousOverlayState();
}

export function makeBusVolumeKey(busId) {
  return `busVol:${String(busId || "")}`;
}

export function makeTrackVolumeKey(trackGuid) {
  return `trackVol:${String(trackGuid || "")}`;
}

export function makeTrackPanKey(trackGuid) {
  return `trackPan:${String(trackGuid || "")}`;
}

export function createContinuousOverlayState() {
  return {
    byKey: {},
  };
}

export function getContinuousEntry(continuous, key) {
  return continuous?.byKey?.[key] || null;
}

export function getOverlayValue(continuous, key) {
  const entry = getContinuousEntry(continuous, key);
  return entry ? entry.value01 : null;
}

export function hasContinuousOverlay(continuous, key) {
  return !!getContinuousEntry(continuous, key);
}

export function beginContinuousOverlay(continuous, key, gestureId, value01) {
  const slice = ensureSlice(continuous);

  return {
    ...slice,
    byKey: {
      ...slice.byKey,
      [key]: {
        key,
        gestureId: String(gestureId || ""),
        value01: clamp01(value01),
        pendingCommit: false,
        updatedAt: nowMs(),
      },
    },
  };
}

export function updateContinuousOverlay(continuous, key, gestureId, value01) {
  const slice = ensureSlice(continuous);
  const prev = slice.byKey[key];

  if (!prev) {
    return beginContinuousOverlay(slice, key, gestureId, value01);
  }

  // Ignore stale gesture updates for a replaced gesture.
  if (prev.gestureId && gestureId && prev.gestureId !== gestureId) {
    return slice;
  }

  return {
    ...slice,
    byKey: {
      ...slice.byKey,
      [key]: {
        ...prev,
        value01: clamp01(value01),
        updatedAt: nowMs(),
      },
    },
  };
}

export function markContinuousOverlayPending(continuous, key, gestureId, value01) {
  const slice = ensureSlice(continuous);

  return {
    ...slice,
    byKey: {
      ...slice.byKey,
      [key]: {
        key,
        gestureId: String(gestureId || ""),
        value01: clamp01(value01),
        pendingCommit: true,
        updatedAt: nowMs(),
      },
    },
  };
}

export function clearContinuousOverlay(continuous, key, gestureId = null) {
  const slice = ensureSlice(continuous);
  const prev = slice.byKey[key];
  if (!prev) return slice;

  if (gestureId && prev.gestureId && prev.gestureId !== gestureId) {
    return slice;
  }

  const nextByKey = { ...slice.byKey };
  delete nextByKey[key];

  return {
    ...slice,
    byKey: nextByKey,
  };
}

export function clearAllContinuousOverlays(continuous) {
  const slice = ensureSlice(continuous);
  if (!Object.keys(slice.byKey || {}).length) return slice;

  return {
    ...slice,
    byKey: {},
  };
}

export function getRenderedValue(continuous, key, truthValue01) {
  const entry = getContinuousEntry(continuous, key);
  if (entry) return entry.value01;
  return clamp01(truthValue01);
}

export function shouldSettleOverlay(entry, truthValue01, epsilon = EPSILON) {
  if (!entry || !entry.pendingCommit) return false;
  if (!Number.isFinite(truthValue01)) return false;
  return Math.abs(clamp01(truthValue01) - clamp01(entry.value01)) <= epsilon;
}

export function settleContinuousOverlays(continuous, resolver, epsilon = EPSILON) {
  const slice = ensureSlice(continuous);
  const byKey = slice.byKey || {};
  let changed = false;
  const nextByKey = { ...byKey };

  for (const [key, entry] of Object.entries(byKey)) {
    if (!entry?.pendingCommit) continue;

    const truthValue01 = resolver(key);
    if (!Number.isFinite(truthValue01)) continue;

    if (Math.abs(clamp01(truthValue01) - clamp01(entry.value01)) <= epsilon) {
      delete nextByKey[key];
      changed = true;
    }
  }

  if (!changed) return slice;

  return {
    ...slice,
    byKey: nextByKey,
  };
}