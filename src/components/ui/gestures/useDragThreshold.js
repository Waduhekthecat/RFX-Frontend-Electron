import * as React from "react";
import { withGestureDefaults } from "./params";

function pt(e) {
  return { x: e.clientX, y: e.clientY };
}
function dist2(a, b) {
  const dx = (a?.x || 0) - (b?.x || 0);
  const dy = (a?.y || 0) - (b?.y || 0);
  return dx * dx + dy * dy;
}

export function useDragThreshold(handlers = {}, override) {
  const p = React.useMemo(() => withGestureDefaults("drag", override), [override]);
  const stRef = React.useRef({ pointerId: null, down: null, dragging: false });
  const threshold2 = p.thresholdPx * p.thresholdPx;

  const onPointerDown = React.useCallback(
    (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;

      const st = stRef.current;
      st.pointerId = e.pointerId;
      st.down = pt(e);
      st.dragging = false;

      if (p.capturePointer && e.currentTarget?.setPointerCapture) {
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
      }

      handlers.onPointerDown?.(e);
    },
    [handlers, p.capturePointer]
  );

  const onPointerMove = React.useCallback(
    (e) => {
      const st = stRef.current;
      if (st.pointerId == null || e.pointerId !== st.pointerId) return;

      const cur = pt(e);
      const d2 = dist2(cur, st.down);

      if (!st.dragging && d2 >= threshold2) {
        st.dragging = true;
        handlers.onDragStart?.({
          start: st.down,
          x: cur.x,
          y: cur.y,
          dx: cur.x - st.down.x,
          dy: cur.y - st.down.y,
          event: e,
        });
      }

      if (st.dragging) {
        if (p.preventDefaultOnDrag) e.preventDefault?.();
        handlers.onDragMove?.({
          start: st.down,
          x: cur.x,
          y: cur.y,
          dx: cur.x - st.down.x,
          dy: cur.y - st.down.y,
          event: e,
        });
      }

      handlers.onPointerMove?.(e);
    },
    [handlers, p.preventDefaultOnDrag, threshold2]
  );

  const finish = React.useCallback(
    (e, kind) => {
      const st = stRef.current;
      if (st.pointerId == null || e.pointerId !== st.pointerId) return;

      const cur = pt(e);

      if (st.dragging) {
        handlers.onDragEnd?.({
          start: st.down,
          x: cur.x,
          y: cur.y,
          dx: cur.x - st.down.x,
          dy: cur.y - st.down.y,
          kind,
          event: e,
        });
      } else {
        handlers.onTap?.({ x: cur.x, y: cur.y, kind, event: e });
      }

      st.pointerId = null;
      st.down = null;
      st.dragging = false;

      handlers.onPointerUp?.(e);
    },
    [handlers]
  );

  const onPointerUp = React.useCallback((e) => finish(e, "up"), [finish]);
  const onPointerCancel = React.useCallback((e) => finish(e, "cancel"), [finish]);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    get isDragging() {
      return !!stRef.current.dragging;
    },
  };
}