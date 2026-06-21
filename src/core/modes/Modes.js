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
