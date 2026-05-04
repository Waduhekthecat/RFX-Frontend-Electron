import React from "react";
import { clamp01 } from "../../../core/DomainHelpers";
import { Knob } from "./Knob";
import { styles } from "./_styles";
import { useRfxStore } from "../../../core/rfx/Store";

const EMPTY_OBJ = Object.freeze({});

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

export function KnobRow({ knobs, busId, mappingArmed, onDropMap }) {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);
  const setKnobValueLocal = useRfxStore((s) => s.setKnobValueLocal);
  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);

  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || {});

  const fxParamsOverlayByGuid = useRfxStore((s) => s.ops?.overlay?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidEntities = useRfxStore((s) => s.entities?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidSnapshot = useRfxStore((s) => s.snapshot?.fxParamsByGuid || EMPTY_OBJ);

  const busKey = String(busId || "NONE");
  // const mapForBus = knobMapByBusId?.[busKey] || {};

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

  const getTargetsForKnob = React.useCallback(
    (knobId) => {
      const raw = mapForBus?.[knobId];
      if (!raw) return [];
      return Array.isArray(raw) ? raw : [raw];
    },
    [mapForBus]
  );

  const [localValues, setLocalValues] = React.useState(() => ({}));
  const localValuesRef = React.useRef({});
  const activeLocalKnobsRef = React.useRef(new Set());
  const groupedGestureStateRef = React.useRef({});

  // keep ref synced so commit can always read latest dragged value
  React.useEffect(() => {
    localValuesRef.current = localValues;
  }, [localValues]);

  // seed local cache from props whenever a knob is not actively being dragged
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
        } else {
          if (!Number.isFinite(next[id])) {
            next[id] = propV;
            changed = true;
          }
        }
      }

      return changed ? next : prev;
    });
  }, [visibleKnobs]);

  const onKnobChange = React.useCallback(
    (knobId, next01) => {
      const v01 = clamp01(next01);

      const prevKnob = clamp01(
        Number.isFinite(localValuesRef.current?.[knobId])
          ? localValuesRef.current[knobId]
          : v01
      );

      activeLocalKnobsRef.current.add(knobId);

      // immediate local render for knob sprite
      setLocalValues((prev) => {
        const next = prev[knobId] === v01 ? prev : { ...prev, [knobId]: v01 };
        localValuesRef.current = next;
        return next;
      });

      // persist the knob's own value immediately
      setKnobValueLocal({ busId: busKey, knobId, value01: v01 });
      const targets = getTargetsForKnob(knobId);
      if (!targets.length) return;

      if (targets.length === 1) {
        const target = targets[0];
        if (!target?.fxGuid || !Number.isFinite(Number(target?.paramIdx))) return;
        const value01 = target?.invert === true ? clamp01(1 - v01) : v01;
        dispatchIntent({
          name: "setParamValue",
          phase: "preview",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid: String(target.fxGuid),
          paramIdx: Number(target.paramIdx),
          value01,
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
          valuesByTargetKey[targetKey] = readFxParam01(
            fxParamSources,
            fxGuid,
            paramIdx,
            v01
          );
        }

        normalizedTargets.push({ ...target, fxGuid, paramIdx, targetKey });
      }

      if (!normalizedTargets.length) return;

      let minDelta = -1;
      let maxDelta = 1;

      for (const target of normalizedTargets) {
        const currentValue = clamp01(valuesByTargetKey[target.targetKey]);
        if (target?.invert === true) {
          // next = current - delta must stay in [0,1]
          minDelta = Math.max(minDelta, currentValue - 1);
          maxDelta = Math.min(maxDelta, currentValue);
        } else {
          // next = current + delta must stay in [0,1]
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
    [busKey, dispatchIntent, getTargetsForKnob, setKnobValueLocal, fxParamSources]
  );

  const onKnobCommit = React.useCallback(
    (knobId) => {
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
    [busKey, dispatchIntent, getTargetsForKnob]
  );

  const onKnobTap = React.useCallback(
    (knobId) => {
      if (!mappingArmed) return;
      commitKnobMapping({ busId: busKey, knobId });
    },
    [mappingArmed, commitKnobMapping, busKey]
  );

  const renderValueFor = React.useCallback(
    (k) => {
      const id = k.id;

      if (activeLocalKnobsRef.current.has(id)) {
        return clamp01(localValues[id]);
      }

      return clamp01(
        Number.isFinite(localValues[id]) ? localValues[id] : k.value
      );
    },
    [localValues]
  );

  return (
    <div style={styles.rowOuter}>
      <div style={styles.rowGrid(visibleKnobs.length)}>
        {visibleKnobs.map((k) => (
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
          />
        ))}
      </div>
    </div>
  );
}