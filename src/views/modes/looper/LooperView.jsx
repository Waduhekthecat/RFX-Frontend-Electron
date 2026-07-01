import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { trackVolDbToNorm } from "../../../core/DomainHelpers";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { modeManager } from "../../../core/modes/ModeManager";
import { RFX_MODES } from "../../../core/modes/Modes";
import {
  DEFAULT_LOOPER_STATE,
  DEFAULT_LOOPER_TYPE,
  DEFAULT_SESSION_CLICK_ENABLED,
  DEFAULT_SESSION_COUNT_IN_ENABLED,
  DEFAULT_SESSION_BEATS_PER_MEASURE,
  DEFAULT_SESSION_NOTE_LENGTH,
  DEFAULT_SESSION_TEMPO_BPM,
  useRfxStore,
} from "../../../core/rfx/Store";
import {
  LooperControlGrid,
  LooperExpressionPanel,
  LooperHeader,
  LooperTimeline,
} from "./components/_index";
import { CONTROL_COLORS, styles } from "./_styles";

const MOMENTARY_ACTIVE_MS = 350;
const LONG_PRESS_MS = 500;
const EXPRESSION_IDLE_MS = 250;
const EXPRESSION_COMMIT_IDLE_MS = 150;
const LOOP_PREVIEW_TICK_MS = 33;
const TAP_TEMPO_FLASH_MS = 180;
const TAP_TEMPO_RESET_MS = 2000;
const MAX_TAP_TEMPO_TIMES = 4;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const EMPTY_OBJ = Object.freeze({});
const LOOP_LENGTH_VALUES = [4, 8, 16, 32, 2];
const BEATS_PER_MEASURE_VALUES = [4, 6, 7, 8, 16, 2, 3];
const NOTE_LENGTH_VALUES = [4, 8, 16, 2];

const cycleValue = (values, currentValue) => {
  const currentIndex = values.indexOf(Number(currentValue));
  return values[(currentIndex + 1) % values.length];
};

const LOOPER_GESTURES = Object.freeze({
  FS_A_LONG: "FS_A_LONG",
  FS_C_LONG: "FS_C_LONG",
  FS_D_LONG: "FS_D_LONG",
  EXPR_TOUCH: "EXPR_TOUCH",
});

const LOOPER_TYPES = [
  {
    id: "post-fx",
    label: "Post-FX",
    classes: "border-fuchsia-300 bg-fuchsia-400/20 shadow-[0_0_18px_rgba(217,70,239,0.35)]",
    faintClasses: "border-fuchsia-300/25 bg-fuchsia-400/5 hover:border-fuchsia-300/45 hover:bg-fuchsia-400/15",
  },
  {
    id: "pre-fx",
    label: "Pre-FX",
    classes: "border-amber-300 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
    faintClasses: "border-amber-300/25 bg-amber-400/5 hover:border-amber-300/45 hover:bg-amber-400/15",
  },
];

const EXPRESSION_TYPES = [
  {
    id: "volume",
    label: "Volume",
    knobLabel: "Gain",
    faintClasses: CONTROL_COLORS.blueFaint,
    activeClasses: CONTROL_COLORS.blueActive,
  },
  {
    id: "destination",
    label: "Destination",
    knobLabel: "Value",
    faintClasses: CONTROL_COLORS.grayFaint,
    activeClasses: CONTROL_COLORS.whiteActive,
  },
];

