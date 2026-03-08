function isAvailable() {
  return typeof window !== "undefined" && !!window.rfx?.transport;
}

export function createElectronTransport() {
  if (!isAvailable()) return null;

  const api = window.rfx.transport;

  let vm = null;
  let installedFx = [];

  const subs = new Set();
  const meterSubs = new Set();
  const installedFxSubs = new Set();
  const cmdResultSubs = new Set();

  const offVm =
    typeof api.onViewModel === "function"
      ? api.onViewModel((next) => {
          vm = next;
          subs.forEach((cb) => cb(vm));
        })
      : null;

  const offCmdResult =
    typeof api.onCmdResult === "function"
      ? api.onCmdResult((result) => {
          cmdResultSubs.forEach((cb) => cb(result));
        })
      : null;

  const offMeters =
    typeof api.onMeters === "function"
      ? api.onMeters((frame) => {
          meterSubs.forEach((cb) => cb(frame));
        })
      : null;

  const offInstalledFx =
    typeof api.onInstalledFx === "function"
      ? api.onInstalledFx((next) => {
          installedFx = Array.isArray(next) ? next : [];
          installedFxSubs.forEach((cb) => cb(installedFx));
        })
      : null;

  const transport = {
    async boot() {
      const res = await api.boot();

      try {
        const snap = await api.getSnapshot();
        if (snap) {
          vm = snap;
          subs.forEach((cb) => cb(vm));
        }
      } catch {
        // ignore
      }

      try {
        if (typeof api.getInstalledFx === "function") {
          const list = await api.getInstalledFx();
          installedFx = Array.isArray(list) ? list : [];
          installedFxSubs.forEach((cb) => cb(installedFx));
        }
      } catch {
        // ignore
      }

      return res;
    },

    getSnapshot() {
      return vm;
    },

    getInstalledFx() {
      return installedFx;
    },

    subscribe(cb) {
      subs.add(cb);
      if (vm) cb(vm);
      return () => subs.delete(cb);
    },

    subscribeCmdResult(cb) {
      cmdResultSubs.add(cb);
      return () => cmdResultSubs.delete(cb);
    },

    subscribeInstalledFx(cb) {
      installedFxSubs.add(cb);
      cb(installedFx);
      return () => installedFxSubs.delete(cb);
    },

    subscribeMeters(cb) {
      meterSubs.add(cb);
      return () => meterSubs.delete(cb);
    },

    async syscall(call) {
      return api.syscall(call);
    },

    destroy() {
      try {
        offVm?.();
        offCmdResult?.();
        offMeters?.();
        offInstalledFx?.();
      } catch {}

      subs.clear();
      cmdResultSubs.clear();
      meterSubs.clear();
      installedFxSubs.clear();
    },
  };

  return transport;
}