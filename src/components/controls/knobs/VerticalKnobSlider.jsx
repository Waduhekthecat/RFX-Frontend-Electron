import React from "react";
import { clamp01 } from "../../../core/DomainHelpers";
import { styles } from "./_styles";

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

const SMOOTH_ALPHA = 0.38;
const SMOOTH_EPS = 0.0008;
const DRAG_PIXELS_FOR_FULL_SWEEP = 140;

export function VerticalKnobSlider({
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
  onLongPress,
  interactive = true,
  dimmed = false,
  yOffset = 0,
  tapEnabled = false,
}) {
  const [dragging, setDragging] = React.useState(false);
  const startRef = React.useRef(null);
  const lastTapRef = React.useRef(0);
  const [mapDragOver, setMapDragOver] = React.useState(false);
  const longPressTimerRef = React.useRef(0);
  const longPressFiredRef = React.useRef(false);
  const pendingPressRef = React.useRef(null);
  const [pressing, setPressing] = React.useState(false);
  const targetValue = clamp01(value);
  const [displayValue, setDisplayValue] = React.useState(targetValue);
  const rafRef = React.useRef(0);
  const targetRef = React.useRef(targetValue);

  React.useEffect(() => () => {
    setGlobalDragLock(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    setPressing(false);
  }, []);

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

  function finishInteraction(el, pointerId, { commit = true } = {}) {
    setDragging(false);
    startRef.current = null;
    setGlobalDragLock(false);

    try {
      if (el && pointerId != null) el.releasePointerCapture?.(pointerId);
    } catch (err) {
      void err;
    }

    if (commit) onCommit?.();
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = 0;
    }
    setPressing(false);
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
    if (!interactive && !tapEnabled) return;
    e.preventDefault();
    e.stopPropagation();

    if (mappingArmed || !interactive) {
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

    pendingPressRef.current = { y: e.clientY, v: displayValue, pointerId };
    startRef.current = null;
    longPressFiredRef.current = false;
    clearLongPressTimer();
    setPressing(true);
    longPressTimerRef.current = setTimeout(() => {
      longPressFiredRef.current = true;
      onLongPress?.(id);
    }, 850);
  }

  function onPointerMove(e) {
    if (!interactive) return;
    if (!pendingPressRef.current && !startRef.current) return;
    e.preventDefault();
    e.stopPropagation();

    if (!startRef.current && pendingPressRef.current) {
      const movePx = Math.abs(e.clientY - pendingPressRef.current.y);
      if (movePx >= 3) {
        clearLongPressTimer();
        startRef.current = pendingPressRef.current;
        pendingPressRef.current = null;
        setGlobalDragLock(true);
        setDragging(true);
      }
    }

    if (!dragging || !startRef.current) return;
    const dy = startRef.current.y - e.clientY;
    const next = clamp01(startRef.current.v + dy / DRAG_PIXELS_FOR_FULL_SWEEP);

    setDisplayValue(next);
    onChange?.(next);
  }

  function onPointerUp(e) {
    if (!interactive) return;
    clearLongPressTimer();
    setPressing(false);
    const pendingPress = pendingPressRef.current;
    pendingPressRef.current = null;
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false;
      finishInteraction(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
      return;
    }

    if (!startRef.current) {
      onTap?.(id);
      finishInteraction(e.currentTarget, pendingPress?.pointerId ?? e.pointerId, {
        commit: false,
      });
      return;
    }
    finishInteraction(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onPointerCancel(e) {
    if (!interactive) return;
    finishInteraction(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
  }

  function onLostPointerCapture(e) {
    if (!interactive) return;
    if (dragging) {
      clearLongPressTimer();
      pendingPressRef.current = null;
      longPressFiredRef.current = false;
      finishInteraction(e.currentTarget, startRef.current?.pointerId ?? e.pointerId);
    }
  }

  const sliderValue = clamp01(displayValue);
  const containerW = 120;

  return (
    <div
      style={{
        ...styles.knobWrap(containerW),
        opacity: dimmed ? 0.45 : 1,
        filter: dimmed ? "saturate(0.7)" : "none",
        transform: `translateY(${yOffset}px)`,
        transition: "opacity 180ms ease, filter 180ms ease, transform 180ms ease",
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onLostPointerCapture={onLostPointerCapture}
        className="select-none"
        style={styles.knobFace({ dragging, mapDragActive, canAcceptMap, mapDragOver, pressing, interactive })}
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
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ width: 24, height: 116, borderRadius: 13, background: "linear-gradient(180deg, rgba(255,255,255,0.22), rgba(20,20,20,0.95))", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "inset 0 0 12px rgba(0,0,0,0.65)" }}>
            <div style={{ position: "relative", width: "100%", height: "100%" }}>
              <div style={{ position: "absolute", left: 2, right: 2, bottom: 2, height: `${Math.max(8, sliderValue * 112)}px`, borderRadius: 10, background: "linear-gradient(180deg, rgba(142,224,255,0.9), rgba(95,189,255,0.45))" }} />
              <div style={{ position: "absolute", left: -8, right: -8, bottom: `${2 + sliderValue * 112}px`, transform: "translateY(50%)", height: 10, borderRadius: 99, background: "rgba(220,242,255,0.95)", boxShadow: "0 0 8px rgba(142,224,255,0.5), 0 2px 10px rgba(0,0,0,0.65)" }} />
            </div>
          </div>
        </div>
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