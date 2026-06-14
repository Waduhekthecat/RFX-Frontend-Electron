export const MIDI_CONTROLS = Object.freeze({
  FS_A: "FS_A",
  FS_B: "FS_B",
  FS_C: "FS_C",
  FS_D: "FS_D",

  FS_A_LONG: "FS_A_LONG",
  FS_B_LONG: "FS_B_LONG",
  FS_C_LONG: "FS_C_LONG",
  FS_D_LONG: "FS_D_LONG",

  EXPR_1: "EXPR_1",
  EXPR_2: "EXPR_2",
});

export const MIDI_EVENT_TYPES = Object.freeze({
  PRESS: "PRESS",
  RELEASE: "RELEASE",
  CONTINUOUS: "CONTINUOUS",
});

const FS_CC_MAP = {
  10: MIDI_CONTROLS.FS_A,
  11: MIDI_CONTROLS.FS_B,
  12: MIDI_CONTROLS.FS_C,
  13: MIDI_CONTROLS.FS_D,

  50: MIDI_CONTROLS.FS_D_LONG,
  51: MIDI_CONTROLS.FS_C_LONG,

  7: MIDI_CONTROLS.EXPR_1,
  8: MIDI_CONTROLS.EXPR_2,
};

export class MidiMapper {
  map(event) {
    if (event.type !== "cc") return null;

    const control = FS_CC_MAP[event.cc];

    if (!control) {
      return {
        type: "unmapped",
        raw: event,
      };
    }

    const eventType = this.getEventType(control, event.value);

    return {
      type: "mapped-control",
      control,
      eventType,
      value: event.value,
      normalizedValue: event.value / 127,
      raw: event,
    };
  }

  getEventType(control, value) {
    if (EXPRESSION_CONTROLS.has(control)) {
      return MIDI_EVENT_TYPES.CONTINUOUS;
    }

    return value > 0
      ? MIDI_EVENT_TYPES.PRESS
      : MIDI_EVENT_TYPES.RELEASE;
  }
}