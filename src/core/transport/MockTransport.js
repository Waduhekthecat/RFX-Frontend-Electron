import { makeMockParamManifestForFx } from "./MockParameterGenerator";

// Mock transport with canonical syscall contract + meters telemetry channel.
// ✅ Includes: selectActiveBus, setRoutingMode (alias setStateMode),
//    setBusVolume, setTrackVolume, setTrackPan,
//    addFx, removeFx, toggleFx, reorderFx, syncView
// ✅ NEW: getPluginParams (lazy param fetch for PluginView)
// ✅ VM snapshot includes FX truth:
//    - fxByGuid { [fxGuid]: { guid, trackGuid, fxIndex, name, vendor, format, enabled, raw? } }
//    - fxOrderByTrackGuid { [trackGuid]: [fxGuid, ...] }
// ✅ NEW VM cache for params:
//    - fxParamsByGuid { [fxGuid]: { plugin, scan, params, recommended?, roles? } }
// ✅ Meters are telemetry-only (no seq bump)

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function clampPan(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < -1) return -1;
  if (v > 1) return 1;
  return v;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function normBusId(x) {
  return String(x || "");
}

function canonicalTrackGuid(id) {
  // FX_1_A -> FX_1A (also FX_12_B -> FX_12B)
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

function normTrackId(x) {
  return canonicalTrackGuid(String(x || ""));
}

function asStr(x, fallback = "") {
  const s = x == null ? "" : String(x);
  return s || fallback;
}

function moveInArray(list, fromIndex, toIndex) {
  const a = Array.isArray(list) ? list.slice() : [];
  if (
    !Number.isFinite(fromIndex) ||
    !Number.isFinite(toIndex) ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= a.length ||
    toIndex >= a.length
  ) {
    return a;
  }
  const [moved] = a.splice(fromIndex, 1);
  a.splice(toIndex, 0, moved);
  return a;
}

function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
}

// ---------------------------
// ✅ NEW: Mock parameter manifest generator
// - Purpose: prove end-to-end flow for PluginView (lazy fetch on PARAMS click)
// - Shape mirrors your Lua manifests (plugin/scan/params/recommended/roles)
// - No plugin-specific logic yet (generic params only).
// ---------------------------
function makeGenericParamManifest({ trackGuid, fxGuid, fxName }) {
  const count = 16;

  const params = Array.from({ length: count }).map((_, i) => {
    const value01 = clamp01(0.15 + i * (0.7 / Math.max(1, count - 1)));
    return {
      idx: i,
      name: `Param ${i + 1}`,
      nameNorm: `param ${i + 1}`,
      value01,
      fmt: value01.toFixed(2),
    };
  });

  // "recommended" = first 8 by default (UI can render this list preferentially)
  const recommended = params.slice(0, 8).map((p) => ({
    idx: p.idx,
    name: p.name,
    score: 10,
    reason: "mock generic",
    confidence: 0.25,
  }));

  return {
    plugin: {
      trackGuid: canonicalTrackGuid(trackGuid),
      fxGuid: asStr(fxGuid, ""),
      fxName: asStr(fxName, "Plugin"),
      paramCount: params.length,
    },
    scan: {
      safeProbe: false,
      paramsIncluded: params.length,
      filter: "generic_mock_params",
    },
    roles: {},
    recommended,
    params,
  };
}

