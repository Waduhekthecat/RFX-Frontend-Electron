const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rfx", {
  transport: {
    boot: () => ipcRenderer.invoke("rfx:boot"),
    syscall: (call) => ipcRenderer.invoke("rfx:syscall", call),
    sendOsc: (packet) => ipcRenderer.invoke("rfx:sendOsc", packet),
    getSnapshot: () => ipcRenderer.invoke("rfx:getSnapshot"),
    getInstalledFx: () => ipcRenderer.invoke("rfx:getInstalledFx"),
    getBootState: () => ipcRenderer.invoke("rfx:getBootState"),

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

    onMidiMessage: (cb) => {
      const handler = (_evt, midiEvent) => cb(midiEvent);
      ipcRenderer.on("midi:message", handler);
      return () => ipcRenderer.removeListener("midi:message", handler);
    },
  },
});