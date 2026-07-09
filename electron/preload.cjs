const { contextBridge, ipcRenderer } = require("electron");

const rfxApi = {
  transport: {
    boot: () => ipcRenderer.invoke("rfx:boot"),
    syscall: (call) => ipcRenderer.invoke("rfx:syscall", call),
    sendOsc: (packet) => ipcRenderer.invoke("rfx:sendOsc", packet),
    setLooperInputGain: (payload) =>
      ipcRenderer.invoke("rfx:setLooperInputGain", payload),
    getSnapshot: () => ipcRenderer.invoke("rfx:getSnapshot"),
    getInstalledFx: () => ipcRenderer.invoke("rfx:getInstalledFx"),
    getBootState: () => ipcRenderer.invoke("rfx:getBootState"),
    tuner: {
      read: () => ipcRenderer.invoke("rfx:tuner:read"),
    },

    onViewModel: (cb) => {
      const handler = (_evt, snap) => cb(snap);
      ipcRenderer.on("rfx:vm", handler);
      return () => ipcRenderer.removeListener("rfx:vm", handler);
    },

    onMeters: (cb) => {
      const handler = (_evt, frame) => cb(frame);
      ipcRenderer.on("rfx:meters", handler);
      return () => ipcRenderer.removeListener("rfx:meters", handler);
    },

    onCmdResult: (cb) => {
      const handler = (_evt, payload) => cb(payload);
      ipcRenderer.on("rfx:cmdResult", handler);
      return () => ipcRenderer.removeListener("rfx:cmdResult", handler);
    },

    onInstalledFx: (cb) => {
      const handler = (_evt, list) => cb(list);
      ipcRenderer.on("rfx:installedFx", handler);
      return () => ipcRenderer.removeListener("rfx:installedFx", handler);
    },

    onBootState: (cb) => {
      const handler = (_evt, state) => cb(state);
      ipcRenderer.on("rfx:bootState", handler);
      return () => ipcRenderer.removeListener("rfx:bootState", handler);
    },

    onReaperReady: (cb) => {
      const handler = (_evt, ready) => cb(!!ready);
      ipcRenderer.on("rfx:reaperReady", handler);
      return () => ipcRenderer.removeListener("rfx:reaperReady", handler);
    },

    onTunerData: (cb) => {
      const handler = (_evt, payload) => cb(payload);
      ipcRenderer.on("rfx:tuner", handler);
      return () => ipcRenderer.removeListener("rfx:tuner", handler);
    },

    onMidiMessage: (cb) => {
      const handler = (_evt, midiEvent) => cb(midiEvent);
      ipcRenderer.on("midi:message", handler);
      return () => ipcRenderer.removeListener("midi:message", handler);
    },
  },
};

contextBridge.exposeInMainWorld("rfx", rfxApi);

contextBridge.exposeInMainWorld("rfxAPI", {
  tuner: {
    read: () => ipcRenderer.invoke("rfx:tuner:read"),
  },
});
