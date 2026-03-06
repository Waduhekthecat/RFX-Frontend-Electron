const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("rfx", {
  transport: {
    boot: () => ipcRenderer.invoke("rfx:boot"),
    syscall: (call) => ipcRenderer.invoke("rfx:syscall", call),
    getSnapshot: () => ipcRenderer.invoke("rfx:getSnapshot"),

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
  },
});