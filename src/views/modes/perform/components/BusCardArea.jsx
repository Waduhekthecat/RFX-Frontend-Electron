import { BusCard } from "./BusCard";
import { useRfxStore } from "../../../../core/rfx/Store";
import { styles } from "../_styles";

const DEFAULT_BUSES = [
  { id: "FX_1", label: "FX_1" },
  { id: "FX_2", label: "FX_2" },
  { id: "FX_3", label: "FX_3" },
  { id: "FX_4", label: "FX_4" },
];

function BusSelectButton({ bus, active, onSelect }) {
  const busId = bus?.id || "FX_?";
  const label = bus?.label ?? busId;

  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onSelect?.(busId)}
      className={[
        styles.BusMenuButtonBase,
        active ? styles.BusMenuButtonActive : styles.BusMenuButtonIdle,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </button>
  );
}

export function BusCardArea({ vm, onSelectBus, getRoutingMode, onDragMapBusVolume }) {
  // ✅ Telemetry-fed meters (fast path). Canonical source is meters.byId.
  // Fallback to perf.metersById for compatibility.
  const metersById = useRfxStore((s) => s.meters?.byId || s.perf?.metersById || {});
  const buses = (vm?.buses?.length ? vm.buses : DEFAULT_BUSES).slice(0, 4);
  const activeBus =
    buses.find((b) => b.id === vm?.activeBusId) ||
    buses[0] ||
    { id: "FX_1", label: "FX_1" };
  const activeBusId = activeBus.id;
  const activeMeters = metersById?.[activeBusId] || { l: 0, r: 0 };
  const activeRoutingMode =
    (vm?.busModes && vm.busModes[activeBusId]) ||
    (getRoutingMode ? getRoutingMode(activeBusId) : "linear");

  return (
    <div className={styles.BusCardAreaRoot}>
      <div className={styles.BusCardAreaMain}>
        <BusCard
          bus={activeBus}
          isActive
          showActiveRing={false}
          meters={activeMeters}
          routingMode={activeRoutingMode}
          onDragMapBusVolume={onDragMapBusVolume}
        />
      </div>

      <div className={styles.BusMenuBar} aria-label="Select active bus">
        {buses.map((b) => (
          <BusSelectButton
            key={b.id}
            bus={b}
            active={activeBusId === b.id}
            onSelect={onSelectBus}
          />
        ))}

      </div>
    </div>
  );
}
