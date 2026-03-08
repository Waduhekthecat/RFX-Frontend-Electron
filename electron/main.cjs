const path = require("path");
const { app, BrowserWindow, ipcMain } = require("electron");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

const { dispatchCmdJson } = require("./ipc/dispatcher.cjs");
const { createIpcWatchers } = require("./ipc/watchers.cjs");
const { getIpcPaths } = require("./ipc/paths.cjs");
const { ensureDir, readJsonSafe } = require("./ipc/jsonfile.cjs");
const { createFallbackVm } = require("./ipc/mockVm.cjs");

let mainWindow = null;
let liveVm = createFallbackVm();
let liveInstalledFx = [];
let watchers = null;

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

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
}

async function readInstalledFxSnapshot() {
  const paths = getIpcPaths();
  const list = await readJsonSafe(paths.pluginlist, []);
  return Array.isArray(list) ? list : [];
}

async function bootIpc() {
  const paths = getIpcPaths();
  await ensureDir(paths.dir);

  const vm = await readJsonSafe(paths.vm, null);
  if (vm) {
    liveVm = vm;
  }

  liveInstalledFx = await readInstalledFxSnapshot();

  watchers = createIpcWatchers({
    onVm(nextVm) {
      liveVm = nextVm;
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("rfx:vm", nextVm);
      }
    },

    onCmdResult(nextRes) {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("rfx:cmdResult", nextRes);
      }
    },

    onInstalledFx(nextInstalledFx) {
      liveInstalledFx = Array.isArray(nextInstalledFx) ? nextInstalledFx : [];
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("rfx:installedFx", liveInstalledFx);
      }
    },
  });

  await watchers.start();
  await watchers.refreshVm().catch(() => { });
  await watchers.refreshCmdResult().catch(() => { });

  // prime installed plugins after watchers start
  liveInstalledFx = await readInstalledFxSnapshot().catch(() => []);
}

ipcMain.handle("rfx:boot", async () => {
  return { ok: true };
});

ipcMain.handle("rfx:getSnapshot", async () => {
  return liveVm || createFallbackVm();
});

ipcMain.handle("rfx:getInstalledFx", async () => {
  return Array.isArray(liveInstalledFx) ? liveInstalledFx : [];
});

ipcMain.handle("rfx:syscall", async (_evt, call) => {
  return dispatchCmdJson(call);
});

app.whenReady().then(async () => {
  await bootIpc();
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
  if (watchers) watchers.stop();
});