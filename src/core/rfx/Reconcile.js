// src/core/rfx/Reconcile.js

const OP_TIMEOUT_MS = 8000;
const EPS = 1e-4;

function isMockVm(norm) {
  const schema = String(norm?.snapshot?.schema || "");
  return schema.startsWith("mock_vm");
}

// ---------------------------
// Standardized reason strings
// ---------------------------
const REASONS = {
  OK: "ok",
  WAIT_SEQ: "waiting for seq advance",

  MISSING_INPUT: "missing INPUT track",

  // mismatch patterns
  ACTIVE_BUS_MISMATCH: (want, got) => `active bus mismatch: want ${want} got ${got}`,
  BUS_MODE_MISMATCH: (want, got) => `bus mode mismatch: want ${want} got ${got}`,

  // generic
  SUPERSEDED: "superseded by newer op (collapse)",
  TIMEOUT: (ms) => `timeout after ${ms}ms`,
};

// tiny helper: always return consistent verify objects
function v(ok, reason) {
  return {
    ok: !!ok,
    reason: String(reason || (ok ? REASONS.OK : "failed")),
  };
}

function canonicalTrackGuid(id) {
  const s = String(id || "");
  // FX_1_A -> FX_1A (also FX_12_B -> FX_12B)
  return s.replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

export function reconcilePending(prevState, norm) {
  const now = Date.now();

  const pendingOrder = prevState?.ops?.pendingOrder || [];
  const pendingById = prevState?.ops?.pendingById || {};
  const prevOverlay = prevState?.ops?.overlay || {
    bus: {},
    track: {},
    fx: {},
    fxOrderByTrackGuid: {},
  };

  const collapsed = computeCollapsedSet(pendingOrder, pendingById);

  const nextPendingById = { ...pendingById };
  const nextPendingOrder = [];
  let overlay = prevOverlay;

  const prevSeq = Number(prevState?.snapshot?.seq || 0);
  const nextSeq = Number(norm?.snapshot?.seq || 0);
  const seqAdvanced = nextSeq > prevSeq;

  // In general: checkedSeq is "the snapshot we're currently looking at"
  const checkedSeq = nextSeq || prevSeq || 0;

  for (const opId of pendingOrder) {
    const op = nextPendingById[opId];
    if (!op) continue;

    // collapse vol/pan bursts
    if (collapsed.has(opId)) {
      nextPendingById[opId] = {
        ...op,
        status: "superseded",
        verify: {
          ok: false,
          reason: REASONS.SUPERSEDED,
          checkedSeq,
        },
      };

      // ✅ IMPORTANT:
      // Do NOT clear overlay for superseded ops.
      // Overlay is keyed by trackGuid/busId, so clearing here would also wipe
      // the optimistic patch for the *newer* op that replaced it.
      continue;
    }

    if (op.status === "acked" || op.status === "failed" || op.status === "timeout") {
      continue;
    }

    // timeout only after "sent"
    if (op.status === "sent") {
      const sentAt = Number(op.sentAtMs || 0);
      if (sentAt && now - sentAt > OP_TIMEOUT_MS) {
        nextPendingById[opId] = {
          ...op,
          status: "timeout",
          error: `Timed out after ${OP_TIMEOUT_MS}ms`,
          verify: {
            ok: false,
            reason: REASONS.TIMEOUT(OP_TIMEOUT_MS),
            checkedSeq,
          },
        };
        overlay = clearOverlayForOp(overlay, op);
        continue;
      }
    }

    // ✅ Ensure verify is written on EVERY reconcile attempt for sent ops.
    if (op.status === "sent" && !seqAdvanced && prevSeq !== 0) {
      nextPendingById[opId] = {
        ...op,
        verify: {
          ok: false,
          reason: REASONS.WAIT_SEQ,
          checkedSeq: prevSeq,
        },
      };
      nextPendingOrder.push(opId);
      continue;
    }

    // For queued ops, we generally don't assert.
    if (op.status !== "sent") {
      nextPendingOrder.push(opId);
      continue;
    }

    // ✅ verify with reasons (seq advanced OR prevSeq==0 boot edge)
    const res = opVerifySnapshot(op, norm);

    nextPendingById[opId] = {
      ...op,
      verify: {
        ok: !!res.ok,
        reason: res.reason || (res.ok ? REASONS.OK : "unknown"),
        checkedSeq,
      },
    };

    if (res.ok) {
      nextPendingById[opId] = {
        ...nextPendingById[opId],
        status: "acked",
        ackSeq: nextSeq || prevSeq,
      };
      overlay = clearOverlayForOp(overlay, op);
      continue;
    }

    nextPendingOrder.push(opId);
  }

  return {
    nextOps: {
      pendingById: nextPendingById,
      pendingOrder: nextPendingOrder,
      overlay,
      lastError: prevState?.ops?.lastError || null,
    },
  };
}

/**
 * Returns { ok, reason } instead of boolean.
 * Reasons are standardized for CoreInspector readability.
 */
function opVerifySnapshot(op, norm) {
  const intent = op?.intent || {};
  const kind = intent.kind || intent.name || op.kind;

  const tracksByGuid = norm?.entities?.tracksByGuid || {};
  const fxByGuid = norm?.entities?.fxByGuid || {};
  const fxOrderByTrackGuid = norm?.entities?.fxOrderByTrackGuid || {};
  const routesById = norm?.entities?.routesById || {};

  switch (kind) {
    case "toggleRecArm": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");
      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = !!tr.recArm;
      const want = !!value;
      return got === want
        ? v(true, REASONS.OK)
        : v(false, `recArm mismatch: want ${want} got ${got}`);
    }

    case "toggleMute": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");
      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = !!tr.mute;
      const want = !!value;
      return got === want
        ? v(true, REASONS.OK)
        : v(false, `mute mismatch: want ${want} got ${got}`);
    }

    case "toggleSolo": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");
      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = Number(tr.solo || 0) !== 0;
      const want = !!value;
      return got === want
        ? v(true, REASONS.OK)
        : v(false, `solo mismatch: want ${want} got ${got}`);
    }

    case "setVol": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");
      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = Number(tr.vol);
      const want = Number(value);
      if (!Number.isFinite(got) || !Number.isFinite(want)) {
        return v(false, `vol non-finite: want ${value} got ${tr.vol}`);
      }
      return nearlyEqual(got, want, EPS)
        ? v(true, REASONS.OK)
        : v(false, `vol mismatch: want ≈${want} got ${got}`);
    }

    case "setPan": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");
      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = Number(tr.pan);
      const want = Number(value);
      if (!Number.isFinite(got) || !Number.isFinite(want)) {
        return v(false, `pan non-finite: want ${value} got ${tr.pan}`);
      }
      return nearlyEqual(got, want, EPS)
        ? v(true, REASONS.OK)
        : v(false, `pan mismatch: want ≈${want} got ${got}`);
    }

    // ---------------------------
    // ✅ Buffered / RFX-named continuous controls
    // For MOCK: verify against snapshot.trackMix / snapshot.busMix.
    // ---------------------------

    case "setTrackVolume": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");

      if (isMockVm(norm)) {
        const mix = norm?.snapshot?.trackMix || {};
        const tg = canonicalTrackGuid(trackGuid);
        const got = Number(mix[tg]?.vol);
        const want = Number(value);
        if (!Number.isFinite(got) || !Number.isFinite(want)) {
          return v(false, `mock track vol non-finite: want ${value} got ${got}`);
        }
        return nearlyEqual(got, want, EPS)
          ? v(true, REASONS.OK)
          : v(false, `mock track vol mismatch: want ≈${want} got ${got}`);
      }

      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = Number(tr.vol);
      const want = Number(value);
      if (!Number.isFinite(got) || !Number.isFinite(want)) {
        return v(false, `vol non-finite: want ${value} got ${tr.vol}`);
      }
      return nearlyEqual(got, want, EPS)
        ? v(true, REASONS.OK)
        : v(false, `vol mismatch: want ≈${want} got ${got}`);
    }

    case "setTrackPan": {
      const { trackGuid, value } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");

      if (isMockVm(norm)) {
        const mix = norm?.snapshot?.trackMix || {};
        const tg = canonicalTrackGuid(trackGuid);
        const got = Number(mix[tg]?.pan);
        const want = Number(value);
        if (!Number.isFinite(got) || !Number.isFinite(want)) {
          return v(false, `mock track pan non-finite: want ${value} got ${got}`);
        }
        return nearlyEqual(got, want, EPS)
          ? v(true, REASONS.OK)
          : v(false, `mock track pan mismatch: want ≈${want} got ${got}`);
      }

      const tr = tracksByGuid[trackGuid];
      if (!tr) return v(false, `track missing: ${trackGuid}`);
      const got = Number(tr.pan);
      const want = Number(value);
      if (!Number.isFinite(got) || !Number.isFinite(want)) {
        return v(false, `pan non-finite: want ${value} got ${tr.pan}`);
      }
      return nearlyEqual(got, want, EPS)
        ? v(true, REASONS.OK)
        : v(false, `pan mismatch: want ≈${want} got ${got}`);
    }

    case "setBusVolume": {
      const { busId, value } = intent;
      if (!busId) return v(false, "missing busId");

      if (isMockVm(norm)) {
        const got = Number(norm?.snapshot?.busMix?.[busId]?.vol);
        const want = Number(value);
        if (!Number.isFinite(got) || !Number.isFinite(want)) {
          return v(false, `mock bus vol non-finite: want ${value} got ${got}`);
        }
        return nearlyEqual(got, want, EPS)
          ? v(true, REASONS.OK)
          : v(false, `mock bus vol mismatch: want ≈${want} got ${got}`);
      }

      return v(false, "setBusVolume verifier not wired for real VM yet");
    }

    // ---------------------------
    // ✅ FX verifiers (Option B)
    // ---------------------------

    case "addFx": {
      const { trackGuid, fxGuid } = intent || {};
      const tg = canonicalTrackGuid(trackGuid);
      if (!tg) return v(false, "missing trackGuid");
      if (!fxGuid) return v(false, "missing fxGuid");

      const fx = fxByGuid[fxGuid];
      if (!fx) return v(false, `fx missing: ${fxGuid}`);

      const order = fxOrderByTrackGuid[tg] || [];
      const inOrder = order.includes(fxGuid);
      const trackOk = canonicalTrackGuid(fx.trackGuid) === tg;

      return inOrder && trackOk ? v(true, REASONS.OK) : v(false, "addFx not reflected in truth");
    }

    case "removeFx": {
      const { fxGuid } = intent || {};
      if (!fxGuid) return v(false, "missing fxGuid");

      const fx = fxByGuid[fxGuid];
      if (fx) return v(false, "removeFx not reflected in truth (fx still present)");

      // If it's gone from fxByGuid, that's enough for now.
      return v(true, REASONS.OK);
    }

    case "toggleFx": {
      const { fxGuid, value } = intent;
      if (!fxGuid) return v(false, "missing fxGuid");
      const fx = fxByGuid[fxGuid];
      if (!fx) return v(false, `fx missing: ${fxGuid}`);
      const got = !!fx.enabled;
      const want = !!value;
      return got === want
        ? v(true, REASONS.OK)
        : v(false, `fx enabled mismatch: want ${want} got ${got}`);
    }

    case "reorderFx": {
      const { trackGuid, fromIndex, toIndex } = intent;
      if (!trackGuid) return v(false, "missing trackGuid");

      const tg = canonicalTrackGuid(trackGuid);

      const expected = expectedFxOrderFromIntentOrOptimistic(
        op,
        fxOrderByTrackGuid,
        tg,
        fromIndex,
        toIndex
      );
      if (!expected) return v(false, "fx order: could not compute expected order");

      const actual = fxOrderByTrackGuid[tg] || [];
      return arrayEqual(actual, expected)
        ? v(true, REASONS.OK)
        : v(false, "fx order mismatch");
    }

    // ✅ setRoutingMode verified by lane recArm (real) or perf map (mock)
    case "setRoutingMode": {
      const { busId, mode } = intent || {};
      if (!busId) return v(false, "missing busId");
      const want = normalizeMode(mode);

      if (isMockVm(norm)) {
        const got = normalizeMode(
          norm?.perf?.busModesById?.[busId] ??
          norm?.perf?.routingModesById?.[busId] ??
          "linear"
        );
        return got === want
          ? v(true, REASONS.OK)
          : v(false, REASONS.BUS_MODE_MISMATCH(want, got));
      }

      const lanes = findLaneGuidsForBusByName(tracksByGuid, busId);

      const wantA = want === "linear" || want === "parallel" || want === "lcr";
      const wantB = want === "parallel" || want === "lcr";
      const wantC = want === "lcr";

      if (!lanes.A) return v(false, `missing lane track ${busId}A`);
      if (wantB && !lanes.B) return v(false, `missing lane track ${busId}B for mode=${want}`);
      if (wantC && !lanes.C) return v(false, `missing lane track ${busId}C for mode=${want}`);

      if (lanes.A) {
        const trA = tracksByGuid[lanes.A];
        if (!trA) return v(false, `lane A missing in snapshot (${busId}A)`);
        if (!!trA.recArm !== !!wantA)
          return v(false, `${busId}A recArm mismatch: want ${!!wantA} got ${!!trA.recArm}`);
      }
      if (lanes.B) {
        const trB = tracksByGuid[lanes.B];
        if (!trB) return v(false, `lane B missing in snapshot (${busId}B)`);
        if (!!trB.recArm !== !!wantB)
          return v(false, `${busId}B recArm mismatch: want ${!!wantB} got ${!!trB.recArm}`);
      }
      if (lanes.C) {
        const trC = tracksByGuid[lanes.C];
        if (!trC) return v(false, `lane C missing in snapshot (${busId}C)`);
        if (!!trC.recArm !== !!wantC)
          return v(false, `${busId}C recArm mismatch: want ${!!wantC} got ${!!trC.recArm}`);
      }

      return v(true, REASONS.OK);
    }

    // ✅ selectActiveBus verified by:
    //  1) session/perf activeBusId equals requested busId (mock)
    //  2) session.activeBusId equals requested busId AND INPUT sends match armed lanes (real)
    case "selectActiveBus": {
      const { busId } = intent || {};
      if (!busId) return v(false, "missing busId");

      if (isMockVm(norm)) {
        const got = String(norm?.session?.activeBusId || norm?.perf?.activeBusId || "");
        return got === busId
          ? v(true, REASONS.OK)
          : v(false, REASONS.ACTIVE_BUS_MISMATCH(busId, got));
      }

      const gotActive = String(norm?.session?.activeBusId || "");
      if (gotActive !== busId) return v(false, REASONS.ACTIVE_BUS_MISMATCH(busId, gotActive));

      let inputGuid = null;
      try {
        inputGuid = mustFindInputTrackGuidByName(tracksByGuid);
      } catch {
        return v(false, REASONS.MISSING_INPUT);
      }

      const armedLaneGuids = armedLaneGuidsForBus(tracksByGuid, busId);
      const actualDestGuids = collectInputSendDestGuids(routesById, inputGuid);

      if (armedLaneGuids.length === 0) return v(false, "no armed lanes for selected bus");
      return setEqual(actualDestGuids, armedLaneGuids)
        ? v(true, REASONS.OK)
        : v(
          false,
          `INPUT sends mismatch: want ${armedLaneGuids.length} got ${actualDestGuids.length}`
        );
    }

    case "syncView":
      return v(true, "syncView (no state assertion)");

    default:
      return v(false, `no verifier implemented for op kind="${kind}"`);
  }
}

