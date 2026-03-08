import React from "react";
import { Knob } from "./Knob";
import { styles } from "./_styles";
import { useIntentBuffered } from "../../../core/useIntentBuffered";
import { useRfxStore } from "../../../core/rfx/Store";

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// keep local ownership briefly after release so truth can catch up
const LOCAL_HOLD_MS = 120;

export function KnobRow({ knobs, busId, mappingArmed }) {
  const { send, flush } = useIntentBuffered({ intervalMs: 16 });

  const setKnobValueLocal = useRfxStore((s) => s.setKnobValueLocal);
  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);

  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || {});
  const busKey = String(busId || "NONE");
  const mapForBus = knobMapByBusId?.[busKey] || {};

  const visibleKnobs = React.useMemo(() => (knobs || []).slice(0, 7), [knobs]);

  const [localValues, setLocalValues] = React.useState(() => ({}));
  const activeLocalKnobsRef = React.useRef(new Set());
  const releaseTimersRef = React.useRef({});

  // ---------------------------
  // Local param overlay helpers
  // Shape expected by ParamCard:
  // s.ops.overlay.fxParamsByGuid[fxGuid][paramIdx] = { value01 }
  // ---------------------------
  const setFxParamOverlayLocal = React.useCallback((fxGuid, paramIdx, value01) => {
    useRfxStore.setState((s) => {
      const prevOps = s.ops || {};
      const prevOverlay = prevOps.overlay || {};
      const prevByGuid = prevOverlay.fxParamsByGuid || {};
      const prevForFx = prevByGuid[fxGuid] || {};
      const prevPatch = prevForFx[paramIdx] || {};

      return {
        ops: {
          ...prevOps,
          overlay: {
            ...prevOverlay,
            fxParamsByGuid: {
              ...prevByGuid,
              [fxGuid]: {
                ...prevForFx,
                [paramIdx]: {
                  ...prevPatch,
                  value01: clamp01(value01),
                },
              },
            },
          },
        },
      };
    });
  }, []);

  const clearFxParamOverlayLocal = React.useCallback((fxGuid, paramIdx) => {
    useRfxStore.setState((s) => {
      const prevOps = s.ops || {};
      const prevOverlay = prevOps.overlay || {};
      const prevByGuid = prevOverlay.fxParamsByGuid || {};
      const prevForFx = prevByGuid[fxGuid];

      if (!prevForFx || !prevForFx[paramIdx]) return s;

      const nextForFx = { ...prevForFx };
      delete nextForFx[paramIdx];

      const nextByGuid = { ...prevByGuid };
      if (Object.keys(nextForFx).length > 0) {
        nextByGuid[fxGuid] = nextForFx;
      } else {
        delete nextByGuid[fxGuid];
      }

      return {
        ops: {
          ...prevOps,
          overlay: {
            ...prevOverlay,
            fxParamsByGuid: nextByGuid,
          },
        },
      };
    });
  }, []);

  // keep local cache seeded from props when not locally controlled
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

  React.useEffect(() => {
    return () => {
      const timers = releaseTimersRef.current || {};
      for (const id of Object.keys(timers)) {
        window.clearTimeout(timers[id]);
      }
      releaseTimersRef.current = {};
    };
  }, []);

  const onKnobChange = React.useCallback(
    (knobId, next01) => {
      const v01 = clamp01(next01);

      if (releaseTimersRef.current[knobId]) {
        window.clearTimeout(releaseTimersRef.current[knobId]);
        delete releaseTimersRef.current[knobId];
      }

      activeLocalKnobsRef.current.add(knobId);

      // immediate local render for knob
      setLocalValues((prev) =>
        prev[knobId] === v01 ? prev : { ...prev, [knobId]: v01 }
      );

      // persist local knob value per bus
      setKnobValueLocal({ busId: busKey, knobId, value01: v01 });

      const target = mapForBus?.[knobId];
      if (target?.fxGuid && Number.isFinite(Number(target?.paramIdx))) {
        const fxGuid = String(target.fxGuid);
        const paramIdx = Number(target.paramIdx);

        // immediate local overlay for ParamCard slider
        setFxParamOverlayLocal(fxGuid, paramIdx, v01);

        // buffered truth commit
        const key = `${fxGuid}:param:${paramIdx}:knob:${knobId}`;
        send(key, {
          name: "setParamValue",
          trackGuid: target.trackGuid,
          fxGuid,
          paramIdx,
          value01: v01,
        });
      }
    },
    [busKey, mapForBus, send, setKnobValueLocal, setFxParamOverlayLocal]
  );

  const onKnobCommit = React.useCallback(
    (knobId) => {
      flush();

      if (releaseTimersRef.current[knobId]) {
        window.clearTimeout(releaseTimersRef.current[knobId]);
      }

      releaseTimersRef.current[knobId] = window.setTimeout(() => {
        activeLocalKnobsRef.current.delete(knobId);

        const target = mapForBus?.[knobId];
        if (target?.fxGuid && Number.isFinite(Number(target?.paramIdx))) {
          clearFxParamOverlayLocal(String(target.fxGuid), Number(target.paramIdx));
        }

        delete releaseTimersRef.current[knobId];
      }, LOCAL_HOLD_MS);
    },
    [flush, mapForBus, clearFxParamOverlayLocal]
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

      return clamp01(k.value);
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