export function createMockTransportContractDocs() {
  return {
    ViewModel: {
      schemaVersion: 1,
      schema: "mock_vm_v2",
      seq: 1,
      ts: 1234567890,
      capabilities: {
        routingModes: ["linear", "parallel", "lcr"],
      },

      buses: [{ id: "FX_1", label: "FX_1", busNum: 1 }],
      activeBusId: "FX_1",

      // routing modes by bus id
      busModes: { FX_1: "linear" },

      // ✅ bus mix
      busMix: { FX_1: { vol: 0.8 } },

      // ✅ track list + mix
      tracks: [{ id: "FX_1A", label: "FX_1A", busId: "FX_1", lane: "A" }],
      trackMix: { FX_1A: { vol: 0.8, pan: 0 } },

      meters: { FX_1: { l: 0.1, r: 0.1 } },

      // ✅ FX truth (new)
      fxByGuid: {},
      fxOrderByTrackGuid: {},

      // ✅ FX params cache (new)
      fxParamsByGuid: {},
    },

    Syscalls: [
      "selectActiveBus",
      "setRoutingMode",
      "setStateMode", // alias of setRoutingMode
      "setBusVolume",
      "setTrackVolume",
      "setTrackPan",
      "syncView",
      "addFx",
      "removeFx",
      "toggleFx",
      "reorderFx",
      "getPluginParams",
      "setParamValue",
    ],

    Telemetry: ["subscribeMeters"],
  };
}

/**
 * Mock transport contract:
 *  - boot(): async handshake
 *  - getSnapshot(): returns current VM
 *  - subscribe(cb): pushes VM updates (truth-ish, seq-bearing changes)
 *  - syscall(call): mutates VM and emits (seq-bearing)
 *
 * Telemetry (optional):
 *  - subscribeMeters(cb): pushes meter frames only (NO seq)
 */
