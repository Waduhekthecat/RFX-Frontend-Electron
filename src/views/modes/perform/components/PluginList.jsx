import React from "react";
import { Inset } from "../../../../components/ui/Panel";
import { styles } from "../_styles";

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick(arr, idx) {
  return arr[idx % arr.length];
}

const VENDORS = ["Neural DSP", "Valhalla", "FabFilter", "Soundtoys", "Tokyo Dawn", "IK", "Waves", "UAD"];
const FX = [
  "Compressor", "Limiter", "EQ", "Tape", "Chorus", "Flanger", "Phaser",
  "Plate Reverb", "Hall Reverb", "Delay", "Ping Pong Delay", "Saturation",
  "Amp Sim", "Cab IR", "Gate", "Multiband", "Stereo Widener",
];

export function makeMockPlugins(busId, count = 6) {
  const seed = hashStr(busId || "BUS");
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = seed + i * 1013;
    const vendor = pick(VENDORS, a);
    const name = pick(FX, a >>> 3);
    const enabled = ((a >>> 7) % 6) !== 0; // mostly enabled
    out.push({
      id: `${busId}_fx_${i}`,
      index: i + 1,
      vendor,
      name,
      enabled,
    });
  }
  return out;
}

function Row({ fx, active }) {
  return (
    <div
      className={[
        styles.PluginRowBase,
        active ? styles.PluginRowActive : styles.PluginRowIdle,
      ].join(" ")}
    >
      <div className={styles.PluginIndex}>{fx.index}</div>

      <div className="flex-1 min-w-0">
        <div className={styles.PluginName}>{fx.name}</div>
        <div className={styles.PluginVendor}>{fx.vendor}</div>
      </div>

      <div
        className={[
          "text-[10px] px-2 py-0.5 rounded-full border",
          fx.enabled ? styles.PluginStateOn : styles.PluginStateOff,
        ].join(" ")}
      >
        {fx.enabled ? "ON" : "OFF"}
      </div>
    </div>
  );
}

export function PluginList({
  title = "FX Chain",
  plugins = [],
  activeIndex = 0,
  className = "",
}) {
  return (
    <Inset className={[styles.PluginInset, className].filter(Boolean).join(" ")}>
      <div className={styles.PluginHeader}>
        <div className={styles.PluginTitle}>{title}</div>
        <div className={styles.PluginCount}>{plugins.length} plugins</div>
      </div>

      <div className={styles.PluginRows}>
        {plugins.map((fx, i) => (
          <Row key={fx.id} fx={fx} active={i === activeIndex} />
        ))}
      </div>
    </Inset>
  );
}