function armedLaneGuidsForBus(tracksByGuid, busId) {
  const lanes = findLaneGuidsForBusByName(tracksByGuid, busId);
  const out = [];
  if (lanes.A && tracksByGuid[lanes.A]?.recArm) out.push(lanes.A);
  if (lanes.B && tracksByGuid[lanes.B]?.recArm) out.push(lanes.B);
  if (lanes.C && tracksByGuid[lanes.C]?.recArm) out.push(lanes.C);
  return out;
}

function collectInputSendDestGuids(routesById, inputGuid) {
  const out = [];
  for (const id of Object.keys(routesById || {})) {
    const e = routesById[id];
    if (!e) continue;
    if (e.category !== "send") continue;
    if (String(e.trackGuid || "") !== String(inputGuid)) continue;
    const dest = String(e.destTrackGuid || "");
    if (dest) out.push(dest);
  }
  return out;
}

function expectedFxOrderFromIntentOrOptimistic(
  op,
  fxOrderByTrackGuid,
  trackGuid,
  fromIndex,
  toIndex
) {
  const tg = canonicalTrackGuid(trackGuid);

  const optimistic = op?.optimistic;
  const maybe = optimistic?.fxOrderByTrackGuid?.[tg];
  if (Array.isArray(maybe)) return maybe;

  const base = fxOrderByTrackGuid?.[tg];
  if (!Array.isArray(base)) return null;

  const order = base.slice();
  if (
    fromIndex == null ||
    toIndex == null ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= order.length ||
    toIndex >= order.length
  ) {
    return null;
  }

  const [moved] = order.splice(fromIndex, 1);
  order.splice(toIndex, 0, moved);
  return order;
}

