const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { spawn, execFile } = require("child_process");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const osc = require("osc");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = !!DEV_SERVER_URL;

const { dispatchCmdJson } = require("./ipc/dispatcher.cjs");
const { createIpcWatchers } = require("./ipc/watchers.cjs");
const { getIpcPaths } = require("./ipc/paths.cjs");
const { ensureDir, readJsonSafe } = require("./ipc/jsonfile.cjs");
const { createFallbackVm } = require("./ipc/mockVm.cjs");

let mainWindow = null;
let liveVm = createFallbackVm();
let liveInstalledFx = [];
let watchers = null;
let oscPort = null;
let reaperProcess = null;
let readinessPollTimer = null;

const appLaunchTimeMs = Date.now();
let reaperLaunchTimeMs = 0;

const BootState = Object.freeze({
  STARTING: "STARTING",
  IPC_READY: "IPC_READY",
  REAPER_LAUNCHING: "REAPER_LAUNCHING",
  WAITING_FOR_REAPER: "WAITING_FOR_REAPER",
  READY: "READY",
});

let bootState = BootState.STARTING;
let reaperReady = false;
let reaperLaunchAttempted = false;

function safeSend(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function setBootState(nextState) {
  if (!nextState || bootState === nextState) return;
  bootState = nextState;
  console.log("[RFX] bootState =", bootState);
  safeSend("rfx:bootState", bootState);
}

function setReaperReady(nextReady) {
  const value = !!nextReady;
  if (reaperReady === value) return;
  reaperReady = value;
  console.log("[RFX] reaperReady =", reaperReady);
  safeSend("rfx:reaperReady", reaperReady);
  if (reaperReady) {
    setBootState(BootState.READY);
    stopReadinessPolling();
  }
}

function ensureOscPort() {
  if (oscPort) return oscPort;
  oscPort = new osc.UDPPort({
    localAddress: "127.0.0.1",
    localPort: 0,
    remoteAddress: "127.0.0.1",
    remotePort: 8000,
    metadata: true,
  });
  oscPort.open();
  return oscPort;
}

function toOscArg(value) {
  if (typeof value === "string") return { type: "s", value };
  if (typeof value === "number") return { type: "f", value };
  if (typeof value === "boolean") return { type: value ? "T" : "F", value };
  return { type: "s", value: String(value ?? "") };
}

async function sendOscPacket(packet) {
  const address = String(packet?.address || "");
  const args = Array.isArray(packet?.args) ? packet.args : [];
  if (!address) throw new Error("sendOscPacket: missing address");
  const port = ensureOscPort();
  port.send({ address, args: args.map(toOscArg) });
  return { ok: true };
}

function getDefaultReaperPath() {
  if (process.platform === "darwin") return "/Applications/REAPER.app/Contents/MacOS/REAPER";
  if (process.platform === "win32") return "C:\\Program Files\\REAPER (x64)\\reaper.exe";
  return "reaper";
}

function buildReaperLaunchConfig() {
  const exePath = process.env.REAPER_PATH || getDefaultReaperPath();
  const args = [];
  if (process.env.REAPER_PROJECT) args.push(process.env.REAPER_PROJECT);
  return { exePath, args };
}

function getFileMtimeMs(filePath) {
  try {
    return Number(fs.statSync(filePath).mtimeMs || 0);
  } catch {
    return 0;
  }
}

function isFreshVmFile() {
  const paths = getIpcPaths();
  const mtimeMs = getFileMtimeMs(paths.vm);
  const freshnessThreshold = Math.max(appLaunchTimeMs, reaperLaunchTimeMs || 0);
  return mtimeMs > 0 && mtimeMs >= freshnessThreshold;
}

function hasUsableVmIdentity(vm) {
  if (!vm || typeof vm !== "object") return false;
  if (Array.isArray(vm.tracks) && vm.tracks.length > 0) return true;
  if (Array.isArray(vm.fxChains) && vm.fxChains.length > 0) return true;
  if (Array.isArray(vm.plugins) && vm.plugins.length > 0) return true;
  if (typeof vm.projectName === "string" && vm.projectName.trim()) return true;
  return false;
}

function evaluateReaperReadiness(vm, source = "unknown") {
  if (reaperReady) return;
  if (!hasUsableVmIdentity(vm)) return;
  if (!isFreshVmFile()) {
    console.log(`[RFX] ignoring stale VM from ${source}`);
    return;
  }
  console.log(`[RFX] fresh VM accepted from ${source}`);
  setReaperReady(true);
}

async function removeFileIfExists(filePath) {
  try {
    await fsp.rm(filePath, { force: true });
  } catch { }
}

async function clearRuntimeIpcArtifacts() {
  const paths = getIpcPaths();
  await ensureDir(paths.dir);
  await Promise.all([
    removeFileIfExists(paths.vm),
    removeFileIfExists(paths.cmdresult),
  ]);
  liveVm = createFallbackVm();
  console.log("[RFX] cleared stale runtime IPC artifacts");
}

function stopReadinessPolling() {
  if (readinessPollTimer) {
    clearInterval(readinessPollTimer);
    readinessPollTimer = null;
  }
}

function startReadinessPolling() {
  stopReadinessPolling();
  readinessPollTimer = setInterval(async () => {
    if (reaperReady) { stopReadinessPolling(); return; }
    try {
      const paths = getIpcPaths();
      const vm = await readJsonSafe(paths.vm, null);
      if (vm) {
        liveVm = vm;
        safeSend("rfx:vm", liveVm);
        evaluateReaperReadiness(vm, "poll");
      }
    } catch (err) {
      console.warn("[RFX] readiness poll failed:", err);
    }
  }, 1000);
}

function launchReaper() {
  if (reaperLaunchAttempted) return;
  reaperLaunchAttempted = true;
  reaperLaunchTimeMs = Date.now();
  setBootState(BootState.REAPER_LAUNCHING);
  const { exePath, args } = buildReaperLaunchConfig();
  try {
    console.log("[RFX] launching REAPER:", exePath, args);
    reaperProcess = spawn(exePath, args, { detached: true, stdio: "ignore", windowsHide: false });
    reaperProcess.on("error", (err) => console.error("[RFX] Failed to launch REAPER:", err));
    reaperProcess.unref();
  } catch (err) {
    console.error("[RFX] Exception while launching REAPER:", err);
  }
  setBootState(BootState.WAITING_FOR_REAPER);
  startReadinessPolling();
}

function chooseTargetDisplay() {
  const displays = screen.getAllDisplays();
  const primary = screen.getPrimaryDisplay();
  if (!Array.isArray(displays) || displays.length === 0) return primary;
  return displays.find((d) => d.id !== primary.id) || primary;
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const targetDisplay = chooseTargetDisplay();
  const { x, y, width, height } = targetDisplay.bounds;

  console.log("PRELOAD PATH =", preloadPath);
  console.log("[RFX] target display =", {
    id: targetDisplay.id,
    label: targetDisplay.label,
    bounds: targetDisplay.bounds,
    scaleFactor: targetDisplay.scaleFactor,
    rotation: targetDisplay.rotation,
    touchSupport: targetDisplay.touchSupport,
  });

  mainWindow = new BrowserWindow({
    x, y, width, height,
    show: false,
    backgroundColor: "#000000",
    frame: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    movable: false,
    minimizable: false,
    maximizable: false,
    closable: true,
    resizable: IS_DEV,
    useContentSize: false,
    roundedCorners: false,
    titleBarStyle: "hidden",
    trafficLightPosition: { x: -100, y: -100 },
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.setFullScreen(true);

  if (!IS_DEV) {
    mainWindow.setKiosk(true);
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setBounds({ x, y, width, height });
    mainWindow.setFullScreen(true);
    if (!IS_DEV) mainWindow.setKiosk(true);
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.webContents.once("did-finish-load", () => {
    safeSend("rfx:bootState", bootState);
    safeSend("rfx:reaperReady", reaperReady);
    safeSend("rfx:vm", liveVm || createFallbackVm());
    safeSend("rfx:installedFx", Array.isArray(liveInstalledFx) ? liveInstalledFx : []);
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
  liveInstalledFx = await readInstalledFxSnapshot();
  watchers = createIpcWatchers({
    onVm(nextVm) {
      console.log("[RFX] onVm received");
      liveVm = nextVm;
      safeSend("rfx:vm", nextVm);
      evaluateReaperReadiness(nextVm, "watcher");
    },
    onCmdResult(nextRes) { safeSend("rfx:cmdResult", nextRes); },
    onInstalledFx(nextInstalledFx) {
      liveInstalledFx = Array.isArray(nextInstalledFx) ? nextInstalledFx : [];
      safeSend("rfx:installedFx", liveInstalledFx);
    },
  });
  await watchers.start();
  await watchers.refreshVm().catch(() => { });
  await watchers.refreshCmdResult().catch(() => { });
  liveInstalledFx = await readInstalledFxSnapshot().catch(() => []);
  setBootState(BootState.IPC_READY);
  setBootState(BootState.WAITING_FOR_REAPER);
}

ipcMain.handle("rfx:boot", async () => ({ ok: true, bootState, reaperReady }));
ipcMain.handle("rfx:getSnapshot", async () => liveVm || createFallbackVm());
ipcMain.handle("rfx:getInstalledFx", async () => Array.isArray(liveInstalledFx) ? liveInstalledFx : []);
ipcMain.handle("rfx:getBootState", async () => ({ ok: true, bootState, reaperReady }));
ipcMain.handle("rfx:syscall", async (_evt, call) => dispatchCmdJson(call));
ipcMain.handle("rfx:sendOsc", async (_evt, packet) => sendOscPacket(packet));

app.whenReady().then(async () => {
  setBootState(BootState.STARTING);
  await clearRuntimeIpcArtifacts();
  await bootIpc();
  createWindow();
  launchReaper();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  stopReadinessPolling();
  try { watchers?.stop(); } catch { }
  try { oscPort?.close(); } catch { }
  try { await clearRuntimeIpcArtifacts(); } catch { }
});