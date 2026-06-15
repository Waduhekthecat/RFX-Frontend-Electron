import { BusCard } from "./BusCard";
import { useRfxStore } from "../../../../core/rfx/Store";
import { styles } from "../_styles";

export function BusCardArea({ vm, onSelectBus, getRoutingMode, onDragMapBusVolume }) {
  // ✅ Telemetry-fed meters (fast path). Canonical source is meters.byId.
  // Fallback to perf.metersById for compatibility.
  const metersById = useRfxStore((s) => s.meters?.byId || s.perf?.metersById || {});

  return (
    <div className={styles.BusCardAreaGrid}>
      {(vm?.buses || []).map((b) => {
        const isActive = vm?.activeBusId === b.id;

        // ✅ meters come from telemetry store, not from vm snapshot
        const m = metersById?.[b.id] || { l: 0, r: 0 };

        // ✅ routing mode priority:
        // 1) vm.busModes (new)
        // 2) getRoutingMode fallback (older helper)
        const routingMode =
          (vm?.busModes && vm.busModes[b.id]) ||
          (getRoutingMode ? getRoutingMode(b.id) : "linear");

        return (
          <BusCard
            key={b.id}
            bus={b}
            isActive={isActive}
            meters={m}
            routingMode={routingMode}
            onSelect={() => onSelectBus?.(b.id)}
            onDragMapBusVolume={onDragMapBusVolume}
          />
        );
      })}
    </div>
  );
}