// src/components/controls/knobs/Knob.jsx
import React from "react";
import knobStripUrl from "../../../assets/knobSpriteStrip.png";
import { styles, SPRITE_FRAMES, RENDER_SIZE, CENTER_FRAME } from "./_styles";

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

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

export function Knob({
  id,
  label,
  value,
  mapped,
  mappedLabel,
  mappingArmed,
  onTap,
  onChange,
  onCommit, // ✅ NEW
}) {
  const [dragging, setDragging] = React.useState(false);
  const startRef = React.useRef(null);
  const lastTapRef = React.useRef(0);
  const [nat, setNat] = React.useState(null);

  React.useEffect(() => {
    const img = new Image();
    img.onload = () => setNat({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = knobStripUrl;
  }, []);

  React.useEffect(() => () => setGlobalDragLock(false), []);

  const v = clamp01(value);
  const frameIndex = valueToFrame(v, SPRITE_FRAMES);

  function finishDrag(el, pointerId) {
    setDragging(false);
    startRef.current = null;
    setGlobalDragLock(false);

    try {
      if (el && pointerId != null) el.releasePointerCapture?.(pointerId);
    } catch { }

    onCommit?.(); // ✅ NEW
  }

  function resetToCenter() {
    onChange?.(0.5);
    setDragging(false);
    startRef.current = null;
    setGlobalDragLock(false);
    onCommit?.(); // ✅ NEW
  }

  function onPointerDown(e) {
    e.preventDefault();
    e.stopPropagation();

    // If mapping mode, treat tap as selection (don’t start drag)
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

    startRef.current = { y: e.clientY, v, pointerId };
  }

  function onPointerMove(e) {
    if (!dragging || !startRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    const dy = startRef.current.y - e.clientY;
    const next = clamp01(startRef.current.v + dy / 250);
    onChange?.(next);
  }

  function onPointerUp(e) {
    finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onPointerCancel(e) {
    finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onLostPointerCapture(e) {
    if (dragging)
      finishDrag(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
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
        style={styles.knobFace(dragging)}
      >
        <img
          src={knobStripUrl}
          draggable={false}
          alt=""
          style={styles.knobImg(stripW, stripH, y)}
        />
      </div>

      {/* LABELS */}
      <div style={styles.labelWrap}>
        <div style={styles.label}>{label}</div>

        {/* ✅ always reserve a line so layout doesn't shift when mapped */}
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