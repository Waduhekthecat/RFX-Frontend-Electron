import React from "react";
import { clamp01, makeGestureId } from "../../../../core/DomainHelpers";
import { useRfxStore } from "../../../../core/rfx/Store";
import { Slider } from "../../../../components/controls/sliders/_index";
import {
  Surface,
  useScrubValue,
  useDoubleTap,
} from "../../../../components/ui/gestures/_index";

const PARAM_SENSITIVITY = 0.0026;
const SMOOTH_ALPHA = 0.38;
const SMOOTH_EPS = 0.0008;
const SNAP_EPS = 0.01;

function ParamCardImpl({
  trackGuid,
  fxGuid,
  p,
  onChange01,
  onCommit01,
  onMap,
  onUnmap,
  mappedKnobs = [],
}) {
  const paramIdx = Number(p?.idx ?? 0);

  // Subscribe only to this param's overlay entry
  const overlayEntry = useRfxStore(
    (s) => s?.ops?.overlay?.fxParamsByGuid?.[fxGuid]?.[paramIdx] ?? null
  );

  // Subscribe only to this param's truth entry, not the whole manifest
  const truthParam = useRfxStore((s) => {
    const entityManifest = s?.entities?.fxParamsByGuid?.[fxGuid];
    const snapManifest = s?.snapshot?.fxParamsByGuid?.[fxGuid];
    const params = entityManifest?.params ?? snapManifest?.params ?? null;
    if (!Array.isArray(params)) return null;

    for (let i = 0; i < params.length; i += 1) {
      const x = params[i];
      if (Number(x?.idx) === paramIdx) return x;
    }
    return null;
  });

  const liveParam = React.useMemo(() => {
    return {
      ...(p || {}),
      ...(truthParam || {}),
      ...(overlayEntry || {}),
      idx: Number(overlayEntry?.idx ?? truthParam?.idx ?? p?.idx ?? paramIdx),
      value01: clamp01(
        overlayEntry?.value01 ?? truthParam?.value01 ?? p?.value01 ?? 0.5
      ),
    };
  }, [p, truthParam, overlayEntry, paramIdx]);

  const truth01 = clamp01(truthParam?.value01 ?? p?.value01 ?? 0.5);

  const rendered01 = clamp01(
    overlayEntry?.value01 ?? truthParam?.value01 ?? p?.value01 ?? 0.5
  );

  const [isDragging, setIsDragging] = React.useState(false);
  const [live01, setLive01] = React.useState(rendered01);

  const rafRef = React.useRef(0);
  const targetRef = React.useRef(rendered01);
  const gestureIdRef = React.useRef(null);

  React.useEffect(() => {
    targetRef.current = rendered01;

    if (isDragging) return;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      if (isDragging) {
        rafRef.current = 0;
        return;
      }

      setLive01((prev) => {
        const cur = clamp01(prev);
        const tgt = clamp01(targetRef.current);
        const diff = tgt - cur;

        if (Math.abs(diff) <= SNAP_EPS) {
          rafRef.current = 0;
          return tgt;
        }

        if (Math.abs(diff) <= SMOOTH_EPS) {
          rafRef.current = 0;
          return tgt;
        }

        return clamp01(cur + diff * SMOOTH_ALPHA);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    if (Math.abs(rendered01 - live01) > SMOOTH_EPS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setLive01(rendered01);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [rendered01, isDragging, live01]);

  function endGesture(finalValue01) {
    if (!isDragging) return;

    const gestureId = gestureIdRef.current || makeGestureId("fxParam");

    setIsDragging(false);
    onCommit01?.(liveParam || p, clamp01(finalValue01), gestureId);

    gestureIdRef.current = null;
  }

  const reset = React.useCallback(() => {
    const next = clamp01(liveParam?.default01 ?? p?.default01 ?? 0.5);
    const gestureId = makeGestureId("fxParamReset");

    gestureIdRef.current = gestureId;
    setIsDragging(true);
    setLive01(next);

    onChange01?.(liveParam || p, next, gestureId);
    onCommit01?.(liveParam || p, next, gestureId);

    setIsDragging(false);
    gestureIdRef.current = null;
  }, [liveParam, p, onChange01, onCommit01]);

  const dbl = useDoubleTap(reset);

  const scrub = useScrubValue({
    value: live01,
    accel: { enabled: true, exponent: 1.6, accel: 0.02 },
    min: 0,
    max: 1,
    sensitivity: PARAM_SENSITIVITY,
    onChange: (next) => {
      const clamped = clamp01(next);

      if (!isDragging) {
        setIsDragging(true);
        gestureIdRef.current = makeGestureId("fxParam");
      }

      // Immediate local ownership during drag
      setLive01(clamped);
      onChange01?.(liveParam || p, clamped, gestureIdRef.current);
    },
    onEnd: ({ value }) => endGesture(value),
  });

  const label = String(
    liveParam?.uiLabel || liveParam?.name || `Param ${paramIdx}`
  ).trim();

  const subtitle = String(liveParam?.name || "").trim();
  const valueText = `${live01.toFixed(2)}`;

  const mapped = Array.isArray(mappedKnobs) && mappedKnobs.length > 0;
  const mappedText = mapped ? `Mapped: ${mappedKnobs.join(", ")}` : "";

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3 h-full flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold tracking-wide text-white truncate">
            {label}
          </div>
          <div className="text-[11px] text-white/45 truncate">{subtitle}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {mapped ? (
            <div
              className="max-w-[180px] px-2.5 py-1 rounded-full border border-emerald-300/30 bg-emerald-500/15 text-[10px] font-semibold text-emerald-200 shadow-[0_0_0_1px_rgba(16,185,129,0.15)] truncate"
              title={mappedText}
            >
              {mappedText}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => {
              if (mapped) onUnmap?.(liveParam || p);
              else onMap?.(liveParam || p);
            }}
            className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/80"
            title={
              mapped
                ? "Unmap this parameter from knobs on this bus"
                : "Map to a macro knob"
            }
          >
            {mapped ? "UNMAP" : "MAP"}
          </button>
        </div>
      </div>

      <div className="mt-3 min-w-0">
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

      <div className="mt-auto pt-2 flex items-center justify-between gap-3 min-w-0">
        <div className="text-[11px] text-white/45 truncate">
          truth={Math.round(truth01 * 100)} • rendered={Math.round(rendered01 * 100)}
        </div>
        <div className="text-[10px] text-white/30 tabular-nums shrink-0">
          #{paramIdx}
        </div>
      </div>
    </div>
  );
}

export const ParamCard = React.memo(
  ParamCardImpl,
  (prev, next) =>
    prev.trackGuid === next.trackGuid &&
    prev.fxGuid === next.fxGuid &&
    prev.p === next.p &&
    prev.onChange01 === next.onChange01 &&
    prev.onCommit01 === next.onCommit01 &&
    prev.onMap === next.onMap &&
    prev.onUnmap === next.onUnmap &&
    prev.mappedKnobs === next.mappedKnobs
);