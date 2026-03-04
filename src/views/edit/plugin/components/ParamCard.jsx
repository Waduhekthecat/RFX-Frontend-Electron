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
const PARAM_SENSITIVITY = 0.0045;

// ✅ smoothing for external updates (knob -> param)
const SMOOTH_ALPHA = 0.18; // 0..1 (higher = snappier, lower = smoother)
const SMOOTH_EPS = 0.0015; // stop animating when within eps

function selectFxParam01(s, fxGuid, paramIdx, fallback01 = 0.5) {
  // 1) optimistic override (during scrub or remote knob changes)
  const patch = s?.ops?.overlay?.fxParamsByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) return clamp01(patch.value01);

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
  onChange01,  // (p, next01) => void
  onCommit01,  // () => void
  onMap,       // (p) => void
  onUnmap,     // (p) => void
  mappedKnobs = [],
}) {
  const paramIdx = Number(p?.idx ?? 0);
  const fallback01 = clamp01(p?.value01 ?? 0.5);

  const truth01 = useRfxStore(
    React.useCallback(
      (s) => selectFxParam01(s, fxGuid, paramIdx, fallback01),
      [fxGuid, paramIdx, fallback01]
    )
  );

  // local drag flag (same as you had)
  const isDraggingRef = React.useRef(false);

  // local display value (what the slider renders)
  const [live01, setLive01] = React.useState(truth01);

  // ✅ smooth external updates (when NOT dragging)
  const rafRef = React.useRef(0);
  const targetRef = React.useRef(truth01);

  React.useEffect(() => {
    targetRef.current = truth01;

    // if user is currently dragging this param, don't fight them
    if (isDraggingRef.current) return;

    // cancel any previous loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      if (isDraggingRef.current) {
        rafRef.current = 0;
        return;
      }

      setLive01((prev) => {
        const cur = clamp01(prev);
        const tgt = clamp01(targetRef.current);
        const diff = tgt - cur;

        // close enough → snap + stop
        if (Math.abs(diff) <= SMOOTH_EPS) {
          rafRef.current = 0;
          return tgt;
        }

        // low-pass / lerp
        const next = cur + diff * SMOOTH_ALPHA;
        return clamp01(next);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    // start loop only if we're meaningfully far away
    if (Math.abs(truth01 - live01) > SMOOTH_EPS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      // keep in sync
      setLive01(truth01);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [truth01]); // intentionally only re-run when truth changes

  const label = String(p?.uiLabel || p?.name || `Param ${paramIdx}`).trim();
  const subtitle = String(p?.name || "").trim();

  function endGesture() {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    onCommit01?.();
    // after releasing, truth smoothing will take back over if needed
  }

  const reset = React.useCallback(() => {
    const next = clamp01(p?.default01 ?? 0.5);
    isDraggingRef.current = true;     // treat reset like a local edit
    setLive01(next);
    onChange01?.(p, next);
    onCommit01?.();
    isDraggingRef.current = false;
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

  const mapped = Array.isArray(mappedKnobs) && mappedKnobs.length > 0;
  const mappedText = mapped ? `Mapped: ${mappedKnobs.join(", ")}` : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 h-full flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold tracking-wide text-white truncate">
            {label}
          </div>
          <div className="text-[11px] text-white/45 truncate">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {mapped ? (
            <div
              className="px-2.5 py-1 rounded-full border border-emerald-300/30 bg-emerald-500/15 text-[10px] font-semibold text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
              title={mappedText}
            >
              {mappedText}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (mapped) onUnmap?.(p);
              else onMap?.(p);
            }}
            className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/80"
            title={mapped ? "Unmap this parameter from knobs on this bus" : "Map to a macro knob"}
          >
            {mapped ? "UNMAP" : "MAP"}
          </button>
        </div>
      </div>

      <div className="mt-3">
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

      <div className="mt-auto pt-2 flex items-center justify-between">
        <div className="text-[11px] text-white/45">{valueText}</div>
        <div className="text-[10px] text-white/30 tabular-nums">#{paramIdx}</div>
      </div>
    </div>
  );
}