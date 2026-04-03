import React from "react";
import { clamp01 } from "../../../core/DomainHelpers";
import { Knob } from "./Knob";
import { styles } from "./_styles";
import { useRfxStore } from "../../../core/rfx/Store";

export function KnobRow({ knobs, busId, mappingArmed }) {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);
  const setKnobValueLocal = useRfxStore((s) => s.setKnobValueLocal);
  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);

  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || {});
  const busKey = String(busId || "NONE");
  const mapForBus = knobMapByBusId?.[busKey] || {};

  const visibleKnobs = React.useMemo(() => (knobs || []).slice(0, 7), [knobs]);

  const [localValues, setLocalValues] = React.useState(() => ({}));
  const localValuesRef = React.useRef({});
  const activeLocalKnobsRef = React.useRef(new Set());

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

      activeLocalKnobsRef.current.add(knobId);

      // immediate local render for knob sprite
      setLocalValues((prev) => {
        const next = prev[knobId] === v01 ? prev : { ...prev, [knobId]: v01 };
        localValuesRef.current = next;
        return next;
      });

      // persist the knob's own value immediately
      setKnobValueLocal({ busId: busKey, knobId, value01: v01 });

      const target = mapForBus?.[knobId];
      if (target?.fxGuid && Number.isFinite(Number(target?.paramIdx))) {
        dispatchIntent({
          name: "setParamValue",
          phase: "preview",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid: String(target.fxGuid),
          paramIdx: Number(target.paramIdx),
          value01: v01,
        });
      }
    },
    [busKey, dispatchIntent, mapForBus, setKnobValueLocal]
  );

  const onKnobCommit = React.useCallback(
    (knobId) => {
      activeLocalKnobsRef.current.delete(knobId);

      const target = mapForBus?.[knobId];
      if (target?.fxGuid && Number.isFinite(Number(target?.paramIdx))) {
        const latestValue = clamp01(localValuesRef.current?.[knobId]);

        dispatchIntent({
          name: "setParamValue",
          phase: "commit",
          gestureId: `knob:${busKey}:${knobId}`,
          trackGuid: target.trackGuid,
          fxGuid: String(target.fxGuid),
          paramIdx: Number(target.paramIdx),
          value01: latestValue,
        });
      }
    },
    [busKey, dispatchIntent, mapForBus]
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
          />
        ))}
      </div>
    </div>
  );
}