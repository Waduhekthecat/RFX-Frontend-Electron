import React from "react";
// import { createMockTransport } from "./MockTransport";
import { createElectronTransport } from "./ElectronTransport";
import { wrapTransportWithContract } from "./ContractEnforcer";

const TransportCtx = React.createContext(null);

export function TransportProvider({ children, transport: providedTransport = null }) {
  const transport = React.useMemo(() => {
    const electron = !providedTransport ? createElectronTransport() : null;
    const raw = providedTransport || electron;

    return wrapTransportWithContract(raw, {
      name:
        raw?.constructor?.name ||
        (providedTransport ? "ProvidedTransport" : electron ? "ElectronTransport" : "MockTransport"),
      warn: true,
    });
  }, [providedTransport]);

  return <TransportCtx.Provider value={transport}>{children}</TransportCtx.Provider>;
}

export function useTransport() {
  const t = React.useContext(TransportCtx);
  if (!t) throw new Error("useTransport must be used within TransportProvider");
  return t;
}