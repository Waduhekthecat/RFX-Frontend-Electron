import { useEffect } from "react";
import { initMidi } from "./MidiInitialize.js";

export function MidiRuntime() {
  useEffect(() => {
    const midi = initMidi();

    return () => {
      midi?.dispose?.();
    };
  }, []);

  return null;
}