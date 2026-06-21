import { useEffect } from "react";
import { initMidi } from "./MidiInitialize.js";
import {
  DEFAULT_LOOPER_TYPE,
  useRfxStore,
} from "../rfx/Store.js";

export function MidiRuntime() {
    const dispatchIntent = useRfxStore((s) => s.dispatchIntent);

    useEffect(() => {
        const midi = initMidi({
      dispatchIntent: (intent) => {
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
      },
      dispatchCommand: (command, payload = {}) => {
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
