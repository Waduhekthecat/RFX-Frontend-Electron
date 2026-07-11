import React from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { Knob } from "../../../components/controls/knobs/Knob";
import { modeManager } from "../../../core/modes/ModeManager";
import { RFX_MODES } from "../../../core/modes/Modes";
import {
  DEFAULT_LOOPER_STATE,
  DEFAULT_SESSION_BEATS_PER_MEASURE,
  DEFAULT_SESSION_CLICK_ENABLED,
  DEFAULT_SESSION_COUNT_IN_ENABLED,
  DEFAULT_SESSION_NOTE_LENGTH,
  DEFAULT_SESSION_TEMPO_BPM,
  useRfxStore,
} from "../../../core/rfx/Store";
import { AutomatableParameterCard } from "./components/AutomatableParameterCard";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;
const AUTOMATION_PREVIEW_TICK_MS = 33;
const TAP_TEMPO_FLASH_MS = 180;
const TAP_TEMPO_RESET_MS = 2000;
const MAX_TAP_TEMPO_TIMES = 4;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;
const LOOP_LENGTH_VALUES = [4, 8, 16, 32, 2];
const BEATS_PER_MEASURE_VALUES = [4, 6, 7, 8, 16, 2, 3];
const NOTE_LENGTH_VALUES = [4, 8, 16, 2];

const AUTOMATION_GESTURES = Object.freeze({
  FS_A_LONG: "FS_A_LONG",
  FS_C_LONG: "FS_C_LONG",
  FS_D_LONG: "FS_D_LONG",
});

const CONTROL_COLORS = {
  greenFaint: "border-emerald-300/25 bg-emerald-400/5 hover:border-emerald-300/45 hover:bg-emerald-400/15",
  greenActive: "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",

  redFaint: "border-red-300/25 bg-red-400/5 hover:border-red-300/45 hover:bg-red-400/15",
  redActive: "border-red-300 bg-red-400/25 shadow-[0_0_20px_rgba(248,113,113,0.45)]",

  orangeFaint: "border-orange-300/25 bg-orange-400/5 hover:border-orange-300/45 hover:bg-orange-400/15",
  orangeActive: "border-orange-300 bg-orange-400/25 shadow-[0_0_20px_rgba(251,146,60,0.45)]",

  blueFaint: "border-sky-300/25 bg-sky-400/5",
  blueActive: "border-sky-300 bg-sky-400/20 shadow-[0_0_18px_rgba(56,189,248,0.35)]",

  grayFaint: "border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10",
  amberActive: "border-amber-300/70 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  purpleActive: "border-purple-300/70 bg-purple-400/20 shadow-[0_0_18px_rgba(192,132,252,0.35)]",
};

