import React from "react";
import { clamp01, canonicalTrackGuid } from "../../../core/DomainHelpers";
import { useParams, useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { styles, KNOB_STRIP_H } from "./_styles";
import { useIntent } from "../../../core/useIntent";
import { useRfxStore } from "../../../core/rfx/Store";
import { ParamCard } from "./components/ParamCard";
import { KnobRow } from "../../../components/controls/knobs/KnobRow";
// import { MapCard } from "../../../components/ui/MapCard";

const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});

function normalizeKnobTargets(raw) {
  if (!raw) return EMPTY_ARR;
  return Array.isArray(raw) ? raw : [raw];
}

function getPrimaryKnobTarget(raw) {
  const targets = normalizeKnobTargets(raw);
  return targets[0] || null;
}

function readFxParam01(sources, fxGuid, paramIdx, fallback01 = 0.5) {
  const overlayByGuid = sources?.overlayByGuid || EMPTY_OBJ;
  const snapshotByGuid = sources?.snapshotByGuid || EMPTY_OBJ;
  const entitiesByGuid = sources?.entitiesByGuid || EMPTY_OBJ;

  const patch = overlayByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) {
    return clamp01(patch.value01);
  }

  const manifest = entitiesByGuid?.[fxGuid] ?? snapshotByGuid?.[fxGuid];
  const params = manifest?.params;
  if (Array.isArray(params)) {
    for (let i = 0; i < params.length; i += 1) {
      const x = params[i];
      if (Number(x?.idx) === Number(paramIdx) && Number.isFinite(Number(x?.value01))) {
        return clamp01(x.value01);
      }
    }
  }

  return clamp01(fallback01);
}

