export const MIDI_CONTROLS = Object.freeze({
  FS_A: "FS_A",
  FS_B: "FS_B",
  FS_C: "FS_C",
  FS_D: "FS_D",

  FS_A_LONG: "FS_A_LONG",
  FS_B_RELEASE: "FS_B_RELEASE",
  FS_C_LONG: "FS_C_LONG",
  FS_D_LONG: "FS_D_LONG",

  EXPR: "EXPR",
});

export const MIDI_EVENT_TYPES = Object.freeze({
  PRESS: "PRESS",
  RELEASE: "RELEASE",
  CONTINUOUS: "CONTINUOUS",
});

const FS_CC_MAP = {
  11: MIDI_CONTROLS.FS_A,
  12: MIDI_CONTROLS.FS_B,
  13: MIDI_CONTROLS.FS_C,
  14: MIDI_CONTROLS.FS_D,

  101: MIDI_CONTROLS.FS_A_LONG,
  102: MIDI_CONTROLS.FS_B_RELEASE,
  103: MIDI_CONTROLS.FS_C_LONG,
  104: MIDI_CONTROLS.FS_D_LONG,

  10: MIDI_CONTROLS.EXPR,
};

const EXPRESSION_CONTROLS = new Set([
  MIDI_CONTROLS.EXPR,
]);

export class MidiMapper {
  map(event) {
    if (!event || event.type !== "cc") return null;

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