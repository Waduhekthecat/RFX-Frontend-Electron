import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { getMidiRuntime } from "../../../core/midi/MidiInitialize";
import { RFX_MODES } from "../../../core/modes/Modes";
import {
  DEFAULT_LOOPER_STATE,
  DEFAULT_LOOPER_TYPE,
  DEFAULT_SESSION_CLICK_ENABLED,
  DEFAULT_SESSION_COUNT_IN_ENABLED,
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
const LOOP_PREVIEW_TICK_MS = 33;
const TAP_TEMPO_FLASH_MS = 180;
const TAP_TEMPO_RESET_MS = 2000;
const MAX_TAP_TEMPO_TIMES = 4;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;

const LOOPER_GESTURES = Object.freeze({
  FS_A_LONG: "FS_A_LONG",
  FS_C_LONG: "FS_C_LONG",
  FS_D_LONG: "FS_D_LONG",
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

const LOOPER_DEBUG_BADGES = [
  { cc: 11, control: MIDI_CONTROLS.FS_A, footswitch: "Tap FS_A", command: "Stop Playback", color: "green" },
  { cc: 12, control: MIDI_CONTROLS.FS_B, footswitch: "Hold FS_B", command: "Start Record", color: "green" },
  { cc: 13, control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Start Playback", color: "green" },
  { cc: 14, control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Toggle Looper Type", color: "looperType" },
  { cc: 101, control: LOOPER_GESTURES.FS_A_LONG, footswitch: "Hold FS_A", command: "Delete Loop Audio", color: "green" },
  { cc: 102, control: MIDI_CONTROLS.FS_B_RELEASE, footswitch: "Release FS_B", command: "Stop Record / Start Playback", color: "red" },
  { cc: 103, control: LOOPER_GESTURES.FS_C_LONG, footswitch: "Hold FS_C", command: "Undo Last Record", color: "green" },
  { cc: 104, control: LOOPER_GESTURES.FS_D_LONG, footswitch: "Hold FS_D", command: "Exit Looper Mode", color: "orange" },
];

const MOMENTARY_CONTROLS = new Set([
  MIDI_CONTROLS.FS_A,
  LOOPER_GESTURES.FS_A_LONG,
  MIDI_CONTROLS.FS_B_RELEASE,
  MIDI_CONTROLS.FS_C,
  LOOPER_GESTURES.FS_C_LONG,
  MIDI_CONTROLS.FS_D,
  LOOPER_GESTURES.FS_D_LONG,
]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
const clampTempoBpm = (value) =>
  Math.max(MIN_TEMPO_BPM, Math.min(Math.round(Number(value)), MAX_TEMPO_BPM));
const midiValueToPlaybackMasterVolume = (value = 0) => clamp01(value / 127);
const formatPlaybackMasterVolume = (value01 = 0) => (clamp01(value01) * 10).toFixed(1);

function makeDebugLooperSnapshot({
  looper,
  selectedBusId,
  passIndex,
  history,
}) {
  const latestHistoryItem = history.at(-1) ?? null;

  return {
    mode: RFX_MODES.LOOPER,
    looperStatus: looper.status,
    passIndex,
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
  const navigate = useNavigate();

  const [activeControls, setActiveControls] = useState(() => new Set());
  const [playbackMasterVolume, setPlaybackMasterVolume] = useState(0);
  const [isExpressionActive, setIsExpressionActive] = useState(false);
  const [loopPositionMs, setLoopPositionMs] = useState(0);
  const [isTapTempoActive, setIsTapTempoActive] = useState(false);
  const [recordPassCount, setRecordPassCount] = useState(0);

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
  const selectedBusId = useRfxStore(
    (state) => state.perf?.activeBusId ?? state.session?.activeBusId ?? null
  );
  const updateLooper = useRfxStore((state) => state.updateLooper);
  const setLooperType = useRfxStore((state) => state.setLooperType);
  const setLooperClickEnabled = useRfxStore((state) => state.setLooperClickEnabled);
  const setLooperCountInEnabled = useRfxStore((state) => state.setLooperCountInEnabled);
  const setLooperTempoBpm = useRfxStore((state) => state.setLooperTempoBpm);

  const isRecording = looper.status === "recording";
  const isPlaying =
    looper.status === "playing" || looper.status === "overdubbing";
  const isOverdubbing = looper.status === "overdubbing";
  const hasRecordedLoop = looper.lengthMs > 0;

  const looperTypeIndex = Math.max(
    LOOPER_TYPES.findIndex((type) => type.id === looperType),
    0
  );
  const currentLooperType = LOOPER_TYPES[looperTypeIndex];

  const releaseTimersRef = useRef(new Map());
  const localPressStateRef = useRef(new Map());
  const expressionTimerRef = useRef(null);
  const tapTempoTimerRef = useRef(null);
  const tapTimesRef = useRef([]);
  const recordingStartRef = useRef(null);
  const playbackStartRef = useRef(null);
  const looperLengthMsRef = useRef(looper.lengthMs);
  const looperDebugStateRef = useRef(looper);
  const selectedBusIdRef = useRef(selectedBusId);
  const passIndexRef = useRef(0);
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
        if (recordPassCount <= 1) return badge;

        return {
          ...badge,
          command: "Undo Overdub",
        };
      }),
    [recordPassCount]
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
    [currentLooperType]
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
        passIndex: passIndexRef.current,
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
        passIndex: passIndexRef.current,
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

  const activateExpression = useCallback((value01) => {
    setPlaybackMasterVolume(clamp01(value01));
    setIsExpressionActive(true);

    if (expressionTimerRef.current) {
      window.clearTimeout(expressionTimerRef.current);
    }

    expressionTimerRef.current = window.setTimeout(() => {
      setIsExpressionActive(false);
      expressionTimerRef.current = null;
    }, EXPRESSION_IDLE_MS);
  }, []);

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
      logLooperSessionStage("[LOOPER BPM UPDATED]", {
        tapCount: nextTapTimes.length,
        averageIntervalMs,
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
  }, [logLooperSessionStage, setLooperTempoBpm]);

  const toggleClick = useCallback(() => {
    const nextClickEnabled = !clickEnabled;
    setLooperClickEnabled(nextClickEnabled);
    logLooperSessionStage("[LOOPER CLICK UPDATED]");
  }, [clickEnabled, logLooperSessionStage, setLooperClickEnabled]);

  const toggleCountIn = useCallback(() => {
    const nextCountInEnabled = !countInEnabled;
    setLooperCountInEnabled(nextCountInEnabled);
    logLooperSessionStage("[LOOPER COUNT-IN UPDATED]");
  }, [countInEnabled, logLooperSessionStage, setLooperCountInEnabled]);

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

      if (!badgesByControl.has(control)) return;
      if (value <= 0) return;

      if (control === MIDI_CONTROLS.FS_A) {
        playbackStartRef.current = null;
        updateLooperWithDebug("[LOOPER PLAYBACK STOP]", {
          status: "stopped",
        });
      }

      if (control === LOOPER_GESTURES.FS_A_LONG) {
        clearLoopPreview();
        passIndexRef.current = 0;
        historyRef.current = [];
        setRecordPassCount(0);
        updateLooperWithDebug("[LOOPER DELETE AUDIO]", {
          status: "idle",
          lengthMs: 0,
        });
      }

      if (control === MIDI_CONTROLS.FS_C) {
        if (hasRecordedLoop) {
          playbackStartRef.current = performance.now();
          setLoopPositionMs(0);
          updateLooperWithDebug("[LOOPER START PLAYBACK]", {
            status: "playing",
          });
        }
      }

      if (control === LOOPER_GESTURES.FS_C_LONG) {
        if (isOverdubbing) {
          updateLooperWithDebug("[LOOPER UNDO OVERDUB]", {
            status: "playing",
          });
        } else if (isRecording || hasRecordedLoop) {
          clearLoopPreview();
          passIndexRef.current = 0;
          historyRef.current = [];
          setRecordPassCount(0);
          updateLooperWithDebug("[LOOPER UNDO LAST RECORD]", {
            status: "idle",
            lengthMs: 0,
          });
        }
      }

      if (control === MIDI_CONTROLS.FS_D) {
        const nextLooperType =
          LOOPER_TYPES[(looperTypeIndex + 1) % LOOPER_TYPES.length];

        setLooperType(nextLooperType.id);
        logLooperSessionStage("[LOOPER TYPE UPDATED]", {
          looperType: nextLooperType.id,
        });
      }

      if (control === LOOPER_GESTURES.FS_D_LONG) {
        logLooperExitOnce();
        getMidiRuntime()?.modeManager?.setMode(RFX_MODES.PERFORM);
        navigate("/");
      }

      if (control === MIDI_CONTROLS.FS_B) {
        clearControlTimer(MIDI_CONTROLS.FS_B);
        setControlActive(MIDI_CONTROLS.FS_B, true);

        if (!hasRecordedLoop && !isRecording) {
          recordingStartRef.current = performance.now();
          playbackStartRef.current = null;
          setLoopPositionMs(0);
          updateLooperWithDebug("[LOOPER RECORD START]", {
            status: "recording",
            lengthMs: 0,
          });
        } else if (hasRecordedLoop) {
          playbackStartRef.current =
            playbackStartRef.current ?? performance.now();

          updateLooperWithDebug("[LOOPER OVERDUB START]", {
            status: "overdubbing",
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

          passIndexRef.current += 1;
          setRecordPassCount(passIndexRef.current);
          updateLooperWithDebug(
            "[LOOPER RECORD STOP]",
            {
              status: "playing",
              lengthMs: duration,
            },
            {
              passIndex: passIndexRef.current,
              action: "recordFirstLoop",
              lengthMs: duration,
            }
          );
          logLooperStage("[LOOPER START PLAYBACK]");
          logLooperStage("[REAPER ROUTING UPDATED]");
        } else if (isOverdubbing) {
          passIndexRef.current += 1;
          setRecordPassCount(passIndexRef.current);
          updateLooperWithDebug(
            "[LOOPER OVERDUB STOP]",
            {
              status: "playing",
            },
            {
              passIndex: passIndexRef.current,
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

      if (flashMomentary && MOMENTARY_CONTROLS.has(control)) {
        flashControl(control);
      }
    },
    [
      activateExpression,
      badgesByControl,
      clearControlTimer,
      clearLoopPreview,
      flashControl,
      hasRecordedLoop,
      isOverdubbing,
      isRecording,
      logLooperExitOnce,
      logLooperStage,
      logLooperSessionStage,
      looperTypeIndex,
      navigate,
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
        control === MIDI_CONTROLS.FS_B_RELEASE
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
        handleLooperControl(MIDI_CONTROLS.FS_B_RELEASE, 127, { flashMomentary: true });
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
    const unsubscribe = getMidiRuntime()?.modeManager?.subscribe?.((event) => {
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
                  playbackMasterVolume={playbackMasterVolume}
                  formattedPlaybackMasterVolume={formatPlaybackMasterVolume(playbackMasterVolume)}
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
