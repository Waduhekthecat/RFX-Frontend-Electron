// edit/components/mixControls/BusMixControls.jsx
import React from "react";
import { Slider } from "../../../../components/controls/sliders/_index";
import { useRfxStore } from "../../../../core/rfx/RFXCore";
import { useIntentBuffered } from "../../../../core/useIntentBuffered";
import { useDoubleTap, useScrubValue, Surface } from "../../../../components/ui/gestures/_index";

const BUS_VOL_SENSITIVITY = 0.005; // tweak to taste
const BUS_VOL_ACCEL = { enabled: true, exponent: 1.7, accel: 0.02 }; // faster ramp for volume
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
 * - Scrub interaction (no tap-to-jump)
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
  }

  const key = `${busId}:busVol`;

  const sendBus = React.useCallback(
    (next) => {
      const payload = { name: "setBusVolume", busId, value: next };
      if (typeof intent === "function") intent(payload);
      else buffered.send(key, payload);
    },
    [busId, buffered, intent, key]
  );

  const resetBusVol = React.useCallback(() => {
    const next = DEFAULT_BUS_VOL01;
    setLiveVol01(next);
    sendBus(next);
    // make reset feel instant
    if (typeof intent !== "function") buffered.flush();
  }, [buffered, intent, sendBus]);

  const dblBus = useDoubleTap(resetBusVol);

  const busScrub = useScrubValue({
    value: liveVol01,
    min: 0,
    max: 1,
    sensitivity: BUS_VOL_SENSITIVITY,
    accel: BUS_VOL_ACCEL,
    onChange: (next) => {
      isDraggingRef.current = true;
      setLiveVol01(next);
      sendBus(next); // your helper that does intent(payload) or buffered.send(...)
    },
    onEnd: () => endGesture(),
  });

  return (
    <div className="flex items-center gap-2">
      <Surface gestures={[busScrub, dblBus]}>
        <Slider
          label="BUS"
          min={0}
          max={1}
          step={0.01}
          value={liveVol01}
          valueText={`${Math.round(liveVol01 * 100)}%`}
          widthClass="w-[160px]"
          onChange={() => { }}
        />
      </Surface>
    </div>
  );
}