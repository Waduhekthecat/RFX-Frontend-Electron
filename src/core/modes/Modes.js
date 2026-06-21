export const RFX_MODES = Object.freeze({
  PERFORM: "PERFORM",
  EDIT: "EDIT",
  TUNER: "TUNER",
  UNASSIGNED: "UNASSIGNED",
  AUTOMATION: "AUTOMATION",
  LOOPER: "LOOPER",
});

export const MODE_INTENT_BY_MODE = Object.freeze({
  [RFX_MODES.PERFORM]: "setPerformMode",
  [RFX_MODES.EDIT]: "setEditMode",
  [RFX_MODES.LOOPER]: "setLooperMode",
  [RFX_MODES.AUTOMATION]: "setAutomationMode",
  [RFX_MODES.TUNER]: "setTunerMode",
});

const RFX_MODE_BY_VM_MODE = Object.freeze({
  perform: RFX_MODES.PERFORM,
  edit: RFX_MODES.EDIT,
  looper: RFX_MODES.LOOPER,
  automation: RFX_MODES.AUTOMATION,
  tuner: RFX_MODES.TUNER,
});

export function modeFromViewModel(value) {
  return RFX_MODE_BY_VM_MODE[String(value || "").trim().toLowerCase()] || null;
}
