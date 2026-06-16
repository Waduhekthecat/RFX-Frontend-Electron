import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";

const MOMENTARY_ACTIVE_MS = 350;
const EXPRESSION_IDLE_MS = 250;

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

function LooperDebugBadge({ badge, active }) {
    return (
        <div
            className={`rounded-xl border px-3 py-3 min-h-[112px] transition-all duration-150 ${active
                    ? "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]"
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

export function LooperView() {
    const [activeControls, setActiveControls] = useState(() => new Set());
    const [playbackMasterVolume, setPlaybackMasterVolume] = useState("0.0");
    const [isExpressionActive, setIsExpressionActive] = useState(false);
    const releaseTimersRef = useRef(new Map());
    const expressionTimerRef = useRef(null);

    const badgesByControl = useMemo(
        () => new Map(LOOPER_DEBUG_BADGES.map((badge) => [badge.control, badge])),
        []
    );

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

            if (payload.control === MIDI_CONTROLS.FS_B) {
                clearControlTimer(MIDI_CONTROLS.FS_B);
                setControlActive(MIDI_CONTROLS.FS_B, true);
                return;
            }

            if (payload.control === MIDI_CONTROLS.FS_B_RELEASE) {
                setControlActive(MIDI_CONTROLS.FS_B, false);
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
    }, [badgesByControl]);

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
                            <div className="grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(160px,0.75fr)] gap-3">
                                <div className="col-span-4 grid grid-cols-4 grid-rows-2 gap-3 self-start">
                                    {LOOPER_DEBUG_BADGES.map((badge) => (
                                        <LooperDebugBadge
                                            key={badge.control}
                                            badge={badge}
                                            active={activeControls.has(badge.control)}
                                        />
                                    ))}
                                </div>

                                <div
                                    className={`rounded-xl border px-3 py-4 transition-all duration-150 ${isExpressionActive
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
                                </div>
                            </div>
                        </Inset>
                    </div>
                </Panel>
            </div>
        </div>
    );
}