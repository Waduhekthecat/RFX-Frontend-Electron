// edit/components/mixControls/BusMixControls.jsx
import React from "react";
import { Slider } from "../../../../components/controls/sliders/_index";
import { useRfxStore } from "../../../../core/rfx/RFXCore";
import { useIntentBuffered } from "../../../../core/useIntentBuffered";
import { useDoubleTap, Surface } from "../../../../components/ui/gestures/_index";

const DEFAULT_BUS_VOL01 = 0.8;

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// VM truth: snapshot.busMix[busId]
function selectBusVol01(s, busId) {
  const bm = s?.snapshot?.busMix?.[busId] || null;

  const vol01 =
    bm?.vol ??
    bm?.volume ??
    bm?.vol01 ??
    bm?.gain ??
    DEFAULT_BUS_VOL01;

  return clamp01(vol01);
}

/**
 * BusMixControls
 * - Truth-backed from snapshot.busMix
 * - Buffered sends (or uses provided intent)
 */
export function BusMixControls({ busId, intent }) {
  const buffered = useIntentBuffered({ intervalMs: 50 });

  const truthVol01 = useRfxStore(
    React.useCallback((s) => selectBusVol01(s, busId), [busId])
  );

  const isDraggingRef = React.useRef(false);
  const [liveVol01, setLiveVol01] = React.useState(truthVol01);

  React.useEffect(() => {
    if (isDraggingRef.current) return;
    setLiveVol01(truthVol01);
  }, [truthVol01, busId]);

  function endGesture() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    buffered.flush();
    // ✅ Do NOT snap to truth here.
  }

  const key = `${busId}:busVol`;

  // ✅ Double-tap reset (send + flush so it happens immediately)
  const resetBusVol = React.useCallback(() => {
    const next = DEFAULT_BUS_VOL01;
    setLiveVol01(next);

    const payload = { name: "setBusVolume", busId, value: next };

    if (typeof intent === "function") {
      intent(payload);
    } else {
      buffered.send(key, payload);
      buffered.flush();
    }
  }, [busId, buffered, intent, key]);

  const dblBus = useDoubleTap(resetBusVol);

  return (
    <div
      className="flex items-center gap-2"
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onPointerLeave={endGesture}
    >
      <Surface gesture={dblBus}>
        <Slider
          label="BUS"
          min={0}
          max={1}
          step={0.01}
          value={liveVol01}
          valueText={`${Math.round(liveVol01 * 100)}%`}
          widthClass="w-[160px]"
          onChange={(v) => {
            isDraggingRef.current = true;
            const next = clamp01(v);
            setLiveVol01(next);

            const payload = { name: "setBusVolume", busId, value: next };

            if (typeof intent === "function") intent(payload);
            else buffered.send(key, payload);
          }}
        />
      </Surface>
    </div>
  );
}