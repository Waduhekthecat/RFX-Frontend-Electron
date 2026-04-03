import React from "react";
import { clamp01, normBusId, trackVolNormToDb, formatVolDb, makeGestureId } from "../../../../core/DomainHelpers";
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