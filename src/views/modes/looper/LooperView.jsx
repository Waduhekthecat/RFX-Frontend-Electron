import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;
const LOOP_PREVIEW_TICK_MS = 33;

const LOOPER_TYPES = [
    { label: "Post-FX", classes: "border-fuchsia-300 bg-fuchsia-400/20 shadow-[0_0_18px_rgba(217,70,239,0.35)]" },
    { label: "Pre-FX", classes: "border-amber-300 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]" },
];

const LOOPER_DEBUG_BADGES = [
    {
        cc: 11,
        control: MIDI_CONTROLS.FS_A,
        footswitch: "FS_A",
        command: "Stop Playback",
    },
    {
        cc: 12,
        control: MIDI_CONTROLS.FS_B,
        footswitch: "FS_B",
        command: "Start Record",
    },
    {
        cc: 13,
        control: MIDI_CONTROLS.FS_C,
        footswitch: "FS_C",
        command: "Start Playback",
    },
    {
        cc: 14,
        control: MIDI_CONTROLS.FS_D,
        footswitch: "FS_D",
        command: "Toggle Looper Type - Unavailable/Future",
    },
    {
        cc: 101,
        control: MIDI_CONTROLS.FS_A_LONG,
        footswitch: "FS_A",
        command: "Delete Loop Audio",
    },
    {
        cc: 102,
        control: MIDI_CONTROLS.FS_B_RELEASE,
        footswitch: "FS_B",
        command: "Stop Record / Start Playback",
    },
    {
        cc: 103,
        control: MIDI_CONTROLS.FS_C_LONG,
        footswitch: "FS_C",
        command: "Unavailable/Future",
    },
    {
        cc: 104,
        control: MIDI_CONTROLS.FS_D_LONG,
        footswitch: "FS_D",
        command: "Exit Looper Mode",
    },
];

const MOMENTARY_CONTROLS = new Set([
    MIDI_CONTROLS.FS_A,
    MIDI_CONTROLS.FS_A_LONG,
    MIDI_CONTROLS.FS_C,
    MIDI_CONTROLS.FS_C_LONG,
    MIDI_CONTROLS.FS_D,
]);

const formatPlaybackMasterVolume = (value = 0) => ((value / 127) * 10).toFixed(1);

function LooperDebugBadge({ badge, active, activeClasses = "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]" }) {    return (
        <div
            className={`rounded-xl border px-3 py-3 min-h-[112px] transition-all duration-150 ${active
                    ? activeClasses
                    : "border-white/10 bg-black/20"
                }`}
        >
            <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.18em] text-white/50">
                <span>CC {badge.cc}</span>
                <span>{badge.footswitch}</span>
            </div>
            <div className="mt-3 text-sm font-semibold leading-snug text-white">
                {badge.command}
            </div>
        </div>
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
        return 18 + (wave * 46) + (accent * 22);
    });

    return (
        <div className="relative h-full min-h-[220px] overflow-hidden rounded-2xl border border-white/10 bg-black/25 p-4">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.16),transparent_30%),radial-gradient(circle_at_80%_35%,rgba(56,189,248,0.14),transparent_28%)]" />
            <div
                className="absolute bottom-0 top-0 w-px bg-emerald-200 shadow-[0_0_20px_rgba(110,231,183,0.75)] transition-[left] duration-75"
                style={{ left: `${progress * 100}%` }}
            />
            <div className="relative z-10 flex h-full flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Loop Timeline / Waveform</div>
                        <div className="mt-2 text-lg font-semibold text-white">{status}</div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold tabular-nums text-white/70">
                        {durationLabel}
                    </div>
                </div>

                <div className="flex h-28 items-center gap-1.5">
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

                <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full rounded-full bg-emerald-300 transition-[width] duration-75"
                        style={{ width: `${progress * 100}%` }}
                    />
                </div>
            </div>
        </div>
    );
}

