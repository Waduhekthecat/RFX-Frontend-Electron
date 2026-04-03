import React from "react";
import { clamp01, clamp, trackVolNormToDb, formatVolDb, makeGestureId } from "../../../../core/DomainHelpers";
import { Slider } from "../../../../components/controls/sliders/_index";
import { useRfxStore } from "../../../../core/rfx/Store";
import {
  getRenderedValue,
  makeTrackVolumeKey,
  makeTrackPanKey,
} from "../../../../core/rfx/Continuous";
import {
  useDoubleTap,
  useScrubValue,
  Surface,
} from "../../../../components/ui/gestures/_index";

const DEFAULT_TRACK_VOL01 = 0.716;
const DEFAULT_TRACK_PAN01 = 0.5;

// Tune feel
const VOL_SENSITIVITY = 0.0035;
const PAN_SENSITIVITY = 0.006;

function panTextFrom01(pan01) {
  const p = clamp01(pan01) * 2 - 1;
  if (Math.abs(p) < 0.01) return "C";
  return p < 0
    ? `L${Math.round(Math.abs(p) * 100)}`
    : `R${Math.round(p * 100)}`;
}

function selectTrackVolDb(s, trackGuid) {
  const tm = s?.snapshot?.trackMix?.[trackGuid];
  const tr = s?.entities?.tracksByGuid?.[trackGuid];
  const db = tm?.volDb ?? tr?.volDb ?? 0.0;
  return Number.isFinite(Number(db)) ? Number(db) : 0.0;
}

function selectTrackVolTruth01(s, trackGuid) {
  const tm = s?.snapshot?.trackMix?.[trackGuid];
  const tr = s?.entities?.tracksByGuid?.[trackGuid];

  const vol =
    tm?.vol ??
    tm?.volume ??
    tr?.vol ??
    tr?.volume ??
    DEFAULT_TRACK_VOL01;

  return clamp01(vol);
}

function selectTrackPanTruth01(s, trackGuid) {
  const tm = s?.snapshot?.trackMix?.[trackGuid];
  const tr = s?.entities?.tracksByGuid?.[trackGuid];

  const panSigned = tm?.pan ?? tr?.pan ?? 0;
  const p = clamp(Number(panSigned), -1, 1);
  return (p + 1) / 2;
}

export function TrackMixControls({ trackGuid }) {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);

  const renderedVol01 = useRfxStore(
    React.useCallback((s) => {
      const key = makeTrackVolumeKey(trackGuid);
      const truth = selectTrackVolTruth01(s, trackGuid);
      return getRenderedValue(s.continuous, key, truth);
    }, [trackGuid])
  );

  const renderedPan01 = useRfxStore(
    React.useCallback((s) => {
      const key = makeTrackPanKey(trackGuid);
      const truth = selectTrackPanTruth01(s, trackGuid);
      return getRenderedValue(s.continuous, key, truth);
    }, [trackGuid])
  );

  const truthVolDb = useRfxStore(
    React.useCallback((s) => selectTrackVolDb(s, trackGuid), [trackGuid])
  );

  const isDraggingVolRef = React.useRef(false);
  const isDraggingPanRef = React.useRef(false);
  const volGestureIdRef = React.useRef(null);
  const panGestureIdRef = React.useRef(null);

  const [liveVol01, setLiveVol01] = React.useState(renderedVol01);
  const [livePan01, setLivePan01] = React.useState(renderedPan01);

  const liveVolDb = React.useMemo(() => trackVolNormToDb(liveVol01), [liveVol01]);
  void truthVolDb;

  React.useEffect(() => {
    if (isDraggingVolRef.current) return;
    setLiveVol01(renderedVol01);
  }, [renderedVol01, trackGuid]);

  React.useEffect(() => {
    if (isDraggingPanRef.current) return;
    setLivePan01(renderedPan01);
  }, [renderedPan01, trackGuid]);

  function endVolGesture(finalValue01) {
    if (!isDraggingVolRef.current) return;

    isDraggingVolRef.current = false;

    const gestureId = volGestureIdRef.current || makeGestureId("trackVol");

    dispatchIntent({
      name: "setTrackVolume",
      trackGuid,
      value: clamp01(finalValue01),
      phase: "commit",
      gestureId,
    });

    volGestureIdRef.current = null;
  }

  function endPanGesture(finalValue01) {
    if (!isDraggingPanRef.current) return;

    isDraggingPanRef.current = false;

    const gestureId = panGestureIdRef.current || makeGestureId("trackPan");

    dispatchIntent({
      name: "setTrackPan",
      trackGuid,
      value: clamp01(finalValue01), // 0..1 ONLY
      phase: "commit",
      gestureId,
    });

    panGestureIdRef.current = null;
  }

  const resetTrackVol = React.useCallback(() => {
    const next = DEFAULT_TRACK_VOL01;
    setLiveVol01(next);

    const gestureId = makeGestureId("trackVolReset");
    dispatchIntent({
      name: "setTrackVolume",
      trackGuid,
      value: next,
      phase: "commit",
      gestureId,
    });
  }, [dispatchIntent, trackGuid]);

  const resetTrackPan = React.useCallback(() => {
    const next = DEFAULT_TRACK_PAN01;
    setLivePan01(next);

    const gestureId = makeGestureId("trackPanReset");
    dispatchIntent({
      name: "setTrackPan",
      trackGuid,
      value: next, // 0..1 ONLY
      phase: "commit",
      gestureId,
    });
  }, [dispatchIntent, trackGuid]);

  const dblVol = useDoubleTap(resetTrackVol);
  const dblPan = useDoubleTap(resetTrackPan);

  const volScrub = useScrubValue({
    value: liveVol01,
    accel: { enabled: true, exponent: 1.7, accel: 0.02 },
    min: 0,
    max: 1,
    sensitivity: VOL_SENSITIVITY,
    onChange: (next) => {
      const clamped = clamp01(next);

      if (!isDraggingVolRef.current) {
        isDraggingVolRef.current = true;
        volGestureIdRef.current = makeGestureId("trackVol");
      }

      setLiveVol01(clamped);

      dispatchIntent({
        name: "setTrackVolume",
        trackGuid,
        value: clamped,
        phase: "preview",
        gestureId: volGestureIdRef.current,
      });
    },
    onEnd: ({ value }) => endVolGesture(value),
  });

  const panScrub = useScrubValue({
    value: livePan01,
    accel: { enabled: true, exponent: 1.4, accel: 0.01 },
    min: 0,
    max: 1,
    sensitivity: PAN_SENSITIVITY,
    onChange: (next) => {
      const clamped = clamp01(next);

      if (!isDraggingPanRef.current) {
        isDraggingPanRef.current = true;
        panGestureIdRef.current = makeGestureId("trackPan");
      }

      setLivePan01(clamped);

      dispatchIntent({
        name: "setTrackPan",
        trackGuid,
        value: clamped, // 0..1 ONLY
        phase: "preview",
        gestureId: panGestureIdRef.current,
      });
    },
    onEnd: ({ value }) => endPanGesture(value),
  });

  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <Surface gestures={[volScrub, dblVol]} className="flex-1 min-w-0">
        <Slider
          label="VOL"
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

      <Surface gestures={[panScrub, dblPan]} className="flex-1 min-w-0">
        <Slider
          label="PAN"
          min={0}
          max={1}
          step={0.01}
          value={livePan01}
          valueText={panTextFrom01(livePan01)}
          widthClass=""
          valueWidthClass="w-[30px]"
          onChange={() => {}}
        />
      </Surface>
    </div>
  );
}