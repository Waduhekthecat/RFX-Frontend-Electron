import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MIDI_CONTROLS, MIDI_EVENT_TYPES } from "./MidiMapper.js";
import { RFX_MODES } from "../modes/Modes.js";

export class MidiCommandBridge {
    constructor({ modeManager, dispatchCommand }) {
        this.modeManager = modeManager;
        this.dispatchCommand = dispatchCommand;
    }

    handleMappedControl(mappedEvent) {
        if (!mappedEvent || mappedEvent.type !== "mapped-control") return;

        const mode = this.modeManager.getMode();

        console.log("[MIDI COMMAND BRIDGE]", {
            mode,
            control: mappedEvent.control,
            eventType: mappedEvent.eventType,
            value: mappedEvent.value,
            normalizedValue: mappedEvent.normalizedValue,
        });

        if (mode === RFX_MODES.PERFORM) {
            this.handlePerformMode(mappedEvent);
            return;
        }

        if (mappedEvent.eventType === MIDI_EVENT_TYPES.RELEASE) return;

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
            return;
        }
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

            case MIDI_CONTROLS.FS_A_LONG:
                this.modeManager.setMode(RFX_MODES.TUNER);
                this.dispatchCommand("ENTER_TUNER_MODE", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_C_LONG:
                this.modeManager.setMode(RFX_MODES.AUTOMATION);
                this.dispatchCommand("ENTER_AUTOMATION_MODE", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_D_LONG:
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
        if (control === MIDI_CONTROLS.FS_A_LONG) {
            this.modeManager.setMode(RFX_MODES.PERFORM);
            this.dispatchCommand("EXIT_TUNER_MODE", {
                source: "midi",
                control,
            });
            return;
        }

        console.log("[MIDI] Tuner mode control not implemented yet:", control);
    }

    handleLooperMode({ control }) {
        switch (control) {
            case MIDI_CONTROLS.FS_A:
                this.dispatchCommand("LOOPER_STOP_AND_RETURN", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_A_LONG:
                this.dispatchCommand("LOOPER_CLEAR", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_D:
                this.dispatchCommand("LOOPER_RECORD_OR_FINISH", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_D_LONG:
                this.modeManager.setMode(RFX_MODES.PERFORM);
                this.dispatchCommand("EXIT_LOOPER_MODE", {
                    source: "midi",
                    control,
                });
                break;

            default:
                console.log("[MIDI] Unhandled looper control:", control);
        }
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

            case MIDI_CONTROLS.FS_A_LONG:
                this.dispatchCommand("AUTOMATION_CLEAR", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_D:
                this.dispatchCommand("AUTOMATION_RECORD_OR_FINISH", {
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_C_LONG:
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