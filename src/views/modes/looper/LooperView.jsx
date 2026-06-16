import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { Knob } from "../../../components/controls/knobs/Knob";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;
const LOOP_PREVIEW_TICK_MS = 33;

const LOOPER_TYPES = [
    { label: "Post-FX", classes: "border-fuchsia-300 bg-fuchsia-400/20 shadow-[0_0_18px_rgba(217,70,239,0.35)]" },
    { label: "Pre-FX", classes: "border-amber-300 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]" },
];

const LOOPER_DEBUG_BADGES = [
    { cc: 11, control: MIDI_CONTROLS.FS_A, footswitch: "FS_A", command: "Stop Playback" },
    { cc: 12, control: MIDI_CONTROLS.FS_B, footswitch: "FS_B", command: "Start Record" },
    { cc: 13, control: MIDI_CONTROLS.FS_C, footswitch: "FS_C", command: "Start Playback" },
    { cc: 14, control: MIDI_CONTROLS.FS_D, footswitch: "FS_D", command: "Toggle Looper Type" },
    { cc: 101, control: MIDI_CONTROLS.FS_A_LONG, footswitch: "FS_A", command: "Delete Loop Audio" },
    { cc: 102, control: MIDI_CONTROLS.FS_B_RELEASE, footswitch: "FS_B", command: "Stop Record / Start Playback" },
    { cc: 103, control: MIDI_CONTROLS.FS_C_LONG, footswitch: "FS_C", command: "Unavailable/Future" },
    { cc: 104, control: MIDI_CONTROLS.FS_D_LONG, footswitch: "FS_D", command: "Exit Looper Mode" },
];

const MOMENTARY_CONTROLS = new Set([
    MIDI_CONTROLS.FS_A,
    MIDI_CONTROLS.FS_A_LONG,
    MIDI_CONTROLS.FS_C,
    MIDI_CONTROLS.FS_C_LONG,
    MIDI_CONTROLS.FS_D,
    MIDI_CONTROLS.FS_D_LONG,
]);

const clamp01 = (value = 0) => Math.max(0, Math.min(value, 1));
const midiValueToPlaybackMasterVolume = (value = 0) => clamp01(value / 127);
const formatPlaybackMasterVolume = (value01 = 0) => (clamp01(value01) * 10).toFixed(1);

function LooperControlButton({
    badge,
    active,
    onClick,
    activeClasses = "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            aria-label={`${badge.footswitch} ${badge.command}`}
            className={`rounded-xl border px-3 py-3 min-h-[112px] text-left transition-all duration-150 hover:border-white/30 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-300/70 ${active ? activeClasses : "border-white/10 bg-black/20"
                }`}
        >
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-white/50">
                <span>CC {badge.cc}</span>
                <span>{badge.footswitch}</span>
            </div>
            <div className="mt-3 text-sm font-semibold leading-snug text-white">
                {badge.command}
            </div>
        </button>
    );
}

function LooperTimeline({ isRecording, hasRecordedLoop, isPlaying, loopDurationMs, loopPositionMs }) {
    const progress = hasRecordedLoop && loopDurationMs > 0
        ? Math.min(loopPositionMs / loopDurationMs, 1)
        : 0;

    const status = isRecording
        ? "Recording first loop"
        : isPlaying
            ? "Playing loop"
            : hasRecordedLoop
                ? "Loop armed"
                : "Waiting for first record trigger";

    const durationLabel = hasRecordedLoop
        ? `${(loopDurationMs / 1000).toFixed(2)}s loop`
        : isRecording
            ? "Counting..."
            : "No loop captured";

    const bars = Array.from({ length: 64 }, (_, index) => {
        const wave = Math.sin(index * 0.48) * 0.5 + 0.5;
        const accent = Math.sin(index * 0.17 + 1.4) * 0.5 + 0.5;
        return 18 + wave * 46 + accent * 22;
    });

    return (
        <div className="h-full min-h-[220px] rounded-xl border border-white/10 bg-black/20 p-4">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                        Loop Timeline
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                        {status}
                    </div>
                </div>

                <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/40">
                        Duration
                    </div>
                    <div className="mt-2 text-sm font-semibold text-white/80">
                        {durationLabel}
                    </div>
                </div>
            </div>

            <div className="mt-6 flex h-[130px] items-end gap-1 rounded-xl border border-white/10 bg-black/30 p-3">
                {bars.map((height, index) => (
                    <div
                        key={index}
                        className={`flex-1 rounded-full transition-colors duration-150 ${index / bars.length <= progress || isRecording
                                ? "bg-emerald-300/80"
                                : "bg-white/15"
                            }`}
                        style={{ height: `${height}%` }}
                    />
                ))}
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
                <div
                    className="h-full rounded-full bg-emerald-300 transition-[width] duration-75"
                    style={{ width: `${progress * 100}%` }}
                />
            </div>
        </div>
    );
}

