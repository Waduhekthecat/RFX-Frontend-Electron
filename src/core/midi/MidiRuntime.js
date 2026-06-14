import { useEffect } from "react";
import { initMidi } from "./initMidi";

export function MidiRuntime() {
  useEffect(() => {
    const midi = initMidi();

    return () => {
      midi?.dispose?.();
    };
  }, []);

  return null;
}