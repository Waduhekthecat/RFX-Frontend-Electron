import React from "react";
import { clamp01 } from "../../../core/DomainHelpers";
import { Knob } from "./Knob";
import { styles } from "./_styles";
import { useRfxStore } from "../../../core/rfx/Store";
import { Panel } from "../../ui/Panel";
import { MapCard } from "../../ui/MapCard";

const EMPTY_OBJ = Object.freeze({});
const MAX_NUMBER_MAPPABLE = 3;
const COLLAPSED_H = 194;
const EXPANDED_H = 740;
function normalizeTargets(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
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

export function KnobRow({
  knobs,
  busId,
  knobMapByBusId = EMPTY_OBJ,
  mappingArmed,
  onDropMap,
  mapDragActive = false,
  onExpandedChange,
}) {
  const [expanded, setExpanded] = React.useState(false);
  const [expandedKnobId, setExpandedKnobId] = React.useState(null);

  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);
  const setKnobValueLocal = useRfxStore((s) => s.setKnobValueLocal);
  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);
  const unmapParamFromBus = useRfxStore((s) => s.unmapParamFromBus);
  const reorderKnobMappingTarget = useRfxStore((s) => s.reorderKnobMappingTarget);

  const fxParamsOverlayByGuid = useRfxStore((s) => s.ops?.overlay?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidEntities = useRfxStore((s) => s.entities?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidSnapshot = useRfxStore((s) => s.snapshot?.fxParamsByGuid || EMPTY_OBJ);

  const busKey = String(busId || "NONE");

  const mapForBus = React.useMemo(
    () => knobMapByBusId?.[busKey] || EMPTY_OBJ,
    [knobMapByBusId, busKey]
  );

  const fxParamSources = React.useMemo(
    () => ({
      overlayByGuid: fxParamsOverlayByGuid,
      snapshotByGuid: fxParamsByGuidSnapshot,
      entitiesByGuid: fxParamsByGuidEntities,
    }),
    [fxParamsOverlayByGuid, fxParamsByGuidSnapshot, fxParamsByGuidEntities]
  );

  const visibleKnobs = React.useMemo(() => (knobs || []).slice(0, 7), [knobs]);
  const interactiveKnobs = React.useMemo(() => visibleKnobs.slice(0, 6), [visibleKnobs]);

  const getTargetsForKnob = React.useCallback(
    (knobId) => normalizeTargets(mapForBus?.[knobId]),
    [mapForBus]
  );

  const mappedParamsForExpandedView = React.useMemo(() => {
    const out = [];

    // for (const [knobId, rawTarget] of Object.entries(mapForBus)) {
    const entries = expandedKnobId
      ? [[expandedKnobId, mapForBus?.[expandedKnobId]]]
      : Object.entries(mapForBus);

    for (const [knobId, rawTarget] of entries) {
      const targets = normalizeTargets(rawTarget);

      for (let i = 0; i < targets.length; i += 1) {
        const t = targets[i];
        if (!t?.fxGuid || !Number.isFinite(Number(t?.paramIdx))) continue;

        out.push({
          knobId,
          targetOrder: out.length,
          trackGuid: t.trackGuid,
          fxGuid: String(t.fxGuid),
          paramIdx: Number(t.paramIdx),
          paramName: String(t.paramName || `Param ${Number(t.paramIdx)}`),
          pluginName: String(t.fxName || "Plugin"),
          invert: t.invert === true,
          isPrimary: i === 0,
          targetIndex: i,
        });
      }
    }
    return out;
    // return out.sort((a, b) => a.paramName.localeCompare(b.paramName));
  // }, [mapForBus]);
    }, [mapForBus, expandedKnobId]);

  const [localValues, setLocalValues] = React.useState(() => ({}));
  const localValuesRef = React.useRef({});
  const activeLocalKnobsRef = React.useRef(new Set());
  const groupedGestureStateRef = React.useRef({});
  const [draggingRowIdx, setDraggingRowIdx] = React.useState(null);
  const dragStateRef = React.useRef({
    active: false,
    sourceRowIdx: null,
    sourceKnobId: "",
    sourceTargetIndex: -1,
    pointerId: null,
    startClientY: 0,
    currentClientY: 0,
    holdTimer: null,
    holdStarted: false,
    rowHeight: 0,
  });
  React.useEffect(() => {
    localValuesRef.current = localValues;
  }, [localValues]);

  React.useEffect(() => {
    setLocalValues((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const k of visibleKnobs) {
        const id = k.id;
        const propV = clamp01(k.value);

        if (!activeLocalKnobsRef.current.has(id)) {
          if (!Number.isFinite(next[id]) || Math.abs(next[id] - propV) > 0.0001) {
            next[id] = propV;
            changed = true;
          }
        } else if (!Number.isFinite(next[id])) {
          next[id] = propV;
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [visibleKnobs]);

  const onKnobChange = React.useCallback(
    (knobId, next01) => {
      if (expanded && expandedKnobId !== knobId) return;

      const v01 = clamp01(next01);

      const prevKnob = clamp01(
        Number.isFinite(localValuesRef.current?.[knobId])
          ? localValuesRef.current[knobId]
          : v01
      );

      activeLocalKnobsRef.current.add(knobId);

      setLocalValues((prev) => {
        const next = prev[knobId] === v01 ? prev : { ...prev, [knobId]: v01 };
        localValuesRef.current = next;
        return next;
      });

      setKnobValueLocal({ busId: busKey, knobId, value01: v01 });

      const targets = getTargetsForKnob(knobId);
      if (!targets.length) return;

      if (targets.length === 1) {
        const target = targets[0];
        if (!target?.fxGuid || !Number.isFinite(Number(target?.paramIdx))) return;

        dispatchIntent({
          name: "setParamValue",
          phase: "preview",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid: String(target.fxGuid),
          paramIdx: Number(target.paramIdx),
          value01: target?.invert === true ? clamp01(1 - v01) : v01,
        });

        return;
      }

      const requestedDelta = v01 - prevKnob;
      if (!Number.isFinite(requestedDelta) || Math.abs(requestedDelta) < 0.000001) return;

      const existing = groupedGestureStateRef.current?.[knobId] || {};
      const valuesByTargetKey = { ...(existing.valuesByTargetKey || {}) };
      const normalizedTargets = [];

      for (const target of targets) {
        if (!target?.fxGuid || !Number.isFinite(Number(target?.paramIdx))) continue;

        const fxGuid = String(target.fxGuid);
        const paramIdx = Number(target.paramIdx);
        const targetKey = `${String(target.trackGuid || "")}|${fxGuid}|${paramIdx}`;

        if (!Number.isFinite(valuesByTargetKey[targetKey])) {
          valuesByTargetKey[targetKey] = readFxParam01(fxParamSources, fxGuid, paramIdx, v01);
        }

        normalizedTargets.push({ ...target, fxGuid, paramIdx, targetKey });
      }

      if (!normalizedTargets.length) return;

      let minDelta = -1;
      let maxDelta = 1;

      for (const target of normalizedTargets) {
        const currentValue = clamp01(valuesByTargetKey[target.targetKey]);

        if (target?.invert === true) {
          minDelta = Math.max(minDelta, currentValue - 1);
          maxDelta = Math.min(maxDelta, currentValue);
        } else {
          minDelta = Math.max(minDelta, -currentValue);
          maxDelta = Math.min(maxDelta, 1 - currentValue);
        }
      }

      const appliedDelta = Math.max(minDelta, Math.min(maxDelta, requestedDelta));
      if (Math.abs(appliedDelta) < 0.000001) return;

      for (const target of normalizedTargets) {
        const signedDelta = target?.invert === true ? -appliedDelta : appliedDelta;
        const nextValue = clamp01(valuesByTargetKey[target.targetKey] + signedDelta);

        valuesByTargetKey[target.targetKey] = nextValue;

        dispatchIntent({
          name: "setParamValue",
          phase: "preview",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid: target.fxGuid,
          paramIdx: target.paramIdx,
          value01: nextValue,
        });
      }

      groupedGestureStateRef.current[knobId] = { valuesByTargetKey };
    },
    [busKey, dispatchIntent, expanded, expandedKnobId, getTargetsForKnob, setKnobValueLocal, fxParamSources]
  );

  const onKnobCommit = React.useCallback(
    (knobId) => {
      if (expanded && expandedKnobId !== knobId) return;

      activeLocalKnobsRef.current.delete(knobId);

      const targets = getTargetsForKnob(knobId);
      const grouped = groupedGestureStateRef.current?.[knobId] || null;
      const latestValue = clamp01(localValuesRef.current?.[knobId]);

      for (const target of targets) {
        if (!target?.fxGuid || !Number.isFinite(Number(target?.paramIdx))) continue;

        const fxGuid = String(target.fxGuid);
        const paramIdx = Number(target.paramIdx);
        const targetKey = `${String(target.trackGuid || "")}|${fxGuid}|${paramIdx}`;

        const commitValue = Number.isFinite(grouped?.valuesByTargetKey?.[targetKey])
          ? clamp01(grouped.valuesByTargetKey[targetKey])
          : target?.invert === true
            ? clamp01(1 - latestValue)
            : latestValue;

        dispatchIntent({
          name: "setParamValue",
          phase: "commit",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid,
          paramIdx,
          value01: commitValue,
        });
      }

      delete groupedGestureStateRef.current[knobId];
    },
    [busKey, dispatchIntent, expanded, expandedKnobId, getTargetsForKnob]
  );

  const onMappedParamChange = React.useCallback(
    (entry, next01) => {
      if (!entry?.fxGuid || !Number.isFinite(Number(entry?.paramIdx))) return;

      const value01 = clamp01(next01);
      const gestureId = `mapCard:${busKey}:${entry.fxGuid}:${entry.paramIdx}`;

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
    [dispatchIntent, busKey]
  );

  const onToggleMappedInvert = React.useCallback(
    (entry) => {
      console.log("toggle invert clicked", {
        entry,
        nextInvert: entry.invert !== true,
      });

      if (!entry?.knobId || !entry?.fxGuid || !Number.isFinite(Number(entry?.paramIdx))) {
        return;
      }

      commitKnobMapping?.({
        busId: busKey,
        knobId: entry.knobId,
        trackGuid: entry.trackGuid,
        fxGuid: entry.fxGuid,
        paramIdx: entry.paramIdx,
        paramName: entry.paramName,
        fxName: entry.pluginName,
        label: entry.paramName,
        invert: entry.invert !== true,
      });
    },
    [busKey, commitKnobMapping]
  );

  const onUnmapMappedParam = React.useCallback(
    (entry) => {
      if (!entry?.fxGuid || !Number.isFinite(Number(entry?.paramIdx))) return;

      unmapParamFromBus?.({
        busId: busKey,
        fxGuid: entry.fxGuid,
        paramIdx: entry.paramIdx,
      });
    },
    [busKey, unmapParamFromBus]
  );

  const cancelMapCardDrag = React.useCallback(() => {
    const d = dragStateRef.current;
    if (d.holdTimer) {
      clearTimeout(d.holdTimer);
      d.holdTimer = null;
    }
    dragStateRef.current = {
      active: false,
      sourceRowIdx: null,
      sourceKnobId: "",
      sourceTargetIndex: -1,
      pointerId: null,
      startClientY: 0,
      currentClientY: 0,
      holdTimer: null,
      holdStarted: false,
      rowHeight: 0,
    };
    setDraggingRowIdx(null);
  }, []);

  React.useEffect(() => () => cancelMapCardDrag(), [cancelMapCardDrag]);

  const startMapCardDrag = React.useCallback((evt, entry, rowIdx) => {
    if (!entry?.knobId || !Number.isInteger(entry?.targetIndex)) return;
    if (evt.button !== undefined && evt.button !== 0) return;

    cancelMapCardDrag();
    const rowHeight = Number(evt?.currentTarget?.getBoundingClientRect?.().height) || 0;
    const pointerId = Number.isFinite(evt.pointerId) ? evt.pointerId : null;

    dragStateRef.current = {
      active: false,
      sourceRowIdx: rowIdx,
      sourceKnobId: String(entry.knobId),
      sourceTargetIndex: Number(entry.targetIndex),
      pointerId,
      startClientY: Number(evt.clientY || 0),
      currentClientY: Number(evt.clientY || 0),
      holdTimer: null,
      holdStarted: true,
      rowHeight,
    };

    dragStateRef.current.holdTimer = setTimeout(() => {
      const d = dragStateRef.current;
      if (!d.holdStarted) return;
      d.active = true;
      setDraggingRowIdx(d.sourceRowIdx);
    }, 300);
  }, [cancelMapCardDrag]);

  const updateMapCardDrag = React.useCallback((evt) => {
    const d = dragStateRef.current;
    if (!d.holdStarted) return;
    if (d.pointerId !== null && evt.pointerId !== d.pointerId) return;
    d.currentClientY = Number(evt.clientY || d.currentClientY || 0);
    if (!d.active) return;

    const rowH = d.rowHeight > 0 ? d.rowHeight : 1;
    const deltaRows = Math.round((d.currentClientY - d.startClientY) / rowH);
    const clampedIdx = Math.max(0, Math.min(2, Number(d.sourceRowIdx) + deltaRows));
    if (clampedIdx !== draggingRowIdx) setDraggingRowIdx(clampedIdx);
  }, [draggingRowIdx]);

  const endMapCardDrag = React.useCallback(() => {
    const d = dragStateRef.current;
    const shouldCommit =
      d.active &&
      d.sourceKnobId &&
      Number.isInteger(d.sourceTargetIndex) &&
      Number.isInteger(draggingRowIdx) &&
      d.sourceRowIdx !== draggingRowIdx;

    if (shouldCommit) {
      reorderKnobMappingTarget?.({
        busId: busKey,
        knobId: d.sourceKnobId,
        fromIndex: d.sourceTargetIndex,
        toIndex: draggingRowIdx,
      });
    }
    cancelMapCardDrag();
  }, [busKey, cancelMapCardDrag, draggingRowIdx, reorderKnobMappingTarget]);


  const knobHasMappedTarget = React.useCallback(
    (knobId) => getTargetsForKnob(knobId).length > 0,
    [getTargetsForKnob]
  );

  const hasAnyMappedTargets = React.useMemo(
    () => interactiveKnobs.some((knob) => knobHasMappedTarget(knob.id)),
    [interactiveKnobs, knobHasMappedTarget]
  );

  const onKnobTap = React.useCallback(
    (knobId) => {
      // if (!mappingArmed) return;
      // commitKnobMapping({ busId: busKey, knobId });
      if (mappingArmed) {
        commitKnobMapping({ busId: busKey, knobId });
        return;
      }

      if (!expanded) return;
      if (!knobHasMappedTarget(knobId)) return;
      setExpandedKnobId(knobId);
    },
    // [mappingArmed, commitKnobMapping, busKey]
    [mappingArmed, commitKnobMapping, busKey, expanded, knobHasMappedTarget]
  );

  // const onKnobLongPressExpand = React.useCallback(() => {
  //   const onKnobLongPressExpand = React.useCallback((knobId) => {
  //   setExpandedKnobId(knobId);
  //   setExpanded((prev) => {
  //     if (prev) return prev;
  //     onExpandedChange?.(true);
  //     return true;
  //   });
  //   setExpandedKnobId(null);
  // }, [onExpandedChange]);

  const onKnobLongPressExpand = React.useCallback(
    (knobId) => {
      // if (expanded) return;
      setExpandedKnobId(knobId);
      setExpanded((prev) => {
        if (prev) return prev;
        onExpandedChange?.(true);
        return true;
      });
    },
    [onExpandedChange]
    // [expanded, onExpandedChange]
  );

  const canAcceptMapForKnob = React.useCallback(
    (knobId) => getTargetsForKnob(knobId).length < MAX_NUMBER_MAPPABLE,
    [getTargetsForKnob]
  );

  const renderValueFor = React.useCallback(
    (k) => clamp01(Number.isFinite(localValues[k.id]) ? localValues[k.id] : k.value),
    [localValues]
  );

  const collapseExpanded = React.useCallback(() => {
    setExpandedKnobId(null);
    setExpanded((prev) => {
      if (!prev) return prev;
      onExpandedChange?.(false);
      return false;
    });
  }, [onExpandedChange]);

  React.useEffect(() => {
    // if (expanded && !hasAnyMappedTargets) {
    if (!expanded) return;

    if (!hasAnyMappedTargets) {
      collapseExpanded();
      return;
    }

    if (!expandedKnobId || !knobHasMappedTarget(expandedKnobId)) {
      const firstMappedKnob = interactiveKnobs.find((knob) => knobHasMappedTarget(knob.id));
      if (firstMappedKnob && firstMappedKnob.id !== expandedKnobId) {
        setExpandedKnobId(firstMappedKnob.id);
      }
    }
  // }, [expanded, hasAnyMappedTargets, collapseExpanded]);
  }, [
    expanded,
    expandedKnobId,
    hasAnyMappedTargets,
    interactiveKnobs,
    knobHasMappedTarget,
    collapseExpanded,
  ]);

  const REVEAL_H = EXPANDED_H - COLLAPSED_H;

  return (
    <div
      style={{
        height: expanded ? EXPANDED_H : COLLAPSED_H,
        transition: "height 400ms ease",
        overflow: "hidden",
        minHeight: 0,
      }}
    >
      <Panel
        style={{
          height: "100%",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          position: "relative",
          background: `
          linear-gradient(
            180deg,
            rgba(255,255,255,0.08),
            rgba(255,255,255,0.02) 0%,
            rgba(0,0,0,0.45)
          ),
          repeating-linear-gradient(
            90deg,
            rgba(255,255,255,0.03) 0px,
            rgba(255,255,255,0.03) 1px,
            transparent 1px,
            transparent 3px
          ),
          #1a1a1a
        `,
          boxShadow: `
          inset 0 1px 0 rgba(255,255,255,0.20),
          inset 0 -8px 18px rgba(0,0,0,0.7),
          0 20px 40px rgba(0,0,0,0.6)
        `,
        }}
      >
        <div
          style={{
            height: expanded ? 196 : 520,
            transition: "height 1000ms ease",
            overflow: "hidden",
            flex: "0 0 auto",
          }}
        >
          <div
            style={{
              ...styles.rowGrid(6),
              height: "100%",
              background: "transparent",
              boxShadow: "none",
            }}
          >
            {interactiveKnobs.map((k) => (
              <Knob
                key={k.id}
                id={k.id}
                label={k.label}
                mapped={!!k.mapped}
                mappedLabel={k.mappedLabel || (k.mapped ? "Mapped" : "")}
                value={renderValueFor(k)}
                mappingArmed={!!mappingArmed}
                onTap={onKnobTap}
                onChange={(next) => onKnobChange(k.id, next)}
                onCommit={() => onKnobCommit(k.id)}
                onDropMap={onDropMap}
                mapDragActive={mapDragActive}
                canAcceptMap={canAcceptMapForKnob(k.id)}
                // onLongPress={onKnobLongPressExpand}
                onLongPress={() => onKnobLongPressExpand(k.id)}
                // interactive={mappingArmed || knobHasMappedTarget(k.id)}
                interactive={
                  mappingArmed ||
                  (knobHasMappedTarget(k.id) && (!expanded || expandedKnobId === k.id))
                }
                tapEnabled={expanded && expandedKnobId !== k.id && knobHasMappedTarget(k.id)}
                dimmed={expanded && expandedKnobId !== k.id}
                yOffset={expanded ? (expandedKnobId === k.id ? -5 : 5) : 0}
              />
            ))}

            {/* <button
              type="button"
              onClick={collapseExpanded}
              style={styles.expandToggleBtn}
              title="Collapse expanded knob row"
            >
              <span style={styles.expandToggleGlyph}>{expanded ? "▾" : ""}</span>
            </button> */}
          </div>
        </div>

        <div
          style={{
            flex: "0 0 auto",
            minHeight: 0,
            padding: expanded ? "16px 20px" : "0 20px",
            overflow: "hidden",
            height: expanded ? 600 : 0,
            opacity: expanded ? 1 : 0,
            transition: "height 1000ms ease, opacity 1000ms ease, padding 1000ms ease",
          }}
        >
          
          <div
            style={{
              height: "100%",
              display: "grid",
              gridTemplateRows: "repeat(3, minmax(0, 1fr)) 56px",
              gap: 12,
            }}
          >
            {Array.from({ length: 3 }).map((_, rowIdx) => {
              const entry = mappedParamsForExpandedView[rowIdx];

              return (
                <div key={`map-row-${rowIdx}`} style={{ minHeight: 0 }}>
                  {entry ? (
                    <MapCard
                      draggableActive={draggingRowIdx === rowIdx}
                      draggableGhost={draggingRowIdx !== null && draggingRowIdx !== rowIdx}
                      onDragHoldStart={(evt) => startMapCardDrag(evt, entry, rowIdx)}
                      onDragHoldMove={updateMapCardDrag}
                      onDragHoldEnd={endMapCardDrag}
                      paramName={entry.paramName}
                      pluginName={entry.pluginName}
                      value01={readFxParam01(
                        fxParamSources,
                        entry.fxGuid,
                        entry.paramIdx,
                        0.5
                      )}
                      invert={entry.invert === true}
                      onChange01={(next) => onMappedParamChange(entry, next)}
                      onToggleInvert={() => onToggleMappedInvert(entry)}
                      badgeLabel={entry.isPrimary ? "Primary" : ""}
                      onUnmap={() => onUnmapMappedParam(entry)}
                      onRange={() => console.log("range", entry)}
                      onExtra={() => console.log("extra", entry)}
                    />
                  ) : null}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
              <button
                type="button"
                onClick={collapseExpanded}
                style={styles.expandToggleBtn}
                title="Collapse expanded knob row"
              >
                <span style={styles.expandToggleGlyph}>{expanded ? "▾" : ""}</span>
              </button>
            </div>
          </div>
        </div>
      </Panel></div>
  );
}