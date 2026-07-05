import { create } from "zustand";
import { clamp01 } from "../DomainHelpers";
import { normalize } from "./Normalize";
import { buildOptimistic } from "./Optimistic";
import { reconcilePending } from "./Reconcile";
import { uid, nowMs } from "./Util";
import {
  createContinuousOverlayState,
  beginContinuousOverlay,
  updateContinuousOverlay,
  markContinuousOverlayPending,
  clearContinuousOverlay,
  makeTrackVolumeKey,
  makeTrackPanKey,
} from "./Continuous";

function asStr(x, fallback = "") {
  const s = x == null ? "" : String(x);
  return s || fallback;
}

function asNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

const LOOPER_TYPES = new Set(["pre-fx", "post-fx"]);
const LOOPER_STATUSES = new Set([
  "idle",
  "recording",
  "playing",
  "overdubbing",
  "stopped",
]);

export const DEFAULT_LOOPER_TYPE = "post-fx";

export const DEFAULT_LOOPER_STATE = Object.freeze({
  status: "idle",
  lengthMs: 0,
  recordCount: 0,
  loopLengthEnabled: false,
  loopLength: 4,
});

export const DEFAULT_SESSION_TEMPO_BPM = 120;
export const DEFAULT_SESSION_CLICK_ENABLED = false;
export const DEFAULT_SESSION_COUNT_IN_ENABLED = false;
export const DEFAULT_SESSION_BEATS_PER_MEASURE = 4;
export const DEFAULT_SESSION_NOTE_LENGTH = 4;

const LOOP_LENGTHS = new Set([2, 4, 8, 16, 32]);
const BEATS_PER_MEASURE_VALUES = new Set([2, 3, 4, 6, 7, 8, 16]);
const NOTE_LENGTH_VALUES = new Set([2, 4, 8, 16]);

function asLooperTypeValue(value, fallback = DEFAULT_LOOPER_TYPE) {
  const raw = asStr(value, "").toLowerCase();
  return LOOPER_TYPES.has(raw) ? raw : fallback;
}

function asLooperStatus(value, fallback = DEFAULT_LOOPER_STATE.status) {
  const raw = asStr(value, "").toLowerCase();
  return LOOPER_STATUSES.has(raw) ? raw : fallback;
}

function makeLooperState(value, fallback = DEFAULT_LOOPER_STATE) {
  const source =
    value?.looper && typeof value.looper === "object" && !Array.isArray(value.looper)
      ? value.looper
      : value && typeof value === "object" && !Array.isArray(value)
        ? value
        : {};

  return {
    status: asLooperStatus(source.status, fallback.status),
    lengthMs: Math.max(0, asNum(source.lengthMs, fallback.lengthMs)),
    recordCount: Math.max(0, Math.floor(asNum(source.recordCount, fallback.recordCount))),
    loopLengthEnabled:
      source.loopLengthEnabled == null
        ? fallback.loopLengthEnabled
        : !!source.loopLengthEnabled,
    loopLength: LOOP_LENGTHS.has(Number(source.loopLength))
      ? Number(source.loopLength)
      : fallback.loopLength,
  };
}

function makeLooperPatch(patch, fallback = DEFAULT_LOOPER_STATE) {
  const p = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  const next = {};

  if (Object.prototype.hasOwnProperty.call(p, "status")) {
    next.status = asLooperStatus(p.status, fallback.status);
  }
  if (Object.prototype.hasOwnProperty.call(p, "lengthMs")) {
    next.lengthMs = Math.max(0, asNum(p.lengthMs, fallback.lengthMs));
  }
  if (Object.prototype.hasOwnProperty.call(p, "recordCount")) {
    next.recordCount = Math.max(0, Math.floor(asNum(p.recordCount, fallback.recordCount)));
  }
  if (Object.prototype.hasOwnProperty.call(p, "loopLengthEnabled")) {
    next.loopLengthEnabled = !!p.loopLengthEnabled;
  }
  if (Object.prototype.hasOwnProperty.call(p, "loopLength")) {
    const loopLength = Number(p.loopLength);
    if (LOOP_LENGTHS.has(loopLength)) next.loopLength = loopLength;
  }

  return next;
}

const MAX_EVENT_LOG = 300;
const MAX_TARGETS_PER_KNOB = 3;
const MAX_AUTOMATABLE_PARAMETERS = 5;
const EMPTY_ARR = Object.freeze([]);
const SNAPSHOT_VERIFIED_MODE_OPS = new Set([
  "setPerformMode",
  "setEditMode",
  "setLooperMode",
  "setAutomationMode",
  "setTunerMode",
]);

