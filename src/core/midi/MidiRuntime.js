import { useEffect } from "react";
import { initMidi } from "./MidiInitialize.js";
import { useRfxStore } from "../rfx/Store.js";

export function MidiRuntime() {
    const dispatchIntent = useRfxStore((s) => s.dispatchIntent);

    useEffect(() => {
        const midi = initMidi({
      dispatchCommand: (command, payload = {}) => {
        console.log("[MIDI → RFX COMMAND]", command, payload);

        if (command && typeof command === "object" && command.name) {
          dispatchIntent(command);
          return;
        }

        window.dispatchEvent(
          new CustomEvent("rfx-midi-command", {
            detail: { command, payload },
          })
        );
      },
    });

        return () => {
            midi?.dispose?.();
        };
    }, [dispatchIntent]);

    return null;
}