const AUTOMATION_DEBUG_BADGES = [
  { control: MIDI_CONTROLS.FS_A, footswitch: "Tap FS_A", command: "Unassigned", color: "green" },
  { control: MIDI_CONTROLS.FS_B, footswitch: "Hold FS_B", command: "Start Record", color: "green" },
  { control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Unassigned", color: "green" },
  { control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Unassigned", color: "green" },
  { control: AUTOMATION_GESTURES.FS_A_LONG, footswitch: "Hold FS_A", command: "Clear Automation", color: "green" },
  { control: MIDI_CONTROLS.FS_B_RELEASE, footswitch: "Release FS_B", command: "Stop Record", color: "red" },
  { control: AUTOMATION_GESTURES.FS_C_LONG, footswitch: "Hold FS_C", command: "Exit Automation Mode", color: "orange" },
  { control: AUTOMATION_GESTURES.FS_D_LONG, footswitch: "Hold FS_D", command: "Unassigned", color: "green" },
];

const MOMENTARY_CONTROLS = new Set(AUTOMATION_DEBUG_BADGES.map((badge) => badge.control));
const DISABLED_AUTOMATION_BADGE_CONTROLS = new Set([
  AUTOMATION_GESTURES.FS_D_LONG,
]);
const EMPTY_OBJ = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
const clampTempoBpm = (value) =>
  Math.max(MIN_TEMPO_BPM, Math.min(Math.round(Number(value)), MAX_TEMPO_BPM));
const cycleValue = (values, currentValue) => {
  const currentIndex = values.indexOf(Number(currentValue));
  return values[(currentIndex + 1) % values.length];
};
const midiValueToAutomationValue = (value = 0) => clamp01(value / 127);
const formatAutomationValue = (value01 = 0) => `${Math.round(clamp01(value01) * 100)}%`;

function getKnobTargets(raw) {
  if (!raw) return [];
  return Array.isArray(raw) ? raw.filter(Boolean) : [raw];
}

function AutomationControlButton({ badge, active, inactiveClasses, activeClasses, onPointerDown, onPointerUp, onKeyDown, onKeyUp }) {
  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onPointerLeave={onPointerUp}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      aria-pressed={active}
      aria-label={`${badge.footswitch} ${badge.command}`}
      className={`rounded-xl border px-3 py-3 h-full min-h-[140px] text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${active ? activeClasses : inactiveClasses}`}
    >
      <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
        <span>{badge.footswitch}</span>
      </div>

      <div className="mt-3 text-sm font-semibold leading-snug text-white">
        {badge.command}
      </div>
    </button>
  );
}

function sameParameterTarget(parameter, target) {
  return (
    String(parameter?.trackGuid || "") === String(target?.trackGuid || "") &&
    String(parameter?.fxGuid || "") === String(target?.fxGuid || "") &&
    Number(parameter?.paramIndex ?? parameter?.paramIdx) ===
      Number(target?.paramIndex ?? target?.paramIdx)
  );
}

function AutomationWorkspace({
  parameters,
  armedParameters,
  onRemove,
  onToggleArmed,
}) {
  return (
    <div className="h-full min-h-[160px] rounded-xl border border-white/10 bg-black/20 p-4">
      {parameters.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
          {parameters.slice(0, 5).map((parameter) => (
            <AutomatableParameterCard
              key={`${parameter.trackGuid}:${parameter.fxGuid}:${parameter.paramIndex}`}
              parameter={parameter}
              onRemove={onRemove}
              onToggleArmed={onToggleArmed}
              armed={armedParameters.some((armedParameter) =>
                sameParameterTarget(parameter, armedParameter)
              )}
            />
          ))}
        </div>
      ) : (
        <div className="flex h-full min-h-[150px] items-center justify-center text-sm text-white/45">
          No automation parameters selected
        </div>
      )}
    </div>
  );
}

