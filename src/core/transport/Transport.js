// Transport = the ONLY thing your UI talks to.
// Later you’ll swap MockTransport -> ElectronTransport, UI stays unchanged.

export function createTransportContractDocs() {
  return {
    ViewModel: {
      buses: [{ id: "FX_1", label: "FX_1", busNum: 1 }],
      activeBusId: "FX_1",
      meters: { FX_1: { l: 0.1, r: 0.1 } },
    },
    Syscalls: [
      "selectActiveBus",
      "setRoutingMode",
      "syncView",
      "setPerformMode",
      "setEditMode",
      "setLooperMode",
      "setAutomationMode",
      "setTunerMode",
    ],
  };
}