export function LooperView() {
    const [activeControls, setActiveControls] = useState(() => new Set());
    const [playbackMasterVolume, setPlaybackMasterVolume] = useState(0);
    const [isExpressionActive, setIsExpressionActive] = useState(false);
    const [isRecordingFirstLoop, setIsRecordingFirstLoop] = useState(false);
    const [hasRecordedLoop, setHasRecordedLoop] = useState(false);
    const [isLoopPlaying, setIsLoopPlaying] = useState(false);
    const [loopDurationMs, setLoopDurationMs] = useState(0);
    const [loopPositionMs, setLoopPositionMs] = useState(0);
    const [looperTypeIndex, setLooperTypeIndex] = useState(0);

    const releaseTimersRef = useRef(new Map());
    const expressionTimerRef = useRef(null);
    const recordingStartRef = useRef(null);
    const playbackStartRef = useRef(null);

    const badgesByControl = useMemo(
        () => new Map(LOOPER_DEBUG_BADGES.map((badge) => [badge.control, badge])),
        []
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

    const flashControl = useCallback((control) => {
        clearControlTimer(control);
        setControlActive(control, true);

        const timer = window.setTimeout(() => {
            setControlActive(control, false);
            releaseTimersRef.current.delete(control);
        }, MOMENTARY_ACTIVE_MS);

        releaseTimersRef.current.set(control, timer);
    }, [clearControlTimer, setControlActive]);

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

    const handleLooperControl = useCallback((control, value = 127) => {
        if (control === MIDI_CONTROLS.EXPR) {
            activateExpression(midiValueToPlaybackMasterVolume(value));
            return;
        }

        if (!badgesByControl.has(control)) return;

        if (control === MIDI_CONTROLS.FS_A) {
            setIsLoopPlaying(false);
            playbackStartRef.current = null;
        }

        if (control === MIDI_CONTROLS.FS_A_LONG) {
            setIsRecordingFirstLoop(false);
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
            setLooperTypeIndex((index) => (index + 1) % LOOPER_TYPES.length);
        }

        if (control === MIDI_CONTROLS.FS_B) {
            clearControlTimer(MIDI_CONTROLS.FS_B);
            setControlActive(MIDI_CONTROLS.FS_B, true);

            if (!hasRecordedLoop && !isRecordingFirstLoop) {
                recordingStartRef.current = performance.now();
                playbackStartRef.current = null;
                setIsRecordingFirstLoop(true);
                setIsLoopPlaying(false);
                setLoopPositionMs(0);
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
                setIsLoopPlaying(true);
                recordingStartRef.current = null;
                playbackStartRef.current = performance.now();
            }

            flashControl(MIDI_CONTROLS.FS_B_RELEASE);
            return;
        }

        if (MOMENTARY_CONTROLS.has(control)) {
            flashControl(control);
        }
    }, [
        activateExpression,
        badgesByControl,
        clearControlTimer,
        flashControl,
        hasRecordedLoop,
        isRecordingFirstLoop,
        setControlActive,
    ]);

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

            releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            releaseTimersRef.current.clear();

            if (expressionTimerRef.current) {
                window.clearTimeout(expressionTimerRef.current);
                expressionTimerRef.current = null;
            }
        };
    }, [handleLooperControl]);

    return (
        <div className="h-full w-full p-3 min-h-0">
            <div className="h-full min-h-0 flex flex-col gap-3">
                <Panel className="min-h-0">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="text-[18px] font-semibold tracking-wide truncate">
                                LOOPER
                            </div>
                            <div className={`rounded-full border px-3 py-1 text-xs font-semibold text-white/80 ${LOOPER_TYPES[looperTypeIndex].classes}`}>
                                [{LOOPER_TYPES[looperTypeIndex].label}]
                            </div>
                        </div>
                    </div>
                </Panel>

                <Panel className="flex-1 min-h-0">
                    <div className="p-4 h-full min-h-0">
                        <Inset className="h-full min-h-0 p-4">
                            <div className="grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(190px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3">
                                <div className="col-span-4 row-span-1 min-h-0">
                                    <LooperTimeline
                                        isRecording={isRecordingFirstLoop}
                                        hasRecordedLoop={hasRecordedLoop}
                                        isPlaying={isLoopPlaying}
                                        loopDurationMs={loopDurationMs}
                                        loopPositionMs={loopPositionMs}
                                    />
                                </div>

                                <div className="col-span-4 row-span-2 grid grid-cols-4 grid-rows-2 gap-3 self-end">
                                    {LOOPER_DEBUG_BADGES.map((badge) => (
                                        <LooperControlButton
                                            key={badge.control}
                                            badge={badge}
                                            active={activeControls.has(badge.control)}
                                            activeClasses={
                                                badge.control === MIDI_CONTROLS.FS_D
                                                    ? LOOPER_TYPES[looperTypeIndex].classes
                                                    : undefined
                                            }
                                            onClick={() => handleLooperControl(badge.control)}
                                        />
                                    ))}
                                </div>

                                <div
                                    className={`col-start-5 row-span-2 row-start-2 rounded-xl border px-3 py-4 transition-all duration-150 ${isExpressionActive
                                            ? "border-sky-300 bg-sky-400/20 shadow-[0_0_18px_rgba(56,189,248,0.35)]"
                                            : "border-white/10 bg-black/20"
                                        }`}
                                >
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/50">
                                        CC 10 · EXPR
                                    </div>

                                    <div className="mt-3 text-sm font-semibold leading-snug text-white">
                                        Playback Master Volume
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

                                    <div className="mt-1 text-center text-4xl font-bold tabular-nums text-white">
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