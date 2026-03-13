function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function createFallbackVm() {
  return {
    schemaVersion: 1,
    schema: "rfx_vm_v1",
    seq: 1,
    ts: nowSec(),
    capabilities: {
      routingModes: ["linear", "parallel", "lcr"],
    },

    buses: [
      { id: "FX_1", label: "FX_1", busNum: 1 },
      { id: "FX_2", label: "FX_2", busNum: 2 },
      { id: "FX_3", label: "FX_3", busNum: 3 },
      { id: "FX_4", label: "FX_4", busNum: 4 },
    ],
    activeBusId: "FX_1",

    busModes: {
      FX_1: "linear",
      FX_2: "linear",
      FX_3: "linear",
      FX_4: "linear",
    },

    busMix: {
      FX_1: { vol: 0.716, pan: 0.5 },
      FX_2: { vol: 0.716, pan: 0.5 },
      FX_3: { vol: 0.716, pan: 0.5 },
      FX_4: { vol: 0.716, pan: 0.5 },
    },

    tracks: [
      { id: "INPUT", label: "INPUT", busId: "", lane: "" },

      { id: "FX_1", label: "FX_1", busId: "FX_1", lane: "" },
      { id: "FX_1A", label: "FX_1A", busId: "FX_1", lane: "A" },
      { id: "FX_1B", label: "FX_1B", busId: "FX_1", lane: "B" },
      { id: "FX_1C", label: "FX_1C", busId: "FX_1", lane: "C" },

      { id: "FX_2", label: "FX_2", busId: "FX_2", lane: "" },
      { id: "FX_2A", label: "FX_2A", busId: "FX_2", lane: "A" },
      { id: "FX_2B", label: "FX_2B", busId: "FX_2", lane: "B" },
      { id: "FX_2C", label: "FX_2B", busId: "FX_2", lane: "C" },

      { id: "FX_3", label: "FX_3", busId: "FX_3", lane: "" },
      { id: "FX_3A", label: "FX_3A", busId: "FX_3", lane: "A" },
      { id: "FX_3B", label: "FX_3B", busId: "FX_3", lane: "B" },
      { id: "FX_3C", label: "FX_3C", busId: "FX_3", lane: "C" },

      { id: "FX_4", label: "FX_4", busId: "FX_4", lane: "" },
      { id: "FX_4A", label: "FX_4A", busId: "FX_4", lane: "A" },
      { id: "FX_4B", label: "FX_4B", busId: "FX_4", lane: "B" },
      { id: "FX_4B", label: "FX_4B", busId: "FX_4", lane: "C" },
    ],

    trackMix: {

      FX_1:  { VOL: 0.716, pan: 0.5 },
      FX_1A: { vol: 0.716, pan: 0.5 },
      FX_1B: { vol: 0.716, pan: 0.5 },
      FX_1C: { vol: 0.716, pan: 0.5 },

      FX_2:  { VOL: 0.716, pan: 0.5 },
      FX_2A: { vol: 0.716, pan: 0.5 },
      FX_2B: { vol: 0.716, pan: 0.5 },
      FX_2C: { vol: 0.716, pan: 0.5 },

      FX_3:  { VOL: 0.716, pan: 0.5 },
      FX_3A: { vol: 0.716, pan: 0.5 },
      FX_3B: { vol: 0.716, pan: 0.5 },
      FX_3C: { vol: 0.716, pan: 0.5 },

      FX_4:  { VOL: 0.716, pan: 0.5 },
      FX_4A: { vol: 0.716, pan: 0.5 },
      FX_4B: { vol: 0.716, pan: 0.5 },
      FX_4C: { vol: 0.716, pan: 0.5 },
    },

    meters: {},
    fxByGuid: {},
    fxOrderByTrackGuid: {},
    fxParamsByGuid: {},
    fxEnabledByGuid: {},
    fxReorderLastByTrackGuid: {},
  };
}

module.exports = {
  createFallbackVm,
};