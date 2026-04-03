// ─── Numeric ────────────────────────────────────────────────────────────────

export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

export function clamp(n, a, b) {
  const v = Number(n);
  if (!Number.isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}

export function nearlyEqual(a, b, eps) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

// ─── Routing mode ───────────────────────────────────────────────────────────

/** @param {string|undefined} m @returns {"linear"|"parallel"|"lcr"} */
export function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

// ─── Track / bus ID canonicalization ────────────────────────────────────────

/**
 * Strips the underscore-lane separator so "FX_1_A" → "FX_1A".
 * Safe to call multiple times.
 */
export function canonicalTrackGuid(id) {
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

/**
 * Strips lane suffix from a bus-like ID: "FX_1A" → "FX_1", "INPUT" stays.
 */
export function normBusId(id) {
  const s = String(id || "").trim().toUpperCase();
  if (!s) return "";
  if (s === "INPUT") return "INPUT";
  const m = s.match(/^FX_(\d+)([ABC])?$/);
  if (!m) return s;
  return `FX_${m[1]}`;
}

// ─── Lane helpers ────────────────────────────────────────────────────────────

/** Returns the set of active lanes for a given routing mode. */
export function lanesForMode(mode) {
  const m = normalizeMode(mode);
  if (m === "lcr") return { A: true, B: true, C: true };
  if (m === "parallel") return { A: true, B: true, C: false };
  return { A: true, B: false, C: false };
}

/** Returns the ordered list of active lane letters for a given mode. */
export function availableLanes(mode) {
  const on = lanesForMode(mode);
  const out = [];
  if (on.A) out.push("A");
  if (on.B) out.push("B");
  if (on.C) out.push("C");
  return out;
}

/** Returns the preferred lane if valid for the mode, else the first available. */
export function nextValidLane(mode, preferred) {
  const lanes = availableLanes(mode);
  if (preferred && lanes.includes(preferred)) return preferred;
  return lanes[0] || "A";
}

// ─── Lane lookups ────────────────────────────────────────────────────────────

/** Find lane GUIDs (A/B/C) for a bus by matching track names. */
export function findLaneGuidsForBus(tracksByGuid, busId) {
  const wantA = `${busId}A`;
  const wantB = `${busId}B`;
  const wantC = `${busId}C`;
  const out = { A: null, B: null, C: null };

  for (const guid of Object.keys(tracksByGuid || {})) {
    const name = String(tracksByGuid[guid]?.name || "");
    if (name === wantA) out.A = guid;
    else if (name === wantB) out.B = guid;
    else if (name === wantC) out.C = guid;
  }

  return out;
}

// ─── Volume curve ────────────────────────────────────────────────────────────

const TRACK_VOL_POINTS = [
  { x: 0.0,   y: -150.0 },
  { x: 0.1,   y: -55.6  },
  { x: 0.2,   y: -35.6  },
  { x: 0.3,   y: -25.2  },
  { x: 0.4,   y: -17.2  },
  { x: 0.5,   y: -10.6  },
  { x: 0.6,   y: -5.72  },
  { x: 0.7,   y: -0.97  },
  { x: 0.716, y:  0.0   },
  { x: 0.8,   y:  3.70  },
  { x: 0.9,   y:  7.91  },
  { x: 1.0,   y: 12.0   },
];

export function trackVolNormToDb(norm01) {
  const x = clamp01(norm01);
  if (x <= TRACK_VOL_POINTS[0].x) return TRACK_VOL_POINTS[0].y;
  const last = TRACK_VOL_POINTS[TRACK_VOL_POINTS.length - 1];
  if (x >= last.x) return last.y;

  for (let i = 0; i < TRACK_VOL_POINTS.length - 1; i++) {
    const a = TRACK_VOL_POINTS[i];
    const b = TRACK_VOL_POINTS[i + 1];
    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x;
      if (span <= 0) return a.y;
      return a.y + (b.y - a.y) * ((x - a.x) / span);
    }
  }
  return 0;
}

export function formatVolDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return "-inf dB";
  if (n <= -149.5) return "-inf dB";
  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded) < 0.005) return "0.00 dB";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} dB`;
}

// ─── Gesture ID ───────────────────────────────────────────────────────────────

export function makeGestureId(prefix = "g") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}