import React from "react";
import { Slider } from "../../../../components/controls/sliders/_index";
import { useIntentBuffered } from "../../../../core/useIntentBuffered";
import { useRfxStore } from "../../../../core/rfx/Store";
import { useDoubleTap, Surface } from "../../../../components/ui/gestures/_index";

const DEFAULT_TRACK_VOL01 = 0.8;
const DEFAULT_TRACK_PAN01 = 0.5;

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}
function clamp(n, a, b) {
  const v = Number(n);
  if (!Number.isFinite(v)) return a;
  return Math.max(a, Math.min(b, v));
}
function panTextFrom01(pan01) {
  const p = pan01 * 2 - 1;
  if (Math.abs(p) < 0.01) return "C";
  return p < 0
    ? `L${Math.round(Math.abs(p) * 100)}`
    : `R${Math.round(p * 100)}`;
}

function selectTrackVol01(s, trackGuid) {
  const patch = s?.ops?.overlay?.track?.[trackGuid];
  const tm = s?.snapshot?.trackMix?.[trackGuid];
  const tr = s?.entities?.tracksByGuid?.[trackGuid];

  const vol =
    patch?.vol ??
    patch?.volume ??
    tm?.vol ??
    tm?.volume ??
    tr?.vol ??
    tr?.volume ??
    DEFAULT_TRACK_VOL01;

  return clamp01(vol);
}

function selectTrackPan01(s, trackGuid) {
  const patch = s?.ops?.overlay?.track?.[trackGuid];
  const tm = s?.snapshot?.trackMix?.[trackGuid];
  const tr = s?.entities?.tracksByGuid?.[trackGuid];

  // 1) If any explicit pan01 exists, use it directly (already 0..1)
  const pan01 = patch?.pan01 ?? tm?.pan01 ?? tr?.pan01;
  if (Number.isFinite(Number(pan01))) {
    return clamp01(pan01);
  }

  // 2) Otherwise treat `pan` as signed -1..1 (center=0)
  const panSigned = patch?.pan ?? tm?.pan ?? tr?.pan ?? 0;
  const p = clamp(Number(panSigned), -1, 1);
  return (p + 1) / 2;
}

export function TrackMixControls({ trackGuid }) {
  const { send, flush } = useIntentBuffered({ intervalMs: 50 });

  const truthVol01 = useRfxStore(
    React.useCallback((s) => selectTrackVol01(s, trackGuid), [trackGuid])
  );
  const truthPan01 = useRfxStore(
    React.useCallback((s) => selectTrackPan01(s, trackGuid), [trackGuid])
  );

  const isDraggingRef = React.useRef(false);
  const [liveVol01, setLiveVol01] = React.useState(truthVol01);
  const [livePan01, setLivePan01] = React.useState(truthPan01);

  React.useEffect(() => {
    if (isDraggingRef.current) return;
    setLiveVol01(truthVol01);
  }, [truthVol01, trackGuid]);

  React.useEffect(() => {
    if (isDraggingRef.current) return;
    setLivePan01(truthPan01);
  }, [truthPan01, trackGuid]);

  function endGesture() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    flush();
    // ✅ Do NOT snap to truth here (truth might be stale briefly)
  }

  const keyVol = `${trackGuid}:trackVol`;
  const keyPan = `${trackGuid}:trackPan`;

  // ✅ Double-tap reset handlers (send + immediate flush so it feels instant)
  const resetTrackVol = React.useCallback(() => {
    const next = DEFAULT_TRACK_VOL01;
    setLiveVol01(next);
    send(keyVol, { name: "setTrackVolume", trackGuid, value: next });
    flush();
  }, [flush, keyVol, send, trackGuid]);

  const resetTrackPan = React.useCallback(() => {
    const next = DEFAULT_TRACK_PAN01;
    setLivePan01(next);
    send(keyPan, { name: "setTrackPan", trackGuid, value: next * 2 - 1 });
    flush();
  }, [flush, keyPan, send, trackGuid]);

  // Hooks must be called inside the component ✅
  const dblVol = useDoubleTap(resetTrackVol);
  const dblPan = useDoubleTap(resetTrackPan);

  return (
    <div
      className="flex items-center gap-2"
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
    >
      <Surface gesture={dblVol}>
        <Slider
          label="VOL"
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
            send(keyVol, { name: "setTrackVolume", trackGuid, value: next });
          }}
        />
      </Surface>

      <Surface gesture={dblPan}>
        <Slider
          label="PAN"
          min={0}
          max={1}
          step={0.01}
          value={livePan01}
          valueText={panTextFrom01(livePan01)}
          widthClass="w-[160px]"
          onChange={(v) => {
            isDraggingRef.current = true;
            const next = clamp01(v);
            setLivePan01(next);
            send(keyPan, { name: "setTrackPan", trackGuid, value: next * 2 - 1 });
          }}
        />
      </Surface>
    </div>
  );
}