import React from "react";
import { useNavigate } from "react-router-dom";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { getMidiRuntime } from "../../../core/midi/MidiInitialize";
import { RFX_MODES } from "../../../core/modes/Modes";

const CONTROL_COLORS = {
    greenFaint: "border-emerald-300/25 bg-emerald-400/5 hover:border-emerald-300/45 hover:bg-emerald-400/15",
    greenActive: "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",
    grayFaint: "border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10",
    grayActive: "border-white/35 bg-white/10 shadow-[0_0_18px_rgba(255,255,255,0.18)]",
};

const TUNER_CONTROLS = [
    { control: MIDI_CONTROLS.FS_A_LONG, footswitch: "Hold FS_A", command: "Exit Tuner Mode", color: "green" },
    { control: MIDI_CONTROLS.FS_B, footswitch: "Tap FS_B", command: "Unassigned", color: "gray" },
    { control: MIDI_CONTROLS.FS_C, footswitch: "Tap FS_C", command: "Unassigned", color: "gray" },
    { control: MIDI_CONTROLS.FS_D, footswitch: "Tap FS_D", command: "Unassigned", color: "gray" },
];

function getControlClasses(color) {
    if (color === "green") {
        return {
            inactiveClasses: CONTROL_COLORS.greenFaint,
            activeClasses: CONTROL_COLORS.greenActive,
        };
    }

    return {
        inactiveClasses: CONTROL_COLORS.grayFaint,
        activeClasses: CONTROL_COLORS.grayActive,
    };
}

function TunerControlButton({ badge, active, inactiveClasses, activeClasses, onPointerDown, onPointerUp, onKeyDown, onKeyUp }) {
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
            className={`flex h-full min-h-[96px] flex-col items-center justify-center rounded-xl border px-3 py-2 text-center transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 ${active ? activeClasses : inactiveClasses}`}    >
            <div className="text-sm font-semibold leading-snug text-white/50">
                <span>{badge.footswitch}</span>
            </div>

            <div className="mt-2 text-sm font-semibold leading-snug text-white">
                {badge.command}
            </div>
        </button>
    );
}

export function TunerView() {
    const navigate = useNavigate();
    const [activeControls, setActiveControls] = React.useState(() => new Set());

    const exitTunerMode = React.useCallback(() => {
        const runtime = getMidiRuntime();

        runtime?.modeManager?.setMode?.(RFX_MODES.PERFORM);
        window.dispatchEvent(
            new CustomEvent("rfx-midi-command", {
                detail: {
                    command: "EXIT_TUNER_MODE",
                    payload: { source: "ui", control: MIDI_CONTROLS.FS_A_LONG },
                },
            })
        );
        navigate("/");
    }, [navigate]);

    const handleTunerControl = React.useCallback((control) => {
        if (control === MIDI_CONTROLS.FS_A_LONG) {
            exitTunerMode();
        }
    }, [exitTunerMode]);

    const pressTunerControl = React.useCallback((control) => {
        setActiveControls((current) => {
            const next = new Set(current);
            next.add(control);
            return next;
        });
        handleTunerControl(control);
    }, [handleTunerControl]);

    const releaseTunerControl = React.useCallback((control) => {
        setActiveControls((current) => {
            const next = new Set(current);
            next.delete(control);
            return next;
        });
    }, []);

    const handleControlKeyDown = React.useCallback((event, control) => {
        if (event.key !== " " && event.key !== "Enter") return;
        if (event.repeat) return;

        event.preventDefault();
        pressTunerControl(control);
    }, [pressTunerControl]);

    const handleControlKeyUp = React.useCallback((event, control) => {
        if (event.key !== " " && event.key !== "Enter") return;

        event.preventDefault();
        releaseTunerControl(control);
    }, [releaseTunerControl]);

    return (
        <div className="h-full w-full p-3 min-h-0">
            <div className="h-full min-h-0 flex flex-col gap-3">
                <Panel className="min-h-0">
                    <div className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="text-[18px] font-semibold tracking-wide truncate">
                            TUNER
                        </div>
                    </div>
                </Panel>

                <Panel className="flex-1 min-h-0">
                    <div className="p-4 h-full min-h-0">
                        <Inset className="h-full min-h-0 p-4">
                            <div className="grid h-full min-h-0 grid-rows-[minmax(0,3fr)_minmax(0,1fr)] gap-3">
                                <div className="min-h-0 rounded-xl border border-white/10 bg-black/20 p-4">
                                    <div className="flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03]">
                                        <div className="text-center">
                                            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                                                Tuner Panel
                                            </div>
                                            <div className="mt-3 text-5xl font-semibold tracking-[0.08em] text-white/85">
                                                --
                                            </div>
                                            <div className="mt-2 text-sm font-medium text-white/45">
                                                Awaiting pitch input
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid min-h-0 grid-cols-4 gap-3 items-stretch">
                                    {TUNER_CONTROLS.map((badge) => {
                                        const { inactiveClasses, activeClasses } = getControlClasses(badge.color);

                                        return (
                                            <TunerControlButton
                                                key={badge.control}
                                                badge={badge}
                                                active={activeControls.has(badge.control)}
                                                inactiveClasses={inactiveClasses}
                                                activeClasses={activeClasses}
                                                onPointerDown={() => pressTunerControl(badge.control)}
                                                onPointerUp={() => releaseTunerControl(badge.control)}
                                                onKeyDown={(event) => handleControlKeyDown(event, badge.control)}
                                                onKeyUp={(event) => handleControlKeyUp(event, badge.control)}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        </Inset>
                    </div>
                </Panel>
            </div>
        </div>
    );
}