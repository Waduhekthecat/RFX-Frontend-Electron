import React from "react";
import { useTransport } from "../transport/TransportProvider";
import { modeManager } from "../modes/ModeManager.js";
import { useRfxStore } from "./Store";

function ingestViewModel(viewModel) {
  useRfxStore.getState().ingestSnapshot(viewModel);

  if (viewModel?.mode != null || viewModel?.session?.mode != null) {
    modeManager.resolveViewModelMode(
      viewModel?.session?.mode ?? viewModel.mode,
      { seq: viewModel?.seq }
    );
  }
}

export function RfxBridge() {
  const transport = useTransport();

  React.useEffect(() => {
    let cancelled = false;

    // 1) Wire transport into RFX store
    useRfxStore.getState().setTransport(transport);

    // 2) Seed initial snapshot (if available)
    void Promise.resolve(transport.getSnapshot?.())
      .then((snap) => {
        if (cancelled || !snap) return;

        ingestViewModel(snap);

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
      })
      .catch((err) => {
        if (!cancelled) {
          console.warn("[RfxBridge] initial snapshot failed:", err);
        }
      });

    // 3) Subscribe to truth snapshots (seq-bearing changes)
    const unsubscribe = transport.subscribe?.((vm) => {
      ingestViewModel(vm);
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
      cancelled = true;
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
