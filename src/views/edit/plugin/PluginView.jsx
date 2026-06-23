import React from "react";
import { clamp01, canonicalTrackGuid } from "../../../core/DomainHelpers";
import { useParams, useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { styles, KNOB_STRIP_H } from "./_styles";
import { useIntent } from "../../../core/useIntent";
import { useRfxStore } from "../../../core/rfx/Store";
import { ParamCard } from "./components/ParamCard";
import { KnobRow } from "../../../components/controls/knobs/KnobRow";
import { createAutomationParameter } from "../../modes/automation/Builders";

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
  const automatableParameters = useRfxStore(
    (s) => s.automation?.automatableParameters || EMPTY_ARR
  );
  const addAutomatableParameter = useRfxStore(
    (s) => s.addAutomatableParameter
  );
  const removeAutomatableParameter = useRfxStore(
    (s) => s.removeAutomatableParameter
  );

  const fxParamsOverlayByGuid = useRfxStore(
    (s) => s.ops?.overlay?.fxParamsByGuid || EMPTY_OBJ
  );

  const fxParamsByGuidEntities = useRfxStore(
    (s) => s.entities?.fxParamsByGuid || EMPTY_OBJ
  );

  const fxParamsByGuidSnapshot = useRfxStore(
    (s) => s.snapshot?.fxParamsByGuid || EMPTY_OBJ
  );

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
  const trackName = useRfxStore(
    (s) => s.entities?.tracksByGuid?.[trackGuid]?.name || null
  );

  const [dragMappingParam, setDragMappingParam] = React.useState(null);
  const [mapDragGlowActive, setMapDragGlowActive] = React.useState(false);

  const [knobRowExpanded, setKnobRowExpanded] = React.useState(false);

  const bottomBusId = String(activeBusId || "NONE");

  const clearMapDragState = React.useCallback(() => {
    setMapDragGlowActive(false);
    setDragMappingParam(null);
  }, []);

  const onMapDragStart = React.useCallback((p) => {
    if (!p) return;

    const idx = Number(p.idx);
    if (!Number.isFinite(idx)) return;

    setDragMappingParam(p);
    setMapDragGlowActive(true);
  }, []);

  const onMapDragEnd = React.useCallback(() => {
    clearMapDragState();
  }, [clearMapDragState]);

  const onRootDragOver = React.useCallback(
    (e) => {
      if (!mapDragGlowActive && !dragMappingParam) return;

      e.preventDefault();

      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    },
    [mapDragGlowActive, dragMappingParam]
  );

  const onRootDrop = React.useCallback(
    (e) => {
      if (!mapDragGlowActive && !dragMappingParam) return;

      e.preventDefault();
      e.stopPropagation();

      clearMapDragState();
    },
    [mapDragGlowActive, dragMappingParam, clearMapDragState]
  );

  React.useEffect(() => {
    if (!dragMappingParam && !mapDragGlowActive) return;

    const clearDragState = () => {
      clearMapDragState();
    };

    window.addEventListener("drop", clearDragState, true);
    window.addEventListener("dragend", clearDragState, true);

    return () => {
      window.removeEventListener("drop", clearDragState, true);
      window.removeEventListener("dragend", clearDragState, true);
    };
  }, [dragMappingParam, mapDragGlowActive, clearMapDragState]);

  const onDropMapToKnob = React.useCallback(
    (knobId, payload) => {
      const busId = String(activeBusId || "");
      if (!busId || !knobId) return;

      setMapDragGlowActive(false);

      let idx = Number(dragMappingParam?.idx);

      if (!Number.isFinite(idx)) {
        const m = String(payload || "").match(/^map:([^:]+):(\d+)$/);
        if (!m) return;
        if (String(m[1]) !== String(fxGuid)) return;
        idx = Number(m[2]);
      }

      if (!Number.isFinite(idx)) return;

      const src =
        dragMappingParam ||
        params.find((x) => Number(x?.idx) === idx) ||
        null;
      const paramName = String(
        src?.uiLabel || src?.name || `Param ${idx}`
      );
      const isExpressionSlider = knobId === `${busId}_k7`;

      if (isExpressionSlider) {
        const expressionTargets = normalizeKnobTargets(
          knobMapByBusId?.[busId]?.[knobId]
        );
        const alreadyMapped = expressionTargets.some(
          (target) =>
            String(target?.trackGuid || "") === String(trackGuid) &&
            String(target?.fxGuid || "") === String(fxGuid) &&
            Number(target?.paramIdx) === idx
        );

        if (!alreadyMapped && expressionTargets.length >= 3) {
          setDragMappingParam(null);
          return;
        }
      }

      commitKnobMapping?.({
        busId,
        knobId,
        trackGuid,
        fxGuid,
        paramIdx: idx,
        paramName,
        fxName: pluginName,
        trackName,
        label: paramName,
        invert: false,
      });

      if (isExpressionSlider) {
        addAutomatableParameter?.(
          createAutomationParameter({
            trackGuid,
            trackName,
            fxGuid,
            fxName: pluginName,
            paramIndex: idx,
            paramName,
          })
        );
      }

      setDragMappingParam(null);
    },
    [
      activeBusId,
      dragMappingParam,
      fxGuid,
      params,
      commitKnobMapping,
      knobMapByBusId,
      addAutomatableParameter,
      trackGuid,
      trackName,
      pluginName,
    ]
  );

  const mappedKnobsByParamIdx = React.useMemo(() => {
    const busId = String(activeBusId || "");
    if (!busId) return EMPTY_OBJ;

    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;
    const out = {};

    for (const [knobId, rawTarget] of Object.entries(maps)) {
      const targets = normalizeKnobTargets(rawTarget);
      if (!targets.length) continue;

      const m = String(knobId).match(/_k(\d+)$/);
      const n = m ? Number(m[1]) : null;
      const label = n ? `K${n}` : knobId;

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

  const onUnmap = React.useCallback(
    (p) => {
      const busId = String(activeBusId || "");
      const idx = Number(p?.idx);

      if (!busId || !Number.isFinite(idx)) return;

      unmapParamFromBus?.({ busId, fxGuid, paramIdx: idx });
    },
    [activeBusId, unmapParamFromBus, fxGuid]
  );

  const onAutomate = React.useCallback(
    (p) => {
      const paramIndex = Number(p?.idx);
      if (!Number.isFinite(paramIndex)) return;

      const parameter = createAutomationParameter({
        trackGuid,
        trackName,
        fxGuid,
        fxName: pluginName,
        paramIndex,
        paramName: String(
          p?.uiLabel || p?.name || `Param ${paramIndex}`
        ),
      });
      const automated = automatableParameters.some(
        (entry) =>
          String(entry?.trackGuid || "") === String(trackGuid) &&
          String(entry?.fxGuid || "") === String(fxGuid) &&
          Number(entry?.paramIndex) === paramIndex
      );

      if (automated) {
        removeAutomatableParameter?.(parameter);
      } else {
        addAutomatableParameter?.(parameter);
      }
    },
    [
      addAutomatableParameter,
      removeAutomatableParameter,
      automatableParameters,
      trackGuid,
      trackName,
      fxGuid,
      pluginName,
    ]
  );

  const bottomKnobs = React.useMemo(() => {
    const busId = bottomBusId;
    const values = knobValuesByBusId?.[busId] || EMPTY_OBJ;
    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;

    return Array.from({ length: 7 }).map((_, i) => {
      const knobId = `${busId}_k${i + 1}`;
      const target = getPrimaryKnobTarget(maps[knobId]);

      const base01 = target
        ? Number.isFinite(values[knobId])
          ? values[knobId]
          : 0.5
        : 0.5;

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
    <div
      className={styles.Root}
      onDragOver={onRootDragOver}
      onDrop={onRootDrop}
    >
      <div className={styles.Column}>
        <Panel className={styles.panelHeader}>
          <div className={styles.Header}>
            <div className={styles.Title}>{pluginName}</div>

            <button
              type="button"
              onClick={() => nav("/edit")}
              className={styles.BackButton}
            >
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
                const automated = automatableParameters.some(
                  (entry) =>
                    String(entry?.trackGuid || "") === String(trackGuid) &&
                    String(entry?.fxGuid || "") === String(fxGuid) &&
                    Number(entry?.paramIndex) === idx
                );

                return (
                  <ParamCard
                    key={p.idx}
                    fxGuid={fxGuid}
                    p={p}
                    onChange01={onParamScrub}
                    onCommit01={onParamCommit}
                    onUnmap={onUnmap}
                    onAutomate={onAutomate}
                    automated={automated}
                    automationCapacityReached={
                      automatableParameters.length >= 5
                    }
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
            mapDragActive={mapDragGlowActive}
            onExpandedChange={setKnobRowExpanded}
          />
        </div>
      </div>
    </div>
  );
}
