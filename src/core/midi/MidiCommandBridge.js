import { MIDI_CONTROLS, MIDI_EVENT_TYPES } from "./MidiMapper";
import { RFX_MODES } from "../modes/modes";

export class MidiCommandBridge {
    constructor({ modeManager, dispatchCommand }) {
        this.modeManager = modeManager;
        this.dispatchCommand = dispatchCommand;
    }

    handleMappedControl(mappedEvent) {
        if (!mappedEvent || mappedEvent.type !== "mapped-control") return;
        if (mappedEvent.eventType === MIDI_EVENT_TYPES.RELEASE) return;

        const mode = this.modeManager.getMode();

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
            return;
        }
    }

    handlePerformMode({ control }) {
        switch (control) {
            case MIDI_CONTROLS.FS_A:
                this.dispatchCommand("selectActiveBus", {
                    busId: "FX_1",
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_B:
                this.dispatchCommand("selectActiveBus", {
                    busId: "FX_2",
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_C:
                this.dispatchCommand("selectActiveBus", {
                    busId: "FX_3",
                    source: "midi",
                    control,
                });
                break;

            case MIDI_CONTROLS.FS_D:
                this.dispatchCommand("selectActiveBus", {
                    busId: "FX_4",
                    source: "midi",
                    control,
                });
                break;

            default:
                console.log("[MIDI] Unhandled perform control:", control);
        }
    }

    handleTunerMode(mappedEvent) {
        console.log("[MIDI] Tuner mode not implemented yet:", mappedEvent);
    }

    handleLooperMode(mappedEvent) {
        console.log("[MIDI] Looper mode not implemented yet:", mappedEvent);
    }

    handleAutomationMode(mappedEvent) {
        console.log("[MIDI] Automation mode not implemented yet:", mappedEvent);
    }
}