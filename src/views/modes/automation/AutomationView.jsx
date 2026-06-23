import React from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { Knob } from "../../../components/controls/knobs/Knob";
import { modeManager } from "../../../core/modes/ModeManager";
import { RFX_MODES } from "../../../core/modes/Modes";
import { useRfxStore } from "../../../core/rfx/Store";
import { AutomatableParameterCard } from "./components/AutomatableParameterCard";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;
const AUTOMATION_PREVIEW_TICK_MS = 33;

const CONTROL_COLORS = {
  greenFaint: "border-emerald-300/25 bg-emerald-400/5 hover:border-emerald-300/45 hover:bg-emerald-400/15",
  greenActive: "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",

  redFaint: "border-red-300/25 bg-red-400/5 hover:border-red-300/45 hover:bg-red-400/15",
  redActive: "border-red-300 bg-red-400/25 shadow-[0_0_20px_rgba(248,113,113,0.45)]",

  orangeFaint: "border-orange-300/25 bg-orange-400/5 hover:border-orange-300/45 hover:bg-orange-400/15",
  orangeActive: "border-orange-300 bg-orange-400/25 shadow-[0_0_20px_rgba(251,146,60,0.45)]",

  blueFaint: "border-sky-300/25 bg-sky-400/5",
  blueActive: "border-sky-300 bg-sky-400/20 shadow-[0_0_18px_rgba(56,189,248,0.35)]",
};

const AUTOMATION_DEBUG_BADGES = [
  { control: MIDI_CONTROLS.FS_A, footswitch: "Tap FS_A", command: "Unassigned", color: "green" },
  { control: MIDI_CONTROLS.FS_B, footswitch: "Hold FS_B", command: "Start Record", color: "green" },
  { control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Unassigned", color: "green" },
  { control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Unassigned", color: "green" },
  { control: MIDI_CONTROLS.FS_A_LONG, footswitch: "Hold FS_A", command: "Clear Automation", color: "green" },
  { control: MIDI_CONTROLS.FS_B_RELEASE, footswitch: "Release FS_B", command: "Stop Record", color: "red" },
  { control: MIDI_CONTROLS.FS_C_LONG, footswitch: "Hold FS_C", command: "Exit Automation Mode", color: "orange" },
  { control: MIDI_CONTROLS.FS_D_LONG, footswitch: "Hold FS_D", command: "Unassigned", color: "green" },
];

const MOMENTARY_CONTROLS = new Set(AUTOMATION_DEBUG_BADGES.map((badge) => badge.control));
const EMPTY_OBJ = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
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
    <div className="h-full min-h-[220px] rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
        Automation Workspace
      </div>

      {parameters.length ? (
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
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
        <div className="flex h-[calc(100%-2rem)] min-h-[150px] items-center justify-center text-sm text-white/45">
          No automation parameters selected
        </div>
      )}
    </div>
  );
}

