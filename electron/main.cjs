const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const { spawn } = require("child_process");
const dgram = require("dgram");
const { app, BrowserWindow, ipcMain, screen } = require("electron");
const osc = require("osc");

const { initMidiMain, closeMidiMain } = require("./midi/midiMain.cjs");

const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const IS_DEV = !!DEV_SERVER_URL;

const { dispatchCmdJson } = require("./ipc/dispatcher.cjs");
const { createIpcWatchers } = require("./ipc/watchers.cjs");
const { getIpcPaths } = require("./ipc/paths.cjs");
const { ensureDir, readJsonSafe, writeJsonAtomic } = require("./ipc/jsonfile.cjs");
const { createFallbackVm } = require("./ipc/mockVm.cjs");

let mainWindow = null;

let liveVm = createFallbackVm();
let liveInstalledFx = [];
let watchers = null;
let oscPort = null;
let oscListenerSocket = null;
let reaperProcess = null;
let readinessPollTimer = null;
let looperInputGainWrite = null;
let pendingLooperInputGain = null;

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
  safeSend("rfx:bootState", bootState);
}

function setReaperReady(nextReady) {
  const value = !!nextReady;
  if (reaperReady === value) return;
  reaperReady = value;
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
    remotePort: 55001,
    metadata: true,
  });

  oscPort.open();
  return oscPort;
}


function getCurrentAppMode() {
  try {
    const statePath = path.join("/tmp/rfx-ipc", "state.json");
    if (!fs.existsSync(statePath)) return "perform";

    const raw = fs.readFileSync(statePath, "utf8");
    if (!raw) return "perform";

    const parsed = JSON.parse(raw);
    return String(parsed?.mode || "perform").toLowerCase();
  } catch {
    return "perform";
  }
}
function ensureOscListener() {
  if (oscListenerSocket) return oscListenerSocket;

  oscListenerSocket = dgram.createSocket("udp4");

  oscListenerSocket.on("message", (buffer) => {
    try {
      const mode = getCurrentAppMode();
      if (mode !== "tuner") {
        return;
      }

      const messages = parseOscMessages(buffer);

      for (const message of messages) {
        if (message.address !== "/rfx/tuner") {
          continue;
        }

        const [note, octave, cents, _confidence, hasPitch] = message.args;
        const hasPitchValue = Number(hasPitch);

        if (!Number.isFinite(hasPitchValue) || hasPitchValue === 0) {
          safeSend("rfx:tuner", {
            hasPitch: 0,
            note: null,
            octave: null,
            cents: null,
          });

          console.log("[RFX OSC] --");
          continue;
        }

        const noteText = String(note ?? "?").trim() || "?";
        const octaveValue = Number(octave);
        const octaveText = Number.isFinite(octaveValue) ? String(octaveValue) : "";
        const centsValue = Number(cents);

        const centsText = `${Number.isFinite(centsValue) && centsValue >= 0 ? "+" : ""
          }${Number.isFinite(centsValue) ? centsValue.toFixed(1) : "0.0"}¢`;

        safeSend("rfx:tuner", {
          hasPitch: 1,
          note: noteText,
          octave: Number.isFinite(octaveValue) ? octaveValue : null,
          cents: Number.isFinite(centsValue) ? centsValue : null,
        });

        console.log(`[RFX OSC] ${noteText}${octaveText}  ${centsText}`);
      }
    } catch (error) {
      // Ignore malformed or non-message OSC packets.
    }
  });

  oscListenerSocket.on("error", (error) => {
    console.error("[RFX OSC] listener error", error);
  });

  oscListenerSocket.bind(55000, "0.0.0.0", () => {
    console.log("[RFX OSC] listening on udp://0.0.0.0:55000");
  });

  return oscListenerSocket;
}

function readPaddedString(buffer, offset) {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }

  const value = buffer.subarray(offset, end).toString("utf8");
  const paddedLength = Math.ceil((end - offset + 1) / 4) * 4;
  return { value, nextOffset: offset + paddedLength };
}

function parseOscMessages(buffer) {
  if (!buffer || buffer.length < 8) {
    return [];
  }

  let offset = 0;
  const first = readPaddedString(buffer, offset);
  const address = first.value;
  offset = first.nextOffset;

  if (address === "#bundle") {
    const messages = [];

    // Skip OSC timetag: 8 bytes
    offset += 8;

    while (offset + 4 <= buffer.length) {
      const size = buffer.readUInt32BE(offset);
      offset += 4;

      if (!Number.isFinite(size) || size <= 0 || offset + size > buffer.length) {
        break;
      }

      const nested = buffer.subarray(offset, offset + size);
      offset += size;

      messages.push(...parseOscMessages(nested));
    }

    return messages;
  }

  const typeInfo = readPaddedString(buffer, offset);
  offset = typeInfo.nextOffset;

  const typeTag = String(typeInfo.value || "");
  if (!typeTag.startsWith(",")) {
    return [];
  }

  const args = [];

  for (let i = 1; i < typeTag.length; i += 1) {
    const tag = typeTag[i];

    switch (tag) {
      case "s": {
        const stringInfo = readPaddedString(buffer, offset);
        args.push(stringInfo.value);
        offset = stringInfo.nextOffset;
        break;
      }

      case "i": {
        if (offset + 4 > buffer.length) return [];
        const value = buffer.readInt32BE(offset);
        args.push(value);
        offset += 4;
        break;
      }

      case "f": {
        if (offset + 4 > buffer.length) return [];
        const value = buffer.readFloatBE(offset);
        args.push(value);
        offset += 4;
        break;
      }

      case "T":
        args.push(true);
        break;

      case "F":
        args.push(false);
        break;

      default:
        args.push(null);
        break;
    }
  }

  return [{ address, args }];
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

  if (process.env.REAPER_PROJECT) {
    args.push(process.env.REAPER_PROJECT);
  }

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
    return;
  }

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
    removeFileIfExists(paths.looperInputGain),
    removeFileIfExists(paths.looperInputGainProcessing),
  ]);

  liveVm = createFallbackVm();
}

