import React from "react";
import { Panel, Inset } from "../../../components/ui/Panel";
import { MIDI_CONTROLS } from "../../../core/midi/MidiMapper";
import { modeManager } from "../../../core/modes/ModeManager";
import { RFX_MODES } from "../../../core/modes/Modes";
import { useRfxStore } from "../../../core/rfx/Store";

const CONTROL_COLORS = {
    greenFaint: "border-emerald-300/25 bg-emerald-400/5 hover:border-emerald-300/45 hover:bg-emerald-400/15",
    greenActive: "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",
    grayFaint: "border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10",
    grayActive: "border-white/35 bg-white/10 shadow-[0_0_18px_rgba(255,255,255,0.18)]",
};

const TUNER_CONTROLS = [
    { control: MIDI_CONTROLS.FS_A_LONG, footswitch: "Hold FS_A", command: "Exit Tuner Mode", color: "green" },
    { control: MIDI_CONTROLS.FS_B, footswitch: "Tap FS_B", command: "Toggle Mute", color: "gray" },
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

function formatCents(centsValue) {
    if (!Number.isFinite(Number(centsValue))) return null;

    const value = Number(centsValue);
    const prefix = value >= 0 ? "+" : "";
    return `${prefix}${value.toFixed(1)}¢`;
}

export function TunerView() {
    const [activeControls, setActiveControls] = React.useState(() => new Set());
    const [tunerState, setTunerState] = React.useState(null);
    const tunerMuted = useRfxStore((state) => state.session?.tunerMuted ?? true);
    const setTunerMuted = useRfxStore((state) => state.setTunerMuted);
    const dispatchIntent = useRfxStore((state) => state.dispatchIntent);

    const exitTunerMode = React.useCallback(async () => {
        try {
            await dispatchIntent({ name: "exitTunerMode" });
        } catch (error) {
            console.warn("[TUNER] failed to dispatch exitTunerMode", error);
        }

        modeManager.setMode(RFX_MODES.PERFORM, { source: "ui" });
    }, [dispatchIntent]);

    const refreshTunerMuteState = React.useCallback(async () => {
        const api = window.rfx?.transport;
        if (!api?.syscall) return;

        try {
            const result = await api.syscall({ name: "getTunerMasterSendState" });
            if (result?.ok) {
                setTunerMuted(!!result.muted);
            }
        } catch (error) {
            console.warn("[TUNER] failed to read mute state", error);
        }
    }, [setTunerMuted]);

    const toggleTunerMasterSend = React.useCallback(async () => {
        const api = window.rfx?.transport;
        if (!api?.syscall) return;

        try {
            const result = await api.syscall({ name: "toggleTunerMasterSend" });
            if (result?.ok) {
                setTunerMuted(!!result.muted);
            } else {
                await refreshTunerMuteState();
            }
        } catch (error) {
            console.warn("[TUNER] failed to toggle master send", error);
        }
    }, [refreshTunerMuteState, setTunerMuted]);

    const handleTunerControl = React.useCallback((control) => {
        if (control === MIDI_CONTROLS.FS_A_LONG) {
            void exitTunerMode();
            return;
        }

        if (control === MIDI_CONTROLS.FS_B) {
            void toggleTunerMasterSend();
        }
    }, [exitTunerMode, toggleTunerMasterSend]);

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

    React.useEffect(() => {
        void refreshTunerMuteState();
    }, [refreshTunerMuteState]);

    React.useEffect(() => {
        const api = window.rfx?.transport;
        if (!api?.onTunerData) return undefined;

        // Subscribe to tuner IPC events from the main process. Add a debug
        // log so we can confirm events are arriving in the renderer.
        return api.onTunerData((next) => {
            try {
                // Helpful debug: visible in renderer console (DevTools)
                // and also appears in any attached renderer logs.
                console.log("[TUNER] ipc -> renderer", next);
            } catch (e) {}

            setTunerState(next ?? null);
        });
    }, []);
    // Display state shown in the UI. This differs from `tunerState` which is
    // the raw incoming payload — when we receive a blank reading we wait 2s
    // before clearing the visible note to "--".
    const [display, setDisplay] = React.useState(() => ({ hasPitch: 0, note: null, octave: null, cents: null }));
    const fadeTimeoutRef = React.useRef(null);

    // Mirror incoming tunerState into the displayed state with fade logic.
    React.useEffect(() => {
        // Clear any existing timer if component unmounts or tunerState changes.
        return () => {
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
                fadeTimeoutRef.current = null;
            }
        };
    }, []);

    React.useEffect(() => {
        const incomingHas = Number(tunerState?.hasPitch) === 1;

        if (incomingHas) {
            // New pitch arrived — cancel any pending fade and show immediately.
            if (fadeTimeoutRef.current) {
                clearTimeout(fadeTimeoutRef.current);
                fadeTimeoutRef.current = null;
            }

            setDisplay({
                hasPitch: 1,
                note: tunerState?.note ?? null,
                octave: tunerState?.octave ?? null,
                cents: Number.isFinite(Number(tunerState?.cents)) ? Number(tunerState.cents) : null,
            });
            return;
        }

        // Blank reading: schedule clearing the displayed note after 2s.
        if (!incomingHas) {
            if (fadeTimeoutRef.current) return; // already scheduled

            fadeTimeoutRef.current = setTimeout(() => {
                setDisplay({ hasPitch: 0, note: null, octave: null, cents: null });
                fadeTimeoutRef.current = null;
            }, 2000);
        }
    }, [tunerState]);

    const shownHasPitch = Number(display?.hasPitch) === 1;
    const shownCentsValue = Number.isFinite(Number(display?.cents)) ? Number(display.cents) : null;
    const shownAbsCents = shownCentsValue == null ? null : Math.abs(shownCentsValue);
    const shownIsCentered = shownAbsCents != null && shownAbsCents <= 0.1;
    const shownIsNearCenter = shownAbsCents != null && shownAbsCents <= 3 && shownAbsCents > 0.1;
    const shownArrowColorClass = shownIsCentered ? "text-emerald-400" : shownIsNearCenter ? "text-amber-400" : "text-rose-500";
    const shownNoteColorClass = shownIsCentered ? "text-emerald-400" : "text-white/95";
    const shownCentsText = formatCents(shownCentsValue);
    const shownNoteLabel = shownHasPitch && display?.note ? `${display.note}${display.octave != null ? display.octave : ""}` : "--";

    // Arrow activity state and presentation helpers.
    const leftActive = shownHasPitch && shownCentsValue != null && shownCentsValue < 0 && !shownIsCentered;
    const rightActive = shownHasPitch && shownCentsValue != null && shownCentsValue > 0 && !shownIsCentered;
    const leftDouble = shownCentsValue != null && shownCentsValue < 0 && Math.abs(shownCentsValue) > 8;
    const rightDouble = shownCentsValue != null && shownCentsValue > 0 && Math.abs(shownCentsValue) > 8;
    const leftGlyph = leftDouble ? ">>" : ">";
    const rightGlyph = rightDouble ? "<<" : "<";
    const inactiveArrowColor = "text-neutral-600"; // faint dark gray
    const inactiveArrowOpacity = "opacity-30";

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
                                <div className="min-h-0 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm shadow-inner h-full">
                                    <div className="relative flex h-full min-h-0 items-center justify-center rounded-lg border border-dashed border-white/15 bg-white/[0.03]">
                                        <div className={`absolute left-4 top-4 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] backdrop-blur-sm transition-all duration-200 ${tunerMuted ? "border-rose-400/70 bg-rose-500 text-white shadow-[0_0_18px_rgba(244,63,94,0.25)]" : "border-white/10 bg-white/10 text-white/35 opacity-60 blur-[0.6px]"}`}>
                                            Mute
                                        </div>
                                        <div className="text-center">
                                            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-white/40">
                                                Tuner Panel
                                            </div>
                                            <div className="mt-3 flex items-center justify-center gap-12 h-full">
                                                {/* Left arrow column */}
                                                <div className="flex items-center justify-center w-28 h-full">
                                                    <span
                                                        className={`text-6xl transition-colors duration-180 ${leftActive ? shownArrowColorClass : inactiveArrowColor} ${leftActive ? "opacity-100" : inactiveArrowOpacity}`}
                                                        aria-hidden="true"
                                                    >
                                                        {leftGlyph}
                                                    </span>
                                                </div>

                                                {/* Large note label */}
                                                <div className={`transition-colors duration-180 ${shownNoteColorClass} text-center w-80 h-full flex items-center justify-center`}>
                                                    <div className="text-[6.5rem] font-extrabold leading-tight tracking-[0.06em] w-full text-center truncate">
                                                        <span className={`inline-block transition-opacity duration-300 ${shownHasPitch ? "opacity-100" : "opacity-70"}`}>
                                                            {shownNoteLabel}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Right arrow column */}
                                                <div className="flex items-center justify-center w-28 h-full">
                                                    <span
                                                        className={`text-6xl transition-colors duration-180 ${rightActive ? shownArrowColorClass : inactiveArrowColor} ${rightActive ? "opacity-100" : inactiveArrowOpacity}`}
                                                        aria-hidden="true"
                                                    >
                                                        {rightGlyph}
                                                    </span>
                                                </div>
                                            </div>

                                            {!shownHasPitch ? (
                                                <div className="mt-2 text-sm font-medium text-white/45">
                                                    Awaiting pitch input
                                                </div>
                                            ) : null}

                                            {shownHasPitch && !shownIsCentered && shownCentsText ? (
                                                <div className={`mt-2 text-sm font-medium ${shownArrowColorClass}`}>
                                                    {shownCentsText}
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="grid min-h-0 grid-cols-4 gap-3 items-stretch">
                                    {(() => {
                                        const firstBadge = TUNER_CONTROLS[0];
                                        const secondBadge = TUNER_CONTROLS[1];
                                        const thirdBadge = TUNER_CONTROLS[2];
                                        const fourthBadge = TUNER_CONTROLS[3];

                                        const firstClasses = getControlClasses(firstBadge.color);
                                        const secondClasses = getControlClasses(secondBadge.color);
                                        const thirdClasses = getControlClasses(thirdBadge.color);
                                        const fourthClasses = getControlClasses(fourthBadge.color);

                                        return (
                                            <>
                                                <TunerControlButton
                                                    key={firstBadge.control}
                                                    badge={firstBadge}
                                                    active={activeControls.has(firstBadge.control)}
                                                    inactiveClasses={firstClasses.inactiveClasses}
                                                    activeClasses={firstClasses.activeClasses}
                                                    onPointerDown={() => pressTunerControl(firstBadge.control)}
                                                    onPointerUp={() => releaseTunerControl(firstBadge.control)}
                                                />
                                                <TunerControlButton
                                                    key={secondBadge.control}
                                                    badge={secondBadge}
                                                    active={activeControls.has(secondBadge.control)}
                                                    inactiveClasses={secondClasses.inactiveClasses}
                                                    activeClasses={secondClasses.activeClasses}
                                                    onPointerDown={() => pressTunerControl(secondBadge.control)}
                                                    onPointerUp={() => releaseTunerControl(secondBadge.control)}
                                                />
                                                <TunerControlButton
                                                    key={thirdBadge.control}
                                                    badge={thirdBadge}
                                                    active={activeControls.has(thirdBadge.control)}
                                                    inactiveClasses={thirdClasses.inactiveClasses}
                                                    activeClasses={thirdClasses.activeClasses}
                                                    onPointerDown={() => pressTunerControl(thirdBadge.control)}
                                                    onPointerUp={() => releaseTunerControl(thirdBadge.control)}
                                                />
                                                <TunerControlButton
                                                    key={fourthBadge.control}
                                                    badge={fourthBadge}
                                                    active={activeControls.has(fourthBadge.control)}
                                                    inactiveClasses={fourthClasses.inactiveClasses}
                                                    activeClasses={fourthClasses.activeClasses}
                                                    onPointerDown={() => pressTunerControl(fourthBadge.control)}
                                                    onPointerUp={() => releaseTunerControl(fourthBadge.control)}
                                                />
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </Inset>
                    </div>
                </Panel>
            </div>
        </div>
    );
}
