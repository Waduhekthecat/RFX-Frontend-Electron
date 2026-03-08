import React from "react";
import { useTransport } from "../../../core/transport/TransportProvider";
import { normalizeInstalledFx } from "./InstalledFxUtils";

const EMPTY = Object.freeze({ count: 0, plugins: [] });

export function useInstalledFxFromTransport() {
  const transport = useTransport();

  const [data, setData] = React.useState(() => {
    if (!transport?.getInstalledFx) return EMPTY;
    return normalizeInstalledFx(transport.getInstalledFx());
  });

  React.useEffect(() => {
    if (!transport) return;

    if (typeof transport.subscribeInstalledFx === "function") {
      return transport.subscribeInstalledFx((next) => {
        setData(normalizeInstalledFx(next));
      });
    }

    if (typeof transport.getInstalledFx === "function") {
      setData(normalizeInstalledFx(transport.getInstalledFx()));
    }
  }, [transport]);

  return data;
}