const fs = require("fs");
const path = require("path");
const { getIpcPaths } = require("./paths.cjs");
const { readJsonSafe } = require("./jsonfile.cjs");

function makeSafeArray(value) {
  return Array.isArray(value) ? value : [];
}

function createIpcWatchers(opts = {}) {
  const { onVm, onCmdResult, onInstalledFx, onTuner } = opts;
  const paths = getIpcPaths();

  let dirWatcher = null;
  let started = false;

  let vmRefreshTimer = null;
  let resRefreshTimer = null;
  let pluginListRefreshTimer = null;
  let tunerRefreshTimer = null;

  async function refreshVm() {
    const nextVm = await readJsonSafe(paths.vm, null);
    if (nextVm && typeof onVm === "function") onVm(nextVm);
    return nextVm;
  }

  async function refreshCmdResult() {
    const nextRes = await readJsonSafe(paths.res, null);
    if (nextRes && typeof onCmdResult === "function") onCmdResult(nextRes);
    return nextRes;
  }

  async function refreshInstalledFx() {
    const nextList = await readJsonSafe(paths.pluginlist, []);
    const safeList = makeSafeArray(nextList);
    if (typeof onInstalledFx === "function") onInstalledFx(safeList);
    return safeList;
  }

  async function refreshTuner() {
    const nextTuner = await readJsonSafe(paths.tuner, null);
    if (nextTuner && typeof onTuner === "function") onTuner(nextTuner);
    return nextTuner;
  }

  function clearTimer(timer) {
    if (timer) clearTimeout(timer);
    return null;
  }

  function scheduleVmRefresh() {
    vmRefreshTimer = clearTimer(vmRefreshTimer);
    vmRefreshTimer = setTimeout(() => {
      refreshVm().catch(() => {});
    }, 15);
  }

  function scheduleResRefresh() {
    resRefreshTimer = clearTimer(resRefreshTimer);
    resRefreshTimer = setTimeout(() => {
      refreshCmdResult().catch(() => {});
    }, 15);
  }

  function schedulePluginListRefresh() {
    pluginListRefreshTimer = clearTimer(pluginListRefreshTimer);
    pluginListRefreshTimer = setTimeout(() => {
      refreshInstalledFx().catch(() => {});
    }, 15);
  }

  function scheduleTunerRefresh() {
    tunerRefreshTimer = clearTimer(tunerRefreshTimer);
    tunerRefreshTimer = setTimeout(() => {
      refreshTuner().catch(() => {});
    }, 15);
  }

  const vmBase = typeof paths.vm === "string" ? path.basename(paths.vm) : null;
  const resBase = typeof paths.res === "string" ? path.basename(paths.res) : null;
  const pluginListBase =
    typeof paths.pluginlist === "string" ? path.basename(paths.pluginlist) : null;
  const tunerBase =
    typeof paths.tuner === "string" ? path.basename(paths.tuner) : null;

  function handleDirEvent(_eventType, filename) {
    const name = typeof filename === "string" ? filename : "";

    if (!name) {
      scheduleVmRefresh();
      scheduleResRefresh();
      if (pluginListBase) schedulePluginListRefresh();
      if (tunerBase) scheduleTunerRefresh();
      return;
    }

    if (vmBase && name === vmBase) {
      scheduleVmRefresh();
      return;
    }

    if (resBase && name === resBase) {
      scheduleResRefresh();
      return;
    }

    if (pluginListBase && name === pluginListBase) {
      schedulePluginListRefresh();
      return;
    }

    if (tunerBase && name === tunerBase) {
      scheduleTunerRefresh();
      return;
    }
  }

  async function start() {
    if (started) return;
    started = true;

    await refreshVm().catch(() => {});
    await refreshCmdResult().catch(() => {});

    if (paths.pluginlist) {
      await refreshInstalledFx().catch(() => {});
    }

    if (paths.tuner) {
      await refreshTuner().catch(() => {});
    }

    try {
      dirWatcher = fs.watch(paths.dir, { persistent: false }, handleDirEvent);
    } catch {
      dirWatcher = null;
    }
  }

  function stop() {
    started = false;

    vmRefreshTimer = clearTimer(vmRefreshTimer);
    resRefreshTimer = clearTimer(resRefreshTimer);
    pluginListRefreshTimer = clearTimer(pluginListRefreshTimer);
    tunerRefreshTimer = clearTimer(tunerRefreshTimer);

    try {
      dirWatcher?.close();
    } catch {}

    dirWatcher = null;
  }

  return {
    start,
    stop,
    refreshVm,
    refreshCmdResult,
    refreshInstalledFx,
    refreshTuner,
  };
}

module.exports = {
  createIpcWatchers,
};