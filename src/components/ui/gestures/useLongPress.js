import * as React from "react";
import { gestureParams } from "./params";

/**
 * useLongPress
 * Fires when held for ms without moving past moveThresholdPx.
 *
 * Usage:
 *   const lp = useLongPress(() => openMenu());
 *   <div {...lp.bind} style={lp.style} />
 */
export function useLongPress(onLongPress, override) {
    const p = React.useMemo(() => {
        const base = gestureParams?.longPress || {};
        return { ...base, ...(override || {}) };
    }, [override]);

    const timerRef = React.useRef(null);
    const stRef = React.useRef({ pointerId: null, down: null, fired: false });

    const moveThresholdPx = p.moveThresholdPx ?? 8;
    const threshold2 = moveThresholdPx * moveThresholdPx;

    const clear = React.useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const reset = React.useCallback(() => {
        const st = stRef.current;
        st.pointerId = null;
        st.down = null;
        st.fired = false;
        clear();
    }, [clear]);

    const onPointerDown = React.useCallback(
        (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;

            const st = stRef.current;
            st.pointerId = e.pointerId;
            st.down = { x: e.clientX, y: e.clientY };
            st.fired = false;

            if ((p.capturePointer ?? true) && e.currentTarget?.setPointerCapture) {
                try {
                    e.currentTarget.setPointerCapture(e.pointerId);
                } catch { }
            }

            clear();
            timerRef.current = setTimeout(() => {
                const cur = stRef.current;
                if (cur.pointerId == null) return;
                cur.fired = true;
                onLongPress?.(e);
            }, p.ms ?? 450);
        },
        [clear, onLongPress, p.capturePointer, p.ms]
    );

    const onPointerMove = React.useCallback(
        (e) => {
            const st = stRef.current;
            if (st.pointerId == null || e.pointerId !== st.pointerId || !st.down)
                return;

            const dx = e.clientX - st.down.x;
            const dy = e.clientY - st.down.y;
            if (dx * dx + dy * dy >= threshold2) reset();
        },
        [reset, threshold2]
    );

    const onPointerUp = React.useCallback(() => reset(), [reset]);
    const onPointerCancel = React.useCallback(() => reset(), [reset]);

    React.useEffect(() => clear, [clear]);

    const style = React.useMemo(
        () => ({ touchAction: "none", userSelect: "none" }),
        []
    );

    const bind = React.useMemo(
        () => ({ onPointerDown, onPointerMove, onPointerUp, onPointerCancel }),
        [onPointerCancel, onPointerDown, onPointerMove, onPointerUp]
    );

    return { bind, style };
}