function computeCollapsedSet(pendingOrder, pendingById) {
  const collapsed = new Set();
  const lastVol = new Map();
  const lastPan = new Map();
  const lastBusVol = new Map();

  for (const opId of pendingOrder) {
    const op = pendingById[opId];
    if (!op) continue;

    const intent = op.intent || {};
    const kind = intent.kind || intent.name || op.kind;

    if (kind === "setVol") {
      const k = intent.trackGuid;
      if (!k) continue;
      if (lastVol.has(k)) collapsed.add(lastVol.get(k));
      lastVol.set(k, opId);
    }

    if (kind === "setPan") {
      const k = intent.trackGuid;
      if (!k) continue;
      if (lastPan.has(k)) collapsed.add(lastPan.get(k));
      lastPan.set(k, opId);
    }

    if (kind === "setTrackVolume") {
      const k = canonicalTrackGuid(intent.trackGuid);
      if (!k) continue;
      if (lastVol.has(k)) collapsed.add(lastVol.get(k));
      lastVol.set(k, opId);
    }

    if (kind === "setTrackPan") {
      const k = canonicalTrackGuid(intent.trackGuid);
      if (!k) continue;
      if (lastPan.has(k)) collapsed.add(lastPan.get(k));
      lastPan.set(k, opId);
    }

    if (kind === "setBusVolume") {
      const k = canonicalTrackGuid(intent.trackGuid);
      if (!k) continue;
      if (lastBusVol.has(k)) collapsed.add(lastBusVol.get(k));
      lastBusVol.set(k, opId);
    }
  }

  return collapsed;
}

