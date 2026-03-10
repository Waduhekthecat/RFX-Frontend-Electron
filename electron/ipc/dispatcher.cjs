const { getIpcPaths } = require("./paths.cjs");
const { ensureDir, writeJsonAtomic } = require("./jsonfile.cjs");

let nextCmdId = 1;

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

function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function canonicalTrackGuid(id) {
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

function normBusId(id) {
  const s = String(id || "").trim().toUpperCase();
  if (!s) return "";

  if (s === "INPUT") return "INPUT";

  const m = s.match(/^FX_(\d+)([ABC])?$/);
  if (!m) return s;

  return `FX_${m[1]}`;
}

function normTrackId(x) {
  return canonicalTrackGuid(String(x || ""));
}

function asStr(x, fallback = "") {
  const s = x == null ? "" : String(x);
  return s || fallback;
}

function canonicalizeCall(call) {
  if (!call) return null;

  const name = call.name === "setStateMode" ? "setRoutingMode" : call.name;
  const next = { ...call, name };

  if (next.trackGuid != null) next.trackGuid = canonicalTrackGuid(next.trackGuid);
  if (next.trackId != null) next.trackId = canonicalTrackGuid(next.trackId);
  if (next.track != null) next.track = canonicalTrackGuid(next.track);

  return next;
}

function makeRequestId() {
  const id = String(nextCmdId++).padStart(6, "0");
  return `cmd_${id}`;
}

function makePayload(call) {
  switch (call.name) {
    case "syncView":
      return {};

    case "selectActiveBus":
      return {
        busId: normBusId(call.busId),
      };

    case "setRoutingMode":
      return {
        busId: normBusId(call.busId),
        mode: normalizeMode(call.mode),
      };

    case "setBusVolume":
      return {
        busId: normBusId(call.busId),
        value: clamp01(call.value ?? call.vol),
        phase: call.phase === "preview" ? "preview" : "commit",
        gestureId: call.gestureId || null,
      };

    case "setTrackVolume":
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        value: clamp01(call.value ?? call.vol),
      };

    case "setTrackPan":
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        value: clampPan(call.value ?? call.pan),
      };

    case "addFx": {
      const fxRaw = asStr(call.fxRaw ?? call.raw, "");
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        fxRaw,
        fxName: asStr(call.fxName ?? call.pluginName ?? call.title, fxRaw || "Plugin"),
        fxVendor: asStr(call.fxVendor ?? call.vendor, ""),
        fxFormat: asStr(call.fxFormat ?? call.format, ""),
        enabled: call.enabled !== false,
      };
    }

    case "removeFx":
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        fxGuid: asStr(call.fxGuid, ""),
      };

    case "toggleFx":
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        fxGuid: asStr(call.fxGuid, ""),
        value: !!call.value,
      };

    case "reorderFx":
      return {
        trackGuid: normTrackId(call.trackGuid),
        fromIndex: Number(call.fromIndex),
        toIndex: Number(call.toIndex),
      };

    case "getPluginParams":
      return {
        fxGuid: asStr(call.fxGuid, ""),
      };

    case "setParamValue":
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        fxGuid: asStr(call.fxGuid, ""),
        paramIdx: Number(call.paramIdx),
        value01: clamp01(call.value01 ?? call.value),
      };

    default:
      return { ...call };
  }
}

async function dispatchCmdJson(call) {
  const c = canonicalizeCall(call);
  if (!c || !c.name) {
    return { ok: false, error: "invalid syscall" };
  }

  const paths = getIpcPaths();
  await ensureDir(paths.dir);

  const requestId = makeRequestId();
  const envelope = {
    id: requestId,
    ts: Date.now(),
    name: c.name,
    payload: makePayload(c),
  };

  await writeJsonAtomic(paths.cmd, envelope);

  return {
    ok: true,
    accepted: true,
    requestId,
  };
}

module.exports = {
  dispatchCmdJson,
  canonicalizeCall,
};