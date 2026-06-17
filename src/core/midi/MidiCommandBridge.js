import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MIDI_CONTROLS, MIDI_EVENT_TYPES } from "./MidiMapper.js";
import { RFX_MODES } from "../modes/Modes.js";

const LONG_PRESS_MS = 500;

const MIDI_GESTURES = Object.freeze({
    FS_A_LONG: "FS_A_LONG",
    FS_B_LONG: "FS_B_LONG",
    FS_C_LONG: "FS_C_LONG",
    FS_D_LONG: "FS_D_LONG",
});

const RELEASE_TO_PHYSICAL_CONTROL = {
    [MIDI_CONTROLS.FS_A_RELEASE]: MIDI_CONTROLS.FS_A,
    [MIDI_CONTROLS.FS_B_RELEASE]: MIDI_CONTROLS.FS_B,
    [MIDI_CONTROLS.FS_C_RELEASE]: MIDI_CONTROLS.FS_C,
    [MIDI_CONTROLS.FS_D_RELEASE]: MIDI_CONTROLS.FS_D,
};

const PHYSICAL_TO_RELEASE_CONTROL = {
    [MIDI_CONTROLS.FS_A]: MIDI_CONTROLS.FS_A_RELEASE,
    [MIDI_CONTROLS.FS_B]: MIDI_CONTROLS.FS_B_RELEASE,
    [MIDI_CONTROLS.FS_C]: MIDI_CONTROLS.FS_C_RELEASE,
    [MIDI_CONTROLS.FS_D]: MIDI_CONTROLS.FS_D_RELEASE,
};

const PHYSICAL_TO_LONG_GESTURE_CONTROL = {
    [MIDI_CONTROLS.FS_A]: MIDI_GESTURES.FS_A_LONG,
    [MIDI_CONTROLS.FS_B]: MIDI_GESTURES.FS_B_LONG,
    [MIDI_CONTROLS.FS_C]: MIDI_GESTURES.FS_C_LONG,
    [MIDI_CONTROLS.FS_D]: MIDI_GESTURES.FS_D_LONG,
};

export class MidiCommandBridge {
    constructor({ modeManager, dispatchCommand }) {
        this.modeManager = modeManager;
        this.dispatchCommand = dispatchCommand;
        this.pressStateByControl = new Map();
    }

    handleMappedControl(mappedEvent) {
        if (!mappedEvent || mappedEvent.type !== "mapped-control") return;

        const mode = this.modeManager.getMode();

        console.log("[MIDI COMMAND BRIDGE] raw mapped event", {
            mode,
            control: mappedEvent.control,
            eventType: mappedEvent.eventType,
            value: mappedEvent.value,
            normalizedValue: mappedEvent.normalizedValue,
        });

        if (mappedEvent.eventType === MIDI_EVENT_TYPES.CONTINUOUS) {
            this.dispatchToMode(mode, mappedEvent);
            return;
        }

        if (mappedEvent.control === MIDI_CONTROLS.FS_B && mappedEvent.eventType === MIDI_EVENT_TYPES.PRESS) {
            this.startGestureTracking(mappedEvent, mode);
            this.dispatchToMode(mode, mappedEvent);
            return;
        }

        if (mappedEvent.control === MIDI_CONTROLS.FS_B_RELEASE && mappedEvent.eventType === MIDI_EVENT_TYPES.RELEASE) {
            this.dispatchToMode(mode, mappedEvent);

            const state = this.pressStateByControl.get(MIDI_CONTROLS.FS_B);
            if (state) {
                this.clearPressState(MIDI_CONTROLS.FS_B);
                console.log("[MIDI COMMAND BRIDGE] release cleanup", {
                    mode: state.modeAtPressStart,
                    control: mappedEvent.control,
                    longFired: state.longFired,
                });
            }
            return;
        }

        if (mappedEvent.eventType === MIDI_EVENT_TYPES.PRESS) {
            this.startGestureTracking(mappedEvent, mode);
            return;
        }

        if (mappedEvent.eventType === MIDI_EVENT_TYPES.RELEASE) {
            this.finishGestureTracking(mappedEvent, mode);
        }
    }

