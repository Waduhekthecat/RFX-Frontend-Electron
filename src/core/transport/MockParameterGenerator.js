// src/core/fx/mockParams.js

function norm(s) {
  return String(s ?? "").trim();
}

function safeLower(s) {
  return norm(s).toLowerCase();
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function makeParam(idx, name, value01 = 0.5, uiLabel) {
  return {
    idx,
    name,
    nameNorm: safeLower(name),
    uiLabel: uiLabel || undefined,
    value01: clamp01(value01),
    fmt: "",
  };
}

function pickTypeFromName(name) {
  const s = safeLower(name);

  if (s.includes("compress")) return "compressor";
  if (s.includes("limit")) return "limiter";
  if (s.includes("gate")) return "gate";
  if (s.includes("reverb")) return "reverb";
  if (s.includes("delay")) return "delay";
  if (s.includes("chorus")) return "chorus";
  if (s.includes("flanger")) return "flanger";
  if (s.includes("eq")) return "eq";
  if (s.includes("amp")) return "amp";
  if (s.includes("cab")) return "cab";
  if (s.includes("drive") || s.includes("distort") || s.includes("saturat"))
    return "distortion";

  return "generic";
}

function paramsFor(type) {
  switch (type) {
    case "compressor":
      return [
        "Threshold",
        "Ratio",
        "Attack",
        "Release",
        "Knee",
        "Makeup Gain",
        "Mix",
        "Sidechain",
      ];

    case "limiter":
      return [
        "Threshold",
        "Ceiling",
        "Release",
        "Lookahead",
        "Gain",
        "Soft Clip",
        "Mix",
        "Stereo Link",
      ];

    case "gate":
      return [
        "Threshold",
        "Attack",
        "Hold",
        "Release",
        "Range",
        "Hysteresis",
        "Sidechain",
        "Mix",
      ];

    case "delay":
      return [
        "Time",
        "Feedback",
        "Mix",
        "LoCut",
        "HiCut",
        "Ping Pong",
        "Mod Rate",
        "Mod Depth",
      ];

    case "reverb":
      return [
        "Size",
        "Decay",
        "PreDelay",
        "Damp",
        "LoCut",
        "HiCut",
        "Width",
        "Mix",
      ];

    case "eq":
      return [
        "HPF",
        "Low Gain",
        "Low Mid",
        "Mid Gain",
        "High Mid",
        "High Gain",
        "LPF",
        "Output",
      ];

    case "amp":
      return [
        "Gain",
        "Bass",
        "Mid",
        "Treble",
        "Presence",
        "Depth",
        "Master",
        "Level",
      ];

    case "distortion":
      return [
        "Drive",
        "Tone",
        "Level",
        "Low",
        "High",
        "Mix",
        "Bias",
        "Tight",
      ];

    default:
      return [
        "Amount",
        "Tone",
        "Width",
        "Drive",
        "Depth",
        "Rate",
        "Mix",
        "Output",
      ];
  }
}

export function makeMockParamManifestForFx(fx) {
  const fxName = norm(fx?.name) || "Plugin";
  const type = pickTypeFromName(fxName);

  const names = paramsFor(type).slice(0, 8);

  const params = names.map((name, i) =>
    makeParam(i, name, 0.5)
  );

  return {
    plugin: {
      fxName,
      fxGuid: fx?.id || fx?.guid || "",
      trackGuid: fx?.trackGuid || "",
      paramCount: params.length,
    },
    scan: {
      safeProbe: false,
      paramsIncluded: params.length,
      filter: `mock:${type}`,
    },
    recommended: params.map((p) => ({
      idx: p.idx,
      name: p.name,
      score: 100,
      confidence: 1.0,
      role: p.nameNorm,
    })),
    roles: {},
    params,
  };
}