export function PluginView() {
  const { trackId, fxId } = useParams();
  const nav = useNavigate();
  const intent = useIntent();

  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);

  const trackGuid = React.useMemo(() => canonicalTrackGuid(trackId), [trackId]);
  const fxGuid = String(fxId || "");

  const activeBusId = useRfxStore(
    (s) => s.perf?.activeBusId || s.meters?.activeBusId || null
  );

  const knobValuesByBusId = useRfxStore((s) => s.perf?.knobValuesByBusId || EMPTY_OBJ);
  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || EMPTY_OBJ);
  const mappingArmed = useRfxStore((s) => s.perf?.mappingArmed ?? null);

  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);
  const unmapParamFromBus = useRfxStore((s) => s.unmapParamFromBus);

  const fxParamsOverlayByGuid = useRfxStore((s) => s.ops?.overlay?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidEntities = useRfxStore((s) => s.entities?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidSnapshot = useRfxStore((s) => s.snapshot?.fxParamsByGuid || EMPTY_OBJ);

  const fxParamSources = React.useMemo(
    () => ({
      overlayByGuid: fxParamsOverlayByGuid,
      snapshotByGuid: fxParamsByGuidSnapshot,
      entitiesByGuid: fxParamsByGuidEntities,
    }),
    [fxParamsOverlayByGuid, fxParamsByGuidSnapshot, fxParamsByGuidEntities]
  );

  const fxByGuid = useRfxStore((s) => s.entities.fxByGuid || EMPTY);
  const fxOverlay = useRfxStore((s) => s.ops.overlay.fx || EMPTY);

  const baseFx = fxByGuid[fxGuid];
  const patchFx = fxOverlay[fxGuid];
  const fx = baseFx ? (patchFx ? { ...baseFx, ...patchFx } : baseFx) : null;

  const truthManifest = useRfxStore(
    (s) =>
      s.entities.fxParamsByGuid?.[fxGuid] ??
      s.snapshot.fxParamsByGuid?.[fxGuid] ??
      null
  );

  const manifest = truthManifest;
  const params = Array.isArray(manifest?.params) ? manifest.params : EMPTY_ARR;

  const pluginName = String(manifest?.plugin?.fxName || fx?.name || "Plugin");

  const [mapModalOpen, setMapModalOpen] = React.useState(false);
  const [mapParam, setMapParam] = React.useState(null);
  const [mapInverse, setMapInverse] = React.useState(false);

  const [dragMappingParam, setDragMappingParam] = React.useState(null);
  const [knobRowExpanded, setKnobRowExpanded] = React.useState(false);

  const handleToggleExpand = () => {
    setKnobRowExpanded((prev) => {
      const next = !prev;
      console.log("knobRowExpanded:", next);
      return next;
    });
  };

  const onMapDragStart = React.useCallback((p) => {
    if (!p) return;
    const idx = Number(p.idx);
    if (!Number.isFinite(idx)) return;
    setDragMappingParam(p);
  }, []);

  const onMapDragEnd = React.useCallback(() => {
    setDragMappingParam(null);
  }, []);

  const onDropMapToKnob = React.useCallback(
    (knobId, payload) => {
      const busId = String(activeBusId || "");
      if (!busId || !knobId) return;

      let idx = Number(dragMappingParam?.idx);
      if (!Number.isFinite(idx)) {
        const m = String(payload || "").match(/^map:([^:]+):(\d+)$/);
        if (!m) return;
        if (String(m[1]) !== String(fxGuid)) return;
        idx = Number(m[2]);
      }
      if (!Number.isFinite(idx)) return;

      const src = dragMappingParam || params.find((x) => Number(x?.idx) === idx) || null;

      commitKnobMapping?.({
        busId,
        knobId,
        trackGuid,
        fxGuid,
        paramIdx: idx,
        paramName: String(src?.uiLabel || src?.name || `Param ${idx}`),
        fxName: pluginName,
        trackName: String(trackGuid),
        label: String(src?.uiLabel || src?.name || `Param ${idx}`),
        invert: false,
      });

      setDragMappingParam(null);
    },
    [activeBusId, dragMappingParam, fxGuid, params, commitKnobMapping, trackGuid, pluginName]
  );

  const mappedKnobsByParamIdx = React.useMemo(() => {
    const busId = String(activeBusId || "");
    if (!busId) return EMPTY_OBJ;

    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;
    const out = {};

    // for (const [knobId, t] of Object.entries(maps)) {
    //   if (!t) continue;
    //   if (String(t.fxGuid) !== String(fxGuid)) continue;

    //   const idx = Number(t.paramIdx);
    //   if (!Number.isFinite(idx)) continue;
    for (const [knobId, rawTarget] of Object.entries(maps)) {
      const targets = normalizeKnobTargets(rawTarget);
      if (!targets.length) continue;

      const m = String(knobId).match(/_k(\d+)$/);
      const n = m ? Number(m[1]) : null;
      const label = n ? `K${n}` : knobId;

      // (out[idx] ||= []).push(label);
      for (const t of targets) {
        if (String(t?.fxGuid) !== String(fxGuid)) continue;
        const idx = Number(t?.paramIdx);
        if (!Number.isFinite(idx)) continue;
        (out[idx] ||= []).push(label);
      }
    }

    for (const k of Object.keys(out)) out[k].sort();
    return out;
  }, [activeBusId, knobMapByBusId, fxGuid]);

  React.useEffect(() => {
    if (!fxGuid) return;
    if (truthManifest) return;

    intent?.({ name: "getPluginParams", fxGuid });
  }, [fxGuid, truthManifest, intent]);

  const onParamScrub = React.useCallback(
    (p, next01, gestureId) => {
      if (!p) return;
      const idx = Number(p.idx);
      if (!Number.isFinite(idx)) return;

      dispatchIntent({
        name: "setParamValue",
        trackGuid,
        fxGuid,
        paramIdx: idx,
        value01: clamp01(next01),
        phase: "preview",
        gestureId,
      });
    },
    [dispatchIntent, fxGuid, trackGuid]
  );

  const onParamCommit = React.useCallback(
    (p, final01, gestureId) => {
      if (!p) return;
      const idx = Number(p.idx);
      if (!Number.isFinite(idx)) return;

      dispatchIntent({
        name: "setParamValue",
        trackGuid,
        fxGuid,
        paramIdx: idx,
        value01: clamp01(final01),
        phase: "commit",
        gestureId,
      });
    },
    [dispatchIntent, fxGuid, trackGuid]
  );

  const onMap = React.useCallback((p) => {
    if (!p) return;
    setMapParam(p);
    setMapModalOpen(true);
    setMapInverse(false);
  }, []);

  const onUnmap = React.useCallback(
    (p) => {
      const busId = String(activeBusId || "");
      const idx = Number(p?.idx);
      if (!busId || !Number.isFinite(idx)) return;

      unmapParamFromBus?.({ busId, fxGuid, paramIdx: idx });
    },
    [activeBusId, unmapParamFromBus, fxGuid]
  );

  const modalBusId = String(activeBusId || "");
  const modalParamIdx = Number(mapParam?.idx);
  const modalHasIdx = Number.isFinite(modalParamIdx);

  const bottomBusId = String(activeBusId || "NONE");


  const mappedParamsForExpandedView = React.useMemo(() => {
    const busId = bottomBusId;
    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;
    const out = [];

    for (const rawTarget of Object.values(maps)) {
      const targets = normalizeKnobTargets(rawTarget);
      for (const t of targets) {
        if (!t?.fxGuid || !Number.isFinite(Number(t?.paramIdx))) continue;
        out.push({
          trackGuid: t.trackGuid,
          fxGuid: String(t.fxGuid),
          paramIdx: Number(t.paramIdx),
          paramName: String(t.paramName || `Param ${Number(t.paramIdx)}`),
          pluginName: String(t.fxName || "Plugin"),
        });
      }
    }

    return out.sort((a, b) => a.paramName.localeCompare(b.paramName));
  }, [bottomBusId, knobMapByBusId]);

  const onMappedParamChange = React.useCallback(
    (entry, next01) => {
      if (!entry?.fxGuid || !Number.isFinite(Number(entry?.paramIdx))) return;
      const value01 = clamp01(next01);
      const gestureId = `mapCard:${bottomBusId}:${entry.fxGuid}:${entry.paramIdx}`;

      dispatchIntent({
        name: "setParamValue",
        phase: "preview",
        gestureId,
        trackGuid: entry.trackGuid,
        fxGuid: entry.fxGuid,
        paramIdx: entry.paramIdx,
        value01,
      });

      dispatchIntent({
        name: "setParamValue",
        phase: "commit",
        gestureId,
        trackGuid: entry.trackGuid,
        fxGuid: entry.fxGuid,
        paramIdx: entry.paramIdx,
        value01,
      });
    },
    [dispatchIntent, bottomBusId]
  );

  const bottomKnobs = React.useMemo(() => {
  const busId = bottomBusId;
  const values = knobValuesByBusId?.[busId] || EMPTY_OBJ;
  const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;

  return Array.from({ length: 7 }).map((_, i) => {
    const knobId = `${busId}_k${i + 1}`;
    const target = getPrimaryKnobTarget(maps[knobId]);

    const base01 = Number.isFinite(values[knobId]) ? values[knobId] : 0.5;

    const param01 =
      target?.fxGuid && Number.isFinite(Number(target?.paramIdx))
        ? readFxParam01(
            fxParamSources,
            String(target.fxGuid),
            Number(target.paramIdx),
            base01
          )
        : null;

    const display01 =
      param01 !== null
        ? target?.invert === true
          ? clamp01(1 - param01)
          : clamp01(param01)
        : clamp01(base01);

    const mappedLabel = target
      ? `${target.fxName || "FX"} • ${target.paramName || `#${target.paramIdx}`}`
      : "";

    return {
      id: knobId,
      label: target?.paramName ? String(target.paramName) : `K${i + 1}`,
      value: display01,
      mapped: !!target,
      mappedLabel,
    };
  });
}, [bottomBusId, knobValuesByBusId, knobMapByBusId, fxParamSources]);

  return (
    <div className={styles.Root}>
      <div className={styles.Column}>
        <Panel className={styles.panelHeader}>
          <div className={styles.Header}>
            <div className={styles.Title}>{pluginName}</div>
            <button type="button" onClick={() => nav("/edit")} className={styles.BackButton}>
              BACK
            </button>
          </div>
        </Panel>

        <div
          className="p-0 min-h-0 flex-1 overflow-auto"
          style={{ paddingBottom: knobRowExpanded ? 0 : KNOB_STRIP_H + 12 }}
        >
          {!manifest ? (
            <div className="text-white/45 text-[12px]">Loading parameters…</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
              {params.map((p) => {
                const idx = Number(p.idx);
                const mappedKnobs = mappedKnobsByParamIdx?.[idx] || EMPTY_ARR;

                return (
                  <ParamCard
                    key={p.idx}
                    trackGuid={trackGuid}
                    fxGuid={fxGuid}
                    p={p}
                    onChange01={onParamScrub}
                    onCommit01={onParamCommit}
                    onMap={onMap}
                    onUnmap={onUnmap}
                    mappedKnobs={mappedKnobs}
                    onMapDragStart={onMapDragStart}
                    onMapDragEnd={onMapDragEnd}
                  />
                );
              })}
            </div>
          )}
        </div>

        <div
          className={styles.KnobPanel}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            top: knobRowExpanded ? 0 : "auto",
            zIndex: knobRowExpanded ? 999 : 10,
            height: knobRowExpanded ? "auto" : KNOB_STRIP_H,
            overflow: "hidden",
          }}
        >
          <KnobRow
            knobs={bottomKnobs}
            busId={bottomBusId}
            knobMapByBusId={knobMapByBusId}
            mappingArmed={mappingArmed}
            onDropMap={onDropMapToKnob}
            mapDragActive={!!dragMappingParam}
            onExpandedChange={setKnobRowExpanded}
          />
        </div>
      </div>
    </div>
  );
}
