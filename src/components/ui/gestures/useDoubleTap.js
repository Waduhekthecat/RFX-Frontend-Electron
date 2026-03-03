import * as React from "react";
import { gestureParams } from "./params";

/**
 * useDoubleTap
 * - Detect double-tap on pointer events
 * - Includes tap-vs-drag guard so dragging never triggers double-tap
 *
 * Usage:
 *   const dbl = useDoubleTap(() => reset(), { thresholdMs: 300 });
 *   <div {...dbl.bind} style={dbl.style}>...</div>
 */
export function useDoubleTap(onDoubleTap, override) {
    const p = React.useMemo(() => {
        const base = gestureParams?.doubleTap || {};
        return { ...base, ...(override || {}) };
    }, [override]);

    const drag = React.useMemo(() => {
        const base = gestureParams?.drag || {};
        return { ...base, ...(override?.drag || {}) };
    }, [override]);

    const thresholdPx = drag.thresholdPx ?? 6;
    const threshold2 = thresholdPx * thresholdPx;

    const stRef = React.useRef({
        pointerId: null,
        down: null,
        moved: false,
        lastUp: { t: 0, x: 0, y: 0 },
    });

    const onPointerDown = React.useCallback(
        (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;

            const st = stRef.current;
            st.pointerId = e.pointerId;
            st.down = { x: e.clientX, y: e.clientY };
            st.moved = false;

            if ((drag.capturePointer ?? true) && e.currentTarget?.setPointerCapture) {
                try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                } catch { }
            }
        },
        [drag.capturePointer]
    );

    const onPointerMove = React.useCallback(
        (e) => {
            const st = stRef.current;
            if (st.pointerId == null || e.pointerId !== st.pointerId) return;
            if (!st.down) return;

            const dx = e.clientX - st.down.x;
            const dy = e.clientY - st.down.y;
            if (dx * dx + dy * dy >= threshold2) st.moved = true;

            // Optional: if you want to stop browser scroll while interacting
            if (st.moved && (drag.preventDefaultOnDrag ?? true)) {
                e.preventDefault?.();
            }
        },
        [drag.preventDefaultOnDrag, threshold2]
    );

    const resetPointer = React.useCallback(() => {
        const st = stRef.current;
        st.pointerId = null;
        st.down = null;
        st.moved = false;
    }, []);

    const onPointerCancel = React.useCallback(() => {
        resetPointer();
    }, [resetPointer]);

    const onPointerUp = React.useCallback(
        (e) => {
            const st = stRef.current;
            if (st.pointerId == null || e.pointerId !== st.pointerId) return;

            // Guard: if user dragged, this interaction is NOT eligible for tap/double-tap
            if (st.moved) {
                resetPointer();
                return;
            }

            const now = Date.now();
            const x = e.clientX;
            const y = e.clientY;

            const last = st.lastUp;
            const dt = now - last.t;

            const maxDeltaPx = p.maxDeltaPx ?? 12;
            const dx = x - last.x;
            const dy = y - last.y;
            const dist2 = dx * dx + dy * dy;

            if (
                dt > 0 &&
                dt <= (p.thresholdMs ?? 280) &&
                dist2 <= maxDeltaPx * maxDeltaPx
            ) {
                e.preventDefault?.();
                e.stopPropagation?.();
                onDoubleTap?.(e);
                st.lastUp = { t: 0, x: 0, y: 0 };
            } else {
                st.lastUp = { t: now, x, y };
            }

            resetPointer();
        },
        [onDoubleTap, p.maxDeltaPx, p.thresholdMs, resetPointer]
    );

    // Recommended style for gesture surfaces (prevents scroll/selection issues)
    const style = React.useMemo(
        () => ({ touchAction: "none", userSelect: "none" }),
        []
    );

    const bind = React.useMemo(
        () => ({
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel,
        }),
        [onPointerCancel, onPointerDown, onPointerMove, onPointerUp]
    );

    return { bind, style };
}