function AutomationSessionControls({
  tempoBpm,
  isTapTempoActive,
  onTapTempo,
  clickEnabled,
  onToggleClick,
  countInEnabled,
  onToggleCountIn,
  loopLengthEnabled,
  loopLength,
  onToggleLoopLength,
  onCycleLoopLength,
  beatsPerMeasure,
  noteLength,
  onCycleBeatsPerMeasure,
  onCycleNoteLength,
}) {
  return (
    <div className="flex min-h-[64px] items-center rounded-xl border border-white/10 bg-black/20 p-2">
      <div className="ml-4 shrink-0 text-[11px] uppercase tracking-[0.18em] text-white/50">
        Automation Workspace
      </div>

      <div className="flex flex-1 flex-wrap items-center justify-center gap-2">
        <div className={`flex h-[56px] w-[92px] items-center justify-center rounded-xl border px-3 py-2 text-sm font-semibold tabular-nums text-white/65 ${CONTROL_COLORS.grayFaint}`}>
          {tempoBpm} BPM
        </div>

        <button
          type="button"
          onClick={onTapTempo}
          className={`h-[56px] w-[92px] shrink-0 rounded-xl border px-5 py-2 text-base font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 ${isTapTempoActive ? CONTROL_COLORS.blueActive : CONTROL_COLORS.blueFaint}`}
        >
          TAP
        </button>

        <div className={`flex h-[56px] shrink-0 overflow-hidden rounded-xl border transition-all duration-150 ${clickEnabled ? "border-amber-300/45 bg-amber-400/5" : "border-white/10 bg-white/[0.03]"}`}>
          <button
            type="button"
            onClick={onToggleClick}
            aria-pressed={clickEnabled}
            className={`w-[92px] border-r border-white/10 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-amber-300/15 ${clickEnabled ? CONTROL_COLORS.amberActive : CONTROL_COLORS.grayFaint}`}
          >
            CLICK
          </button>
          <button
            type="button"
            onClick={onToggleCountIn}
            disabled={!clickEnabled}
            aria-disabled={!clickEnabled}
            aria-pressed={countInEnabled}
            className={`w-[128px] px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-purple-300/15 ${clickEnabled ? (countInEnabled ? CONTROL_COLORS.purpleActive : CONTROL_COLORS.grayFaint) : "cursor-not-allowed bg-white/[0.02] text-white/35"}`}
          >
            COUNT-IN
          </button>
        </div>

        <div className={`flex h-[56px] shrink-0 overflow-hidden rounded-xl border transition-all duration-150 ${loopLengthEnabled ? "border-emerald-300/45 bg-emerald-400/5" : "border-white/10 bg-white/[0.03]"}`}>
          <button
            type="button"
            onClick={onToggleLoopLength}
            aria-pressed={loopLengthEnabled}
            className={`w-[104px] border-r border-white/10 px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-emerald-300/15 ${loopLengthEnabled ? CONTROL_COLORS.greenActive : CONTROL_COLORS.grayFaint}`}
          >
            LENGTH
          </button>
          <button
            type="button"
            onClick={onCycleLoopLength}
            disabled={!loopLengthEnabled}
            aria-disabled={!loopLengthEnabled}
            className={`w-[92px] px-3 py-2 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:bg-emerald-300/15 ${loopLengthEnabled ? CONTROL_COLORS.greenFaint : "cursor-not-allowed bg-white/[0.02] text-white/35"}`}
          >
            {loopLength} BARS
          </button>
        </div>

        <div className="flex h-[56px] shrink-0 overflow-hidden rounded-xl border border-sky-300/25 bg-sky-400/5">
          <div className="flex w-[48px] items-center justify-center border-r border-white/10 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sky-100/60">
            Time
          </div>
          <button
            type="button"
            onClick={onCycleBeatsPerMeasure}
            aria-label={`Beats per measure: ${beatsPerMeasure}`}
            className="w-[54px] border-r border-white/10 text-xl font-semibold tabular-nums text-sky-100 transition-colors hover:bg-sky-300/10 focus:outline-none focus-visible:bg-sky-300/15"
          >
            {beatsPerMeasure}
          </button>
          <button
            type="button"
            onClick={onCycleNoteLength}
            aria-label={`Note length: ${noteLength}`}
            className="w-[54px] text-xl font-semibold tabular-nums text-sky-100 transition-colors hover:bg-sky-300/10 focus:outline-none focus-visible:bg-sky-300/15"
          >
            {noteLength}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AutomationView() {
  const [activeControls, setActiveControls] = React.useState(() => new Set());
  const [automationValue, setAutomationValue] = React.useState(0);
  const [isExpressionActive, setIsExpressionActive] = React.useState(false);
  const [isTapTempoActive, setIsTapTempoActive] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [automationDurationMs, setAutomationDurationMs] = React.useState(0);
  const [, setAutomationPositionMs] = React.useState(0);

  const activeBusId = useRfxStore((state) => state.perf?.activeBusId ?? state.meters?.activeBusId ?? null);
  const buses = useRfxStore((state) => state.perf?.buses ?? []);
  const knobMapByBusId = useRfxStore((state) => state.perf?.knobMapByBusId ?? EMPTY_OBJ);
  const looper = useRfxStore((state) => state.session?.looper ?? DEFAULT_LOOPER_STATE);
  const tempoBpm = useRfxStore((state) => state.session?.tempoBpm ?? DEFAULT_SESSION_TEMPO_BPM);
  const clickEnabled = useRfxStore((state) => state.session?.clickEnabled ?? DEFAULT_SESSION_CLICK_ENABLED);
  const countInEnabled = useRfxStore((state) => state.session?.countInEnabled ?? DEFAULT_SESSION_COUNT_IN_ENABLED);
  const beatsPerMeasure = useRfxStore((state) => state.session?.beatsPerMeasure ?? DEFAULT_SESSION_BEATS_PER_MEASURE);
  const noteLength = useRfxStore((state) => state.session?.noteLength ?? DEFAULT_SESSION_NOTE_LENGTH);
  const automatableParameters = useRfxStore(
    (state) => state.automation?.automatableParameters ?? EMPTY_ARR
  );
  const removeAutomatableParameter = useRfxStore(
    (state) => state.removeAutomatableParameter
  );
  const armedAutomationParameters = useRfxStore(
    (state) => state.automation?.armedAutomationParameters ?? EMPTY_ARR
  );
  const toggleArmedAutomationParameter = useRfxStore(
    (state) => state.toggleArmedAutomationParameter
  );
  const dispatchIntent = useRfxStore((state) => state.dispatchIntent);
  const setLooperTempoBpm = useRfxStore((state) => state.setLooperTempoBpm);
  const setLooperClickEnabled = useRfxStore((state) => state.setLooperClickEnabled);
  const setLooperCountInEnabled = useRfxStore((state) => state.setLooperCountInEnabled);
  const setLoopLengthEnabled = useRfxStore((state) => state.setLoopLengthEnabled);
  const setLoopLength = useRfxStore((state) => state.setLoopLength);
  const setTimeSignature = useRfxStore((state) => state.setTimeSignature);

  const releaseTimersRef = React.useRef(new Map());
  const expressionTimerRef = React.useRef(null);
  const tapTempoTimerRef = React.useRef(null);
  const tapTimesRef = React.useRef([]);
  const recordingStartRef = React.useRef(null);
  const playbackStartRef = React.useRef(null);
  const automationValueRef = React.useRef(0);

  const busId = String(activeBusId || buses?.[0]?.id || "NONE");
  const sliderKnobId = `${busId}_k7`;
  const sliderTargets = React.useMemo(
    () => getKnobTargets(knobMapByBusId?.[busId]?.[sliderKnobId]).slice(0, 3),
    [busId, knobMapByBusId, sliderKnobId]
  );
  const sliderMappedLabel = sliderTargets.length
    ? sliderTargets.map((target) => target.paramName || `#${target.paramIdx}`).join(" • ")
    : "";
  const automationExpressionTargets = React.useMemo(
    () =>
      armedAutomationParameters
        .map((parameter) => {
          const paramIdx = Number(parameter?.paramIndex ?? parameter?.paramIdx);
          if (
            !parameter?.fxGuid ||
            !Number.isFinite(paramIdx)
          ) {
            return null;
          }

          return {
            trackGuid: parameter.trackGuid || "",
            fxGuid: String(parameter.fxGuid),
            paramIdx,
            label: parameter.paramName || `#${paramIdx}`,
          };
        })
        .filter(Boolean),
    [armedAutomationParameters]
  );
  const automationExpressionLabel = automationExpressionTargets.length
    ? automationExpressionTargets.map((target) => target.label).join(" • ")
    : sliderMappedLabel;

  const armDefaultParameterEnvelopesIfReady = React.useCallback(() => {
    console.log(
      "[RFX Automation] Selected automation parameters:",
      armedAutomationParameters
    );
    console.log(
      "[RFX Automation] Total selected automation parameters:",
      armedAutomationParameters.length
    );
  }, [armedAutomationParameters]);

  React.useEffect(() => {
    armDefaultParameterEnvelopesIfReady();
  }, [armDefaultParameterEnvelopesIfReady]);

  const toggleAutomationParameterEnvelope = React.useCallback((parameter) => {
    const isArmed = armedAutomationParameters.some((armedParameter) =>
      sameParameterTarget(parameter, armedParameter)
    );
    const paramIdx = Number(parameter?.paramIndex ?? parameter?.paramIdx);

    toggleArmedAutomationParameter(parameter);

    if (
      !parameter?.trackGuid ||
      !parameter?.fxGuid ||
      !Number.isFinite(paramIdx)
    ) {
      return;
    }

    void dispatchIntent({
      name: isArmed ? "setUnarm" : "setArm",
      trackGuid: parameter.trackGuid,
      fxGuid: parameter.fxGuid,
      paramIdx,
      paramIndex: paramIdx,
      paramName: parameter.paramName || null,
      fxName: parameter.fxName || null,
      trackName: parameter.trackName || null,
    });
  }, [armedAutomationParameters, dispatchIntent, toggleArmedAutomationParameter]);

  const getBadgeClasses = React.useCallback((badge) => {
    if (badge.color === "red") {
      return { inactiveClasses: CONTROL_COLORS.redFaint, activeClasses: CONTROL_COLORS.redActive };
    }

    if (badge.color === "orange") {
      return { inactiveClasses: CONTROL_COLORS.orangeFaint, activeClasses: CONTROL_COLORS.orangeActive };
    }

    return { inactiveClasses: CONTROL_COLORS.greenFaint, activeClasses: CONTROL_COLORS.greenActive };
  }, []);

  React.useEffect(() => {
    if (!isRecording && !isPlaying) return undefined;

    const tick = () => {
      const now = performance.now();

      if (isRecording && recordingStartRef.current) {
        setAutomationPositionMs(now - recordingStartRef.current);
        return;
      }

      if (isPlaying && playbackStartRef.current && automationDurationMs > 0) {
        setAutomationPositionMs((now - playbackStartRef.current) % automationDurationMs);
      }
    };

    tick();
    const interval = window.setInterval(tick, AUTOMATION_PREVIEW_TICK_MS);
    return () => window.clearInterval(interval);
  }, [automationDurationMs, isPlaying, isRecording]);

  const clearControlTimer = React.useCallback((control) => {
    const timer = releaseTimersRef.current.get(control);
    if (!timer) return;
    window.clearTimeout(timer);
    releaseTimersRef.current.delete(control);
  }, []);

  const setControlActive = React.useCallback((control, active) => {
    setActiveControls((currentControls) => {
      const nextControls = new Set(currentControls);
      if (active) nextControls.add(control);
      else nextControls.delete(control);
      return nextControls;
    });
  }, []);

  const flashControl = React.useCallback((control) => {
    clearControlTimer(control);
    setControlActive(control, true);
    const timer = window.setTimeout(() => {
      setControlActive(control, false);
      releaseTimersRef.current.delete(control);
    }, MOMENTARY_ACTIVE_MS);
    releaseTimersRef.current.set(control, timer);
  }, [clearControlTimer, setControlActive]);

  const dispatchAutomationExpressionValue = React.useCallback((value01, phase) => {
    const value = clamp01(value01);

    for (const target of automationExpressionTargets) {
      dispatchIntent({
        name: "setParamValue",
        phase,
        gestureId: "automation:expr",
        trackGuid: target.trackGuid,
        fxGuid: target.fxGuid,
        paramIdx: target.paramIdx,
        value01: value,
      });
    }
  }, [automationExpressionTargets, dispatchIntent]);

  const activateExpression = React.useCallback((value01) => {
    const value = clamp01(value01);

    automationValueRef.current = value;
    setAutomationValue(value);
    setIsExpressionActive(true);
    dispatchAutomationExpressionValue(value, "preview");

    if (expressionTimerRef.current) window.clearTimeout(expressionTimerRef.current);

    expressionTimerRef.current = window.setTimeout(() => {
      setIsExpressionActive(false);
      expressionTimerRef.current = null;
    }, EXPRESSION_IDLE_MS);
  }, [dispatchAutomationExpressionValue]);

  const commitExpression = React.useCallback(() => {
    dispatchAutomationExpressionValue(automationValueRef.current, "commit");
  }, [dispatchAutomationExpressionValue]);

  const handleTapTempo = React.useCallback(() => {
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
      void dispatchIntent({ name: "setTempo", bpm: nextBpm });
    }

    setIsTapTempoActive(true);

    if (tapTempoTimerRef.current) {
      window.clearTimeout(tapTempoTimerRef.current);
    }

    tapTempoTimerRef.current = window.setTimeout(() => {
      setIsTapTempoActive(false);
      tapTempoTimerRef.current = null;
    }, TAP_TEMPO_FLASH_MS);
  }, [dispatchIntent, setLooperTempoBpm]);

  const toggleClick = React.useCallback(() => {
    const nextClickEnabled = !clickEnabled;
    setLooperClickEnabled(nextClickEnabled);
    void dispatchIntent({ name: "setClickEnabled", enabled: nextClickEnabled });
  }, [clickEnabled, dispatchIntent, setLooperClickEnabled]);

  const toggleCountIn = React.useCallback(() => {
    const nextCountInEnabled = !countInEnabled;
    setLooperCountInEnabled(nextCountInEnabled);
    void dispatchIntent({ name: "setCountInEnabled", enabled: nextCountInEnabled });
  }, [countInEnabled, dispatchIntent, setLooperCountInEnabled]);

  const toggleLoopLength = React.useCallback(() => {
    const nextEnabled = !looper.loopLengthEnabled;
    setLoopLengthEnabled(nextEnabled);
    void dispatchIntent({ name: "setLoopLengthEnabled", enabled: nextEnabled });
  }, [dispatchIntent, looper.loopLengthEnabled, setLoopLengthEnabled]);

  const cycleLoopLength = React.useCallback(() => {
    const nextLoopLength = cycleValue(LOOP_LENGTH_VALUES, looper.loopLength);
    setLoopLength(nextLoopLength);
    void dispatchIntent({ name: "setLoopLength", bars: nextLoopLength });
  }, [dispatchIntent, looper.loopLength, setLoopLength]);

  const updateTimeSignature = React.useCallback((nextBeatsPerMeasure, nextNoteLength) => {
    setTimeSignature(nextBeatsPerMeasure, nextNoteLength);
    void dispatchIntent({
      name: "setTimeSignature",
      beatsPerMeasure: nextBeatsPerMeasure,
      noteLength: nextNoteLength,
    });
  }, [dispatchIntent, setTimeSignature]);

  const cycleBeatsPerMeasure = React.useCallback(() => {
    updateTimeSignature(
      cycleValue(BEATS_PER_MEASURE_VALUES, beatsPerMeasure),
      noteLength
    );
  }, [beatsPerMeasure, noteLength, updateTimeSignature]);

  const cycleNoteLength = React.useCallback(() => {
    updateTimeSignature(
      beatsPerMeasure,
      cycleValue(NOTE_LENGTH_VALUES, noteLength)
    );
  }, [beatsPerMeasure, noteLength, updateTimeSignature]);

  const exitAutomationMode = React.useCallback(() => {
    setIsRecording(false);
    setIsPlaying(false);
    setAutomationDurationMs(0);
    setAutomationPositionMs(0);
    recordingStartRef.current = null;
    playbackStartRef.current = null;

    void (async () => {
      await dispatchIntent({ name: "clearEnvelopes" });
      await dispatchIntent({ name: "setUnarm" });
      await dispatchIntent({ name: "setPerformMode" });
      modeManager.setMode(RFX_MODES.PERFORM, { dispatch: false, source: "ui" });
    })();
  }, [dispatchIntent]);

  const handleAutomationControl = React.useCallback((control, value = 127) => {
    if (control === MIDI_CONTROLS.EXPR) {
      activateExpression(midiValueToAutomationValue(value));
      return;
    }

    if (value <= 0) return;

    if (control === MIDI_CONTROLS.FS_B) {
      recordingStartRef.current = performance.now();
      playbackStartRef.current = null;
      setAutomationDurationMs(0);
      setAutomationPositionMs(0);
      setIsPlaying(false);
      setIsRecording(true);
      void dispatchIntent({ name: "startAutomationRec" });
    }

    if (control === MIDI_CONTROLS.FS_B_RELEASE) {
      const duration = recordingStartRef.current
        ? Math.max(performance.now() - recordingStartRef.current, AUTOMATION_PREVIEW_TICK_MS)
        : automationDurationMs;
      setAutomationDurationMs(duration);
      setAutomationPositionMs(0);
      setIsRecording(false);
      setIsPlaying(false);
      recordingStartRef.current = null;
      playbackStartRef.current = null;
      void dispatchIntent({ name: "stopAutomationRec" });
    }

    if (control === MIDI_CONTROLS.FS_A) {
      setIsPlaying((playing) => {
        const nextPlaying = automationDurationMs > 0 && !playing;
        playbackStartRef.current = nextPlaying ? performance.now() : null;
        if (nextPlaying) setAutomationPositionMs(0);
        return nextPlaying;
      });
      setIsRecording(false);
      recordingStartRef.current = null;
    }

    if (control === AUTOMATION_GESTURES.FS_A_LONG) {
      setIsRecording(false);
      setIsPlaying(false);
      setAutomationDurationMs(0);
      setAutomationPositionMs(0);
      recordingStartRef.current = null;
      playbackStartRef.current = null;
      void dispatchIntent({ name: "clearEnvelopes" });
    }

    if (control === AUTOMATION_GESTURES.FS_C_LONG) {
      exitAutomationMode();
    }

    if (MOMENTARY_CONTROLS.has(control)) flashControl(control);
  }, [activateExpression, automationDurationMs, dispatchIntent, exitAutomationMode, flashControl]);

  const pressAutomationControl = React.useCallback((control) => {
    handleAutomationControl(control, 127);
  }, [handleAutomationControl]);

  const releaseAutomationControl = React.useCallback(() => {}, []);

  const handleControlKeyDown = React.useCallback((event, control) => {
    if (event.repeat) return;
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    pressAutomationControl(control);
  }, [pressAutomationControl]);

  const handleControlKeyUp = React.useCallback((event, control) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    releaseAutomationControl(control);
  }, [releaseAutomationControl]);

  React.useEffect(() => {
    const handler = (event) => {
      const { command, payload } = event.detail || {};

      if (command !== "AUTOMATION_EXPRESSION_CONTROL" && !String(command || "").startsWith("AUTOMATION_")) return;

      if (command === "AUTOMATION_EXPRESSION_CONTROL") {
        activateExpression(payload?.value ?? 0);
        return;
      }

      if (command === "AUTOMATION_START_RECORD") handleAutomationControl(MIDI_CONTROLS.FS_B);
      if (command === "AUTOMATION_STOP_RECORD") handleAutomationControl(MIDI_CONTROLS.FS_B_RELEASE);
      if (command === "AUTOMATION_PLAY_OR_STOP") handleAutomationControl(MIDI_CONTROLS.FS_A);
      if (command === "AUTOMATION_CLEAR") handleAutomationControl(AUTOMATION_GESTURES.FS_A_LONG);
      if (command === "EXIT_AUTOMATION_MODE") handleAutomationControl(AUTOMATION_GESTURES.FS_C_LONG);
    };

    window.addEventListener("rfx-midi-command", handler);
    return () => window.removeEventListener("rfx-midi-command", handler);
  }, [activateExpression, handleAutomationControl]);

  React.useEffect(() => {
    const releaseTimers = releaseTimersRef.current;

    return () => {
      releaseTimers.forEach((timer) => window.clearTimeout(timer));
      releaseTimers.clear();

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
    <div className="h-full w-full p-3 min-h-0">
      <div className="h-full min-h-0 flex flex-col gap-3">
        <Panel className="min-h-0">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-[18px] font-semibold tracking-wide truncate">
              AUTOMATION
            </div>
          </div>
        </Panel>

        <Panel className="flex-1 min-h-0">
          <div className="p-4 h-full min-h-0">
            <Inset className="h-full min-h-0 p-4">
              <div className="flex h-full min-h-0 flex-col gap-3">
                <AutomationSessionControls
                  tempoBpm={tempoBpm}
                  isTapTempoActive={isTapTempoActive}
                  onTapTempo={handleTapTempo}
                  clickEnabled={clickEnabled}
                  onToggleClick={toggleClick}
                  countInEnabled={countInEnabled}
                  onToggleCountIn={toggleCountIn}
                  loopLengthEnabled={looper.loopLengthEnabled}
                  loopLength={looper.loopLength}
                  onToggleLoopLength={toggleLoopLength}
                  onCycleLoopLength={cycleLoopLength}
                  beatsPerMeasure={beatsPerMeasure}
                  noteLength={noteLength}
                  onCycleBeatsPerMeasure={cycleBeatsPerMeasure}
                  onCycleNoteLength={cycleNoteLength}
                />

                <div className="grid flex-1 h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(190px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3">
                <div className="col-span-5 row-span-1 min-h-0">
                  <AutomationWorkspace
                    parameters={automatableParameters}
                    armedParameters={armedAutomationParameters}
                    onRemove={removeAutomatableParameter}
                    onToggleArmed={toggleAutomationParameterEnvelope}
                  />
                </div>

                <div className="col-span-4 row-span-2 grid grid-cols-4 grid-rows-2 gap-3 items-stretch">
                  {AUTOMATION_DEBUG_BADGES.map((badge) => {
                    const { inactiveClasses, activeClasses } = getBadgeClasses(badge);
                    const disabled = DISABLED_AUTOMATION_BADGE_CONTROLS.has(
                      badge.control
                    );

                    return (
                      <AutomationControlButton
                        key={badge.control}
                        badge={badge}
                        active={activeControls.has(badge.control)}
                        inactiveClasses={inactiveClasses}
                        activeClasses={activeClasses}
                        onPointerDown={
                          disabled
                            ? undefined
                            : () => pressAutomationControl(badge.control)
                        }
                        onPointerUp={
                          disabled
                            ? undefined
                            : () => releaseAutomationControl(badge.control)
                        }
                        onKeyDown={
                          disabled
                            ? undefined
                            : (event) =>
                                handleControlKeyDown(event, badge.control)
                        }
                        onKeyUp={
                          disabled
                            ? undefined
                            : (event) =>
                                handleControlKeyUp(event, badge.control)
                        }
                      />
                    );
                  })}
                </div>

                <div className={`col-start-5 row-start-2 row-span-2 h-full rounded-xl border px-3 py-4 transition-all duration-150 ${isExpressionActive ? CONTROL_COLORS.blueActive : CONTROL_COLORS.blueFaint}`}>
                  <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
                    EXPR
                  </div>

                  <div className="mt-3 text-sm font-semibold leading-snug text-white">
                    Automation
                  </div>

                  <div className="mt-4 flex justify-center">
                    <Knob
                      id={sliderKnobId}
                      label="Value"
                      value={automationValue}
                      mapped={automationExpressionTargets.length > 0}
                      mappedLabel={automationExpressionLabel}
                      onChange={activateExpression}
                      onCommit={commitExpression}
                    />
                  </div>

                  <div className="mt-1 text-center text-2xl font-bold tabular-nums text-white">
                    {formatAutomationValue(automationValue)}
                  </div>
                </div>
                </div>
              </div>
            </Inset>
          </div>
        </Panel>
      </div>
    </div>
  );
}
