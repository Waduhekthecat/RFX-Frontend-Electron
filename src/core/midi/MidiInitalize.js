import { MidiInputService } from "./MidiInputService";
import { MidiMapper } from "./MidiMapper";
import { MidiCommandBridge } from "./MidiCommandBridge";
import { ModeManager } from "../modes/ModeManager";

let midiRuntime = null;

export function initMidi({ dispatchCommand } = {}) {
  if (midiRuntime) return midiRuntime;

  const modeManager = new ModeManager();
  const midiInputService = new MidiInputService();
  const midiMapper = new MidiMapper();

  const safeDispatchCommand =
    typeof dispatchCommand === "function"
      ? dispatchCommand
      : (command, payload = {}) => {
          console.log("[MIDI → RFX COMMAND]", command, payload);
        };

  const midiCommandBridge = new MidiCommandBridge({
    modeManager,
    dispatchCommand: safeDispatchCommand,
  });

  const unsubscribe = midiInputService.subscribe((rawMidiEvent) => {
    console.log("[MIDI RAW]", rawMidiEvent);

    const mappedEvent = midiMapper.map(rawMidiEvent);

    if (!mappedEvent) return;

    console.log("[MIDI MAPPED]", mappedEvent);

    midiCommandBridge.handleMappedControl(mappedEvent);
  });

  midiInputService.initialize();

  midiRuntime = {
    modeManager,
    midiInputService,
    midiMapper,
    midiCommandBridge,

    dispose() {
      unsubscribe();
      midiInputService.dispose();
      midiRuntime = null;
    },
  };

  return midiRuntime;
}