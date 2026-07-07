import { useEffect } from "react";
import { initMidi } from "./MidiInitialize.js";
import {
  DEFAULT_LOOPER_TYPE,
  useRfxStore,
} from "../rfx/Store.js";

export function MidiRuntime() {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);

  useEffect(() => {
    const sendIntent = (intent) => {
      const nextIntent =
        intent?.name === "setLooperMode"
          ? {
              ...intent,
              looperType:
                useRfxStore.getState().session?.looperType ??
                DEFAULT_LOOPER_TYPE,
            }
          : intent;

      return dispatchIntent(nextIntent);
    };

    const midi = initMidi({
      dispatchIntent: sendIntent,
      dispatchCommand: (command, payload = {}) => {
        if (command && typeof command === "object" && command.name) {
          console.log("[MIDI → RFX INTENT]", command);
          return sendIntent(command);
        }

        console.log("[MIDI → RFX COMMAND]", command, payload);

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
