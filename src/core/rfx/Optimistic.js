import { normalizeMode, canonicalTrackGuid, normBusId, findLaneGuidsForBus } from "../DomainHelpers";

/**
 * Optimistic overlay builder.
 * Accepts either { kind: "X" } OR { name: "X" }.
 */
export function buildOptimistic(state, intent) {
  const kind = intent?.kind || intent?.name;

  switch (kind) {
    case "toggleRecArm": {
      const { trackGuid, value } = intent || {};
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { recArm: !!value } } };
    }

    case "toggleMute": {
      const { trackGuid, value } = intent || {};
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { mute: !!value } } };
    }

    case "toggleSolo": {
      const { trackGuid, value } = intent || {};
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { solo: value ? 1 : 0 } } };
    }

    case "setVol": {
      const { trackGuid, value } = intent || {};
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { vol: Number(value ?? 1) } } };
    }

    case "setPan": {
      const { trackGuid, value } = intent || {};
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { pan: Number(value ?? 0) } } };
    }

    // ---------------------------
    // ✅ FX: add (optimistic)
    // ---------------------------
    case "addFx": {
      const trackGuid = canonicalTrackGuid(intent?.trackGuid);
      const localFxId = String(intent?.localFxId || intent?.fxGuid || "");
      if (!trackGuid || !localFxId) return null;

      const fxName =
        String(intent?.fxName || intent?.fxRaw || "Plugin");

      const vendor = String(intent?.fxVendor || "");
      const format = String(intent?.fxFormat || "");
      const enabled = intent?.enabled !== false;

      const baseOrder = state?.entities?.fxOrderByTrackGuid?.[trackGuid] || [];
      const nextOrder = baseOrder.concat([localFxId]);

      return {
        fx: {
          [localFxId]: {
            guid: localFxId,
            trackGuid,
            fxIndex: nextOrder.length - 1,
            name: fxName,
            vendor,
            format,
            enabled,
            raw: intent?.fxRaw ?? intent?.raw ?? null,
            optimistic: true,
          },
        },
        fxOrderByTrackGuid: { [trackGuid]: nextOrder },
      };
    }

    // ---------------------------
    // ✅ FX: remove (optimistic)
    // ---------------------------
    case "removeFx": {
      const trackGuid = canonicalTrackGuid(intent?.trackGuid);
      const fxGuid = String(intent?.fxGuid || "");
      if (!trackGuid || !fxGuid) return null;

      const baseOrder = state?.entities?.fxOrderByTrackGuid?.[trackGuid] || [];
      const nextOrder = baseOrder.filter((g) => g !== fxGuid);

      // tombstone (so chain can skip it immediately)
      return {
        fx: { [fxGuid]: { removed: true } },
        fxOrderByTrackGuid: { [trackGuid]: nextOrder },
      };
    }
    // ---------------------------
    // ✅ MIX: Track Volume (0..1)
    // Supports: setVol (legacy) AND setTrackVolume (current)
    // ---------------------------
    case "setVol":
    case "setTrackVolume": {
      const trackGuid = canonicalTrackGuid(intent?.trackGuid);
      const value = Number(intent?.value ?? 1);
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { vol: value } } };
    }

    // ---------------------------
    // ✅ MIX: Track Pan (-1..+1)
    // Supports: setPan (legacy) AND setTrackPan (current)
    // ---------------------------
    case "setPan":
    case "setTrackPan": {
      const trackGuid = canonicalTrackGuid(intent?.trackGuid);
      const value = Number(intent?.value ?? 0);
      if (!trackGuid) return null;
      return { track: { [trackGuid]: { pan: value } } };
    }

    // ---------------------------
    // ✅ MIX: Bus Volume (0..1)
    // ---------------------------
    case "setBusVolume": {
      const busId = normBusId(intent?.busId);
      const value = Number(intent?.value ?? 1);
      if (!busId) return null;
      return { bus: { [busId]: { vol: value } } };
    }

    case "toggleFx": {
      const { fxGuid, value } = intent || {};
      if (!fxGuid) return null;
      return { fx: { [fxGuid]: { enabled: !!value } } };
    }

    case "reorderFx": {
      const trackGuid = canonicalTrackGuid(intent?.trackGuid);
      const { fromIndex, toIndex } = intent || {};
      if (!trackGuid) return null;

      const order = state.entities.fxOrderByTrackGuid[trackGuid] || [];
      if (
        fromIndex == null ||
        toIndex == null ||
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= order.length ||
        toIndex >= order.length
      ) {
        return null;
      }

      const next = order.slice();
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { fxOrderByTrackGuid: { [trackGuid]: next } };
    }

    case "setRoutingMode": {
      const { busId, mode } = intent || {};
      if (!busId) return null;

      const lanes = findLaneGuidsForBus(state?.entities?.tracksByGuid || {}, busId);
      if (!lanes.A && !lanes.B && !lanes.C) return null;

      const want = normalizeMode(mode);

      const armA = want === "linear" || want === "parallel" || want === "lcr";
      const armB = want === "parallel" || want === "lcr";
      const armC = want === "lcr";

      const patch = {};
      if (lanes.A) patch[lanes.A] = { recArm: !!armA };
      if (lanes.B) patch[lanes.B] = { recArm: !!armB };
      if (lanes.C) patch[lanes.C] = { recArm: !!armC };

      return { track: patch };
    }
    case "setParamValue": {
      const fxGuid = String(intent?.fxGuid || "");
      const paramIdx = Number(intent?.paramIdx);
      const value01 = Number(intent?.value01 ?? intent?.value);

      if (!fxGuid) return null;
      if (!Number.isFinite(paramIdx)) return null;

      const v01 = Math.max(0, Math.min(1, Number.isFinite(value01) ? value01 : 0));

      return {
        fxParamsByGuid: {
          [fxGuid]: {
            [paramIdx]: { value01: v01 },
          },
        },
      };
    }
    case "selectActiveBus":
    default:
      return null;
  }
}