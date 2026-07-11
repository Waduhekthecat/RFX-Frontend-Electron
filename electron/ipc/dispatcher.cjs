const { getIpcPaths } = require("./paths.cjs");
const { ensureDir, exists, writeJsonAtomic } = require("./jsonfile.cjs");

let nextCmdId = 1;
let cmdQueue = Promise.resolve();

const CMD_QUEUE_POLL_MS = 10;
const CMD_QUEUE_TIMEOUT_MS = 10000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForMissing(filePath, label) {
  const startedAt = Date.now();

  while (await exists(filePath)) {
    if (Date.now() - startedAt > CMD_QUEUE_TIMEOUT_MS) {
      throw new Error(`${label} timed out waiting for cmd.json to be consumed`);
    }

    await sleep(CMD_QUEUE_POLL_MS);
  }
}

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

function normalizeLooperType(value) {
  const x = String(value || "").toLowerCase();
  if (x === "pre-fx") return "pre-fx";
  return "post-fx";
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

function nonNegativeInt(n, fallback = 0) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(0, Math.floor(v));
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

    case "setPerformMode":
    case "setEditMode":
    case "setAutomationMode":
    case "setTunerMode":
    case "exitTunerMode":
    case "startAutomationRec":
    case "stopAutomationRec":
    case "clearEnvelopes":
      return {};

    case "setLooperMode":
      return {
        looperType: normalizeLooperType(call.looperType),
      };

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

    case "setArm":
    case "setUnarm": {
      if (!call.fxGuid && !call.trackGuid && !call.trackId && call.paramIdx == null && call.paramIndex == null) {
        return {};
      }

      const paramIdx = Number(call.paramIdx ?? call.paramIndex);
      return {
        trackGuid: normTrackId(call.trackGuid || call.trackId),
        fxGuid: asStr(call.fxGuid, ""),
        paramIdx,
        paramIndex: paramIdx,
        paramName: asStr(call.paramName, ""),
        fxName: asStr(call.fxName, ""),
        trackName: asStr(call.trackName, ""),
      };
    }

    case "setTempo":
      return {
        bpm: Math.max(1, Number(call.bpm) || 120),
      };

    case "setClickEnabled":
    case "setCountInEnabled":
      return {
        enabled: call.enabled === true,
      };

    case "setLoopLengthEnabled":
      return {
        enabled: call.enabled === true,
      };

    case "setLoopLength":
      return {
        bars: String(call.bars),
      };

    case "setTimeSignature":
      return {
        beatsPerMeasure: String(call.beatsPerMeasure),
        noteLength: String(call.noteLength),
      };

    case "startLooperRecord":
      return {
        recordCount: nonNegativeInt(call.recordCount, 0),
        inputGain01: clamp01(call.inputGain01 ?? 1),
      };

    case "toggleLooperType":
      return {
        looperType: normalizeLooperType(call.looperType),
      };

    case "stopLooperRecord":
    case "startLooperPlayback":
    case "stopLooperPlayback":
    case "undoLooperOverdub":
    case "undoLooperRecord":
    case "clearLooper":
      return {};

    default:
      return { ...call };
  }
}

async function writeCmdJsonNow(call) {
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
  console.log("[RFX -> cmd.json]", envelope.name, envelope.payload);

  return {
    ok: true,
    accepted: true,
    requestId,
  };
}

async function runQueuedCommand(call, resolve) {
  const paths = getIpcPaths();

  try {
    await ensureDir(paths.dir);
    await waitForMissing(paths.cmd, "before command write");

    const result = await writeCmdJsonNow(call);
    resolve(result);

    if (result?.ok !== false) {
      await waitForMissing(paths.cmd, "after command write");
    }
  } catch (err) {
    resolve({
      ok: false,
      error: String(err?.message || err),
    });
  }
}

async function dispatchCmdJson(call) {
  return new Promise((resolve) => {
    cmdQueue = cmdQueue
      .catch(() => {})
      .then(() => runQueuedCommand(call, resolve));
  });
}

module.exports = {
  dispatchCmdJson,
  canonicalizeCall,
};