export function AutomationView() {
  const [activeControls, setActiveControls] = React.useState(() => new Set());
  const [automationValue, setAutomationValue] = React.useState(0);
  const [isExpressionActive, setIsExpressionActive] = React.useState(false);
  const [isRecording, setIsRecording] = React.useState(false);
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [automationDurationMs, setAutomationDurationMs] = React.useState(0);
  const [, setAutomationPositionMs] = React.useState(0);

  const activeBusId = useRfxStore((state) => state.perf?.activeBusId ?? state.meters?.activeBusId ?? null);
  const buses = useRfxStore((state) => state.perf?.buses ?? []);
  const knobMapByBusId = useRfxStore((state) => state.perf?.knobMapByBusId ?? EMPTY_OBJ);
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

  const releaseTimersRef = React.useRef(new Map());
  const expressionTimerRef = React.useRef(null);
  const recordingStartRef = React.useRef(null);
  const playbackStartRef = React.useRef(null);

  const busId = String(activeBusId || buses?.[0]?.id || "NONE");
  const sliderKnobId = `${busId}_k7`;
  const sliderTargets = React.useMemo(
    () => getKnobTargets(knobMapByBusId?.[busId]?.[sliderKnobId]).slice(0, 3),
    [busId, knobMapByBusId, sliderKnobId]
  );
  const mappedLabel = sliderTargets.length
    ? sliderTargets.map((target) => target.paramName || `#${target.paramIdx}`).join(" • ")
    : "";

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

  const activateExpression = React.useCallback((value01) => {
    setAutomationValue(clamp01(value01));
    setIsExpressionActive(true);

    if (expressionTimerRef.current) window.clearTimeout(expressionTimerRef.current);

    expressionTimerRef.current = window.setTimeout(() => {
      setIsExpressionActive(false);
      expressionTimerRef.current = null;
    }, EXPRESSION_IDLE_MS);
  }, []);

  const handleAutomationControl = React.useCallback((control, value = 127) => {
    if (control === MIDI_CONTROLS.EXPR) {
      activateExpression(midiValueToAutomationValue(value));
      return;
    }

    if (value <= 0) return;

    if (control === MIDI_CONTROLS.FS_D) {
      if (!isRecording) {
        recordingStartRef.current = performance.now();
        playbackStartRef.current = null;
        setAutomationDurationMs(0);
        setAutomationPositionMs(0);
        setIsPlaying(false);
        setIsRecording(true);
      } else {
        const duration = Math.max(performance.now() - recordingStartRef.current, AUTOMATION_PREVIEW_TICK_MS);
        setAutomationDurationMs(duration);
        setAutomationPositionMs(0);
        setIsRecording(false);
        setIsPlaying(true);
        recordingStartRef.current = null;
        playbackStartRef.current = performance.now();
      }
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

    if (control === MIDI_CONTROLS.FS_A_LONG) {
      setIsRecording(false);
      setIsPlaying(false);
      setAutomationDurationMs(0);
      setAutomationPositionMs(0);
      recordingStartRef.current = null;
      playbackStartRef.current = null;
    }

    if (control === MIDI_CONTROLS.FS_C_LONG) {
      modeManager.setMode(RFX_MODES.PERFORM, { source: "ui" });
    }

    if (MOMENTARY_CONTROLS.has(control)) flashControl(control);
  }, [activateExpression, automationDurationMs, flashControl, isRecording]);

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

      if (command === "AUTOMATION_PLAY_OR_STOP") handleAutomationControl(MIDI_CONTROLS.FS_A);
      if (command === "AUTOMATION_CLEAR") handleAutomationControl(MIDI_CONTROLS.FS_A_LONG);
      if (command === "AUTOMATION_RECORD_OR_FINISH") handleAutomationControl(MIDI_CONTROLS.FS_D);
      if (command === "EXIT_AUTOMATION_MODE") handleAutomationControl(MIDI_CONTROLS.FS_C_LONG);
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
              <div className="grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(190px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3">
                <div className="col-span-5 row-span-1 min-h-0">
                  <AutomationWorkspace
                    parameters={automatableParameters}
                    armedParameters={armedAutomationParameters}
                    onRemove={removeAutomatableParameter}
                    onToggleArmed={toggleArmedAutomationParameter}
                  />
                </div>

                <div className="col-span-4 row-span-2 grid grid-cols-4 grid-rows-2 gap-3 items-stretch">
                  {AUTOMATION_DEBUG_BADGES.map((badge) => {
                    const { inactiveClasses, activeClasses } = getBadgeClasses(badge);

                    return (
                      <AutomationControlButton
                        key={badge.control}
                        badge={badge}
                        active={activeControls.has(badge.control)}
                        inactiveClasses={inactiveClasses}
                        activeClasses={activeClasses}
                        onPointerDown={() => pressAutomationControl(badge.control)}
                        onPointerUp={() => releaseAutomationControl(badge.control)}
                        onKeyDown={(event) => handleControlKeyDown(event, badge.control)}
                        onKeyUp={(event) => handleControlKeyUp(event, badge.control)}
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
                      mapped={sliderTargets.length > 0}
                      mappedLabel={mappedLabel}
                      onChange={activateExpression}
                      onCommit={() => {}}
                    />
                  </div>

                  <div className="mt-1 text-center text-2xl font-bold tabular-nums text-white">
                    {formatAutomationValue(automationValue)}
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