export function createMockTransport() {
  let seq = 1;

  let vm = {
    schemaVersion: 1,
    schema: "mock_vm_v2",
    seq,
    ts: nowSec(),
    capabilities: {
      routingModes: ["linear", "parallel", "lcr"],
    },

    buses: [
      { id: "FX_1", label: "FX_1", busNum: 1 },
      { id: "FX_2", label: "FX_2", busNum: 2 },
      { id: "FX_3", label: "FX_3", busNum: 3 },
      { id: "FX_4", label: "FX_4", busNum: 4 },
    ],
    activeBusId: "FX_1",

    busModes: {
      FX_1: "linear",
      FX_2: "parallel",
      FX_3: "lcr",
      FX_4: "parallel",
    },

    busMix: {
      FX_1: { vol: 0.8 },
      FX_2: { vol: 0.8 },
      FX_3: { vol: 0.8 },
      FX_4: { vol: 0.8 },
    },

    tracks: [
      { id: "FX_1A", label: "FX_1A", busId: "FX_1", lane: "A" },

      { id: "FX_2A", label: "FX_2A", busId: "FX_2", lane: "A" },
      { id: "FX_2B", label: "FX_2B", busId: "FX_2", lane: "B" },

      { id: "FX_3A", label: "FX_3A", busId: "FX_3", lane: "A" },
      { id: "FX_3B", label: "FX_3B", busId: "FX_3", lane: "B" },
      { id: "FX_3C", label: "FX_3C", busId: "FX_3", lane: "C" },

      { id: "FX_4A", label: "FX_4A", busId: "FX_4", lane: "A" },
      { id: "FX_4B", label: "FX_4B", busId: "FX_4", lane: "B" },
    ],

    trackMix: {
      FX_1A: { vol: 0.8, pan: 0 },

      FX_2A: { vol: 0.8, pan: 0 },
      FX_2B: { vol: 0.8, pan: 0 },

      FX_3A: { vol: 0.8, pan: 0 },
      FX_3B: { vol: 0.8, pan: 0 },
      FX_3C: { vol: 0.8, pan: 0 },

      FX_4A: { vol: 0.8, pan: 0 },
      FX_4B: { vol: 0.8, pan: 0 },
    },

    meters: {
      FX_1: { l: 0.1, r: 0.12 },
      FX_2: { l: 0.02, r: 0.03 },
      FX_3: { l: 0.0, r: 0.0 },
      FX_4: { l: 0.05, r: 0.04 },
    },

    // ✅ FX truth
    fxByGuid: {},
    fxOrderByTrackGuid: {},

    // ✅ NEW: FX params cache (truth-ish)
    fxParamsByGuid: {},

    // legacy debug fields (safe to keep)
    fxEnabledByGuid: {},
    fxReorderLastByTrackGuid: {},
  };

  // Truth subscribers (snapshots)
  const subs = new Set();
  const emit = () => subs.forEach((cb) => cb(vm));

  // Telemetry subscribers (meters)
  const meterSubs = new Set();
  const emitMeters = (frame) => meterSubs.forEach((cb) => cb(frame));

  function bumpSeq() {
    seq += 1;
    vm = { ...vm, seq, ts: nowSec() };
  }

  function canonicalizeCall(call) {
    if (!call) return null;
    const name = call.name === "setStateMode" ? "setRoutingMode" : call.name;

    // Normalize boundary ids so the core never sees FX_1_A downstream.
    const next = { ...call, name };

    if (next.trackGuid != null) next.trackGuid = canonicalTrackGuid(next.trackGuid);
    if (next.trackId != null) next.trackId = canonicalTrackGuid(next.trackId);
    if (next.track != null) next.track = canonicalTrackGuid(next.track);

    return next;
  }

  // ---------------------------
  // FX truth helpers
  // ---------------------------
  function ensureFxOrder(trackGuid) {
    const tg = canonicalTrackGuid(trackGuid);
    const cur = vm.fxOrderByTrackGuid?.[tg];
    if (Array.isArray(cur)) return cur;
    return [];
  }

  function recomputeFxIndicesForTrack(trackGuid, nextOrder) {
    const tg = canonicalTrackGuid(trackGuid);
    const fxByGuid = { ...(vm.fxByGuid || {}) };

    const order = Array.isArray(nextOrder) ? nextOrder : [];
    for (let i = 0; i < order.length; i++) {
      const g = order[i];
      const fx = fxByGuid[g];
      if (!fx) continue;
      fxByGuid[g] = { ...fx, fxIndex: i, trackGuid: tg };
    }

    vm = {
      ...vm,
      fxByGuid,
      fxOrderByTrackGuid: {
        ...(vm.fxOrderByTrackGuid || {}),
        [tg]: order.slice(),
      },
    };
  }

  function addFxToTruth({ trackGuid, fxGuid, name, vendor, format, enabled, raw }) {
    const tg = canonicalTrackGuid(trackGuid);
    const guid = asStr(fxGuid, "") || uid("fx");

    const baseOrder = ensureFxOrder(tg);
    const nextOrder = baseOrder.concat([guid]);

    const fx = {
      guid,
      trackGuid: tg,
      fxIndex: nextOrder.length - 1,
      name: asStr(name, "Plugin"),
      vendor: asStr(vendor, ""),
      format: asStr(format, ""),
      enabled: enabled !== false,
      raw: raw ?? null,
    };

    vm = {
      ...vm,
      fxByGuid: {
        ...(vm.fxByGuid || {}),
        [guid]: fx,
      },
      fxOrderByTrackGuid: {
        ...(vm.fxOrderByTrackGuid || {}),
        [tg]: nextOrder,
      },
    };

    return guid;
  }

  function removeFxFromTruth({ trackGuid, fxGuid }) {
    const tg = canonicalTrackGuid(trackGuid);
    const guid = asStr(fxGuid, "");
    if (!guid) return false;

    const baseOrder = ensureFxOrder(tg);
    const nextOrder = baseOrder.filter((g) => g !== guid);

    const nextFxByGuid = { ...(vm.fxByGuid || {}) };
    delete nextFxByGuid[guid];

    // Also clear any cached params for that FX instance
    const nextFxParamsByGuid = { ...(vm.fxParamsByGuid || {}) };
    delete nextFxParamsByGuid[guid];

    vm = {
      ...vm,
      fxByGuid: nextFxByGuid,
      fxOrderByTrackGuid: {
        ...(vm.fxOrderByTrackGuid || {}),
        [tg]: nextOrder,
      },
      fxParamsByGuid: nextFxParamsByGuid,
    };

    // reindex remaining
    recomputeFxIndicesForTrack(tg, nextOrder);
    return true;
  }

  // ============================
  // ✅ Dev toggle: pause meters
  // ============================
  let metersEnabled = true;
  let metersTimer = null;

  function seedMetersForActiveBus() {
    const id = vm.activeBusId;
    if (!id) return;
    const m = vm.meters?.[id];
    if (!m) return;

    emitMeters({
      t: Date.now(),
      activeBusId: id,
      metersByBusId: { [id]: m },
      metersById: { [id]: m },
    });
  }

  function tickMeters() {
    const id = vm.activeBusId;
    if (!id) return;

    const prev = vm.meters[id] || { l: 0, r: 0 };
    const next = {
      l: clamp01(prev.l * 0.85 + Math.random() * 0.35),
      r: clamp01(prev.r * 0.85 + Math.random() * 0.35),
    };

    // IMPORTANT: meters do NOT bump seq
    vm = { ...vm, meters: { ...vm.meters, [id]: next } };

    emitMeters({
      t: Date.now(),
      activeBusId: id,
      metersByBusId: { [id]: next },
      metersById: { [id]: next },
    });
  }

  function startMeters() {
    if (metersTimer) return;
    if (typeof window === "undefined" || typeof window.setInterval !== "function") return;

    metersTimer = window.setInterval(() => {
      if (!metersEnabled) return;
      tickMeters();
    }, 60);
  }

  startMeters();

  return {
    async boot() {
      await sleep(600);
      await sleep(900);
      bumpSeq();
      emit();
      seedMetersForActiveBus();
      return { ok: true, seq };
    },

    getSnapshot() {
      return vm;
    },

    subscribe(cb) {
      subs.add(cb);
      cb(vm);
      return () => subs.delete(cb);
    },

    subscribeMeters(cb) {
      meterSubs.add(cb);
      try {
        const id = vm.activeBusId;
        if (id && vm.meters?.[id]) {
          cb({
            t: Date.now(),
            activeBusId: id,
            metersByBusId: { [id]: vm.meters[id] },
            metersById: { [id]: vm.meters[id] },
          });
        }
      } catch {
        // ignore
      }
      return () => meterSubs.delete(cb);
    },

    async syscall(call) {
      const c = canonicalizeCall(call);
      if (!c || !c.name) return { ok: false, error: "invalid syscall" };

      // ---------------------------
      // Active bus
      // ---------------------------
      if (c.name === "selectActiveBus") {
        const id = normBusId(c.busId);
        bumpSeq();
        vm = { ...vm, activeBusId: id };
        emit();
        seedMetersForActiveBus();
        return { ok: true };
      }

      // ---------------------------
      // Routing mode (alias supported)
      // ---------------------------
      if (c.name === "setRoutingMode") {
        const id = normBusId(c.busId);
        if (!id) return { ok: false, error: "missing busId" };

        bumpSeq();
        const mode = normalizeMode(c.mode);
        vm = { ...vm, busModes: { ...vm.busModes, [id]: mode } };
        emit();
        return { ok: true };
      }

      // ---------------------------
      // Bus mix
      // ---------------------------
      if (c.name === "setBusVolume") {
        const id = normBusId(c.busId);
        if (!id) return { ok: false, error: "missing busId" };

        const v = clamp01(c.value ?? c.vol);
        bumpSeq();
        vm = {
          ...vm,
          busMix: {
            ...(vm.busMix || {}),
            [id]: { ...(vm.busMix?.[id] || {}), vol: v },
          },
        };
        emit();
        return { ok: true };
      }

      // ---------------------------
      // Track mix
      // ---------------------------
      if (c.name === "setTrackVolume") {
        const id = normTrackId(c.trackId ?? c.trackGuid);
        if (!id) return { ok: false, error: "missing trackId" };

        const v = clamp01(c.value ?? c.vol);
        bumpSeq();
        vm = {
          ...vm,
          trackMix: {
            ...(vm.trackMix || {}),
            [id]: { ...(vm.trackMix?.[id] || {}), vol: v },
          },
        };
        emit();
        return { ok: true };
      }

      if (c.name === "setTrackPan") {
        const id = normTrackId(c.trackId ?? c.trackGuid);
        if (!id) return { ok: false, error: "missing trackId" };

        const p = clampPan(c.value ?? c.pan);
        bumpSeq();
        vm = {
          ...vm,
          trackMix: {
            ...(vm.trackMix || {}),
            [id]: { ...(vm.trackMix?.[id] || {}), pan: p },
          },
        };
        emit();
        return { ok: true };
      }

      // ---------------------------
      // ✅ FX: add
      // NOTE: DO NOT read c.name for plugin name (c.name === "addFx")
      // Accepts:
      //  - { name:"addFx", trackGuid, fxGuid?, fxName, fxVendor?, fxFormat?, raw?, enabled? }
      // ---------------------------
      if (c.name === "addFx") {
        const trackGuid = canonicalTrackGuid(c.trackGuid || c.trackId || "");
        if (!trackGuid) return { ok: false, error: "missing trackGuid" };

        bumpSeq();

        const fxGuid = asStr(c.fxGuid, "") || uid("fx");
        const fxName = asStr(c.fxName ?? c.pluginName ?? c.title, "Plugin");
        const fxVendor = asStr(c.fxVendor ?? c.vendor, "");
        const fxFormat = asStr(c.fxFormat ?? c.format, "");
        const enabled = c.enabled !== false;

        const guid = addFxToTruth({
          trackGuid,
          fxGuid,
          name: fxName,
          vendor: fxVendor,
          format: fxFormat,
          enabled,
          raw: c.raw ?? null,
        });

        emit();
        return { ok: true, fxGuid: guid };
      }

      // ---------------------------
      // ✅ FX: remove
      // Accepts:
      //  - { name:"removeFx", trackGuid, fxGuid }
      // ---------------------------
      if (c.name === "removeFx") {
        const trackGuid = canonicalTrackGuid(c.trackGuid || c.trackId || "");
        const fxGuid = asStr(c.fxGuid, "");
        if (!trackGuid) return { ok: false, error: "missing trackGuid" };
        if (!fxGuid) return { ok: false, error: "missing fxGuid" };

        bumpSeq();
        removeFxFromTruth({ trackGuid, fxGuid });
        emit();
        return { ok: true };
      }

      // ---------------------------
      // ✅ FX: toggle enable/disable
      // ---------------------------
      if (c.name === "toggleFx") {
        const fxGuid = asStr(c.fxGuid, "");
        const value = !!c.value;
        if (!fxGuid) return { ok: false, error: "missing fxGuid" };

        const fx = vm.fxByGuid?.[fxGuid];
        if (!fx) return { ok: false, error: `fx not found: ${fxGuid}` };

        bumpSeq();
        vm = {
          ...vm,
          fxByGuid: {
            ...(vm.fxByGuid || {}),
            [fxGuid]: { ...fx, enabled: value },
          },
          fxEnabledByGuid: {
            ...(vm.fxEnabledByGuid || {}),
            [fxGuid]: value,
          },
        };
        emit();
        return { ok: true };
      }

      // ---------------------------
      // ✅ FX: reorder (truth)
      // Accepts:
      //  - { name:"reorderFx", trackGuid, fromIndex, toIndex }
      // ---------------------------
      if (c.name === "reorderFx") {
        const trackGuid = canonicalTrackGuid(c.trackGuid || "");
        const fromIndex = Number(c.fromIndex);
        const toIndex = Number(c.toIndex);

        if (!trackGuid) return { ok: false, error: "missing trackGuid" };
        if (!Number.isFinite(fromIndex) || !Number.isFinite(toIndex)) {
          return { ok: false, error: "missing fromIndex/toIndex" };
        }

        const baseOrder = ensureFxOrder(trackGuid);
        if (baseOrder.length === 0) {
          return { ok: false, error: "no fx on track" };
        }

        bumpSeq();

        const nextOrder = moveInArray(baseOrder, fromIndex, toIndex);
        recomputeFxIndicesForTrack(trackGuid, nextOrder);

        // legacy debug field (optional)
        vm = {
          ...vm,
          fxReorderLastByTrackGuid: {
            ...(vm.fxReorderLastByTrackGuid || {}),
            [trackGuid]: { fromIndex, toIndex, at: Date.now() },
          },
        };

        emit();
        return { ok: true };
      }

      // ---------------------------
      // ✅ NEW: FX params fetch (lazy)
      // Accepts:
      //  - { name:"getPluginParams", trackGuid, fxGuid }
      //
      // Contract:
      //  - Updates truth cache: vm.fxParamsByGuid[fxGuid] = manifest
      //  - Bumps seq + emit (so PluginView can render from store truth)
      // ---------------------------
      if (c.name === "getPluginParams") {
        const trackGuid = canonicalTrackGuid(c.trackGuid || c.trackId || "");
        const fxGuid = asStr(c.fxGuid, "");
        if (!trackGuid) return { ok: false, error: "missing trackGuid" };
        if (!fxGuid) return { ok: false, error: "missing fxGuid" };

        const fx = vm.fxByGuid?.[fxGuid];
        if (!fx) return { ok: false, error: `fx not found: ${fxGuid}` };

        // ✅ IMPORTANT: use the FX truth name/vendor/format
        // and generate ONLY 8 params max
        const manifest = makeMockParamManifestForFx({
          id: fxGuid,
          guid: fxGuid,
          trackGuid,
          name: fx.name,
          vendor: fx.vendor,
          format: fx.format,
        });

        bumpSeq();

        vm = {
          ...vm,
          fxParamsByGuid: {
            ...(vm.fxParamsByGuid || {}),
            [fxGuid]: manifest,
          },
        };

        emit();
        return { ok: true };
      }
      if (c.name === "setParamValue") {
        const fxGuid = asStr(c.fxGuid, "");
        const paramIdx = Number(c.paramIdx);
        const value01 = clamp01(c.value01 ?? c.value);

        if (!fxGuid) return { ok: false, error: "missing fxGuid" };
        if (!Number.isFinite(paramIdx)) return { ok: false, error: "missing paramIdx" };

        const hit = vm.fxParamsByGuid?.[fxGuid];
        if (!hit) return { ok: false, error: `missing fx params cache: ${fxGuid}` };

        const params = Array.isArray(hit.params) ? hit.params.slice() : [];
        const i = params.findIndex((p) => Number(p?.idx) === paramIdx);
        if (i < 0) return { ok: false, error: `param not found: idx=${paramIdx}` };

        const prev = params[i] || {};
        params[i] = {
          ...prev,
          value01,
          fmt: prev?.fmtSamples ? prev.fmt : (value01 * 100).toFixed(1), // keep simple for now
        };

        bumpSeq();
        vm = {
          ...vm,
          fxParamsByGuid: {
            ...(vm.fxParamsByGuid || {}),
            [fxGuid]: { ...hit, params },
          },
        };

        emit();
        return { ok: true };
      }
      // ---------------------------
      // View sync
      // ---------------------------
      if (c.name === "syncView") {
        bumpSeq();
        emit();
        return { ok: true };
      }

      return { ok: false, error: `unknown syscall: ${String(c.name)}` };
    },

    setMetersEnabled(on) {
      metersEnabled = !!on;
      return { ok: true };
    },

    getMetersEnabled() {
      return metersEnabled;
    },
  };
}