function clearOverlayForOp(overlay, op) {
  const optimistic = op?.optimistic;
  if (!optimistic) return overlay;

  const next = {
    bus: { ...(overlay.bus || {}) },
    track: { ...(overlay.track || {}) },
    fx: { ...(overlay.fx || {}) },
    fxOrderByTrackGuid: { ...(overlay.fxOrderByTrackGuid || {}) },
  };
  if (optimistic.bus) {
    for (const id of Object.keys(optimistic.bus)) delete next.bus[id];
  }
  if (optimistic.track) {
    for (const guid of Object.keys(optimistic.track)) delete next.track[guid];
  }
  if (optimistic.fx) {
    for (const guid of Object.keys(optimistic.fx)) delete next.fx[guid];
  }
  if (optimistic.fxOrderByTrackGuid) {
    for (const trackGuid of Object.keys(optimistic.fxOrderByTrackGuid)) {
      delete next.fxOrderByTrackGuid[trackGuid];
    }
  }

  return next;
}

function nearlyEqual(a, b, eps) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

function arrayEqual(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function mustFindInputTrackGuidByName(tracksByGuid) {
  for (const guid of Object.keys(tracksByGuid || {})) {
    const tr = tracksByGuid[guid];
    if (String(tr?.name || "") === "INPUT") return guid;
  }
  throw new Error(REASONS.MISSING_INPUT);
}

function findLaneGuidsForBusByName(tracksByGuid, busId) {
  const wantA = `${busId}A`;
  const wantB = `${busId}B`;
  const wantC = `${busId}C`;

  const out = { A: null, B: null, C: null };

  for (const guid of Object.keys(tracksByGuid || {})) {
    const tr = tracksByGuid[guid];
    const name = String(tr?.name || "");
    if (name === wantA) out.A = guid;
    else if (name === wantB) out.B = guid;
    else if (name === wantC) out.C = guid;
  }

  return out;
}

function setEqual(aList, bList) {
  const a = new Set((aList || []).filter(Boolean));
  const b = new Set((bList || []).filter(Boolean));
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}