function scheduleLooperInputGainWrite() {
  if (looperInputGainWrite) return;

  looperInputGainWrite = (async () => {
    const paths = getIpcPaths();
    await ensureDir(paths.dir);

    while (pendingLooperInputGain) {
      const nextPayload = pendingLooperInputGain;
      pendingLooperInputGain = null;
      await writeJsonAtomic(paths.looperInputGain, nextPayload);
    }
  })()
    .catch((error) => {
      console.warn("[RFX] looper input gain write failed", error);
    })
    .finally(() => {
      looperInputGainWrite = null;
      if (pendingLooperInputGain) scheduleLooperInputGainWrite();
    });
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
    if (reaperReady) {
      stopReadinessPolling();
      return;
    }

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
    reaperProcess = spawn(exePath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
    });

    reaperProcess.on("error", (err) => {
      console.error("[RFX] Failed to launch REAPER:", err);
    });

    reaperProcess.unref();
  } catch (err) {
    console.error("[RFX] Exception while launching REAPER:", err);
  }

  setBootState(BootState.WAITING_FOR_REAPER);
  startReadinessPolling();
}

function chooseTargetDisplay() {
  return screen.getPrimaryDisplay();
}

function createWindow() {
  const preloadPath = path.join(__dirname, "preload.cjs");
  const targetDisplay = chooseTargetDisplay();

  const {
    x,
    y,
    width: displayWidth,
    height: displayHeight,
  } = targetDisplay.workArea;

  const APP_WIDTH = 1280;
  const APP_HEIGHT = 800;

  const width = Math.min(APP_WIDTH, displayWidth);
  const height = Math.min(APP_HEIGHT, displayHeight);

  const windowX = x + Math.floor((displayWidth - width) / 2);
  const windowY = y + Math.floor((displayHeight - height) / 2);

  mainWindow = new BrowserWindow({
    x: windowX,
    y: windowY,
    width,
    height,
    show: false,
    backgroundColor: "#000000",
    frame: true,
    fullscreen: false,
    kiosk: false,
    autoHideMenuBar: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    closable: true,
    resizable: true,
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
  mainWindow.setFullScreen(false);

  if (!IS_DEV) {
    mainWindow.setAlwaysOnTop(true, "screen-saver");
  } else {
    mainWindow.setAlwaysOnTop(false);
  }

  mainWindow.once("ready-to-show", () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;

    mainWindow.setBounds({ x: windowX, y: windowY, width, height });
    mainWindow.setFullScreen(false);
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
      liveVm = nextVm;
      safeSend("rfx:vm", nextVm);
      evaluateReaperReadiness(nextVm, "watcher");
    },

    onCmdResult(nextRes) {
      safeSend("rfx:cmdResult", nextRes);
    },

    onInstalledFx(nextInstalledFx) {
      liveInstalledFx = Array.isArray(nextInstalledFx) ? nextInstalledFx : [];
      safeSend("rfx:installedFx", liveInstalledFx);
    },

    onTuner(nextTuner) {
      safeSend("rfx:tuner", nextTuner);
    },
  });

  await watchers.start();
  await watchers.refreshVm().catch(() => { });
  await watchers.refreshCmdResult().catch(() => { });
  await watchers.refreshTuner?.().catch(() => {});

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
ipcMain.handle("rfx:setLooperInputGain", async (_evt, payload) => {
  const value = Number(payload?.value01);
  const value01 = Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;

  const nextPayload = {
    ts: Date.now(),
    busId: String(payload?.busId || ""),
    value01,
  };

  pendingLooperInputGain = nextPayload;
  scheduleLooperInputGainWrite();
  return { ok: true };
});

app.whenReady().then(async () => {
  setBootState(BootState.STARTING);

  await clearRuntimeIpcArtifacts();
  await bootIpc();
  ensureOscListener();

  createWindow();
  // MIDI is initialized after the window exists so midiMain can forward
  // messages to the renderer through mainWindow.webContents.send().
  initMidiMain(mainWindow);

  launchReaper();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      initMidiMain(mainWindow);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", async () => {
  stopReadinessPolling();

  try { closeMidiMain(); } catch { }
  try { watchers?.stop(); } catch { }
  try { oscPort?.close(); } catch { }
  try { oscListenerSocket?.close(); } catch { }
  try { await clearRuntimeIpcArtifacts(); } catch { }
});