    dispatchToMode(mode, mappedEvent) {
        if (mode === RFX_MODES.PERFORM) {
            this.handlePerformMode(mappedEvent);
            return;
        }

        if (mode === RFX_MODES.TUNER) {
            this.handleTunerMode(mappedEvent);
            return;
        }

        if (mode === RFX_MODES.LOOPER) {
            this.handleLooperMode(mappedEvent);
            return;
        }

        if (mode === RFX_MODES.AUTOMATION) {
            this.handleAutomationMode(mappedEvent);
        }
    }

    startGestureTracking(mappedEvent, modeAtPressStart) {
        const { control } = mappedEvent;
        const longGestureControl = PHYSICAL_TO_LONG_GESTURE_CONTROL[control];

        if (!longGestureControl) {
            this.dispatchToMode(modeAtPressStart, mappedEvent);
            return;
        }

        this.clearPressState(control);

        const state = {
            startedAt: performance.now(),
            modeAtPressStart,
            longFired: false,
            timer: null,
        };

        console.log("[MIDI COMMAND BRIDGE] gesture start", {
            mode: modeAtPressStart,
            control,
        });

        state.timer = window.setTimeout(() => {
            const currentState = this.pressStateByControl.get(control);
            if (!currentState || currentState.longFired) return;

            currentState.longFired = true;

            console.log("[MIDI COMMAND BRIDGE] logical long fired", {
                mode: currentState.modeAtPressStart,
                control: longGestureControl,
                physicalControl: control,
            });

            this.dispatchToMode(currentState.modeAtPressStart, {
                ...mappedEvent,
                control: longGestureControl,
                eventType: MIDI_EVENT_TYPES.PRESS,
            });
        }, LONG_PRESS_MS);

        this.pressStateByControl.set(control, state);
    }

    finishGestureTracking(mappedEvent, currentMode) {
        const physicalControl = RELEASE_TO_PHYSICAL_CONTROL[mappedEvent.control] ?? mappedEvent.control;
        const state = this.pressStateByControl.get(physicalControl);

        if (!state) return;

        this.clearPressState(physicalControl);

        const releaseControl = PHYSICAL_TO_RELEASE_CONTROL[physicalControl] ?? mappedEvent.control;

        const shortMappedEvent = {
            ...mappedEvent,
            control: physicalControl,
            eventType: MIDI_EVENT_TYPES.PRESS,
        };

        const shouldRunLooperFsAReleaseCleanup =
            state.modeAtPressStart === RFX_MODES.LOOPER &&
            physicalControl === MIDI_CONTROLS.FS_A &&
            state.longFired;

        if (shouldRunLooperFsAReleaseCleanup) {
            console.log("[MIDI COMMAND BRIDGE] release cleanup", {
                mode: state.modeAtPressStart,
                control: physicalControl,
            });

            this.dispatchToMode(state.modeAtPressStart, shortMappedEvent);
            return;
        }

        if (state.longFired) {
            console.log("[MIDI COMMAND BRIDGE] release cleanup", {
                mode: state.modeAtPressStart,
                control: releaseControl,
                suppressedShort: true,
            });
            return;
        }

        if (currentMode !== state.modeAtPressStart) {
            console.log("[MIDI COMMAND BRIDGE] release cleanup", {
                modeAtPressStart: state.modeAtPressStart,
                currentMode,
                control: releaseControl,
                suppressedShort: true,
            });
            return;
        }

        console.log("[MIDI COMMAND BRIDGE] short fired on release", {
            mode: state.modeAtPressStart,
            control: physicalControl,
        });

        this.dispatchToMode(state.modeAtPressStart, shortMappedEvent);
    }

    clearPressState(control) {
        const state = this.pressStateByControl.get(control);
        if (!state) return;

        if (state.timer) {
            window.clearTimeout(state.timer);
        }

        this.pressStateByControl.delete(control);
    }

