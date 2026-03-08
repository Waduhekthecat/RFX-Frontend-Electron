const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rfx", {
  transport: {
    boot: () => ipcRenderer.invoke("rfx:boot"),
    syscall: (call) => ipcRenderer.invoke("rfx:syscall", call),
    getSnapshot: () => ipcRenderer.invoke("rfx:getSnapshot"),
    getInstalledFx: () => ipcRenderer.invoke("rfx:getInstalledFx"),

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
  },
});