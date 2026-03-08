import React from "react";
import { useIntent } from "./useIntent";

function normalizeLaneId(id) {
  const s = String(id || "");
  return s.replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

/**
 * Buffered intent sender for continuous controls.
 * - call send(key, intent) frequently during drag
 * - coalesces by key
 * - auto-flushes after intervalMs
 * - call flush() on pointer up to commit immediately
 */
export function useIntentBuffered({ intervalMs = 50 } = {}) {
  const intent = useIntent();

  const intentRef = React.useRef(intent);
  const pendingRef = React.useRef(new Map());
  const timerRef = React.useRef(null);

  React.useEffect(() => {
    intentRef.current = intent;
  }, [intent]);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const flush = React.useCallback(() => {
    clearTimer();

    const pending = pendingRef.current;
    if (!pending.size) return;

    const items = Array.from(pending.values());
    pending.clear();

    for (const it of items) {
      intentRef.current?.(it);
    }
  }, [clearTimer]);

  const scheduleFlush = React.useCallback(() => {
    if (timerRef.current) return;

    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      flush();
    }, intervalMs);
  }, [flush, intervalMs]);

  React.useEffect(() => {
    return () => {
      clearTimer();
      pendingRef.current.clear();
    };
  }, [clearTimer]);

  const send = React.useCallback(
    (key, it) => {
      let nextKey = key;
      let nextIntent = it;

      // allow send(intent)
      if (typeof nextIntent === "undefined") {
        nextIntent = nextKey;
        const tg = normalizeLaneId(nextIntent?.trackGuid);
        nextKey = `${nextIntent?.name || "intent"}:${tg || nextIntent?.fxGuid || nextIntent?.busId || ""}`;
        nextIntent = tg ? { ...nextIntent, trackGuid: tg } : nextIntent;
      }

      if (nextIntent?.trackGuid) {
        nextIntent = {
          ...nextIntent,
          trackGuid: normalizeLaneId(nextIntent.trackGuid),
        };
      }

      if (nextIntent?.trackId) {
        nextIntent = {
          ...nextIntent,
          trackId: normalizeLaneId(nextIntent.trackId),
        };
      }

      pendingRef.current.set(String(nextKey), nextIntent);
      scheduleFlush();
    },
    [scheduleFlush]
  );

  return { send, flush };
}