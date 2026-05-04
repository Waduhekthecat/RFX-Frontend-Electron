import React from "react";
import { clamp01 } from "../../../core/DomainHelpers";
import knobStripUrl from "../../../assets/knobSpriteStrip.png";
import { styles, SPRITE_FRAMES, RENDER_SIZE, CENTER_FRAME } from "./_styles";

function valueToFrame(v01, frames) {
  const v = clamp01(v01);
  const idx = Math.round((v - 0.5) * (frames - 1) + CENTER_FRAME);
  return Math.max(0, Math.min(frames - 1, idx));
}

function setGlobalDragLock(on) {
  const b = document.body;
  if (!b) return;
  if (on) {
    b.style.userSelect = "none";
    b.style.webkitUserSelect = "none";
    b.style.cursor = "ns-resize";
  } else {
    b.style.userSelect = "";
    b.style.webkitUserSelect = "";
    b.style.cursor = "";
  }
}

// smoothing for EXTERNAL updates only
const SMOOTH_ALPHA = 0.38;
const SMOOTH_EPS = 0.0008;

export function Knob({
  id,
  label,
  value,
  mapped,
  mappedLabel,
  mappingArmed,
  onDropMap,
  onTap,
  onChange,
  onCommit,
  mapDragActive = false,
  canAcceptMap = true,
}) {
  const [dragging, setDragging] = React.useState(false);
  const startRef = React.useRef(null);
  const lastTapRef = React.useRef(0);
  const [nat, setNat] = React.useState(null);
  const [mapDragOver, setMapDragOver] = React.useState(false);

  // ✅ display value for smoothing incoming mapped/store updates
  const targetValue = clamp01(value);
  const [displayValue, setDisplayValue] = React.useState(targetValue);
  const rafRef = React.useRef(0);
  const targetRef = React.useRef(targetValue);

  React.useEffect(() => {
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = knobStripUrl;
  }, []);

  React.useEffect(() => () => {
    setGlobalDragLock(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  // ✅ smooth external updates, but do not fight active drag
  React.useEffect(() => {
    targetRef.current = targetValue;

    if (dragging) {
      setDisplayValue(targetValue);
      return;
    }

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = () => {
      setDisplayValue((prev) => {
        const cur = clamp01(prev);
        const tgt = clamp01(targetRef.current);
        const diff = tgt - cur;

        if (Math.abs(diff) <= SMOOTH_EPS) {
          rafRef.current = 0;
          return tgt;
        }

        const next = cur + diff * SMOOTH_ALPHA;
        return clamp01(next);
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    if (Math.abs(displayValue - targetValue) > SMOOTH_EPS) {
      rafRef.current = requestAnimationFrame(tick);
    } else {
      setDisplayValue(targetValue);
    }

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetValue, dragging]);

  const v = clamp01(displayValue);
  const frameIndex = valueToFrame(v, SPRITE_FRAMES);

  function finishDrag(el, pointerId) {
    setDragging(false);
    startRef.current = null;
    setGlobalDragLock(false);

    try {
      if (el && pointerId != null) el.releasePointerCapture?.(pointerId);
    } catch (err) {
      void err;
    }

    onCommit?.();
  }

  function resetToCenter() {
    const next = 0.5;
    setDisplayValue(next);
    onChange?.(next);
    setDragging(false);
    startRef.current = null;
    setGlobalDragLock(false);
    onCommit?.();
  }

  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();

    if (mappingArmed) {
      onTap?.(id);
      return;
    }

    const now = Date.now();
    const delta = now - lastTapRef.current;
    lastTapRef.current = now;

    if (delta > 0 && delta < 300) {
      resetToCenter();
      return;
    }

    const el = e.currentTarget;
    const pointerId = e.pointerId;

    el.setPointerCapture?.(pointerId);

    setGlobalDragLock(true);
    setDragging(true);

    startRef.current = { y: e.clientY, v: displayValue, pointerId };  }

  function onPointerMove(e) {
    if (!dragging || !startRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dy = startRef.current.y - e.clientY;
    const next = clamp01(startRef.current.v + dy / 250);

    // ✅ direct visual response while dragging
    setDisplayValue(next);
    onChange?.(next);
  }

  function onPointerUp(e) {
    finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onPointerCancel(e) {
    finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onLostPointerCapture(e) {
    if (dragging) {
      finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
    }
  }

  const srcW = nat?.w ?? 1;
  const srcH = nat?.h ?? SPRITE_FRAMES;
  const srcFrameH = Math.max(1, Math.floor(srcH / SPRITE_FRAMES));
  const scale = RENDER_SIZE / srcFrameH;

  const stripW = Math.round(srcW * scale);
  const stripH = Math.round(srcH * scale);
  const frameRenderH = srcFrameH * scale;
  const y = -frameIndex * frameRenderH;

  const containerW = Math.max(120, RENDER_SIZE + 28);

  return (
    <div style={styles.knobWrap(containerW)}>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        className="select-none"
        style={styles.knobFace({ dragging, mapDragActive, canAcceptMap, mapDragOver })}
        onDragEnter={(e) => {
          if (!onDropMap || !canAcceptMap) return;
          e.preventDefault();
          setMapDragOver(true);
        }}
        onDragOver={(e) => {
          if (!onDropMap || !canAcceptMap) return;
          e.preventDefault();
          if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
          if (!mapDragOver) setMapDragOver(true);
        }}
        onDragLeave={() => {
          if (mapDragOver) setMapDragOver(false);
        }}
        onDrop={(e) => {
          setMapDragOver(false);
          if (!onDropMap || !canAcceptMap) return;
          e.preventDefault();
          e.stopPropagation();
          const payload = e.dataTransfer?.getData("text/plain") || "";
          onDropMap?.(id, payload);
        }}
      >
        <img
          src={knobStripUrl}
          draggable={false}
          alt=""
          style={styles.knobImg(stripW, stripH, y)}
        />
      </div>

      <div style={styles.labelWrap}>
        <div style={styles.label}>{label}</div>
        <div
          style={{
            ...styles.mappedLabel,
            visibility: mapped && mappedLabel ? "visible" : "hidden",
          }}
          title={mapped && mappedLabel ? mappedLabel : ""}
        >
          {mapped && mappedLabel ? mappedLabel : "placeholder"}
        </div>
      </div>
    </div>
  );
}