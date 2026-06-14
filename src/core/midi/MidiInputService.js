import { MIDI_CONTROLS, MIDI_EVENT_TYPES } from "./MidiMapper";
import { RFX_MODES } from "../modes/modes";

export class MidiCommandBridge {
  constructor({ modeManager, dispatchCommand }) {
    this.modeManager = modeManager;
    this.dispatchCommand = dispatchCommand;
  }

  handleMappedControl(mappedEvent) {
    if (!mappedEvent || mappedEvent.type !== "mapped-control") return;

    const { control, eventType, value, normalizedValue } = mappedEvent;

    if (eventType === MIDI_EVENT_TYPES.RELEASE) return;

    const mode = this.modeManager.getMode();

    console.log("[MIDI COMMAND BRIDGE]", {
      mode,
      control,
      eventType,
      value,
      normalizedValue,
    });

    if (mode === RFX_MODES.PERFORM) {
      this.handlePerformMode(mappedEvent);
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

    if (mode === RFX_MODES.TUNER) {
      this.handleTunerMode(mappedEvent);
    }
  }

  handlePerformMode({ control, eventType, normalizedValue }) {
    if (eventType === MIDI_EVENT_TYPES.CONTINUOUS) {
      this.dispatchCommand("EXPRESSION_CONTROL", {
        expression: control,
        value: normalizedValue,
      });
      return;
    }

    switch (control) {
      case MIDI_CONTROLS.FS_A:
        this.dispatchCommand("SELECT_CONTEXT", { contextId: "A", source: "midi" });
        break;

      case MIDI_CONTROLS.FS_B:
        this.dispatchCommand("SELECT_CONTEXT", { contextId: "B", source: "midi" });
        break;

      case MIDI_CONTROLS.FS_C:
        this.dispatchCommand("SELECT_CONTEXT", { contextId: "C", source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D:
        this.dispatchCommand("SELECT_CONTEXT", { contextId: "D", source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D_LONG:
        this.modeManager.setMode(RFX_MODES.LOOPER);
        this.dispatchCommand("ENTER_LOOPER_MODE", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_C_LONG:
        this.modeManager.setMode(RFX_MODES.AUTOMATION);
        this.dispatchCommand("ENTER_AUTOMATION_MODE", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_B_LONG:
        this.modeManager.setMode(RFX_MODES.TUNER);
        this.dispatchCommand("ENTER_TUNER_MODE", { source: "midi" });
        break;

      default:
        console.log("[MIDI] Unhandled perform control:", control);
    }
  }

  handleLooperMode({ control }) {
    switch (control) {
      case MIDI_CONTROLS.FS_A:
        this.dispatchCommand("LOOPER_STOP_AND_RETURN", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_A_LONG:
        this.dispatchCommand("LOOPER_CLEAR", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D:
        this.dispatchCommand("LOOPER_RECORD_OR_FINISH", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D_LONG:
        this.modeManager.setMode(RFX_MODES.PERFORM);
        this.dispatchCommand("EXIT_LOOPER_MODE", { source: "midi" });
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
        this.dispatchCommand("AUTOMATION_PLAY_OR_STOP", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_A_LONG:
        this.dispatchCommand("AUTOMATION_CLEAR", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D:
        this.dispatchCommand("AUTOMATION_RECORD_OR_FINISH", { source: "midi" });
        break;

      case MIDI_CONTROLS.FS_D_LONG:
        this.modeManager.setMode(RFX_MODES.PERFORM);
        this.dispatchCommand("EXIT_AUTOMATION_MODE", { source: "midi" });
        break;

      default:
        console.log("[MIDI] Unhandled automation control:", control);
    }
  }

  handleTunerMode({ control }) {
    if (control === MIDI_CONTROLS.FS_B_LONG) {
      this.modeManager.setMode(RFX_MODES.PERFORM);
      this.dispatchCommand("EXIT_TUNER_MODE", { source: "midi" });
    }
  }
}