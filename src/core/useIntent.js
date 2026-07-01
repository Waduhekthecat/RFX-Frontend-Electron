import React from "react";
import { useRfxStore } from "./rfx/Store";
/**
 * UI command boundary.
 * Returns a stable function you can call like:
 *   intent({ name: "syncView" })
 *   intent({ name: "setRoutingMode", busId, mode })
 */
export function useIntent() {
  const dispatchIntent = useRfxStore((s) => s.dispatchIntent);
  // keeps stable identity across renders 
  return React.useCallback(
    (intent) => dispatchIntent(intent),
    [dispatchIntent]
  );
}
