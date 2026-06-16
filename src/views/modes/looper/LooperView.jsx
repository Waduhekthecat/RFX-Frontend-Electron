import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { Knob } from "../../../components/controls/knobs/Knob";
import { getMidiRuntime } from "../../../core/midi/MidiInitialize";
import { RFX_MODES } from "../../../core/modes/Modes";
import { useRfxStore } from "../../../core/rfx/Store";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;
const LOOP_PREVIEW_TICK_MS = 33;
const TAP_TEMPO_FLASH_MS = 180;
const TAP_TEMPO_RESET_MS = 2000;
const MAX_TAP_TEMPO_TIMES = 4;
const MIN_TEMPO_BPM = 40;
const MAX_TEMPO_BPM = 240;

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
    amberFaint: "border-amber-300/25 bg-amber-400/10 hover:border-amber-300/45 hover:bg-amber-400/15",
    amberActive: "border-amber-300/70 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
    purpleFaint: "border-purple-300/25 bg-purple-400/10 hover:border-purple-300/45 hover:bg-purple-400/15",
    purpleActive: "border-purple-300/70 bg-purple-400/20 shadow-[0_0_18px_rgba(192,132,252,0.35)]",
};

const LOOPER_DEBUG_BADGES = [
    { cc: 11, control: MIDI_CONTROLS.FS_A, footswitch: "Tap FS_A", command: "Stop Playback", color: "green" },
    { cc: 12, control: MIDI_CONTROLS.FS_B, footswitch: "Hold FS_B", command: "Start Record", color: "green" },
    { cc: 13, control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Start Playback", color: "green" },
    { cc: 14, control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Toggle Looper Type", color: "looperType" },
    { cc: 101, control: MIDI_CONTROLS.FS_A_LONG, footswitch: "Hold FS_A", command: "Delete Loop Audio", color: "green" },
    { cc: 102, control: MIDI_CONTROLS.FS_B_RELEASE, footswitch: "Release FS_B", command: "Stop Record / Start Playback", color: "red" },
    { cc: 103, control: MIDI_CONTROLS.FS_C_LONG, footswitch: "Hold FS_C", command: "Undo Last Record", color: "green" },
    { cc: 104, control: MIDI_CONTROLS.FS_D_LONG, footswitch: "Hold FS_D", command: "Exit Looper Mode", color: "orange" },
];

const MOMENTARY_CONTROLS = new Set([
    MIDI_CONTROLS.FS_A,
    MIDI_CONTROLS.FS_A_LONG,
    MIDI_CONTROLS.FS_B_RELEASE,
    MIDI_CONTROLS.FS_C,
    MIDI_CONTROLS.FS_C_LONG,
    MIDI_CONTROLS.FS_D,
    MIDI_CONTROLS.FS_D_LONG,
]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
const midiValueToPlaybackMasterVolume = (value = 0) => clamp01(value / 127);
const formatPlaybackMasterVolume = (value01 = 0) => (clamp01(value01) * 10).toFixed(1);

const formatStopwatchTime = (milliseconds = 0) => {
    const totalSeconds = Math.floor(Math.max(milliseconds, 0) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((Math.max(milliseconds, 0) % 1000) / 100);

    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${tenths}`;
};

function LooperControlButton({
    badge,
    active,
    inactiveClasses,
    activeClasses,
    onPointerDown,
    onPointerUp,
    onKeyDown,
    onKeyUp,
}) {
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
            className={`rounded-xl border px-3 py-3 h-full min-h-[140px] text-left transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${active ? activeClasses : inactiveClasses
                }`}
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

function LooperTimeline({
    isRecording,
    isOverdubbing,
    hasRecordedLoop,
    isPlaying,
    loopDurationMs,
    loopPositionMs,
    tempoBpm,
    isTapTempoActive,
    onTapTempo,
    isClickEnabled,
    onToggleClick,
    isCountInEnabled,
    onToggleCountIn,
}) {
    const progress =
        hasRecordedLoop && loopDurationMs > 0
            ? Math.min(loopPositionMs / loopDurationMs, 1)
            : 0;

    const status = isOverdubbing
        ? "Overdubbing"
        : isRecording
            ? "Recording"
            : isPlaying
                ? "Playing Loop"
                : hasRecordedLoop
                    ? "Loop Playback Stopped"
                    : "Start Record";

    const durationLabel = isRecording || hasRecordedLoop ? "Duration" : "";

    const durationContent =
        isRecording && !hasRecordedLoop
            ? formatStopwatchTime(loopPositionMs)
            : hasRecordedLoop
                ? `${(loopDurationMs / 1000).toFixed(2)}s loop`
                : "";

    const shouldBlinkWaveform = isRecording || isOverdubbing;
    const recordingWaveformBeatMs = 60000 / Math.max(MIN_TEMPO_BPM, Math.min(tempoBpm, MAX_TEMPO_BPM));

    const bars = Array.from({ length: 64 }, (_, index) => {
        const wave = Math.sin(index * 0.48) * 0.5 + 0.5;
        const accent = Math.sin(index * 0.17 + 1.4) * 0.5 + 0.5;
        return 18 + wave * 46 + accent * 22;
    });

    return (
        <div className="flex h-full min-h-[220px] flex-col rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-stretch gap-3">
                <div className="min-w-0 self-start">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        Loop Timeline
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                        {status}
                    </div>
                </div>

                <div className="flex flex-wrap items-stretch justify-center gap-2">
                    <div className={`flex h-full min-h-[72px] items-center rounded-xl border px-5 py-3 text-base font-semibold tabular-nums text-sky-100 ${CONTROL_COLORS.blueFaint}`}>
                        {tempoBpm} BPM
                    </div>
                    <button
                        type="button"
                        onClick={onTapTempo}
                        className={`h-full min-h-[72px] rounded-xl border px-5 py-3 text-base font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 ${isTapTempoActive ? CONTROL_COLORS.blueActive : CONTROL_COLORS.blueFaint}`}                    >
                        TAP
                    </button>
                    <button
                        type="button"
                        onClick={onToggleClick}
                        aria-pressed={isClickEnabled}
                        className={`h-full min-h-[72px] rounded-xl border px-5 py-3 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/70 ${isClickEnabled ? CONTROL_COLORS.amberActive : CONTROL_COLORS.grayFaint}`}                    >
                        CLICK {isClickEnabled ? "ON" : "OFF"}
                    </button>
                    <button
                        type="button"
                        onClick={onToggleCountIn}
                        aria-pressed={isCountInEnabled}
                        className={`h-full min-h-[72px] rounded-xl border px-5 py-3 text-sm font-semibold text-white transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300/70 ${isCountInEnabled ? CONTROL_COLORS.purpleActive : CONTROL_COLORS.grayFaint}`}                    >
                        COUNT-IN {isCountInEnabled ? "ON" : "OFF"}
                    </button>
                </div>

                <div className="flex min-w-0 items-start justify-end gap-3 self-start">
                    <div className="shrink-0 text-right">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                            {durationLabel}
                        </div>
                        <div className="mt-2 text-sm font-semibold text-white/80">
                            {durationContent}
                        </div>
                    </div>
                </div>
            </div>

            <div
                className={`mt-3 flex h-[130px] items-end gap-1 rounded-xl border border-white/10 bg-black/30 p-3 ${shouldBlinkWaveform ? "rfx-recording-waveform" : ""}`}
                style={{ "--rfx-recording-waveform-beat-ms": `${recordingWaveformBeatMs}ms` }}
            >
                {bars.map((height, index) => (
                    <div
                        key={index}
                        className={`flex-1 rounded-full transition-colors duration-150 ${(hasRecordedLoop && index / bars.length <= progress) || shouldBlinkWaveform
                            ? "bg-emerald-300/80"
                            : "bg-white/15"
                            }`}
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                    className="h-full rounded-full bg-emerald-300"
                    style={{ width: `${progress * 100}%` }}
                />
            </div>
        </div>
    );
}

export function LooperView() {
    const navigate = useNavigate();

    const [activeControls, setActiveControls] = useState(() => new Set());
    const [playbackMasterVolume, setPlaybackMasterVolume] = useState(0);
    const [isExpressionActive, setIsExpressionActive] = useState(false);
    const [isRecordingFirstLoop, setIsRecordingFirstLoop] = useState(false);
    const [isOverdubbing, setIsOverdubbing] = useState(false);
    const [hasRecordedLoop, setHasRecordedLoop] = useState(false);
    const [isLoopPlaying, setIsLoopPlaying] = useState(false);
    const [loopDurationMs, setLoopDurationMs] = useState(0);
    const [loopPositionMs, setLoopPositionMs] = useState(0);
    const [tempoBpm, setTempoBpm] = useState(120);
    const [tapTimes, setTapTimes] = useState([]);
    const [isTapTempoActive, setIsTapTempoActive] = useState(false);
    const [isClickEnabled, setIsClickEnabled] = useState(false);
    const [isCountInEnabled, setIsCountInEnabled] = useState(false);

    const looperType = useRfxStore((state) => state.session.looperType);
    const setLooperType = useRfxStore((state) => state.setLooperType);

    const looperTypeIndex = Math.max(
        LOOPER_TYPES.findIndex((type) => type.id === looperType),
        0
    );

    const currentLooperType = LOOPER_TYPES[looperTypeIndex];

    const releaseTimersRef = useRef(new Map());
    const expressionTimerRef = useRef(null);
    const tapTempoTimerRef = useRef(null);
    const recordingStartRef = useRef(null);
    const playbackStartRef = useRef(null);

    const badgesByControl = useMemo(
        () => new Map(LOOPER_DEBUG_BADGES.map((badge) => [badge.control, badge])),
        []
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
        if (!isRecordingFirstLoop && !isLoopPlaying) return undefined;

        const tick = () => {
            const now = performance.now();

            if (isRecordingFirstLoop && recordingStartRef.current) {
                setLoopPositionMs(now - recordingStartRef.current);
                return;
            }

            if (isLoopPlaying && playbackStartRef.current && loopDurationMs > 0) {
                setLoopPositionMs((now - playbackStartRef.current) % loopDurationMs);
            }
        };

        tick();

        const interval = window.setInterval(tick, LOOP_PREVIEW_TICK_MS);

        return () => window.clearInterval(interval);
    }, [isRecordingFirstLoop, isLoopPlaying, loopDurationMs]);

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

        setTapTimes((currentTapTimes) => {
            const lastTapTime = currentTapTimes.at(-1);
            const recentTapTimes =
                lastTapTime && now - lastTapTime <= TAP_TEMPO_RESET_MS
                    ? currentTapTimes
                    : [];
            const nextTapTimes = [...recentTapTimes, now].slice(-MAX_TAP_TEMPO_TIMES);

            if (nextTapTimes.length >= 2) {
                const intervals = nextTapTimes
                    .slice(1)
                    .map((tapTime, index) => tapTime - nextTapTimes[index]);
                const averageIntervalMs =
                    intervals.reduce((total, interval) => total + interval, 0) / intervals.length;
                const nextBpm = Math.round(60000 / averageIntervalMs);

                setTempoBpm(Math.max(MIN_TEMPO_BPM, Math.min(nextBpm, MAX_TEMPO_BPM)));
            }

            return nextTapTimes;
        });

        setIsTapTempoActive(true);

        if (tapTempoTimerRef.current) {
            window.clearTimeout(tapTempoTimerRef.current);
        }

        tapTempoTimerRef.current = window.setTimeout(() => {
            setIsTapTempoActive(false);
            tapTempoTimerRef.current = null;
        }, TAP_TEMPO_FLASH_MS);
    }, []);

    const toggleClick = useCallback(() => {
        setIsClickEnabled((enabled) => !enabled);
    }, []);

    const toggleCountIn = useCallback(() => {
        setIsCountInEnabled((enabled) => !enabled);
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
                setIsLoopPlaying(false);
                setIsOverdubbing(false);
                playbackStartRef.current = null;
            }

            if (control === MIDI_CONTROLS.FS_A_LONG) {
                setIsRecordingFirstLoop(false);
                setIsOverdubbing(false);
                setHasRecordedLoop(false);
                setIsLoopPlaying(false);
                setLoopDurationMs(0);
                setLoopPositionMs(0);
                recordingStartRef.current = null;
                playbackStartRef.current = null;
            }

            if (control === MIDI_CONTROLS.FS_C) {
                setHasRecordedLoop((recorded) => {
                    if (recorded) {
                        playbackStartRef.current = performance.now();
                        setLoopPositionMs(0);
                        setIsLoopPlaying(true);
                    }

                    return recorded;
                });
            }

            if (control === MIDI_CONTROLS.FS_D) {
                const nextLooperType =
                    LOOPER_TYPES[(looperTypeIndex + 1) % LOOPER_TYPES.length];

                setLooperType(nextLooperType.id);
            }

            if (control === MIDI_CONTROLS.FS_D_LONG) {
                getMidiRuntime()?.modeManager?.setMode(RFX_MODES.PERFORM);
                navigate("/");
            }

            if (control === MIDI_CONTROLS.FS_B) {
                clearControlTimer(MIDI_CONTROLS.FS_B);
                setControlActive(MIDI_CONTROLS.FS_B, true);

                if (!hasRecordedLoop && !isRecordingFirstLoop) {
                    recordingStartRef.current = performance.now();
                    playbackStartRef.current = null;
                    setIsRecordingFirstLoop(true);
                    setIsOverdubbing(false);
                    setIsLoopPlaying(false);
                    setLoopPositionMs(0);
                } else if (hasRecordedLoop) {
                    playbackStartRef.current =
                        playbackStartRef.current ?? performance.now();

                    setIsOverdubbing(true);
                    setIsLoopPlaying(true);
                }

                return;
            }

            if (control === MIDI_CONTROLS.FS_B_RELEASE) {
                setControlActive(MIDI_CONTROLS.FS_B, false);

                if (isRecordingFirstLoop && recordingStartRef.current) {
                    const duration = Math.max(
                        performance.now() - recordingStartRef.current,
                        LOOP_PREVIEW_TICK_MS
                    );

                    setLoopDurationMs(duration);
                    setLoopPositionMs(0);
                    setHasRecordedLoop(true);
                    setIsRecordingFirstLoop(false);
                    setIsOverdubbing(false);
                    setIsLoopPlaying(true);

                    recordingStartRef.current = null;
                    playbackStartRef.current = performance.now();
                } else if (isOverdubbing) {
                    setIsOverdubbing(false);
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
            flashControl,
            hasRecordedLoop,
            isOverdubbing,
            isRecordingFirstLoop,
            looperTypeIndex,
            navigate,
            setControlActive,
            setLooperType,
        ]
    );

    const pressLooperControl = useCallback(
        (control) => {
            handleLooperControl(control, 127, { flashMomentary: true });
        },
        [handleLooperControl]
    );

    const releaseLooperControl = useCallback(() => { }, []);

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

            if (command !== "LOOPER_DEBUG_MIDI_CONTROL") return;
            if (payload?.control == null) return;

            handleLooperControl(payload.control, payload.value);
        };

        window.addEventListener("rfx-midi-command", handler);

        return () => {
            window.removeEventListener("rfx-midi-command", handler);
        };
    }, [handleLooperControl]);

    useEffect(() => {
        return () => {
            releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            releaseTimersRef.current.clear();

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
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="text-[18px] font-semibold tracking-wide truncate">
                                LOOPER
                            </div>

                            <div
                                className={`rounded-full border px-3 py-1 text-xs font-semibold text-white/80 ${currentLooperType.classes}`}
                            >
                                [{currentLooperType.label}]
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel className="flex-1 min-h-0">
                    <div className="p-4 h-full min-h-0">
                        <Inset className="h-full min-h-0 p-4">
                            <div className="grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(190px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3">
                                <div className="col-span-5 row-span-1 min-h-0">
                                    <LooperTimeline
                                        isRecording={isRecordingFirstLoop}
                                        isOverdubbing={isOverdubbing}
                                        hasRecordedLoop={hasRecordedLoop}
                                        isPlaying={isLoopPlaying}
                                        loopDurationMs={loopDurationMs}
                                        loopPositionMs={loopPositionMs}
                                        tempoBpm={tempoBpm}
                                        isTapTempoActive={isTapTempoActive}
                                        onTapTempo={handleTapTempo}
                                        isClickEnabled={isClickEnabled}
                                        onToggleClick={toggleClick}
                                        isCountInEnabled={isCountInEnabled}
                                        onToggleCountIn={toggleCountIn}
                                    />
                                </div>

                                <div className="col-span-4 row-span-2 grid grid-cols-4 grid-rows-2 gap-3 items-stretch">
                                    {LOOPER_DEBUG_BADGES.map((badge) => {
                                        const { inactiveClasses, activeClasses } = getBadgeClasses(badge);

                                        return (
                                            <LooperControlButton
                                                key={badge.control}
                                                badge={badge}
                                                active={activeControls.has(badge.control)}
                                                inactiveClasses={inactiveClasses}
                                                activeClasses={activeClasses}
                                                onPointerDown={() => pressLooperControl(badge.control)}
                                                onPointerUp={() => releaseLooperControl(badge.control)}
                                                onKeyDown={(event) =>
                                                    handleControlKeyDown(event, badge.control)
                                                }
                                                onKeyUp={(event) =>
                                                    handleControlKeyUp(event, badge.control)
                                                }
                                            />
                                        );
                                    })}
                                </div>

                                <div
                                    className={`col-start-5 row-start-2 row-span-2 h-full rounded-xl border px-3 py-4 transition-all duration-150 ${isExpressionActive
                                        ? CONTROL_COLORS.blueActive
                                        : CONTROL_COLORS.blueFaint
                                        }`}
                                >
                                    <div className="mt-3 text-sm font-semibold leading-snug text-white/50">
                                        EXPR
                                    </div>

                                    <div className="mt-3 text-sm font-semibold leading-snug text-white">
                                        Output
                                    </div>

                                    <div className="mt-4 flex justify-center">
                                        <Knob
                                            id="looper-playback-master-volume"
                                            label="Volume"
                                            value={playbackMasterVolume}
                                            mapped={false}
                                            mappedLabel=""
                                            onChange={activateExpression}
                                            onCommit={() => { }}
                                        />
                                    </div>

                                    <div className="mt-1 text-center text-2xl font-bold tabular-nums text-white">
                                        {formatPlaybackMasterVolume(playbackMasterVolume)}
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