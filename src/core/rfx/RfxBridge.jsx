import React from "react";
import { useTransport } from "../transport/TransportProvider";
import { useRfxStore } from "./Store";

export function RfxBridge() {
  const transport = useTransport();

  React.useEffect(() => {
    // 1) Wire transport into RFX store
    useRfxStore.getState().setTransport(transport);

    // 2) Seed initial snapshot (if available)
    try {
      const snap = transport.getSnapshot?.();
      if (snap) {
        useRfxStore.getState().ingestSnapshot(snap);

        // Seed meters slice too if meters exist in snapshot
        const meters =
          snap?.meters ||
          snap?.perf?.metersById ||
          snap?.perf?.metersByBusId ||
          null;

        if (meters && typeof meters === "object") {
          useRfxStore.getState().ingestMeters({
            t: Date.now(),
            metersById: meters, // store expects metersById naming
            activeBusId: snap?.activeBusId || snap?.perf?.activeBusId || null,
          });
        }
      }
    } catch (err) {
      console.warn("[RfxBridge] initial snapshot failed:", err);
    }

    // 3) Subscribe to truth snapshots (seq-bearing changes)
    const unsubscribe = transport.subscribe?.((vm) => {
      useRfxStore.getState().ingestSnapshot(vm);
    });

    // 4) Subscribe to meters telemetry stream (fast path)
    const unsubscribeMeters =
      typeof transport.subscribeMeters === "function"
        ? transport.subscribeMeters((frame) => {
            useRfxStore.getState().ingestMeters(frame);
          })
        : null;

    const unsubscribeCmdResult =
      typeof transport.subscribeCmdResult === "function"
        ? transport.subscribeCmdResult((result) => {
            useRfxStore.getState().ingestCmdResult(result);
          })
        : null;

    return () => {
      try {
        unsubscribe?.();
      } catch {
        // Best-effort cleanup.
      }
      try {
        unsubscribeMeters?.();
      } catch {
        // Best-effort cleanup.
      }
      try {
        unsubscribeCmdResult?.();
      } catch {
        // Best-effort cleanup.
      }
    };
  }, [transport]);

  return null;
}
