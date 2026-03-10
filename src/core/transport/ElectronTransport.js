function isAvailable() {
  return typeof window !== "undefined" && !!window.rfx?.transport;
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function getTrackNumberFromRfxGuid(trackGuid) {
  const guid = String(trackGuid || "").trim();

  if (guid === "INPUT") return 1;

  // Matches:
  // FX_1
  // FX_1A
  // FX_1B
  // FX_1C
  const m = guid.match(/^FX_(\d+)([ABC])?$/i);
  if (!m) return null;

  const busNum = Number(m[1]);
  const lane = String(m[2] || "").toUpperCase();

  if (!Number.isFinite(busNum) || busNum < 1) return null;

  // Layout:
  // 1 = INPUT
  // 2 = FX_1
  // 3 = FX_1A
  // 4 = FX_1B
  // 5 = FX_1C
  // 6 = FX_2
  // 7 = FX_2A
  // ...
  const busBase = 2 + (busNum - 1) * 4;

  if (!lane) return busBase;
  if (lane === "A") return busBase + 1;
  if (lane === "B") return busBase + 2;
  if (lane === "C") return busBase + 3;

  return null;
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

    osc: {
      async sendTrackVolume(trackGuid, value) {
        const guid = String(trackGuid || "");
        const vol = clamp01(value);

        if (!guid || !Number.isFinite(vol)) {
          throw new Error("sendTrackVolume: invalid trackGuid/value");
        }

        const trackNumber = getTrackNumberFromRfxGuid(guid);
        if (!Number.isFinite(trackNumber)) {
          throw new Error(
            `sendTrackVolume: could not resolve track number for guid ${guid}`
          );
        }

        const address = `/track/${trackNumber}/volume`;

        if (typeof api.sendOsc === "function") {
          return api.sendOsc({
            address,
            args: [vol],
          });
        }

        if (typeof api.oscSend === "function") {
          return api.oscSend(address, [vol]);
        }

        if (typeof api.sendTrackVolumeOsc === "function") {
          return api.sendTrackVolumeOsc(trackNumber, vol);
        }

        throw new Error(
          "OSC bridge not wired: expected api.sendOsc / api.oscSend / api.sendTrackVolumeOsc"
        );
      },

      async sendTrackPan(trackGuid, value) {
        const guid = String(trackGuid || "");
        const pan01 = clamp01(value);

        if (!guid || !Number.isFinite(pan01)) {
          throw new Error("sendTrackPan: invalid trackGuid/value");
        }

        const trackNumber = getTrackNumberFromRfxGuid(guid);
        if (!Number.isFinite(trackNumber)) {
          throw new Error(
            `sendTrackPan: could not resolve track number for guid ${guid}`
          );
        }

        const address = `/track/${trackNumber}/pan`;

        // REAPER pan OSC expects:
        // 0.0 = L100
        // 0.5 = C
        // 1.0 = R100
        if (typeof api.sendOsc === "function") {
          return api.sendOsc({
            address,
            args: [pan01],
          });
        }

        if (typeof api.oscSend === "function") {
          return api.oscSend(address, [pan01]);
        }

        if (typeof api.sendTrackPanOsc === "function") {
          return api.sendTrackPanOsc(trackNumber, pan01);
        }

        throw new Error(
          "OSC bridge not wired: expected api.sendOsc / api.oscSend / api.sendTrackPanOsc"
        );
      },

      async sendBusVolume(busId, value) {
        const id = String(busId || "");
        const vol = clamp01(value);

        if (!id || !Number.isFinite(vol)) {
          throw new Error("sendBusVolume: invalid busId/value");
        }

        if (typeof api.sendOsc === "function") {
          return api.sendOsc({
            address: "/rfx/bus/vol",
            args: [id, vol],
          });
        }

        if (typeof api.oscSend === "function") {
          return api.oscSend("/rfx/bus/vol", [id, vol]);
        }

        if (typeof api.sendBusVolumeOsc === "function") {
          return api.sendBusVolumeOsc(id, vol);
        }

        throw new Error(
          "OSC bridge not wired: expected api.sendOsc / api.oscSend / api.sendBusVolumeOsc"
        );
      },

      async sendFxParamValue({ trackGuid, fxIndex, paramIdx, value01 }) {
        const guid = String(trackGuid || "").trim();
        const fxSlot0 = Number(fxIndex);
        const paramSlot0 = Number(paramIdx);
        const value = clamp01(value01);

        if (!guid) {
          throw new Error("sendFxParamValue: invalid trackGuid");
        }

        if (!Number.isFinite(fxSlot0) || fxSlot0 < 0) {
          throw new Error(`sendFxParamValue: invalid fxIndex ${fxIndex}`);
        }

        if (!Number.isFinite(paramSlot0) || paramSlot0 < 0) {
          throw new Error(`sendFxParamValue: invalid paramIdx ${paramIdx}`);
        }

        const trackNumber = getTrackNumberFromRfxGuid(guid);
        if (!Number.isFinite(trackNumber)) {
          throw new Error(
            `sendFxParamValue: could not resolve track number for guid ${guid}`
          );
        }

        // REAPER OSC path is 1-based for fx and param slots
        const fxSlot1 = fxSlot0 + 1;
        const paramSlot1 = paramSlot0 + 1;
        const address = `/track/${trackNumber}/fx/${fxSlot1}/fxparam/${paramSlot1}/value`;

        if (typeof api.sendOsc === "function") {
          return api.sendOsc({
            address,
            args: [value],
          });
        }

        if (typeof api.oscSend === "function") {
          return api.oscSend(address, [value]);
        }

        if (typeof api.sendFxParamValueOsc === "function") {
          return api.sendFxParamValueOsc(
            trackNumber,
            fxSlot1,
            paramSlot1,
            value
          );
        }

        throw new Error(
          "OSC bridge not wired: expected api.sendOsc / api.oscSend / api.sendFxParamValueOsc"
        );
      },
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