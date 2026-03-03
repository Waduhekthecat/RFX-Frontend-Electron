// src/views/edit/plugin/components/ParamCard.jsx
import React from "react";
import { useRfxStore } from "../../../../core/rfx/Store";
import { Slider } from "../../../../components/controls/sliders/_index";
import { Surface, useScrubValue, useDoubleTap } from "../../../../components/ui/gestures/_index";

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

// Tune feel (similar vibe to TrackMixControls)
const PARAM_SENSITIVITY = 0.0045; // ~200px sweep-ish

function selectFxParam01(s, fxGuid, paramIdx, fallback01 = 0.5) {
  // 1) optimistic override (during scrub)
  const patch = s?.ops?.overlay?.fxParamsByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) {
    return clamp01(patch.value01);
  }

  // 2) truth
  const manifest =
    s?.snapshot?.fxParamsByGuid?.[fxGuid] ??
    s?.entities?.fxParamsByGuid?.[fxGuid];

  const p = manifest?.params?.find?.((x) => Number(x?.idx) === Number(paramIdx));
  if (p && Number.isFinite(Number(p.value01))) return clamp01(p.value01);

  return clamp01(fallback01);
}

export function ParamCard({
  fxGuid,
  p,
  onChange01, // (p, next01) => void  (buffered “send” in parent)
  onCommit01, // () => void            (flush in parent)
  onMap,      // (p) => void
}) {
  const paramIdx = Number(p?.idx ?? 0);
  const fallback01 = clamp01(p?.value01 ?? 0.5);

  // ✅ ONE hook per card component (safe even if params count changes)
  const truth01 = useRfxStore(
    React.useCallback(
      (s) => selectFxParam01(s, fxGuid, paramIdx, fallback01),
      [fxGuid, paramIdx, fallback01]
    )
  );

  const isDraggingRef = React.useRef(false);
  const [live01, setLive01] = React.useState(truth01);

  // If truth changes (and we’re not dragging), follow it
  React.useEffect(() => {
    if (isDraggingRef.current) return;
    setLive01(truth01);
  }, [truth01]);

  const label = String(p?.uiLabel || p?.name || `Param ${paramIdx}`).trim();
  const subtitle = String(p?.name || "").trim();

  function endGesture() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onCommit01?.();
  }

  // Optional: double-tap reset (uses p.default01 if present, else 0.5)
  const reset = React.useCallback(() => {
    const next = clamp01(p?.default01 ?? 0.5);
    setLive01(next);
    onChange01?.(p, next);
    onCommit01?.();
  }, [onChange01, onCommit01, p]);

  const dbl = useDoubleTap(reset);

  const scrub = useScrubValue({
    value: live01,
    accel: { enabled: true, exponent: 1.6, accel: 0.02 },
    min: 0,
    max: 1,
    sensitivity: PARAM_SENSITIVITY,
    onChange: (next) => {
      isDraggingRef.current = true;
      setLive01(next);
      onChange01?.(p, next);
    },
    onEnd: endGesture,
  });

  const valueText = p?.fmt ? String(p.fmt) : `${Math.round(live01 * 100)}%`;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-wide text-white truncate">
            {label}
          </div>
          <div className="text-[11px] text-white/45 truncate">{subtitle}</div>
        </div>

        <button
          type="button"
          onClick={() => onMap?.(p)}
          className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/80"
          title="Map to a macro knob"
        >
          MAP
        </button>
      </div>

      <div className="mt-3">
        {/* ✅ Same pattern as TrackMixControls: Surface drives the slider, slider onChange noop */}
        <Surface gestures={[scrub, dbl]}>
          <Slider
            label=""
            min={0}
            max={1}
            step={0.001}
            value={live01}
            valueText={valueText}
            widthClass="w-full"
            onChange={() => {}}
          />
        </Surface>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="text-[11px] text-white/45">{valueText}</div>
        <div className="text-[10px] text-white/30 tabular-nums">#{paramIdx}</div>
      </div>
    </div>
  );
}