const LOOPER_DEBUG_BADGES = [
  { cc: 11, control: MIDI_CONTROLS.FS_A, footswitch: "Tap FS_A", command: "Stop Playback", color: "green" },
  { cc: 12, control: MIDI_CONTROLS.FS_B, footswitch: "Hold FS_B", command: "Start Record", color: "green" },
  { cc: 13, control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Start Playback", color: "green" },
  { cc: 14, control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Toggle Looper Type", color: "looperType" },
  { cc: 101, control: LOOPER_GESTURES.FS_A_LONG, footswitch: "Hold FS_A", command: "Delete Loop Audio", color: "green" },
  { cc: null, control: LOOPER_GESTURES.EXPR_TOUCH, footswitch: "Touch", command: "Toggle EXPR Type", color: "expr" },
  { cc: 103, control: LOOPER_GESTURES.FS_C_LONG, footswitch: "Hold FS_C", command: "Undo Last Record", color: "green" },
  { cc: 104, control: LOOPER_GESTURES.FS_D_LONG, footswitch: "Hold FS_D", command: "Exit Looper Mode", color: "orange" },
];

const MOMENTARY_CONTROLS = new Set([
  MIDI_CONTROLS.FS_A,
  LOOPER_GESTURES.FS_A_LONG,
  MIDI_CONTROLS.FS_B_RELEASE,
  LOOPER_GESTURES.EXPR_TOUCH,
  MIDI_CONTROLS.FS_C,
  LOOPER_GESTURES.FS_C_LONG,
  MIDI_CONTROLS.FS_D,
  LOOPER_GESTURES.FS_D_LONG,
]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
const looperInputGain01ToDb = (value01 = 0) =>
  -12 + (12 * clamp01(value01));
const clampTempoBpm = (value) =>
  Math.max(MIN_TEMPO_BPM, Math.min(Math.round(Number(value)), MAX_TEMPO_BPM));
const midiValueToPlaybackMasterVolume = (value = 0) => clamp01(value / 127);
const formatPlaybackMasterVolume = (value01 = 0) =>
  (clamp01(value01) * 10).toFixed(1);
const formatDestinationExpressionValue = (value01 = 0) =>
  clamp01(value01).toFixed(2);
const normalizeTargets = (raw) => {
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
};

function makeDebugLooperSnapshot({
  looper,
  selectedBusId,
  history,
}) {
  const latestHistoryItem = history.at(-1) ?? null;

  return {
    mode: RFX_MODES.LOOPER,
    looperStatus: looper.status,
    recordCount: looper.recordCount ?? 0,
    activeLoopTrack: null,
    recordTargetTrack: null,
    playbackSourceTrack: null,
    selectedBusId,
    inputSources: selectedBusId ? [selectedBusId] : [],
    historyLength: history.length,
    latestHistoryItem,
  };
}

export function LooperView() {
  const [activeControls, setActiveControls] = useState(() => new Set());
  const [playbackMasterVolume, setPlaybackMasterVolume] = useState(1);
  const [destinationExpressionValue, setDestinationExpressionValue] = useState(0.5);
  const [expressionTypeId, setExpressionTypeId] = useState("volume");
  const [isExpressionActive, setIsExpressionActive] = useState(false);
  const [loopPositionMs, setLoopPositionMs] = useState(0);
  const [isTapTempoActive, setIsTapTempoActive] = useState(false);

  const looper = useRfxStore((state) => state.session?.looper ?? DEFAULT_LOOPER_STATE);
  const looperType = useRfxStore(
    (state) => state.session?.looperType ?? DEFAULT_LOOPER_TYPE
  );
  const tempoBpm = useRfxStore(
    (state) => state.session?.tempoBpm ?? DEFAULT_SESSION_TEMPO_BPM
  );
  const clickEnabled = useRfxStore(
    (state) => state.session?.clickEnabled ?? DEFAULT_SESSION_CLICK_ENABLED
  );
  const countInEnabled = useRfxStore(
    (state) => state.session?.countInEnabled ?? DEFAULT_SESSION_COUNT_IN_ENABLED
  );
  const beatsPerMeasure = useRfxStore(
    (state) =>
      state.session?.beatsPerMeasure ?? DEFAULT_SESSION_BEATS_PER_MEASURE
  );
  const noteLength = useRfxStore(
    (state) => state.session?.noteLength ?? DEFAULT_SESSION_NOTE_LENGTH
  );
  const selectedBusId = useRfxStore(
    (state) => state.perf?.activeBusId ?? state.session?.activeBusId ?? null
  );
  const lpPostSendIndex = useRfxStore((state) => {
    if (!selectedBusId) return null;

    const routeIds =
      state.entities?.routeIdsByTrackGuid?.[selectedBusId]?.sends ?? [];

    for (const routeId of routeIds) {
      const route = state.entities?.routesById?.[routeId];
      if (route?.destTrackGuid !== "LP_POST") continue;

      const sendIndex = Number(route.sendIndex);
      return Number.isFinite(sendIndex) ? sendIndex : null;
    }

    return null;
  });
  const transport = useRfxStore((state) => state.transport);
  const knobValuesByBusId = useRfxStore(
    (state) => state.perf?.knobValuesByBusId ?? EMPTY_OBJ
  );
  const knobMapByBusId = useRfxStore(
    (state) => state.perf?.knobMapByBusId ?? EMPTY_OBJ
  );
  const sliderBusVolumeMapByBusId = useRfxStore(
    (state) => state.perf?.sliderBusVolumeMapByBusId ?? EMPTY_OBJ
  );
  const dispatchIntent = useRfxStore((state) => state.dispatchIntent);
  const setKnobValueLocal = useRfxStore((state) => state.setKnobValueLocal);
  const updateLooper = useRfxStore((state) => state.updateLooper);
  const setLooperType = useRfxStore((state) => state.setLooperType);
  const setLooperClickEnabled = useRfxStore((state) => state.setLooperClickEnabled);
  const setLooperCountInEnabled = useRfxStore((state) => state.setLooperCountInEnabled);
  const setLooperTempoBpm = useRfxStore((state) => state.setLooperTempoBpm);
  const setLoopLengthEnabled = useRfxStore(
    (state) => state.setLoopLengthEnabled
  );
  const setLoopLength = useRfxStore((state) => state.setLoopLength);
  const setTimeSignature = useRfxStore((state) => state.setTimeSignature);

  const isRecording = looper.status === "recording";
  const isPlaying =
    looper.status === "playing" || looper.status === "overdubbing";
  const isOverdubbing = looper.status === "overdubbing";
  const hasRecordedLoop = looper.lengthMs > 0;
  const recordCount = looper.recordCount ?? 0;
  const isLoopLengthLocked = recordCount > 0 || isRecording || isOverdubbing;

  const looperTypeIndex = Math.max(
    LOOPER_TYPES.findIndex((type) => type.id === looperType),
    0
  );
  const currentLooperType = LOOPER_TYPES[looperTypeIndex];
  const expressionTypeIndex = Math.max(
    EXPRESSION_TYPES.findIndex((type) => type.id === expressionTypeId),
    0
  );
  const currentExpressionType = EXPRESSION_TYPES[expressionTypeIndex];
  const expressionKnobId = selectedBusId ? `${selectedBusId}_k7` : "";
  const expressionTargets = useMemo(
    () =>
      normalizeTargets(
        knobMapByBusId?.[selectedBusId]?.[expressionKnobId]
      ),
    [expressionKnobId, knobMapByBusId, selectedBusId]
  );
  const expressionBusVolumeTarget =
    sliderBusVolumeMapByBusId?.[selectedBusId] ?? "";

  const releaseTimersRef = useRef(new Map());
  const localPressStateRef = useRef(new Map());
  const expressionTimerRef = useRef(null);
  const expressionCommitTimerRef = useRef(null);
  const playbackMasterVolumeRef = useRef(playbackMasterVolume);
  const destinationExpressionValueRef = useRef(destinationExpressionValue);
  const tapTempoTimerRef = useRef(null);
  const tapTimesRef = useRef([]);
  const recordingStartRef = useRef(null);
  const playbackStartRef = useRef(null);
  const looperLengthMsRef = useRef(looper.lengthMs);
  const looperDebugStateRef = useRef(looper);
  const selectedBusIdRef = useRef(selectedBusId);
  const historyRef = useRef([]);
  const exitLoggedRef = useRef(false);

  const badgesByControl = useMemo(
    () => new Map(LOOPER_DEBUG_BADGES.map((badge) => [badge.control, badge])),
    []
  );

  const looperDebugBadges = useMemo(
    () =>
      LOOPER_DEBUG_BADGES.map((badge) => {
        if (badge.control !== LOOPER_GESTURES.FS_C_LONG) return badge;
        if (recordCount <= 1) return badge;

        return {
          ...badge,
          command: "Undo Overdub",
        };
      }),
    [recordCount]
  );

  const getBadgeClasses = useCallback(
    (badge) => {
      if (badge.color === "red") {
        return {
          inactiveClasses: CONTROL_COLORS.redFaint,
          activeClasses: CONTROL_COLORS.redActive,
        };
      }

      if (badge.color === "orange") {
        return {
          inactiveClasses: CONTROL_COLORS.orangeFaint,
          activeClasses: CONTROL_COLORS.orangeActive,
        };
      }

      if (badge.color === "expr") {
        return {
          inactiveClasses: currentExpressionType.faintClasses,
          activeClasses: currentExpressionType.activeClasses,
        };
      }

      if (badge.color === "looperType") {
        return {
          inactiveClasses: currentLooperType.faintClasses,
          activeClasses: currentLooperType.classes,
        };
      }

      return {
        inactiveClasses: CONTROL_COLORS.greenFaint,
        activeClasses: CONTROL_COLORS.greenActive,
      };
    },
    [currentExpressionType, currentLooperType]
  );

  useEffect(() => {
    looperLengthMsRef.current = looper.lengthMs;
  }, [looper.lengthMs]);

  useEffect(() => {
    looperDebugStateRef.current = looper;
  }, [looper]);

  useEffect(() => {
    selectedBusIdRef.current = selectedBusId;
  }, [selectedBusId]);

  useEffect(() => {
    if (
      expressionTypeId !== "volume" ||
      !selectedBusId ||
      !transport?.setLooperInputGain
    ) {
      return;
    }

    void transport
      .setLooperInputGain({
        busId: selectedBusId,
        value01: playbackMasterVolumeRef.current,
      })
      .catch((error) => {
        console.warn("[LOOPER] failed to initialize LP_POST send gain", error);
      });
  }, [expressionTypeId, selectedBusId, transport]);

  const logLooperStage = useCallback((stage, patch = null, historyItem = null) => {
    const currentLooper = looperDebugStateRef.current ?? DEFAULT_LOOPER_STATE;
    const nextLooper = patch ? { ...currentLooper, ...patch } : currentLooper;

    if (patch) {
      looperDebugStateRef.current = nextLooper;
    }

    if (historyItem) {
      historyRef.current = [...historyRef.current, historyItem];
    }

    console.log(
      stage,
      makeDebugLooperSnapshot({
        looper: nextLooper,
        selectedBusId: selectedBusIdRef.current,
        history: historyRef.current,
      })
    );
  }, []);

  const logLooperSessionStage = useCallback((stage, meta = {}) => {
    const session = useRfxStore.getState()?.session ?? {};

    console.log(stage, {
      ...makeDebugLooperSnapshot({
        looper: looperDebugStateRef.current ?? DEFAULT_LOOPER_STATE,
        selectedBusId: selectedBusIdRef.current,
        history: historyRef.current,
      }),
      tempoBpm: session.tempoBpm ?? DEFAULT_SESSION_TEMPO_BPM,
      clickEnabled: session.clickEnabled ?? DEFAULT_SESSION_CLICK_ENABLED,
      countInEnabled: session.countInEnabled ?? DEFAULT_SESSION_COUNT_IN_ENABLED,
      ...meta,
    });
  }, []);

  const updateLooperWithDebug = useCallback(
    (stage, patch, historyItem = null) => {
      updateLooper(patch);
      logLooperStage(stage, patch, historyItem);
    },
    [logLooperStage, updateLooper]
  );

  const dispatchLooperIntent = useCallback(
    (name, payload = null) => {
      void dispatchIntent(payload ? { name, ...payload } : { name });
    },
    [dispatchIntent]
  );

  const logLooperExitOnce = useCallback(() => {
    if (exitLoggedRef.current) return;

    exitLoggedRef.current = true;
    logLooperStage("[LOOPER EXIT LOOPER MODE]");
  }, [logLooperStage]);

  useEffect(() => {
    logLooperStage("[LOOPER INIT]");
    logLooperStage("[LOOPER ENTER MODE]");
  }, [logLooperStage]);

  useEffect(() => {
    logLooperStage("[LOOPER SELECT BUS]");
  }, [logLooperStage, selectedBusId]);

  useEffect(() => {
    if (!isRecording && !isPlaying) return undefined;

    const tick = () => {
      const now = performance.now();

      if (isRecording && recordingStartRef.current) {
        const elapsedMs = now - recordingStartRef.current;
        updateLooper({ lengthMs: elapsedMs });
        setLoopPositionMs(elapsedMs);
        return;
      }

      const playbackLengthMs = looperLengthMsRef.current;
      if (isPlaying && playbackStartRef.current && playbackLengthMs > 0) {
        setLoopPositionMs((now - playbackStartRef.current) % playbackLengthMs);
      }
    };

    tick();

    const interval = window.setInterval(tick, LOOP_PREVIEW_TICK_MS);

    return () => window.clearInterval(interval);
  }, [isPlaying, isRecording, updateLooper]);

  const clearControlTimer = useCallback((control) => {
    const timer = releaseTimersRef.current.get(control);
    if (!timer) return;

    window.clearTimeout(timer);
    releaseTimersRef.current.delete(control);
  }, []);

  const setControlActive = useCallback((control, active) => {
    setActiveControls((currentControls) => {
      const nextControls = new Set(currentControls);

      if (active) nextControls.add(control);
      else nextControls.delete(control);

      return nextControls;
    });
  }, []);

  const flashControl = useCallback(
    (control) => {
      clearControlTimer(control);
      setControlActive(control, true);

      const timer = window.setTimeout(() => {
        setControlActive(control, false);
        releaseTimersRef.current.delete(control);
      }, MOMENTARY_ACTIVE_MS);

      releaseTimersRef.current.set(control, timer);
    },
    [clearControlTimer, setControlActive]
  );

  const flashExpressionPanel = useCallback(() => {
    setIsExpressionActive(true);

    if (expressionTimerRef.current) {
      window.clearTimeout(expressionTimerRef.current);
    }

    expressionTimerRef.current = window.setTimeout(() => {
      setIsExpressionActive(false);
      expressionTimerRef.current = null;
    }, EXPRESSION_IDLE_MS);
  }, []);

  const dispatchDestinationExpression = useCallback(
    (value01, phase) => {
      if (!selectedBusId || !expressionKnobId) return;

      const normalized = clamp01(value01);
      const gestureId = `looperExpr:${selectedBusId}`;

      setKnobValueLocal({
        busId: selectedBusId,
        knobId: expressionKnobId,
        value01: normalized,
      });

      for (const target of expressionTargets) {
        if (!target?.fxGuid || !Number.isFinite(Number(target?.paramIdx))) {
          continue;
        }

        dispatchIntent({
          name: "setParamValue",
          phase,
          gestureId,
          trackGuid: target.trackGuid,
          fxGuid: String(target.fxGuid),
          paramIdx: Number(target.paramIdx),
          value01:
            target.invert === true
              ? clamp01(1 - normalized)
              : normalized,
        });
      }

      if (expressionBusVolumeTarget) {
        dispatchIntent({
          name: "setTrackVolume",
          phase,
          gestureId,
          trackGuid: expressionBusVolumeTarget,
          value: normalized,
        });
      }
    },
    [
      dispatchIntent,
      expressionBusVolumeTarget,
      expressionKnobId,
      expressionTargets,
      selectedBusId,
      setKnobValueLocal,
    ]
  );

  const activateExpression = useCallback(
    (value01) => {
      const normalized = clamp01(value01);

      if (expressionTypeId === "destination") {
        destinationExpressionValueRef.current = normalized;
        setDestinationExpressionValue(normalized);
        dispatchDestinationExpression(normalized, "preview");

        if (expressionCommitTimerRef.current) {
          window.clearTimeout(expressionCommitTimerRef.current);
        }

        expressionCommitTimerRef.current = window.setTimeout(() => {
          dispatchDestinationExpression(normalized, "commit");
          expressionCommitTimerRef.current = null;
        }, EXPRESSION_COMMIT_IDLE_MS);
      } else {
        playbackMasterVolumeRef.current = normalized;
        setPlaybackMasterVolume(normalized);

        if (
          transport?.osc?.sendTrackSendVolume &&
          selectedBusId &&
          Number.isFinite(lpPostSendIndex)
        ) {
          const gainDb = looperInputGain01ToDb(normalized);

          void transport.osc
            .sendTrackSendVolume(
              selectedBusId,
              lpPostSendIndex,
              trackVolDbToNorm(gainDb)
            )
            .catch((error) => {
              console.warn(
                "[LOOPER] failed to preview LP_POST send gain",
                error
              );
            });
        }

        if (transport?.setLooperInputGain && selectedBusId) {
          void transport
            .setLooperInputGain({
              busId: selectedBusId,
              value01: normalized,
            })
            .catch((error) => {
              console.warn("[LOOPER] failed to set LP_POST send gain", error);
            });
        }
      }

      flashExpressionPanel();
    },
    [
      dispatchDestinationExpression,
      expressionTypeId,
      flashExpressionPanel,
      lpPostSendIndex,
      selectedBusId,
      transport,
    ]
  );

  const handleTapTempo = useCallback(() => {
    const now = performance.now();
    const currentTapTimes = tapTimesRef.current;
    const lastTapTime = currentTapTimes.at(-1);
    const recentTapTimes =
      lastTapTime && now - lastTapTime <= TAP_TEMPO_RESET_MS
        ? currentTapTimes
        : [];
    const nextTapTimes = [...recentTapTimes, now].slice(-MAX_TAP_TEMPO_TIMES);
    tapTimesRef.current = nextTapTimes;

    if (nextTapTimes.length >= 2) {
      const intervals = nextTapTimes
        .slice(1)
        .map((tapTime, index) => tapTime - nextTapTimes[index]);
      const averageIntervalMs =
        intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
      const nextBpm = clampTempoBpm(60000 / averageIntervalMs);

      setLooperTempoBpm(nextBpm);
      dispatchLooperIntent("setTempo", { bpm: nextBpm });
      logLooperSessionStage("[LOOPER BPM UPDATED]", {
        tapCount: nextTapTimes.length,
        averageIntervalMs,
        bpm: nextBpm,
        backendIntent: "setTempo",
      });
    } else {
      console.log("[LOOPER TAP TEMPO]", {
        tapCount: nextTapTimes.length,
        waitingForNextTap: true,
      });
    }

    setIsTapTempoActive(true);

    if (tapTempoTimerRef.current) {
      window.clearTimeout(tapTempoTimerRef.current);
    }

    tapTempoTimerRef.current = window.setTimeout(() => {
      setIsTapTempoActive(false);
      tapTempoTimerRef.current = null;
    }, TAP_TEMPO_FLASH_MS);
  }, [dispatchLooperIntent, logLooperSessionStage, setLooperTempoBpm]);

  const toggleClick = useCallback(() => {
    const nextClickEnabled = !clickEnabled;
    setLooperClickEnabled(nextClickEnabled);
    dispatchLooperIntent("setClickEnabled", {
      enabled: nextClickEnabled,
    });
    logLooperSessionStage("[LOOPER CLICK UPDATED]", {
      clickEnabled: nextClickEnabled,
    });
  }, [
    clickEnabled,
    dispatchLooperIntent,
    logLooperSessionStage,
    setLooperClickEnabled,
  ]);

  const toggleCountIn = useCallback(() => {
    const nextCountInEnabled = !countInEnabled;
    setLooperCountInEnabled(nextCountInEnabled);
    dispatchLooperIntent("setCountInEnabled", {
      enabled: nextCountInEnabled,
    });
    logLooperSessionStage("[LOOPER COUNT-IN UPDATED]", {
      countInEnabled: nextCountInEnabled,
    });
  }, [
    countInEnabled,
    dispatchLooperIntent,
    logLooperSessionStage,
    setLooperCountInEnabled,
  ]);

  const toggleLoopLength = useCallback(() => {
    if (isLoopLengthLocked) return;
    const nextEnabled = !looper.loopLengthEnabled;
    setLoopLengthEnabled(nextEnabled);
    dispatchLooperIntent("setLoopLengthEnabled", { enabled: nextEnabled });
  }, [
    dispatchLooperIntent,
    isLoopLengthLocked,
    looper.loopLengthEnabled,
    setLoopLengthEnabled,
  ]);

  const cycleLoopLength = useCallback(() => {
    const nextLoopLength = cycleValue(
      LOOP_LENGTH_VALUES,
      looper.loopLength
    );
    setLoopLength(nextLoopLength);
    dispatchLooperIntent("setLoopLength", { bars: nextLoopLength });
  }, [dispatchLooperIntent, looper.loopLength, setLoopLength]);

  const updateTimeSignature = useCallback(
    (nextBeatsPerMeasure, nextNoteLength) => {
      setTimeSignature(nextBeatsPerMeasure, nextNoteLength);
      dispatchLooperIntent("setTimeSignature", {
        beatsPerMeasure: nextBeatsPerMeasure,
        noteLength: nextNoteLength,
      });
    },
    [dispatchLooperIntent, setTimeSignature]
  );

  const cycleBeatsPerMeasure = useCallback(() => {
    updateTimeSignature(
      cycleValue(BEATS_PER_MEASURE_VALUES, beatsPerMeasure),
      noteLength
    );
  }, [beatsPerMeasure, noteLength, updateTimeSignature]);

  const cycleNoteLength = useCallback(() => {
    updateTimeSignature(
      beatsPerMeasure,
      cycleValue(NOTE_LENGTH_VALUES, noteLength)
    );
  }, [beatsPerMeasure, noteLength, updateTimeSignature]);

  const clearLoopPreview = useCallback(() => {
    recordingStartRef.current = null;
    playbackStartRef.current = null;
    setLoopPositionMs(0);
  }, []);

  const handleLooperControl = useCallback(
    (control, value = 127, { flashMomentary = true } = {}) => {
      if (control === MIDI_CONTROLS.EXPR) {
        activateExpression(midiValueToPlaybackMasterVolume(value));
        return;
      }

      if (
        !badgesByControl.has(control) &&
        control !== MIDI_CONTROLS.FS_B_RELEASE
      ) {
        return;
      }
      if (value <= 0 && control !== MIDI_CONTROLS.FS_B_RELEASE) return;

      if (control === MIDI_CONTROLS.FS_A) {
        playbackStartRef.current = null;
        dispatchLooperIntent("stopLooperPlayback");
        updateLooperWithDebug("[LOOPER PLAYBACK STOP]", {
          status: "stopped",
        });
      }

      if (control === LOOPER_GESTURES.FS_A_LONG) {
        clearLoopPreview();
        historyRef.current = [];
        dispatchLooperIntent("clearLooper");
        dispatchLooperIntent("setLoopLengthEnabled", { enabled: false });
        // dispatchLooperIntent("setLoopLength", {
        //   bars: DEFAULT_LOOPER_STATE.loopLength,
        // });
        updateLooperWithDebug("[LOOPER DELETE AUDIO]", {
          status: "idle",
          lengthMs: 0,
          recordCount: 0,
          loopLengthEnabled: false,
          loopLength: DEFAULT_LOOPER_STATE.loopLength,
        });
      }

      if (control === MIDI_CONTROLS.FS_C) {
        if (hasRecordedLoop) {
          playbackStartRef.current = performance.now();
          setLoopPositionMs(0);
          dispatchLooperIntent("startLooperPlayback");
          updateLooperWithDebug("[LOOPER START PLAYBACK]", {
            status: "playing",
          });
        }
      }

      if (control === LOOPER_GESTURES.FS_C_LONG) {
        if (isOverdubbing) {
          dispatchLooperIntent("undoLooperOverdub");
          updateLooperWithDebug("[LOOPER UNDO OVERDUB]", {
            status: "playing",
            recordCount,
          });
        } else if (recordCount > 1) {
          dispatchLooperIntent("undoLooperOverdub");
          updateLooperWithDebug("[LOOPER UNDO OVERDUB]", {
            status: "playing",
            recordCount: recordCount - 1,
          });
        } else if (isRecording || hasRecordedLoop) {
          clearLoopPreview();
          historyRef.current = [];
          dispatchLooperIntent("undoLooperRecord");
          updateLooperWithDebug("[LOOPER UNDO LAST RECORD]", {
            status: "idle",
            lengthMs: 0,
            recordCount: 0,
          });
        }
      }

      if (control === MIDI_CONTROLS.FS_D) {
        const nextLooperType =
          LOOPER_TYPES[(looperTypeIndex + 1) % LOOPER_TYPES.length];

        clearLoopPreview();
        historyRef.current = [];

        updateLooperWithDebug("[LOOPER TYPE CLEAR LOCAL STATE]", {
          status: "idle",
          lengthMs: 0,
          recordCount: 0,
        });

        setLooperType(nextLooperType.id);

        dispatchLooperIntent("toggleLooperType", {
          looperType: nextLooperType.id,
        });

        logLooperSessionStage("[LOOPER TYPE UPDATED]", {
          looperType: nextLooperType.id,
        });
      }

      if (control === LOOPER_GESTURES.FS_D_LONG) {
        logLooperExitOnce();
        modeManager.setMode(RFX_MODES.PERFORM, { source: "ui" });
      }

      if (control === MIDI_CONTROLS.FS_B) {
        clearControlTimer(MIDI_CONTROLS.FS_B);
        setControlActive(MIDI_CONTROLS.FS_B, true);

        if (!hasRecordedLoop && !isRecording) {
          recordingStartRef.current = performance.now();
          playbackStartRef.current = null;
          setLoopPositionMs(0);
          dispatchLooperIntent("startLooperRecord", {
            recordCount,
            inputGain01: playbackMasterVolumeRef.current,
          });
          updateLooperWithDebug("[LOOPER RECORD START]", {
            status: "recording",
            lengthMs: 0,
            recordCount,
          });
        } else if (hasRecordedLoop && !isOverdubbing) {
          playbackStartRef.current =
            playbackStartRef.current ?? performance.now();

          dispatchLooperIntent("startLooperRecord", {
            recordCount,
            inputGain01: playbackMasterVolumeRef.current,
          });
          updateLooperWithDebug("[LOOPER OVERDUB START]", {
            status: "overdubbing",
            recordCount,
          });
        }

        return;
      }

      if (control === MIDI_CONTROLS.FS_B_RELEASE) {
        setControlActive(MIDI_CONTROLS.FS_B, false);

        if (isRecording && recordingStartRef.current) {
          const duration = Math.max(
            performance.now() - recordingStartRef.current,
            LOOP_PREVIEW_TICK_MS
          );

          recordingStartRef.current = null;
          playbackStartRef.current = performance.now();
          setLoopPositionMs(0);

          const nextRecordCount = recordCount + 1;
          dispatchLooperIntent("stopLooperRecord");
          updateLooperWithDebug(
            "[LOOPER RECORD STOP]",
            {
              status: "playing",
              lengthMs: duration,
              recordCount: nextRecordCount,
            },
            {
              recordCount: nextRecordCount,
              action: "recordFirstLoop",
              lengthMs: duration,
            }
          );
          logLooperStage("[LOOPER START PLAYBACK]");
          logLooperStage("[REAPER ROUTING UPDATED]");
        } else if (isOverdubbing) {
          const nextRecordCount = recordCount + 1;
          dispatchLooperIntent("stopLooperRecord");
          updateLooperWithDebug(
            "[LOOPER OVERDUB STOP]",
            {
              status: "playing",
              recordCount: nextRecordCount,
            },
            {
              recordCount: nextRecordCount,
              action: "overdub",
              lengthMs: looperLengthMsRef.current,
            }
          );
          logLooperStage("[LOOPER PLAYBACK START]");
          logLooperStage("[REAPER ROUTING UPDATED]");
        }

        if (flashMomentary) {
          flashControl(MIDI_CONTROLS.FS_B_RELEASE);
        }

        return;
      }

      if (control === LOOPER_GESTURES.EXPR_TOUCH) {
        if (
          expressionTypeId === "destination" &&
          expressionCommitTimerRef.current
        ) {
          window.clearTimeout(expressionCommitTimerRef.current);
          expressionCommitTimerRef.current = null;
          dispatchDestinationExpression(
            destinationExpressionValueRef.current,
            "commit"
          );
        }

        const nextExpressionType =
          EXPRESSION_TYPES[
          (expressionTypeIndex + 1) % EXPRESSION_TYPES.length
          ];

        if (nextExpressionType.id === "destination") {
          const nextDestinationValue = clamp01(
            knobValuesByBusId?.[selectedBusId]?.[expressionKnobId] ?? 0.5
          );
          destinationExpressionValueRef.current = nextDestinationValue;
          setDestinationExpressionValue(nextDestinationValue);
        }

        setExpressionTypeId(nextExpressionType.id);
        flashExpressionPanel();
        logLooperSessionStage("[LOOPER EXPR TYPE UPDATED]", {
          expressionType: nextExpressionType.id,
        });

        if (flashMomentary) {
          flashControl(LOOPER_GESTURES.EXPR_TOUCH);
        }

        return;
      }

      if (flashMomentary && MOMENTARY_CONTROLS.has(control)) {
        flashControl(control);
      }
    },
    [
      activateExpression,
      badgesByControl,
      clearControlTimer,
      clearLoopPreview,
      dispatchLooperIntent,
      dispatchDestinationExpression,
      expressionTypeId,
      flashControl,
      flashExpressionPanel,
      hasRecordedLoop,
      isOverdubbing,
      isRecording,
      logLooperExitOnce,
      logLooperStage,
      logLooperSessionStage,
      looperTypeIndex,
      expressionTypeIndex,
      expressionKnobId,
      knobValuesByBusId,
      recordCount,
      selectedBusId,
      setControlActive,
      setLooperType,
      updateLooperWithDebug,
    ]
  );

  const clearLocalPressState = useCallback((control) => {
    const state = localPressStateRef.current.get(control);
    if (!state) return null;

    if (state.timer) {
      window.clearTimeout(state.timer);
    }

    localPressStateRef.current.delete(control);
    return state;
  }, []);

  const pressLooperControl = useCallback(
    (control) => {
      if (control === MIDI_CONTROLS.FS_B) {
        handleLooperControl(control, 127, { flashMomentary: true });
        return;
      }

      if (
        control === LOOPER_GESTURES.FS_A_LONG ||
        control === LOOPER_GESTURES.FS_C_LONG ||
        control === LOOPER_GESTURES.FS_D_LONG ||
        control === LOOPER_GESTURES.EXPR_TOUCH
      ) {
        handleLooperControl(control, 127, { flashMomentary: true });
        return;
      }

      if (
        control !== MIDI_CONTROLS.FS_A &&
        control !== MIDI_CONTROLS.FS_C &&
        control !== MIDI_CONTROLS.FS_D
      ) {
        handleLooperControl(control, 127, { flashMomentary: true });
        return;
      }

      clearLocalPressState(control);
      setControlActive(control, true);

      const longControlByPhysicalControl = {
        [MIDI_CONTROLS.FS_A]: LOOPER_GESTURES.FS_A_LONG,
        [MIDI_CONTROLS.FS_C]: LOOPER_GESTURES.FS_C_LONG,
        [MIDI_CONTROLS.FS_D]: LOOPER_GESTURES.FS_D_LONG,
      };

      const longControl = longControlByPhysicalControl[control];
      const state = {
        longFired: false,
        timer: window.setTimeout(() => {
          const currentState = localPressStateRef.current.get(control);
          if (!currentState || currentState.longFired) return;

          currentState.longFired = true;
          handleLooperControl(longControl, 127, { flashMomentary: true });
        }, LONG_PRESS_MS),
      };

      localPressStateRef.current.set(control, state);
    },
    [clearLocalPressState, handleLooperControl, setControlActive]
  );

  const releaseLooperControl = useCallback(
    (control) => {
      if (control === MIDI_CONTROLS.FS_B) {
        handleLooperControl(MIDI_CONTROLS.FS_B_RELEASE, 127, {
          flashMomentary: true,
        });
        return;
      }

      if (
        control !== MIDI_CONTROLS.FS_A &&
        control !== MIDI_CONTROLS.FS_C &&
        control !== MIDI_CONTROLS.FS_D
      ) {
        return;
      }

      const state = clearLocalPressState(control);
      setControlActive(control, false);

      if (!state) return;

      if (state.longFired) {
        if (control === MIDI_CONTROLS.FS_A) {
          handleLooperControl(MIDI_CONTROLS.FS_A, 127, { flashMomentary: true });
        }

        return;
      }

      handleLooperControl(control, 127, { flashMomentary: true });
    },
    [clearLocalPressState, handleLooperControl, setControlActive]
  );

  const handleControlKeyDown = useCallback(
    (event, control) => {
      if (event.repeat) return;
      if (event.key !== " " && event.key !== "Enter") return;

      event.preventDefault();
      pressLooperControl(control);
    },
    [pressLooperControl]
  );

  const handleControlKeyUp = useCallback(
    (event, control) => {
      if (event.key !== " " && event.key !== "Enter") return;

      event.preventDefault();
      releaseLooperControl(control);
    },
    [releaseLooperControl]
  );

  useEffect(() => {
    const handler = (event) => {
      const { command, payload } = event.detail || {};

      if (command === "EXIT_LOOPER_MODE") {
        logLooperExitOnce();
        return;
      }

      if (command !== "LOOPER_DEBUG_MIDI_CONTROL") return;
      if (payload?.control == null) return;

      handleLooperControl(payload.control, payload.value);
    };

    window.addEventListener("rfx-midi-command", handler);

    return () => {
      window.removeEventListener("rfx-midi-command", handler);
    };
  }, [handleLooperControl, logLooperExitOnce]);

  useEffect(() => {
    const unsubscribe = modeManager.subscribe((event) => {
      if (
        event?.previousMode === RFX_MODES.LOOPER &&
        event?.currentMode !== RFX_MODES.LOOPER
      ) {
        logLooperExitOnce();
      }
    });

    return () => {
      unsubscribe?.();
    };
  }, [logLooperExitOnce]);

  useEffect(() => {
    const releaseTimers = releaseTimersRef.current;
    const localPressState = localPressStateRef.current;

    return () => {
      releaseTimers.forEach((timer) => window.clearTimeout(timer));
      releaseTimers.clear();

      localPressState.forEach((state) => window.clearTimeout(state.timer));
      localPressState.clear();

      if (expressionTimerRef.current) {
        window.clearTimeout(expressionTimerRef.current);
        expressionTimerRef.current = null;
      }

      if (expressionCommitTimerRef.current) {
        window.clearTimeout(expressionCommitTimerRef.current);
        expressionCommitTimerRef.current = null;
      }

      if (tapTempoTimerRef.current) {
        window.clearTimeout(tapTempoTimerRef.current);
        tapTempoTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div className={styles.Root}>
      <div className={styles.Column}>
        <LooperHeader looperType={currentLooperType} />

        <Panel className={styles.MainPanel}>
          <div className={styles.MainPanelInner}>
            <Inset className={styles.MainInset}>
              <div className={styles.LayoutGrid}>
                <div className={styles.TimelineSlot}>
                  <LooperTimeline
                    isRecording={isRecording}
                    isOverdubbing={isOverdubbing}
                    hasRecordedLoop={hasRecordedLoop}
                    isPlaying={isPlaying}
                    loopDurationMs={looper.lengthMs}
                    loopPositionMs={loopPositionMs}
                    tempoBpm={tempoBpm}
                    isTapTempoActive={isTapTempoActive}
                    onTapTempo={handleTapTempo}
                    isClickEnabled={clickEnabled}
                    onToggleClick={toggleClick}
                    isCountInEnabled={countInEnabled}
                    onToggleCountIn={toggleCountIn}
                    loopLengthEnabled={looper.loopLengthEnabled}
                    isLoopLengthLocked={isLoopLengthLocked}
                    loopLength={looper.loopLength}
                    onToggleLoopLength={toggleLoopLength}
                    onCycleLoopLength={cycleLoopLength}
                    beatsPerMeasure={beatsPerMeasure}
                    noteLength={noteLength}
                    onCycleBeatsPerMeasure={cycleBeatsPerMeasure}
                    onCycleNoteLength={cycleNoteLength}
                  />
                </div>

                <LooperControlGrid
                  badges={looperDebugBadges}
                  activeControls={activeControls}
                  getBadgeClasses={getBadgeClasses}
                  onPressControl={pressLooperControl}
                  onReleaseControl={releaseLooperControl}
                  onControlKeyDown={handleControlKeyDown}
                  onControlKeyUp={handleControlKeyUp}
                />

                <LooperExpressionPanel
                  active={isExpressionActive}
                  expressionType={currentExpressionType}
                  expressionValue={
                    expressionTypeId === "destination"
                      ? destinationExpressionValue
                      : playbackMasterVolume
                  }
                  formattedExpressionValue={
                    expressionTypeId === "destination"
                      ? formatDestinationExpressionValue(
                        destinationExpressionValue
                      )
                      : formatPlaybackMasterVolume(playbackMasterVolume)
                  }
                  onExpressionChange={activateExpression}
                />
              </div>
            </Inset>
          </div>
        </Panel>
      </div>
    </div>
  );
}
