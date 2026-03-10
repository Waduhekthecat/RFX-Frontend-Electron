import React from "react";
import { Slider } from "../../../../components/controls/sliders/_index";
import { useRfxStore } from "../../../../core/rfx/Store";
import {
  getRenderedValue,
  makeTrackVolumeKey,
} from "../../../../core/rfx/Continuous";
import {
  useDoubleTap,
  useScrubValue,
  Surface,
} from "../../../../components/ui/gestures/_index";

const DEFAULT_BUS_VOL01 = 0.716;
const BUS_VOL_SENSITIVITY = 0.005;

const TRACK_VOL_POINTS = [
  { x: 0.0, y: -150.0 },
  { x: 0.1, y: -55.6 },
  { x: 0.2, y: -35.6 },
  { x: 0.3, y: -25.2 },
  { x: 0.4, y: -17.2 },
  { x: 0.5, y: -10.6 },
  { x: 0.6, y: -5.72 },
  { x: 0.7, y: -0.97 },
  { x: 0.716, y: 0.0 },
  { x: 0.8, y: 3.70 },
  { x: 0.9, y: 7.91 },
  { x: 1.0, y: 12.0 },
];

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function normBusId(id) {
  const s = String(id || "").trim().toUpperCase();
  if (!s) return "";

  if (s === "INPUT") return "INPUT";

  const m = s.match(/^FX_(\d+)([ABC])?$/);
  if (!m) return s;

  return `FX_${m[1]}`;
}

function formatVolDb(db) {
  const n = Number(db);
  if (!Number.isFinite(n)) return "-inf dB";
  if (n <= -149.5) return "-inf dB";

  const rounded = Math.round(n * 100) / 100;
  if (Math.abs(rounded) < 0.005) return "0.00 dB";
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)} dB`;
}

function trackVolNormToDb(norm01) {
  const x = clamp01(norm01);

  if (x <= TRACK_VOL_POINTS[0].x) return TRACK_VOL_POINTS[0].y;
  if (x >= TRACK_VOL_POINTS[TRACK_VOL_POINTS.length - 1].x) {
    return TRACK_VOL_POINTS[TRACK_VOL_POINTS.length - 1].y;
  }

  for (let i = 0; i < TRACK_VOL_POINTS.length - 1; i++) {
    const a = TRACK_VOL_POINTS[i];
    const b = TRACK_VOL_POINTS[i + 1];

    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x;
      if (span <= 0) return a.y;
      const t = (x - a.x) / span;
      return a.y + (b.y - a.y) * t;
    }
  }

  return 0;
}

function makeGestureId(prefix = "g") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function selectBusVolTruth01(s, busId) {
  const targetGuid = normBusId(busId);

  const tm = s?.snapshot?.trackMix?.[targetGuid];
  const tr = s?.entities?.tracksByGuid?.[targetGuid];
  const bm = s?.snapshot?.busMix?.[targetGuid];

  const vol =
    tm?.vol ??
    tm?.volume ??
    tr?.vol ??
    tr?.volume ??
    bm?.vol ??
    bm?.volume ??
    bm?.vol01 ??
    bm?.gain ??
    DEFAULT_BUS_VOL01;

  return clamp01(vol);
}

export function BusMixControls({ busId }) {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);
  const targetGuid = normBusId(busId);

  const renderedVol01 = useRfxStore(
    React.useCallback((s) => {
      const key = makeTrackVolumeKey(targetGuid);
      const truth = selectBusVolTruth01(s, targetGuid);
      return getRenderedValue(s.continuous, key, truth);
    }, [targetGuid])
  );

  const isDraggingRef = React.useRef(false);
  const gestureIdRef = React.useRef(null);

  const [liveVol01, setLiveVol01] = React.useState(renderedVol01);

  React.useEffect(() => {
    if (isDraggingRef.current) return;
    setLiveVol01(renderedVol01);
  }, [renderedVol01, targetGuid]);

  function endGesture(finalValue01) {
    if (!isDraggingRef.current) return;

    isDraggingRef.current = false;

    const gestureId = gestureIdRef.current || makeGestureId("busVol");

    dispatchIntent({
      name: "setTrackVolume",
      trackGuid: targetGuid,
      value: clamp01(finalValue01),
      phase: "commit",
      gestureId,
    });

    gestureIdRef.current = null;
  }

  const resetBusVol = React.useCallback(() => {
    const next = DEFAULT_BUS_VOL01;
    setLiveVol01(next);

    const gestureId = makeGestureId("busVolReset");
    dispatchIntent({
      name: "setTrackVolume",
      trackGuid: targetGuid,
      value: next,
      phase: "commit",
      gestureId,
    });
  }, [dispatchIntent, targetGuid]);

  const dblBus = useDoubleTap(resetBusVol);

  const busScrub = useScrubValue({
    value: liveVol01,
    accel: { enabled: true, exponent: 1.7, accel: 0.02 },
    min: 0,
    max: 1,
    sensitivity: BUS_VOL_SENSITIVITY,
    onChange: (next) => {
      const clamped = clamp01(next);

      if (!isDraggingRef.current) {
        isDraggingRef.current = true;
        gestureIdRef.current = makeGestureId("busVol");
      }

      setLiveVol01(clamped);

      dispatchIntent({
        name: "setTrackVolume",
        trackGuid: targetGuid,
        value: clamped,
        phase: "preview",
        gestureId: gestureIdRef.current,
      });
    },
    onEnd: ({ value }) => endGesture(value),
  });

  const liveVolDb = React.useMemo(() => trackVolNormToDb(liveVol01), [liveVol01]);

  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <Surface gestures={[busScrub, dblBus]} className="flex-1 min-w-0">
        <Slider
          label="BUS"
          min={0}
          max={1}
          step={0.01}
          value={liveVol01}
          valueText={formatVolDb(liveVolDb)}
          widthClass=""
          valueWidthClass="w-[50px]"
          onChange={() => {}}
        />
      </Surface>
    </div>
  );
}