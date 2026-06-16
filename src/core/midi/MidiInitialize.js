import { MidiInputService } from "./MidiInputService.js";
import { MidiMapper } from "./MidiMapper.js";
import { MidiCommandBridge } from "./MidiCommandBridge.js";
import { ModeManager } from "../modes/ModeManager.js";

let midiRuntime = null;

export function getMidiRuntime() {
  return midiRuntime;
}

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

        window.dispatchEvent(
          new CustomEvent("rfx-midi-command", {
            detail: { command, payload },
          })
        );
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