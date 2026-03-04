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

// how long we "trust local drag" before allowing store-driven value to override
const LOCAL_HOLD_MS = 120;

export function KnobRow({ knobs, busId, mappingArmed }) {
  const { send, flush } = useIntentBuffered({ intervalMs: 16 });

  const setKnobValueLocal = useRfxStore((s) => s.setKnobValueLocal);
  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);

  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || {});
  const busKey = String(busId || "NONE");
  const mapForBus = knobMapByBusId?.[busKey] || {};

  const visibleKnobs = React.useMemo(() => (knobs || []).slice(0, 7), [knobs]);

  // ✅ local live values for smooth feel
  const [localValues, setLocalValues] = React.useState(() => ({}));
  const lastLocalTsRef = React.useRef({}); // { [knobId]: ms }

  // ✅ keep localValues in sync with props, BUT don't stomp user drag
  React.useEffect(() => {
    const now = Date.now();

    setLocalValues((prev) => {
      let changed = false;
      const next = { ...prev };

      for (const k of visibleKnobs) {
        const id = k.id;
        const propV = clamp01(k.value);
        const lastTs = lastLocalTsRef.current[id] || 0;

        // if user hasn't touched recently, sync local from prop
        if (now - lastTs > LOCAL_HOLD_MS) {
          if (!Number.isFinite(next[id]) || Math.abs(next[id] - propV) > 0.0001) {
            next[id] = propV;
            changed = true;
          }
        } else {
          // ensure key exists even if first render during drag window
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

      // 1) local live immediately (smooth)
      lastLocalTsRef.current[knobId] = Date.now();
      setLocalValues((prev) => (prev[knobId] === v01 ? prev : { ...prev, [knobId]: v01 }));

      // 2) persist local knob value per bus in store (for bus switching / persistence)
      setKnobValueLocal({ busId: busKey, knobId, value01: v01 });

      // 3) if mapped, send buffered setParamValue
      const target = mapForBus?.[knobId];
      if (target?.fxGuid && Number.isFinite(Number(target?.paramIdx))) {
        const key = `${target.fxGuid}:param:${Number(target.paramIdx)}:knob:${knobId}`;
        send(key, {
          name: "setParamValue",
          trackGuid: target.trackGuid,
          fxGuid: target.fxGuid,
          paramIdx: Number(target.paramIdx),
          value01: v01,
        });
      }
    },
    [busKey, mapForBus, send, setKnobValueLocal]
  );

  const onKnobCommit = React.useCallback(() => {
    flush();
  }, [flush]);

  const onKnobTap = React.useCallback(
    (knobId) => {
      if (!mappingArmed) return;
      commitKnobMapping({ busId: busKey, knobId });
    },
    [mappingArmed, commitKnobMapping, busKey]
  );

  // choose what to render for knob face: local while "recently touched", else prop
  const renderValueFor = React.useCallback(
    (k) => {
      const id = k.id;
      const now = Date.now();
      const lastTs = lastLocalTsRef.current[id] || 0;

      if (now - lastTs <= LOCAL_HOLD_MS) {
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
            value={renderValueFor(k)}          // ✅ smooth local while dragging
            mappingArmed={!!mappingArmed}
            onTap={onKnobTap}
            onChange={(next) => onKnobChange(k.id, next)}
            onCommit={onKnobCommit}
          />
        ))}
      </div>
    </div>
  );
}