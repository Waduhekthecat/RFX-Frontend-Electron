import React from "react";
import { useTransport } from "./transport/TransportProvider";

export function useTransportVM() {
  const t = useTransport();
  const [vm, setVm] = React.useState(() => t.getSnapshot?.() ?? null);
  React.useEffect(() => t.subscribe(setVm), [t]);
  return vm;
}