    handlePerformMode({ control, eventType, normalizedValue }) {
        if (eventType === MIDI_EVENT_TYPES.RELEASE) {
            console.log("[MIDI] Perform release ignored:", control);
            return;
        }

        if (eventType === MIDI_EVENT_TYPES.CONTINUOUS) {
            this.dispatchCommand("EXPRESSION_CONTROL", {
                expression: control,
                value: normalizedValue,
                source: "midi",
            });
            return;
        }

        switch (control) {
            case MIDI_CONTROLS.FS_A:
                this.dispatchCommand({
                    name: "selectActiveBus",
                    busId: "FX_1",
                });
                break;

            case MIDI_CONTROLS.FS_B:
                this.dispatchCommand({
                    name: "selectActiveBus",
                    busId: "FX_2",
                });
                break;

            case MIDI_CONTROLS.FS_C:
                this.dispatchCommand({
                    name: "selectActiveBus",
                    busId: "FX_3",
                });
                break;

            case MIDI_CONTROLS.FS_D:
                this.dispatchCommand({
                    name: "selectActiveBus",
                    busId: "FX_4",
                });
                break;

            case MIDI_GESTURES.FS_A_LONG:
                this.modeManager.setMode(RFX_MODES.TUNER);
                this.dispatchCommand("ENTER_TUNER_MODE", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_GESTURES.FS_B_LONG:
                console.log("[MIDI] FS_B long not assigned yet");
                break;

            case MIDI_GESTURES.FS_C_LONG:
                this.modeManager.setMode(RFX_MODES.AUTOMATION);
                this.dispatchCommand("ENTER_AUTOMATION_MODE", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_GESTURES.FS_D_LONG:
                this.modeManager.setMode(RFX_MODES.LOOPER);
                this.dispatchCommand("ENTER_LOOPER_MODE", {
                    source: "midi",
                    control,
                });
                break;

            default:
                console.log("[MIDI] Unhandled perform control:", control);
        }
    }

    handleTunerMode({ control }) {
        if (control === MIDI_GESTURES.FS_A_LONG) {
            this.modeManager.setMode(RFX_MODES.PERFORM);
            this.dispatchCommand("EXIT_TUNER_MODE", {
                source: "midi",
                control,
            });
            return;
        }

        if (control === MIDI_GESTURES.FS_B_LONG) {
            console.log("[MIDI] FS_B long not assigned yet");
            return;
        }

        console.log("[MIDI] Tuner mode control not implemented yet:", control);
    }

    handleLooperMode({ control, value, normalizedValue }) {
        if (control === MIDI_GESTURES.FS_B_LONG) {
            console.log("[MIDI] FS_B long not assigned yet");
            return;
        }

        if (control === MIDI_GESTURES.FS_D_LONG) {
            this.modeManager.setMode(RFX_MODES.PERFORM);
            this.dispatchCommand("EXIT_LOOPER_MODE", {
                source: "midi",
                control,
            });
            return;
        }

        this.dispatchCommand("LOOPER_DEBUG_MIDI_CONTROL", {
            source: "midi",
            control,
            value,
            normalizedValue,
        });
    }

    handleAutomationMode({ control, eventType, normalizedValue }) {
        if (eventType === MIDI_EVENT_TYPES.CONTINUOUS) {
            this.dispatchCommand("AUTOMATION_EXPRESSION_CONTROL", {
                expression: control,
                value: normalizedValue,
                source: "midi",
            });
            return;
        }

        switch (control) {
            case MIDI_CONTROLS.FS_A:
                this.dispatchCommand("AUTOMATION_PLAY_OR_STOP", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_GESTURES.FS_A_LONG:
                this.dispatchCommand("AUTOMATION_CLEAR", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_GESTURES.FS_B_LONG:
                console.log("[MIDI] FS_B long not assigned yet");
                break;

            case MIDI_CONTROLS.FS_D:
                this.dispatchCommand("AUTOMATION_RECORD_OR_FINISH", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_GESTURES.FS_C_LONG:
                this.modeManager.setMode(RFX_MODES.PERFORM);
                this.dispatchCommand("EXIT_AUTOMATION_MODE", {
                    source: "midi",
                    control,
                });
                break;

            default:
                console.log("[MIDI] Unhandled automation control:", control);
        }
    }
}

export function MidiNavigationBridge() {
    const navigate = useNavigate();

    useEffect(() => {
        const handler = (event) => {
            const { command } = event.detail || {};

            switch (command) {
                case "ENTER_LOOPER_MODE":
                    navigate("/looper");
                    break;

                case "ENTER_AUTOMATION_MODE":
                    navigate("/automation");
                    break;

                case "ENTER_TUNER_MODE":
                    navigate("/tuner");
                    break;

                case "EXIT_LOOPER_MODE":
                case "EXIT_AUTOMATION_MODE":
                case "EXIT_TUNER_MODE":
                    navigate("/");
                    break;

                default:
                    break;
            }
        };

        window.addEventListener("rfx-midi-command", handler);

        return () => {
            window.removeEventListener("rfx-midi-command", handler);
        };
    }, [navigate]);

    return null;
}
