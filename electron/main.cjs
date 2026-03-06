const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockBackend() {
  let seq = 1;

  let vm = {
    schemaVersion: 1,
    schema: "mock_vm_v2",
    seq,
    ts: nowSec(),
    capabilities: { routingModes: ["linear", "parallel", "lcr"] },
    buses: [
      { id: "FX_1", label: "FX_1", busNum: 1 },
      { id: "FX_2", label: "FX_2", busNum: 2 },
      { id: "FX_3", label: "FX_3", busNum: 3 },
      { id: "FX_4", label: "FX_4", busNum: 4 },
    ],
    activeBusId: "FX_1",
    busModes: {
      FX_1: "linear",
      FX_2: "parallel",
      FX_3: "lcr",
      FX_4: "parallel",
    },
    meters: {
      FX_1: { l: 0.1, r: 0.12 },
      FX_2: { l: 0.02, r: 0.03 },
      FX_3: { l: 0.0, r: 0.0 },
      FX_4: { l: 0.05, r: 0.04 },
    },
  };

  let metersEnabled = true;
  const windows = new Set();

  function broadcast(channel, payload) {
    for (const win of windows) {
      if (!win || win.isDestroyed()) continue;
      win.webContents.send(channel, payload);
    }
  }

  function bumpSeq() {
    seq += 1;
    vm = { ...vm, seq, ts: nowSec() };
  }

  function emitVm() {
    broadcast("rfx:vm", vm);
  }

  function emitMetersFrame(busId, meter) {
    broadcast("rfx:meters", {
      t: Date.now(),
      activeBusId: busId,
      metersByBusId: { [busId]: meter },
      metersById: { [busId]: meter },
    });
  }

  function seedMetersForActiveBus() {
    const id = vm.activeBusId;
    if (!id) return;
    const meter = vm.meters && vm.meters[id];
    if (!meter) return;
    emitMetersFrame(id, meter);
  }

  function tickMeters() {
    if (!metersEnabled) return;

    const id = vm.activeBusId;
    if (!id) return;

    const prev = vm.meters[id] || { l: 0, r: 0 };
    const next = {
      l: clamp01(prev.l * 0.85 + Math.random() * 0.35),
      r: clamp01(prev.r * 0.85 + Math.random() * 0.35),
    };

    vm = {
      ...vm,
      meters: {
        ...vm.meters,
        [id]: next,
      },
    };

    emitMetersFrame(id, next);
  }

  const meterTimer = setInterval(tickMeters, 60);

  return {
    attachWindow(win) {
      windows.add(win);
      win.on("closed", () => {
        windows.delete(win);
      });
    },

    dispose() {
      clearInterval(meterTimer);
    },

    async boot() {
      await sleep(600);
      await sleep(900);
      bumpSeq();
      emitVm();
      seedMetersForActiveBus();
      return { ok: true, seq };
    },

    getSnapshot() {
      return vm;
    },

    async syscall(call) {
      const name = call && call.name === "setStateMode"
        ? "setRoutingMode"
        : call && call.name;

      if (!name) {
        return { ok: false, error: "invalid syscall" };
      }

      if (name === "selectActiveBus") {
        if (!call.busId) {
          return { ok: false, error: "missing busId" };
        }

        bumpSeq();
        vm = {
          ...vm,
          activeBusId: call.busId,
        };
        emitVm();
        seedMetersForActiveBus();
        return { ok: true };
      }

      if (name === "setRoutingMode") {
        const id = call.busId;
        if (!id) {
          return { ok: false, error: "missing busId" };
        }

        bumpSeq();
        vm = {
          ...vm,
          busModes: {
            ...vm.busModes,
            [id]: normalizeMode(call.mode),
          },
        };
        emitVm();
        return { ok: true };
      }

      if (name === "syncView") {
        bumpSeq();
        emitVm();
        return { ok: true };
      }

      return { ok: false, error: `unknown syscall: ${String(name)}` };
    },

    setMetersEnabled(on) {
      metersEnabled = !!on;
      return { ok: true };
    },
  };
}

const backend = createMockBackend();
let mainWindow = null;

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  console.log("PRELOAD PATH =", preloadPath);

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    useContentSize: true,
    backgroundColor: "#0b0b0e",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  backend.attachWindow(mainWindow);

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

ipcMain.handle("rfx:boot", async () => backend.boot());
ipcMain.handle("rfx:getSnapshot", async () => backend.getSnapshot());
ipcMain.handle("rfx:syscall", async (_evt, call) => backend.syscall(call));

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  backend.dispose();
});