export function LooperView() {
    const [activeControls, setActiveControls] = useState(() => new Set());
    const [playbackMasterVolume, setPlaybackMasterVolume] = useState("0.0");
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

    useEffect(() => {
        const clearControlTimer = (control) => {
            const timer = releaseTimersRef.current.get(control);

            if (!timer) return;

            window.clearTimeout(timer);
            releaseTimersRef.current.delete(control);
        };

        const setControlActive = (control, active) => {
            setActiveControls((currentControls) => {
                const nextControls = new Set(currentControls);

                if (active) {
                    nextControls.add(control);
                } else {
                    nextControls.delete(control);
                }

                return nextControls;
            });
        };

        const flashControl = (control) => {
            clearControlTimer(control);
            setControlActive(control, true);

            const timer = window.setTimeout(() => {
                setControlActive(control, false);
                releaseTimersRef.current.delete(control);
            }, MOMENTARY_ACTIVE_MS);

            releaseTimersRef.current.set(control, timer);
        };

        const handler = (event) => {
            const { command, payload } = event.detail || {};

            if (command !== "LOOPER_DEBUG_MIDI_CONTROL") return;

            if (payload.control === MIDI_CONTROLS.EXPR) {
                setPlaybackMasterVolume(formatPlaybackMasterVolume(payload.value));
                setIsExpressionActive(true);

                if (expressionTimerRef.current) {
                    window.clearTimeout(expressionTimerRef.current);
                }

                expressionTimerRef.current = window.setTimeout(() => {
                    setIsExpressionActive(false);
                    expressionTimerRef.current = null;
                }, EXPRESSION_IDLE_MS);

                return;
            }

            if (!badgesByControl.has(payload.control)) return;

            if (payload.control === MIDI_CONTROLS.FS_A) {
                setIsLoopPlaying(false);
                playbackStartRef.current = null;
            }

            if (payload.control === MIDI_CONTROLS.FS_A_LONG) {
                setIsRecordingFirstLoop(false);
                setHasRecordedLoop(false);
                setIsLoopPlaying(false);
                setLoopDurationMs(0);
                setLoopPositionMs(0);
                recordingStartRef.current = null;
                playbackStartRef.current = null;
            }

            if (payload.control === MIDI_CONTROLS.FS_C) {
                setHasRecordedLoop((recorded) => {
                    if (recorded) {
                        playbackStartRef.current = performance.now();
                        setLoopPositionMs(0);
                        setIsLoopPlaying(true);
                    }

                    return recorded;
                });
            }

            if (payload.control === MIDI_CONTROLS.FS_D) {
                setLooperTypeIndex((index) => (index + 1) % LOOPER_TYPES.length);
            }

            if (payload.control === MIDI_CONTROLS.FS_B) {
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

            if (payload.control === MIDI_CONTROLS.FS_B_RELEASE) {
                setControlActive(MIDI_CONTROLS.FS_B, false);

                if (isRecordingFirstLoop && recordingStartRef.current) {
                    const duration = Math.max(performance.now() - recordingStartRef.current, LOOP_PREVIEW_TICK_MS);

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

            if (MOMENTARY_CONTROLS.has(payload.control)) {
                flashControl(payload.control);
            }
        };

        window.addEventListener("rfx-midi-command", handler);

        return () => {
            window.removeEventListener("rfx-midi-command", handler);
            releaseTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            releaseTimersRef.current.clear();

            if (expressionTimerRef.current) {
                window.clearTimeout(expressionTimerRef.current);
            }
        };
    }, [badgesByControl, hasRecordedLoop, isRecordingFirstLoop]);

    return (
        <div className="h-full w-full p-3 min-h-0">
            <div className="h-full min-h-0 flex flex-col gap-3">
                <Panel className="min-h-0">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="text-[18px] font-semibold tracking-wide truncate">
                            LOOPER
                        </div>
                    </div>
                </Panel>

                <Panel className="flex-1 min-h-0">
                    <div className="p-4 h-full min-h-0">
                        <Inset className="h-full min-h-0 p-4">
                            <div className="grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(160px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3">
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
                                        <LooperDebugBadge
                                            key={badge.control}
                                            badge={badge}
                                            active={activeControls.has(badge.control)}
                                            activeClasses={badge.control === MIDI_CONTROLS.FS_D ? LOOPER_TYPES[looperTypeIndex].classes : undefined}
                                        />
                                    ))}
                                </div>

                                <div className={`col-start-5 row-span-2 row-start-2 rounded-xl border px-3 py-4 transition-all duration-150 ${isExpressionActive
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
                                    <div className="mt-5 text-4xl font-bold tabular-nums text-white">
                                        {playbackMasterVolume}
                                    </div>
                                    <div className="mt-6 text-[11px] uppercase tracking-[0.18em] text-white/40">
                                        Looper Type
                                    </div>
                                    <div className="mt-2 text-sm font-semibold text-white/80">
                                        {LOOPER_TYPES[looperTypeIndex].label}
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