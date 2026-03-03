// src/core/rfx/Normalize.js
// (This is your same file, only the VM branch entities mapping is corrected.)

function asStr(x, fallback = "") {
  const s = x == null ? "" : String(x);
  return s || fallback;
}

function asNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function ensureSelectionIndex(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v : -1;
}

export function normalize(view) {
  const v = view || {};

  // -----------------------------
  // Case A: VM-style snapshot (Mock/Electron backend)
  // -----------------------------
  if (Array.isArray(v.buses)) {
    const buses = v.buses || [];
    const activeBusId = asStr(v.activeBusId, "");

    const busModesById =
      (v.busModes && typeof v.busModes === "object" && v.busModes) ||
      (v.routingModes && typeof v.routingModes === "object" && v.routingModes) ||
      {};

    const selectedTrackIndex = buses.findIndex(
      (b) => asStr(b?.id, "") === activeBusId
    );

    return {
      snapshot: {
        seq: asNum(v.seq, 0),
        schema: asStr(v.schema, "mock_vm"),
        ts: asNum(v.ts, 0),

        trackMix: v.trackMix && typeof v.trackMix === "object" ? v.trackMix : {},
        busMix: v.busMix && typeof v.busMix === "object" ? v.busMix : {},
      },

      reaper: { version: "mock", resourcePath: "" },
      project: { name: "Mock", path: "", templateVersion: "mock" },

      selection: {
        selectedTrackIndex: selectedTrackIndex >= 0 ? selectedTrackIndex : -1,
      },

      transportState: null,

      session: {
        activeBusId,
      },

      entities: {
        tracksByGuid: {},
        trackOrder: [],

        // ✅ FIX: map VM FX truth into entities so Reconcile can verify
        fxByGuid: (v.fxByGuid && typeof v.fxByGuid === "object") ? v.fxByGuid : {},
        fxOrderByTrackGuid:
          (v.fxOrderByTrackGuid && typeof v.fxOrderByTrackGuid === "object")
            ? v.fxOrderByTrackGuid
            : {},

        routesById: {},
        routeIdsByTrackGuid: {},
      },

      perf: {
        buses,
        activeBusId,
        busModesById,
      },
    };
  }

  // -----------------------------
  // Case B: REAPER snapshot (unchanged)
  // -----------------------------
  const schema = asStr(v.schema, "unknown");
  const seq = asNum(v.seq, 0);
  const ts = asNum(v.ts, 0);

  const reaper = {
    version: asStr(v?.reaper?.version ?? v.reaperVersion, "unknown"),
    resourcePath: asStr(v?.reaper?.resourcePath, ""),
  };

  const project = {
    name: asStr(v?.project?.name ?? v.projectName, ""),
    path: asStr(v?.project?.path ?? v.projectPath, ""),
    templateVersion: asStr(
      v?.project?.templateVersion ?? v.templateVersion,
      "unknown"
    ),
  };

  const selection = {
    selectedTrackIndex: ensureSelectionIndex(v?.selection?.selectedTrackIndex),
  };

  const transportState = v?.transport || null;

  const session = {
    activeBusId: asStr(v?.session?.activeBusId, ""),
  };

  const tracks = Array.isArray(v?.tracks) ? v.tracks : [];

  const tracksByGuid = {};
  const trackOrder = [];
  const fxByGuid = {};
  const fxOrderByTrackGuid = {};
  const routesById = {};
  const routeIdsByTrackGuid = {};

  for (const tr of tracks) {
    const guid = asStr(tr?.trackGuid, "");
    if (!guid) continue;

    const trackIndex = asNum(tr?.trackIndex, 0);

    tracksByGuid[guid] = {
      guid,
      trackIndex,
      trackNumber: asNum(tr?.trackNumber, trackIndex + 1),
      name: asStr(tr?.trackName, ""),

      parentGuid: asStr(tr?.parentGuid, ""),
      folderDepth: asNum(tr?.folderDepth, 0),

      selected: !!tr?.selected,

      recArm: !!tr?.recArm,
      recMon: asNum(tr?.recMon, 0),
      recMode: asNum(tr?.recMode, 0),
      recInput: asNum(tr?.recInput, 0),

      mute: !!tr?.mute,
      solo: asNum(tr?.solo, 0),
      phaseInvert: !!tr?.phaseInvert,

      vol: asNum(tr?.vol, 1),
      pan: asNum(tr?.pan, 0),
      width: asNum(tr?.width, 1),
      panLaw: asNum(tr?.panLaw, 0),

      masterSend: !!tr?.masterSend,

      color: asNum(tr?.color, 0),
      tcpHide: asNum(tr?.tcpHide, 0),
      mcpHide: asNum(tr?.mcpHide, 0),
    };

    trackOrder.push(guid);

    const fxArr = Array.isArray(tr?.fx) ? tr.fx : [];
    const fxGuids = [];

    for (const fx of fxArr) {
      const fxGuid = asStr(fx?.fxGuid, "");
      if (!fxGuid) continue;

      fxByGuid[fxGuid] = {
        guid: fxGuid,
        trackGuid: guid,
        fxIndex: asNum(fx?.fxIndex, 0),
        name: asStr(fx?.fxName, ""),
        enabled: fx?.enabled !== false,
        offline: !!fx?.offline,
      };

      fxGuids.push(fxGuid);
    }

    fxOrderByTrackGuid[guid] = fxGuids;

    const sends = Array.isArray(tr?.routing?.sends) ? tr.routing.sends : [];
    const receives = Array.isArray(tr?.routing?.receives)
      ? tr.routing.receives
      : [];

    const sendIds = [];
    const recvIds = [];

    for (const e of sends) {
      const id = `${guid}:send:${asNum(e?.index, 0)}`;
      routesById[id] = normalizeEdge(id, guid, "send", e);
      sendIds.push(id);
    }

    for (const e of receives) {
      const id = `${guid}:receive:${asNum(e?.index, 0)}`;
      routesById[id] = normalizeEdge(id, guid, "receive", e);
      recvIds.push(id);
    }

    routeIdsByTrackGuid[guid] = { sends: sendIds, receives: recvIds };
  }

  trackOrder.sort(
    (a, b) =>
      (tracksByGuid[a]?.trackIndex ?? 0) - (tracksByGuid[b]?.trackIndex ?? 0)
  );

  return {
    snapshot: { seq, schema, ts },
    reaper,
    project,
    selection,
    transportState,
    session,
    entities: {
      tracksByGuid,
      trackOrder,
      fxByGuid,
      fxOrderByTrackGuid,
      routesById,
      routeIdsByTrackGuid,
    },
    perf: null,
  };
}

function normalizeEdge(id, ownerGuid, category, e) {
  return {
    id,
    category,
    trackGuid: ownerGuid,
    srcTrackGuid: asStr(e?.srcTrackGuid, ""),
    destTrackGuid: asStr(e?.destTrackGuid, ""),
    sendMode: asNum(e?.sendMode, 0),
    vol: asNum(e?.vol, 1),
    pan: asNum(e?.pan, 0),
    mute: !!e?.mute,
    phaseInvert: !!e?.phaseInvert,
    mono: !!e?.mono,
    srcChan: asNum(e?.srcChan, 0),
    dstChan: asNum(e?.dstChan, 0),
  };
}