function pushBounded(list, item, max = MAX_EVENT_LOG) {
  const next = [...(list || []), item];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

function summarizeTransitions(prevPendingById, nextPendingById, idsInOrder) {
  const out = {
    acked: [],
    timeout: [],
    failed: [],
    superseded: [],
    stillPending: 0,
  };

  for (const id of idsInOrder || []) {
    const a = prevPendingById?.[id];
    const b = nextPendingById?.[id];
    if (!a || !b) continue;

    const from = String(a.status || "");
    const to = String(b.status || "");

    if (from === to) {
      if (to === "queued" || to === "sent") out.stillPending += 1;
      continue;
    }

    const row = {
      id,
      kind: b.kind,
      from,
      to,
      error: b.error || null,
      ackSeq: b.ackSeq || null,
    };

    if (to === "acked") out.acked.push(row);
    else if (to === "timeout") out.timeout.push(row);
    else if (to === "failed") out.failed.push(row);
    else if (to === "superseded") out.superseded.push(row);
  }

  return out;
}

function mergeOverlay(base, patch) {
  if (!patch) return base;
  return {
    track: { ...(base.track || {}), ...(patch.track || {}) },
    bus: { ...(base.bus || {}), ...(patch.bus || {}) },
    perf: { ...(base.perf || {}), ...(patch.perf || {}) },
    session: { ...(base.session || {}), ...(patch.session || {}) },
    fx: { ...(base.fx || {}), ...(patch.fx || {}) },
    fxOrderByTrackGuid: {
      ...(base.fxOrderByTrackGuid || {}),
      ...(patch.fxOrderByTrackGuid || {}),
    },
    fxParamsByGuid: mergeFxParamsOverlay(
      base.fxParamsByGuid || {},
      patch.fxParamsByGuid || {}
    ),
  };
}

function clearOverlayPatch(base, patch) {
  if (!patch) return base;

  const next = {
    track: { ...(base.track || {}) },
    bus: { ...(base.bus || {}) },
    perf: { ...(base.perf || {}) },
    session: { ...(base.session || {}) },
    fx: { ...(base.fx || {}) },
    fxOrderByTrackGuid: { ...(base.fxOrderByTrackGuid || {}) },
    fxParamsByGuid: { ...(base.fxParamsByGuid || {}) },
  };

  if (patch.bus) {
    for (const id of Object.keys(patch.bus)) delete next.bus[id];
  }
  if (patch.track) {
    for (const guid of Object.keys(patch.track)) delete next.track[guid];
  }
  if (patch.perf) {
    for (const key of Object.keys(patch.perf)) delete next.perf[key];
  }
  if (patch.session) {
    for (const key of Object.keys(patch.session)) delete next.session[key];
  }
  if (patch.fx) {
    for (const guid of Object.keys(patch.fx)) delete next.fx[guid];
  }
  if (patch.fxOrderByTrackGuid) {
    for (const trackGuid of Object.keys(patch.fxOrderByTrackGuid)) {
      delete next.fxOrderByTrackGuid[trackGuid];
    }
  }
  if (patch.fxParamsByGuid) {
    for (const fxGuid of Object.keys(patch.fxParamsByGuid)) {
      const byIdx = patch.fxParamsByGuid[fxGuid] || {};
      const baseParams = next.fxParamsByGuid[fxGuid];
      if (!baseParams) continue;

      const copy = { ...(baseParams || {}) };
      for (const idx of Object.keys(byIdx)) delete copy[idx];

      if (Object.keys(copy).length === 0) delete next.fxParamsByGuid[fxGuid];
      else next.fxParamsByGuid[fxGuid] = copy;
    }
  }

  return next;
}

function mergeFxParamsOverlay(base, patch) {
  if (!patch || typeof patch !== "object") return base || {};

  const next = { ...(base || {}) };
  for (const fxGuid of Object.keys(patch)) {
    next[fxGuid] = {
      ...((base || {})[fxGuid] || {}),
      ...(patch[fxGuid] || {}),
    };
  }
  return next;
}

function coerceToTransportCall(intent) {
  if (!intent) return null;
  if (intent.name) return intent;
  if (intent.kind) return { ...intent, name: intent.kind };
  return null;
}

function mergeMetersById(prev, next) {
  if (!next || typeof next !== "object") return prev || {};
  return { ...(prev || {}), ...next };
}

function coerceMetersFrame(frame) {
  const f = frame || {};
  const metersById = f.metersById || f.metersByBusId || f.metersByBus || null;

  return {
    t: Number(f.t || Date.now()),
    activeBusId: f.activeBusId || null,
    metersById: metersById && typeof metersById === "object" ? metersById : null,
  };
}


function normalizeRange01(min01, max01, fallbackMin = 0, fallbackMax = 1) {
  const a = clamp01(min01 ?? fallbackMin);
  const b = clamp01(max01 ?? fallbackMax);
  return {
    min01: Math.min(a, b),
    max01: Math.max(a, b),
  };
}

function isTrackVolumePreviewCall(call) {
  return call?.name === "setTrackVolume" && call?.phase === "preview";
}

function isTrackVolumeCommitCall(call) {
  return call?.name === "setTrackVolume" && call?.phase === "commit";
}

function isTrackPanPreviewCall(call) {
  return call?.name === "setTrackPan" && call?.phase === "preview";
}

function isTrackPanCommitCall(call) {
  return call?.name === "setTrackPan" && call?.phase === "commit";
}

function isParamValuePreviewCall(call) {
  return call?.name === "setParamValue" && call?.phase === "preview";
}

function isParamValueCommitCall(call) {
  return call?.name === "setParamValue" && call?.phase === "commit";
}

function stripContinuousFields(call) {
  const next = { ...(call || {}) };
  delete next.phase;
  delete next.gestureId;
  return next;
}

function shouldSyncViewAfterCommit(call) {
  const name = String(call?.name || "");
  return (
    name === "setTrackVolume" ||
    name === "setTrackPan" ||
    name === "setBusVolume" ||
    name === "setParamValue"
  );
}

async function trySendTrackVolumeOsc(transport, trackGuid, value) {
  if (transport?.osc?.sendTrackVolume) {
    return transport.osc.sendTrackVolume(trackGuid, value);
  }
  if (transport?.sendTrackVolumeOsc) {
    return transport.sendTrackVolumeOsc(trackGuid, value);
  }
  throw new Error("transport osc.sendTrackVolume not wired");
}

async function trySendTrackPanOsc(transport, trackGuid, value) {
  if (transport?.osc?.sendTrackPan) {
    return transport.osc.sendTrackPan(trackGuid, value);
  }
  if (transport?.sendTrackPanOsc) {
    return transport.sendTrackPanOsc(trackGuid, value);
  }
  throw new Error("transport osc.sendTrackPan not wired");
}

function makeReaperFxParamOscPacket(state, payload) {
  const trackGuid = String(payload.trackGuid || "");
  const trackIndex0 = state.entities.trackOrder.indexOf(trackGuid);

  const fxIndex0 = Number(payload.fxIndex);
  const paramIndex0 = Number(payload.paramIdx);
  const value01 = clamp01(payload.value01 ?? payload.value);

  if (trackIndex0 < 0) throw new Error(`OSC track not found: ${trackGuid}`);
  if (!Number.isFinite(fxIndex0)) throw new Error("OSC missing fxIndex");
  if (!Number.isFinite(paramIndex0)) throw new Error("OSC missing paramIdx");

  return {
    address: `/track/${trackIndex0 + 1}/fx/${fxIndex0 + 1}/fxparam/${paramIndex0 + 1}/value`,
    args: [value01],
  };
}

async function trySendFxParamValueOsc(transport, payload, state) {
  const packet = makeReaperFxParamOscPacket(state, payload);

  console.log("[OSC SEND]", packet);

  if (transport?.sendOsc) {
    return transport.sendOsc(packet);
  }

  if (transport?.osc?.sendFxParamValue) {
    return transport.osc.sendFxParamValue(payload);
  }

  if (transport?.sendFxParamValueOsc) {
    return transport.sendFxParamValueOsc(payload);
  }

  throw new Error("transport OSC not wired");
}

function getKnobTargets(mapForBus, knobId) {
  const raw = mapForBus?.[knobId];
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function makeKnobTarget(payload) {
  const sourceRange = normalizeRange01(
    payload.sourceMin01 ?? 0,
    payload.sourceMax01 ?? 1,
    0,
    1
  );

  const targetRange = normalizeRange01(
    payload.targetMin01 ?? 0,
    payload.targetMax01 ?? 1,
    0,
    1
  );

  return {
    busId: String(payload.busId || ""),
    knobId: String(payload.knobId || ""),
    trackGuid: String(payload.trackGuid || ""),
    fxGuid: String(payload.fxGuid || ""),
    paramIdx: Number(payload.paramIdx),
    paramName: payload.paramName || payload.label || undefined,
    fxName: payload.fxName || undefined,
    trackName: payload.trackName || undefined,

    sourceMin01: sourceRange.min01,
    sourceMax01: sourceRange.max01,
    targetMin01: targetRange.min01,
    targetMax01: targetRange.max01,
    invert: payload.invert === true,
  };
}

function sanitizeKnobTargetPatch(prevTarget, patch) {
  const next = { ...(prevTarget || {}), ...(patch || {}) };

  const sourceRange = normalizeRange01(
    next.sourceMin01 ?? 0,
    next.sourceMax01 ?? 1,
    0,
    1
  );

  const targetRange = normalizeRange01(
    next.targetMin01 ?? 0,
    next.targetMax01 ?? 1,
    0,
    1
  );

  return {
    ...next,
    sourceMin01: sourceRange.min01,
    sourceMax01: sourceRange.max01,
    targetMin01: targetRange.min01,
    targetMax01: targetRange.max01,
    invert: next.invert === true,
  };
}

function sameTarget(a, b) {
  return (
    String(a?.trackGuid || "") === String(b?.trackGuid || "") &&
    String(a?.fxGuid || "") === String(b?.fxGuid || "") &&
    Number(a?.paramIdx) === Number(b?.paramIdx)
  );
}

function sameAutomatableParameter(a, b) {
  return (
    String(a?.trackGuid || "") === String(b?.trackGuid || "") &&
    String(a?.fxGuid || "") === String(b?.fxGuid || "") &&
    Number(a?.paramIndex) === Number(b?.paramIndex)
  );
}

export const useRfxStore = create((set, get) => ({
  transport: null,
  setTransport: (transport) => set({ transport }),

  snapshot: {
    seq: 0,
    schema: "none",
    ts: 0,
    receivedAtMs: 0,
    trackMix: {},
    busMix: {},
    fxParamsByGuid: {},
  },

  reaper: { version: "unknown", resourcePath: "" },
  project: { name: "", path: "", templateVersion: "unknown" },
  transportState: null,
  selection: { selectedTrackIndex: -1 },

  entities: {
    tracksByGuid: {},
    trackOrder: [],
    fxByGuid: {},
    fxOrderByTrackGuid: {},
    fxParamsByGuid: {},
    routesById: {},
    routeIdsByTrackGuid: {},
  },

  meters: {
    byId: {},
    lastAtMs: 0,
    activeBusId: null,
  },

  perf: {
    buses: null,
    activeBusId: null,
    busModesById: null,
    metersById: null,
    knobValuesByBusId: {},
    knobMapByBusId: {},
    mappingArmed: null,
    sliderBusVolumeMapByBusId: {},
  },

  automation: {
    automatableParameters: [],
    armedAutomationParameters: [],
  },

  session: {
    mode: null,
    activeBusId: null,
    activeTrackGuid: null,
    selectedTrackGuid: null,
    selectedFxGuid: null,
    tunerMuted: true,
    looperType: DEFAULT_LOOPER_TYPE,
    looper: { ...DEFAULT_LOOPER_STATE },
    tempoBpm: DEFAULT_SESSION_TEMPO_BPM,
    clickEnabled: DEFAULT_SESSION_CLICK_ENABLED,
    countInEnabled: DEFAULT_SESSION_COUNT_IN_ENABLED,
    beatsPerMeasure: DEFAULT_SESSION_BEATS_PER_MEASURE,
    noteLength: DEFAULT_SESSION_NOTE_LENGTH,
  },

  ops: {
    pendingById: {},
    pendingOrder: [],
    overlay: {
      track: {},
      bus: {},
      perf: {},
      session: {},
      fx: {},
      fxOrderByTrackGuid: {},
      fxParamsByGuid: {},
    },
    lastError: null,
    eventLog: [],
  },

  continuous: createContinuousOverlayState(),

  beginContinuous: (key, gestureId, value01) =>
    set((s) => ({
      continuous: beginContinuousOverlay(s.continuous, key, gestureId, value01),
    })),

  updateContinuous: (key, gestureId, value01) =>
    set((s) => ({
      continuous: updateContinuousOverlay(s.continuous, key, gestureId, value01),
    })),

  commitContinuous: (key, gestureId, value01) =>
    set((s) => ({
      continuous: markContinuousOverlayPending(s.continuous, key, gestureId, value01),
    })),

  clearContinuous: (key, gestureId) =>
    set((s) => ({
      continuous: clearContinuousOverlay(s.continuous, key, gestureId),
    })),

  logEvent: (kind, data, meta) => {
    const entry = {
      t: nowMs(),
      kind: String(kind || "event"),
      meta: meta ?? null,
      data: data ?? null,
    };
    set((s) => ({
      ops: { ...s.ops, eventLog: pushBounded(s.ops.eventLog, entry) },
    }));
  },

  clearEventLog: () => {
    set((s) => ({ ops: { ...s.ops, eventLog: [] } }));
  },

  addAutomatableParameter: (parameter) => {
    if (
      !parameter?.trackGuid ||
      !parameter?.fxGuid ||
      !Number.isFinite(Number(parameter?.paramIndex))
    ) {
      return;
    }

    set((s) => {
      const automatableParameters = Array.isArray(
        s.automation?.automatableParameters
      )
        ? s.automation.automatableParameters
        : [];

      if (
        automatableParameters.length >= MAX_AUTOMATABLE_PARAMETERS ||
        automatableParameters.some((entry) =>
          sameAutomatableParameter(entry, parameter)
        )
      ) {
        return s;
      }

      return {
        automation: {
          ...(s.automation || {}),
          automatableParameters: [...automatableParameters, parameter],
        },
      };
    });
  },

  removeAutomatableParameter: (parameter) => {
    set((s) => {
      const automatableParameters = Array.isArray(
        s.automation?.automatableParameters
      )
        ? s.automation.automatableParameters
        : [];
      const nextParameters = automatableParameters.filter(
        (entry) => !sameAutomatableParameter(entry, parameter)
      );

      if (nextParameters.length === automatableParameters.length) return s;

      return {
        automation: {
          ...(s.automation || {}),
          automatableParameters: nextParameters,
          armedAutomationParameters: (
            s.automation?.armedAutomationParameters || []
          ).filter(
            (entry) => !sameAutomatableParameter(entry, parameter)
          ),
        },
      };
    });
  },

  toggleArmedAutomationParameter: (parameter) => {
    if (
      !parameter?.trackGuid ||
      !parameter?.fxGuid ||
      !Number.isFinite(Number(parameter?.paramIndex))
    ) {
      return;
    }

    set((s) => {
      const armedAutomationParameters = Array.isArray(
        s.automation?.armedAutomationParameters
      )
        ? s.automation.armedAutomationParameters
        : [];
      const isArmed = armedAutomationParameters.some((entry) =>
        sameAutomatableParameter(entry, parameter)
      );

      return {
        automation: {
          ...(s.automation || {}),
          armedAutomationParameters: isArmed
            ? armedAutomationParameters.filter(
              (entry) => !sameAutomatableParameter(entry, parameter)
            )
            : [...armedAutomationParameters, parameter],
        },
      };
    });
  },

  updateLooper: (patch) => {
    set((s) => {
      const current = makeLooperState(s.session?.looper, {
        ...DEFAULT_LOOPER_STATE,
      });
      const nextLooper = {
        ...current,
        ...makeLooperPatch(patch, current),
      };

      return {
        session: {
          ...s.session,
          looper: nextLooper,
        },
      };
    });
  },

  resetLooperState: () => {
    set((s) => ({
      session: {
        ...s.session,
        looperType: DEFAULT_LOOPER_TYPE,
        looper: { ...DEFAULT_LOOPER_STATE },
        tempoBpm: DEFAULT_SESSION_TEMPO_BPM,
        clickEnabled: DEFAULT_SESSION_CLICK_ENABLED,
        countInEnabled: DEFAULT_SESSION_COUNT_IN_ENABLED,
        beatsPerMeasure: DEFAULT_SESSION_BEATS_PER_MEASURE,
        noteLength: DEFAULT_SESSION_NOTE_LENGTH,
      },
    }));
  },

  setLooperType: (looperType) => {
    const nextLooperType = asLooperTypeValue(looperType, "");
    if (!nextLooperType) return;
    set((s) => ({
      session: {
        ...s.session,
        looperType: nextLooperType,
      },
    }));
  },

  setLooperStatus: (status) => {
    const nextStatus = asLooperStatus(status, "");
    if (!nextStatus) return;
    get().updateLooper({ status: nextStatus });
  },

  setLooperTempoBpm: (tempoBpm) => {
    const nextTempoBpm = Number(tempoBpm);
    if (!Number.isFinite(nextTempoBpm)) return;
    const normalizedTempoBpm = Math.max(1, nextTempoBpm);
    set((s) => ({
      session: {
        ...s.session,
        tempoBpm: normalizedTempoBpm,
      },
    }));
    get().logEvent("session:tempo_updated", {
      tempoBpm: normalizedTempoBpm,
    });
  },

  setLooperClickEnabled: (enabled) => {
    const nextEnabled = !!enabled;
    set((s) => ({
      session: {
        ...s.session,
        clickEnabled: nextEnabled,
      },
    }));
    get().logEvent("looper:click_updated", {
      clickEnabled: nextEnabled,
    });
  },

  setLooperCountInEnabled: (enabled) => {
    const nextEnabled = !!enabled;
    set((s) => ({
      session: {
        ...s.session,
        countInEnabled: nextEnabled,
      },
    }));
    get().logEvent("looper:count_in_updated", {
      countInEnabled: nextEnabled,
    });
  },

  setLoopLengthEnabled: (enabled) => {
    const nextEnabled = !!enabled;
    get().updateLooper({ loopLengthEnabled: nextEnabled });
    get().logEvent("looper:length_enabled_updated", {
      loopLengthEnabled: nextEnabled,
    });
  },

  setLoopLength: (loopLength) => {
    const nextLoopLength = Number(loopLength);
    if (!LOOP_LENGTHS.has(nextLoopLength)) return;
    get().updateLooper({ loopLength: nextLoopLength });
    get().logEvent("looper:length_updated", {
      loopLength: nextLoopLength,
    });
  },

  setTimeSignature: (beatsPerMeasure, noteLength) => {
    const nextBeatsPerMeasure = Number(beatsPerMeasure);
    const nextNoteLength = Number(noteLength);
    if (
      !BEATS_PER_MEASURE_VALUES.has(nextBeatsPerMeasure) ||
      !NOTE_LENGTH_VALUES.has(nextNoteLength)
    ) {
      return;
    }

    set((s) => ({
      session: {
        ...s.session,
        beatsPerMeasure: nextBeatsPerMeasure,
        noteLength: nextNoteLength,
      },
    }));
    get().logEvent("session:time_signature_updated", {
      beatsPerMeasure: nextBeatsPerMeasure,
      noteLength: nextNoteLength,
    });
  },

  setTunerMuted: (muted) => {
    const nextMuted = !!muted;
    set((s) => ({
      session: {
        ...s.session,
        tunerMuted: nextMuted,
      },
    }));
    get().logEvent("tuner:mute_state_updated", {
      tunerMuted: nextMuted,
    });
  },

  toggleTunerMuted: () => {
    set((s) => ({
      session: {
        ...s.session,
        tunerMuted: !s.session?.tunerMuted,
      },
    }));
    get().logEvent("tuner:mute_toggled", {
      tunerMuted: !get().session?.tunerMuted,
    });
  },

  setLooperLengthMs: (lengthMs) => {
    const nextLengthMs = Number(lengthMs);
    if (!Number.isFinite(nextLengthMs)) return;
    get().updateLooper({ lengthMs: nextLengthMs });
  },

  setLooperRecordCount: (recordCount) => {
    const nextRecordCount = Number(recordCount);
    if (!Number.isFinite(nextRecordCount)) return;
    get().updateLooper({ recordCount: nextRecordCount });
  },

  selectTrackEffective: (trackGuid) => {
    const st = get();
    const base = st.entities.tracksByGuid[trackGuid];
    if (!base) return null;
    const patch = st.ops.overlay.track[trackGuid];
    return patch ? { ...base, ...patch } : base;
  },

  selectFxOrderEffective: (trackGuid) => {
    const st = get();
    return (
      st.ops.overlay.fxOrderByTrackGuid[trackGuid] ||
      st.entities.fxOrderByTrackGuid[trackGuid] ||
      EMPTY_ARR
    );
  },

  selectFxEffective: (fxGuid) => {
    const st = get();
    const base = st.entities.fxByGuid[fxGuid];
    if (!base) return null;
    const patch = st.ops.overlay.fx[fxGuid];
    return patch ? { ...base, ...patch } : base;
  },

  ingestCmdResult: (resLike) => {
    const res = resLike || {};
    const name = String(res?.name || "");
    const ok = res?.ok === true;
    const err = String(res?.error || "");

    set((s) => {
      const pendingById = { ...(s.ops?.pendingById || {}) };
      const pendingOrder = Array.isArray(s.ops?.pendingOrder) ? s.ops.pendingOrder : [];

      let changed = false;

      for (const opId of pendingOrder) {
        const op = pendingById[opId];
        if (!op) continue;

        const kind = String(
          op?.kind || op?.intent?.name || op?.syscallCall?.name || ""
        );

        if (kind !== name) continue;
        if (op.status !== "sent" && op.status !== "queued") continue;

        if (ok && SNAPSHOT_VERIFIED_MODE_OPS.has(kind)) {
          pendingById[opId] = {
            ...op,
            status: "sent",
            commandAcknowledgedAtMs: nowMs(),
            verify: {
              ok: false,
              reason: "command acknowledged; waiting for newer VM mode",
              checkedSeq: Number(s.snapshot?.seq || 0),
            },
          };
          changed = true;
          continue;
        }

        pendingById[opId] = {
          ...op,
          status: ok ? "acked" : "failed",
          ackSeq: Number(s.snapshot?.seq || 0),
          error: ok ? null : (err || "command failed"),
          verify: {
            ok,
            reason: ok ? `${name} acknowledged from cmd result` : (err || `${name} failed`),
            checkedSeq: Number(s.snapshot?.seq || 0),
          },
        };

        changed = true;
      }

      if (!changed) return {};

      return {
        ops: {
          ...s.ops,
          pendingById,
          pendingOrder: pendingOrder.filter((opId) => {
            const op = pendingById[opId];
            return op && op.status !== "acked" && op.status !== "failed";
          }),
        },
      };
    });
  },

  ingestMeters: (frameLike) => {
    const f = coerceMetersFrame(frameLike);
    if (!f.metersById) return;

    set((s) => ({
      meters: {
        byId: mergeMetersById(s.meters.byId, f.metersById),
        lastAtMs: f.t || nowMs(),
        activeBusId: f.activeBusId ?? s.meters.activeBusId ?? null,
      },
      perf: {
        ...s.perf,
        metersById: mergeMetersById(s.perf.metersById, f.metersById),
      },
    }));
  },

  ingestSnapshot: (viewJsonOrVm) => {
    const receivedAtMs = nowMs();
    const norm = normalize(viewJsonOrVm);

    const prevSeq = Number(get().snapshot?.seq || 0);
    const nextSeq = Number(norm?.snapshot?.seq || 0);
    const seqChanged = nextSeq !== prevSeq && nextSeq !== 0;

    if (seqChanged) {
      get().logEvent(
        "snapshot:received",
        {
          seq: norm?.snapshot?.seq,
          schema: norm?.snapshot?.schema,
          ts: norm?.snapshot?.ts,
        },
        { seq: nextSeq }
      );
    }

    const prev = get();
    const prevPendingById = prev.ops.pendingById;
    const prevPendingOrder = prev.ops.pendingOrder;

    const { nextOps, nextContinuous } = reconcilePending(prev, norm);
    const optimisticActiveBusId =
      nextOps?.overlay?.perf?.activeBusId ??
      nextOps?.overlay?.session?.activeBusId ??
      null;
    const normalizedActiveBusId =
      norm.perf?.activeBusId ?? norm.session?.activeBusId ?? null;
    const effectiveActiveBusId =
      optimisticActiveBusId ?? normalizedActiveBusId ?? null;

    let selectedGuid = prev.session.selectedTrackGuid;
    const idx = Number(norm?.selection?.selectedTrackIndex ?? -1);
    if (idx >= 0) selectedGuid = norm.entities.trackOrder[idx] || null;
    else selectedGuid = null;

    let activeGuid = prev.session.activeTrackGuid;
    if (activeGuid && !norm.entities.tracksByGuid[activeGuid]) activeGuid = null;
    if (!activeGuid) activeGuid = selectedGuid || norm.entities.trackOrder[0] || null;

    const transitions = summarizeTransitions(
      prevPendingById,
      nextOps.pendingById,
      prevPendingOrder
    );

    set((s) => {
      const currentLooper = makeLooperState(s.session?.looper, {
        ...DEFAULT_LOOPER_STATE,
      });
      const normalizedLooper = makeLooperState(norm.session, currentLooper);

      return {
        snapshot: {
          ...norm.snapshot,
          receivedAtMs,
        },
        reaper: norm.reaper,
        project: norm.project,
        transportState: norm.transportState,
        selection: norm.selection,
        entities: norm.entities,
        continuous: nextContinuous ?? s.continuous,

        perf: norm.perf
          ? {
            buses: norm.perf.buses,
            activeBusId: effectiveActiveBusId,
            busModesById:
              norm.perf.busModesById ?? norm.perf.routingModesById ?? null,
            metersById: s.meters.byId || s.perf.metersById || null,
            knobValuesByBusId: s.perf.knobValuesByBusId || {},
            knobMapByBusId: s.perf.knobMapByBusId || {},
            mappingArmed: s.perf.mappingArmed ?? null,
            sliderBusVolumeMapByBusId: s.perf.sliderBusVolumeMapByBusId || {},
          }
          : {
            ...s.perf,
            activeBusId: effectiveActiveBusId ?? s.perf.activeBusId ?? null,
            metersById: s.meters.byId || s.perf.metersById || null,
          },

        session: {
          ...s.session,
          mode: norm.session?.mode ?? s.session.mode ?? null,
          activeBusId: effectiveActiveBusId ?? s.session.activeBusId ?? null,
          activeTrackGuid: activeGuid,
          selectedTrackGuid: selectedGuid,
          looperType:
            norm.session?.looperType ?? s.session.looperType ?? DEFAULT_LOOPER_TYPE,
          looper: normalizedLooper,
          tempoBpm:
            norm.session?.tempoBpm ?? s.session.tempoBpm ?? DEFAULT_SESSION_TEMPO_BPM,
          clickEnabled:
            norm.session?.clickEnabled ??
            s.session.clickEnabled ??
            DEFAULT_SESSION_CLICK_ENABLED,
          countInEnabled:
            norm.session?.countInEnabled ??
            s.session.countInEnabled ??
            DEFAULT_SESSION_COUNT_IN_ENABLED,
          beatsPerMeasure:
            norm.session?.beatsPerMeasure ??
            s.session.beatsPerMeasure ??
            DEFAULT_SESSION_BEATS_PER_MEASURE,
          noteLength:
            norm.session?.noteLength ??
            s.session.noteLength ??
            DEFAULT_SESSION_NOTE_LENGTH,
        },

        ops: {
          ...nextOps,
          eventLog: s.ops.eventLog,
        },
      };
    });

    if (seqChanged) {
      const changed =
        transitions.acked.length +
        transitions.timeout.length +
        transitions.failed.length +
        transitions.superseded.length;

      if (changed > 0) {
        get().logEvent(
          "reconcile:transitions",
          {
            acked: transitions.acked,
            timeout: transitions.timeout,
            failed: transitions.failed,
            superseded: transitions.superseded,
            stillPending: transitions.stillPending,
          },
          { seq: nextSeq }
        );

        for (const row of transitions.acked) {
          get().logEvent(
            "op:acked",
            { kind: row.kind, from: row.from, to: row.to, ackSeq: row.ackSeq },
            { opId: row.id, seq: row.ackSeq ?? nextSeq }
          );
        }
        for (const row of transitions.timeout) {
          get().logEvent(
            "op:timeout",
            {
              kind: row.kind,
              from: row.from,
              to: row.to,
              error: row.error ?? null,
            },
            { opId: row.id, seq: nextSeq }
          );
        }
        for (const row of transitions.failed) {
          get().logEvent(
            "op:failed",
            {
              kind: row.kind,
              from: row.from,
              to: row.to,
              error: row.error ?? null,
            },
            { opId: row.id, seq: nextSeq }
          );
        }
        for (const row of transitions.superseded) {
          get().logEvent(
            "op:superseded",
            { kind: row.kind, from: row.from, to: row.to },
            { opId: row.id, seq: nextSeq }
          );
        }
      }
    }
  },

  dispatchIntent: async (intent) => {
    const transport = get().transport;
    get().logEvent("intent:received", intent, null);

    const call = coerceToTransportCall(intent);
    if (!call || !call.name) return;

    if (String(call.name) === "removeFx") {
      const fxGuid = String(call.fxGuid || "");
      if (fxGuid) {
        get().unmapFxFromAllBuses({ fxGuid });
      }
    }

    if (isTrackVolumePreviewCall(call)) {
      const trackGuid = String(call.trackGuid || "");
      const gestureId = String(call.gestureId || "");
      const value = Number(call.value);

      if (!trackGuid || !Number.isFinite(value)) return;

      const key = makeTrackVolumeKey(trackGuid);
      get().updateContinuous(key, gestureId, value);

      try {
        await trySendTrackVolumeOsc(transport, trackGuid, value);
        get().logEvent(
          "osc:trackVolume:preview",
          { trackGuid, value, gestureId },
          null
        );
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setTrackVolume",
            phase: "preview",
            trackGuid,
            value,
            error: String(err?.message || err),
          },
          null
        );
      }
      return;
    }

    if (isTrackPanPreviewCall(call)) {
      const trackGuid = String(call.trackGuid || "");
      const gestureId = String(call.gestureId || "");
      const value = Number(call.value);

      if (!trackGuid || !Number.isFinite(value)) return;

      const key = makeTrackPanKey(trackGuid);
      get().updateContinuous(key, gestureId, value);

      try {
        await trySendTrackPanOsc(transport, trackGuid, value);
        get().logEvent(
          "osc:trackPan:preview",
          { trackGuid, value, gestureId },
          null
        );
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setTrackPan",
            phase: "preview",
            trackGuid,
            value,
            error: String(err?.message || err),
          },
          null
        );
      }
      return;
    }

    if (isParamValuePreviewCall(call)) {
      const fxGuid = String(call.fxGuid || "");
      const paramIdx = Number(call.paramIdx);
      const value01 = clamp01(call.value01 ?? call.value);

      const fxMeta = get().entities?.fxByGuid?.[fxGuid] || null;
      const trackGuid = String(call.trackGuid || fxMeta?.trackGuid || "");
      const fxIndex = Number(fxMeta?.fxIndex);

      if (!trackGuid || !fxGuid || !Number.isFinite(paramIdx)) return;

      const previewIntent = {
        name: "setParamValue",
        trackGuid,
        fxGuid,
        paramIdx,
        value01,
      };

      let optimistic = null;
      try {
        optimistic = buildOptimistic(get(), previewIntent);
      } catch {
        optimistic = null;
      }

      if (optimistic) {
        set((s) => ({
          ops: {
            ...s.ops,
            overlay: mergeOverlay(s.ops.overlay, optimistic),
          },
        }));
      }

      try {
        await trySendFxParamValueOsc(
          transport,
          {
            trackGuid,
            fxGuid,
            fxIndex,
            paramIdx,
            value01,
          },
          get()
        );

        get().logEvent(
          "osc:fxParam:preview",
          {
            trackGuid,
            fxGuid,
            fxIndex,
            paramIdx,
            value01,
            gestureId: call.gestureId || null,
          },
          null
        );
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setParamValue",
            phase: "preview",
            trackGuid,
            fxGuid,
            fxIndex,
            paramIdx,
            value01,
            error: String(err?.message || err),
          },
          null
        );
      }
      return;
    }

    const isTrackVolCommit = isTrackVolumeCommitCall(call);
    const isTrackPanCommit = isTrackPanCommitCall(call);
    const isParamCommit = isParamValueCommitCall(call);
    let syscallCall = call;

    if (isTrackVolCommit) {
      const trackGuid = String(call.trackGuid || "");
      const gestureId = String(call.gestureId || "");
      const value = Number(call.value);

      if (!trackGuid || !Number.isFinite(value)) return;

      const key = makeTrackVolumeKey(trackGuid);
      get().commitContinuous(key, gestureId, value);

      try {
        await trySendTrackVolumeOsc(transport, trackGuid, value);
        get().logEvent("osc:trackVolume:commit", { trackGuid, value, gestureId }, null);
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setTrackVolume",
            phase: "commit",
            trackGuid,
            value,
            error: String(err?.message || err),
          },
          null
        );
      }

      syscallCall = stripContinuousFields(call);
    }

    if (isTrackPanCommit) {
      const trackGuid = String(call.trackGuid || "");
      const gestureId = String(call.gestureId || "");
      const value = Number(call.value);

      if (!trackGuid || !Number.isFinite(value)) return;

      const key = makeTrackPanKey(trackGuid);
      get().commitContinuous(key, gestureId, value);

      try {
        await trySendTrackPanOsc(transport, trackGuid, value);
        get().logEvent("osc:trackPan:commit", { trackGuid, value, gestureId }, null);
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setTrackPan",
            phase: "commit",
            trackGuid,
            value,
            error: String(err?.message || err),
          },
          null
        );
      }

      syscallCall = stripContinuousFields(call);
    }

    if (isParamCommit) {
      const fxGuid = String(call.fxGuid || "");
      const paramIdx = Number(call.paramIdx);
      const value01 = clamp01(call.value01 ?? call.value);

      const fxMeta = get().entities?.fxByGuid?.[fxGuid] || null;
      const trackGuid = String(call.trackGuid || fxMeta?.trackGuid || "");
      const fxIndex = Number(fxMeta?.fxIndex);

      if (!trackGuid || !fxGuid || !Number.isFinite(paramIdx)) return;

      try {
        await trySendFxParamValueOsc(transport, {
          trackGuid,
          fxGuid,
          fxIndex,
          paramIdx,
          value01,
        });

        get().logEvent(
          "osc:fxParam:commit",
          {
            trackGuid,
            fxGuid,
            fxIndex,
            paramIdx,
            value01,
            gestureId: call.gestureId || null,
          },
          null
        );
      } catch (err) {
        get().logEvent(
          "osc:error",
          {
            kind: "setParamValue",
            phase: "commit",
            trackGuid,
            fxGuid,
            fxIndex,
            paramIdx,
            value01,
            error: String(err?.message || err),
          },
          null
        );
      }

      syscallCall = stripContinuousFields({
        ...call,
        trackGuid,
        fxGuid,
        paramIdx,
        value01,
      });
    }

    const opId = uid("op");
    const createdAtMs = nowMs();

    let optimistic = null;
    if (!isTrackVolCommit && !isTrackPanCommit) {
      try {
        optimistic = buildOptimistic(get(), syscallCall);
      } catch {
        optimistic = null;
      }
    }

    set((s) => ({
      ops: {
        ...s.ops,
        pendingById: {
          ...s.ops.pendingById,
          [opId]: {
            id: opId,
            kind: syscallCall.name,
            status: "queued",
            intent: syscallCall,
            optimistic,
            createdAtMs,
            baseSnapshotSeq: Number(s.snapshot?.seq || 0),
          },
        },
        pendingOrder: [...s.ops.pendingOrder, opId],
        overlay: mergeOverlay(s.ops.overlay, optimistic),
      },
    }));

    get().logEvent(
      "intent:optimistic_applied",
      { kind: syscallCall.name, optimistic: optimistic || null },
      { opId }
    );

    if (!transport || typeof transport.syscall !== "function") {
      set((s) => ({
        ops: {
          ...s.ops,
          lastError: {
            opId,
            message: "No transport wired into RFX store",
            atMs: nowMs(),
          },
          pendingById: {
            ...s.ops.pendingById,
            [opId]: {
              ...s.ops.pendingById[opId],
              status: "failed",
              error: "no transport",
            },
          },
          overlay: clearOverlayPatch(s.ops.overlay, optimistic),
        },
      }));

      get().logEvent("syscall:error", { kind: syscallCall.name, error: "no transport" }, { opId });
      return;
    }

    try {
      set((s) => ({
        ops: {
          ...s.ops,
          pendingById: {
            ...s.ops.pendingById,
            [opId]: {
              ...s.ops.pendingById[opId],
              status: "sent",
              sentAtMs: nowMs(),
            },
          },
        },
      }));

      get().logEvent("syscall:sent", { call: syscallCall }, { opId });

      const res = await transport.syscall(syscallCall);

      if (res && res.ok === false) {
        const msg = String(res.error || "syscall failed");
        set((s) => ({
          ops: {
            ...s.ops,
            lastError: { opId, message: msg, atMs: nowMs() },
            pendingById: {
              ...s.ops.pendingById,
              [opId]: {
                ...s.ops.pendingById[opId],
                status: "failed",
                error: msg,
              },
            },
            overlay: clearOverlayPatch(s.ops.overlay, optimistic),
          },
        }));

        get().logEvent("syscall:error", { kind: syscallCall.name, error: msg }, { opId });
        return;
      }

      if (shouldSyncViewAfterCommit(syscallCall)) {
        try {
          await transport.syscall({ name: "syncView" });
          get().logEvent(
            "syscall:syncView_after_commit",
            { after: syscallCall.name },
            { opId }
          );
        } catch (err) {
          get().logEvent(
            "syscall:error",
            {
              kind: "syncView",
              after: syscallCall.name,
              error: String(err?.message || err),
            },
            { opId }
          );
        }
      }
    } catch (err) {
      const msg = String(err?.message || err);

      set((s) => ({
        ops: {
          ...s.ops,
          lastError: { opId, message: msg, atMs: nowMs() },
          pendingById: {
            ...s.ops.pendingById,
            [opId]: {
              ...s.ops.pendingById[opId],
              status: "failed",
              error: msg,
            },
          },
          overlay: clearOverlayPatch(s.ops.overlay, optimistic),
        },
      }));

      get().logEvent("syscall:error", { kind: syscallCall.name, error: msg }, { opId });
    }
  },

  armKnobMapping: (payload) => {
    const p = payload || {};
    const busId = String(p.busId || "");
    const fxGuid = String(p.fxGuid || "");
    const trackGuid = String(p.trackGuid || "");
    const paramIdx = Number(p.paramIdx);
    const knobId = p.knobId ? String(p.knobId) : "";

    if (!busId || !fxGuid || !trackGuid || !Number.isFinite(paramIdx)) return;

    if (knobId) {
      const m = knobId.match(/_k(\d+)$/);
      const knobIndex = m ? Number(m[1]) : null;

      get().logEvent(
        "knobmap:armed",
        {
          busId,
          knobId,
          knobIndex,
          trackGuid,
          fxGuid,
          paramIdx,
          label: p.label || "",
        },
        null
      );
    }

    set((s) => ({
      perf: {
        ...s.perf,
        mappingArmed: {
          busId,
          knobId: knobId || undefined,
          trackGuid,
          fxGuid,
          paramIdx,
          label: String(p.label || p.paramName || `Param ${paramIdx}`),
          fxName: p.fxName ? String(p.fxName) : undefined,
          trackName: p.trackName ? String(p.trackName) : undefined,
          paramName: p.paramName ? String(p.paramName) : undefined,

          sourceMin01: clamp01(p.sourceMin01 ?? 0),
          sourceMax01: clamp01(p.sourceMax01 ?? 1),
          targetMin01: clamp01(p.targetMin01 ?? 0),
          targetMax01: clamp01(p.targetMax01 ?? 1),
          invert: p.invert === true,
        },
      },
    }));
  },


  setSliderBusVolumeMapping: ({ busId, targetBusId }) => {
    const b = String(busId || "");
    const t = String(targetBusId || "");
    if (!b || !t) return;

    set((s) => ({
      perf: {
        ...s.perf,
        sliderBusVolumeMapByBusId: {
          ...(s.perf?.sliderBusVolumeMapByBusId || {}),
          [b]: t,
        },
      },
    }));

    get().logEvent("knobmap:slider_bus_volume_mapped", { busId: b, targetBusId: t });
  },

  clearKnobMappingArmed: () => {
    set((s) => ({ perf: { ...s.perf, mappingArmed: null } }));
  },

  commitKnobMapping: (payload) => {
    const p = payload || {};
    const busId = String(p.busId || "");
    const knobId = String(p.knobId || "");
    const trackGuid = String(p.trackGuid || "");
    const fxGuid = String(p.fxGuid || "");
    const paramIdx = Number(p.paramIdx);

    if (!busId || !knobId || !trackGuid || !fxGuid || !Number.isFinite(paramIdx)) {
      return;
    }

    const target = makeKnobTarget(p);
    const m = knobId.match(/_k(\d+)$/);
    const knobIndex = m ? Number(m[1]) : null;

    set((s) => {
      const knobMapByBusId = s.perf.knobMapByBusId || {};
      const busMap = knobMapByBusId[busId] || {};
      const prevTargets = getKnobTargets(busMap, knobId);

      const existingIndex = prevTargets.findIndex((t) => sameTarget(t, target));

      let nextTargets;

      if (existingIndex >= 0) {
        nextTargets = prevTargets.map((t, i) =>
          i === existingIndex ? { ...t, ...target } : t
        );

        get().logEvent("knobmap:updated", {
          ...target,
          knobIndex,
          targetCount: nextTargets.length,
        });
      } else {
        if (prevTargets.length >= MAX_TARGETS_PER_KNOB) {
          get().logEvent("knobmap:commit_rejected_full", {
            busId,
            knobId,
            knobIndex,
            max: MAX_TARGETS_PER_KNOB,
            attempted: target,
          });
          return s;
        }

        nextTargets = [...prevTargets, target];

        get().logEvent("knobmap:committed", {
          ...target,
          knobIndex,
          targetCount: nextTargets.length,
        });
      }

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...knobMapByBusId,
            [busId]: {
              ...busMap,
              [knobId]: nextTargets,
            },
          },
        },
      };
    });
  },

  updateKnobMappingTarget: ({ busId, knobId, fxGuid, paramIdx, patch }) => {
    const b = String(busId || "");
    const k = String(knobId || "");
    const fx = String(fxGuid || "");
    const idx = Number(paramIdx);

    if (!b || !k || !fx || !Number.isFinite(idx)) return;

    set((s) => {
      const knobMapByBusId = s.perf.knobMapByBusId || {};
      const busMap = knobMapByBusId[b] || {};
      const prevTargets = getKnobTargets(busMap, k);

      if (!prevTargets.length) return s;

      let changed = false;
      const nextTargets = prevTargets.map((t) => {
        if (
          String(t?.fxGuid || "") !== fx ||
          Number(t?.paramIdx) !== idx
        ) {
          return t;
        }

        changed = true;
        return sanitizeKnobTargetPatch(t, patch);
      });

      if (!changed) return s;

      get().logEvent("knobmap:target_updated", {
        busId: b,
        knobId: k,
        fxGuid: fx,
        paramIdx: idx,
        patch: patch || null,
      });

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...knobMapByBusId,
            [b]: {
              ...busMap,
              [k]: nextTargets,
            },
          },
        },
      };
    });
  },

  reorderKnobMappingTarget: ({ busId, knobId, fromIndex, toIndex }) => {
    const b = String(busId || "");
    const k = String(knobId || "");
    const from = Number(fromIndex);
    const to = Number(toIndex);

    if (!b || !k || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return;

    set((s) => {
      const knobMapByBusId = s.perf.knobMapByBusId || {};
      const busMap = knobMapByBusId[b] || {};
      const prevTargets = getKnobTargets(busMap, k);

      if (!prevTargets.length) return s;
      if (
        from < 0 ||
        to < 0 ||
        from >= prevTargets.length ||
        to >= prevTargets.length
      ) {
        return s;
      }

      const nextTargets = [...prevTargets];
      const [moved] = nextTargets.splice(from, 1);
      nextTargets.splice(to, 0, moved);

      get().logEvent("knobmap:target_reordered", {
        busId: b,
        knobId: k,
        fromIndex: from,
        toIndex: to,
      });

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...knobMapByBusId,
            [b]: {
              ...busMap,
              [k]: nextTargets,
            },
          },
        },
      };
    });
  },

  removeKnobMappingTarget: ({ busId, knobId, fxGuid, paramIdx }) => {
    const b = String(busId || "");
    const k = String(knobId || "");
    const fx = String(fxGuid || "");
    const idx = Number(paramIdx);

    if (!b || !k || !fx || !Number.isFinite(idx)) return;

    set((s) => {
      const knobMapByBusId = s.perf.knobMapByBusId || {};
      const busMap = knobMapByBusId[b] || {};
      const prevTargets = getKnobTargets(busMap, k);

      if (!prevTargets.length) return s;

      const nextTargets = prevTargets.filter(
        (t) =>
          !(
            String(t?.fxGuid || "") === fx &&
            Number(t?.paramIdx) === idx
          )
      );

      if (nextTargets.length === prevTargets.length) return s;

      const nextBusMap = { ...busMap };
      if (nextTargets.length > 0) nextBusMap[k] = nextTargets;
      else delete nextBusMap[k];

      get().logEvent("knobmap:target_removed", {
        busId: b,
        knobId: k,
        fxGuid: fx,
        paramIdx: idx,
      });

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...knobMapByBusId,
            [b]: nextBusMap,
          },
        },
      };
    });
  },

  setKnobValueLocal: ({ busId, knobId, value01 }) => {
    const b = String(busId || "");
    const k = String(knobId || "");
    const v = Number(value01);
    if (!b || !k || !Number.isFinite(v)) return;

    const clamped = Math.max(0, Math.min(1, v));

    set((s) => ({
      perf: {
        ...s.perf,
        knobValuesByBusId: {
          ...(s.perf.knobValuesByBusId || {}),
          [b]: {
            ...((s.perf.knobValuesByBusId || {})[b] || {}),
            [k]: clamped,
          },
        },
      },
    }));
  },

  unmapKnob: ({ busId, knobId }) => {
    const b = String(busId || "");
    const k = String(knobId || "");
    if (!b || !k) return;

    const cur = get().perf?.knobMapByBusId?.[b]?.[k];
    get().logEvent("knobmap:unmapped", { busId: b, knobId: k, prev: cur || null });

    set((s) => {
      const busMap = { ...((s.perf.knobMapByBusId || {})[b] || {}) };
      delete busMap[k];

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...(s.perf.knobMapByBusId || {}),
            [b]: busMap,
          },
        },
      };
    });
  },

  unmapParamFromBus: ({ busId, fxGuid, paramIdx }) => {
    const b = String(busId || "");
    const fx = String(fxGuid || "");
    const idx = Number(paramIdx);
    if (!b || !fx || !Number.isFinite(idx)) return;

    const removed = [];

    set((s) => {
      const currentBusMap = (s.perf.knobMapByBusId || {})[b] || {};
      const nextBusMap = {};

      for (const [knobId, rawTargets] of Object.entries(currentBusMap)) {
        const targets = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];
        const kept = [];

        for (const t of targets) {
          if (String(t?.fxGuid || "") === fx && Number(t?.paramIdx) === idx) {
            removed.push({ knobId, target: t });
          } else {
            kept.push(t);
          }
        }

        if (kept.length > 0) {
          nextBusMap[knobId] = kept;
        }
      }

      return {
        perf: {
          ...s.perf,
          knobMapByBusId: {
            ...(s.perf.knobMapByBusId || {}),
            [b]: nextBusMap,
          },
        },
      };
    });

    if (removed.length) {
      get().logEvent("knobmap:param_unmapped", {
        busId: b,
        fxGuid: fx,
        paramIdx: idx,
        removed,
      });
    }
  },

  unmapFxFromAllBuses: ({ fxGuid }) => {
    const fx = String(fxGuid || "");
    if (!fx) return;

    const knobMapByBusId = get().perf?.knobMapByBusId || {};
    const nextKnobMapByBusId = {};
    const removed = [];

    for (const [busId, busMap] of Object.entries(knobMapByBusId)) {
      const nextBusMap = {};

      for (const [knobId, rawTargets] of Object.entries(busMap || {})) {
        const targets = Array.isArray(rawTargets) ? rawTargets : rawTargets ? [rawTargets] : [];
        const kept = [];

        for (const target of targets) {
          if (String(target?.fxGuid || "") === fx) {
            removed.push({
              busId,
              knobId,
              fxGuid: fx,
              paramIdx: Number(target?.paramIdx),
              trackGuid: String(target?.trackGuid || ""),
            });
          } else {
            kept.push(target);
          }
        }

        if (kept.length > 0) {
          nextBusMap[knobId] = kept;
        }
      }

      nextKnobMapByBusId[busId] = nextBusMap;
    }

    if (!removed.length) return;

    get().logEvent("knobmap:fx_unmapped_all", {
      fxGuid: fx,
      removed,
    });

    set((s) => ({
      perf: {
        ...s.perf,
        knobMapByBusId: nextKnobMapByBusId,
      },
    }));
  },

  setActiveTrackGuid: (trackGuid) =>
    set((s) => ({ session: { ...s.session, activeTrackGuid: trackGuid } })),

  setSelectedFxGuid: (fxGuid) =>
    set((s) => ({ session: { ...s.session, selectedFxGuid: fxGuid } })),
}));
