import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { modeManager } from "./ModeManager.js";
import { RFX_MODES } from "./Modes.js";

const ROUTE_BY_MODE = Object.freeze({
  [RFX_MODES.PERFORM]: "/",
  [RFX_MODES.EDIT]: "/edit",
  [RFX_MODES.LOOPER]: "/looper",
  [RFX_MODES.AUTOMATION]: "/automation",
  [RFX_MODES.TUNER]: "/tuner",
});

function modeForPath(pathname) {
  if (pathname === "/") return RFX_MODES.PERFORM;
  if (pathname.startsWith("/edit")) return RFX_MODES.EDIT;
  if (pathname.startsWith("/looper")) return RFX_MODES.LOOPER;
  if (pathname.startsWith("/automation")) return RFX_MODES.AUTOMATION;
  if (pathname.startsWith("/tuner")) return RFX_MODES.TUNER;
  return null;
}

export function ModeNavigationBridge() {
  const navigate = useNavigate();
  const location = useLocation();
  const initializedFromRoute = React.useRef(false);

  React.useEffect(() => {
    const unsubscribe = modeManager.subscribe((event) => {
      const nextRoute = ROUTE_BY_MODE[event?.currentMode];
      if (nextRoute) navigate(nextRoute, { replace: event?.source === "view-model" });
    });

    return () => unsubscribe?.();
  }, [navigate]);

  React.useEffect(() => {
    const mode = modeForPath(location.pathname);
    if (!mode) return;

    if (!initializedFromRoute.current) {
      initializedFromRoute.current = true;

      if (modeManager.hasConfirmedMode()) {
        const confirmedRoute = ROUTE_BY_MODE[modeManager.getMode()];
        if (confirmedRoute && confirmedRoute !== location.pathname) {
          navigate(confirmedRoute, { replace: true });
          return;
        }
      }
    }

    modeManager.setMode(mode, { source: "route" });
  }, [location.pathname, navigate]);

  return null;
}
