import React from "react";
import { Panel } from "../../../components/ui/Panel";
import { VerticalMeter } from "../../../components/ui/meters/VerticalMeter";
import { RoutingWell } from "./RoutingWell";
import { styles } from "../_styles";

export function BusCard({
  bus,
  isActive,
  meters = { l: 0, r: 0 },
  onSelect,
  routingMode = "linear",
  onDragMapBusVolume,
}) {
  const busId = bus?.id || "FX_?";
  const label = bus?.label ?? busId;

  function onDragStartMap(e) {
    e.stopPropagation();

    if (e.dataTransfer) {
      e.dataTransfer.setData("text/plain", `busvol:${busId}`);
      e.dataTransfer.effectAllowed = "copy";
    }

    onDragMapBusVolume?.(busId);
  }

  return (
    <Panel
      as="div"
      role="button"
      tabIndex={0}
      interactive
      active={isActive}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect?.(e);
        }
      }}
      className={styles.BusCardButton}
    >
      <div className={styles.BusCardInnerRow}>
        <div className={styles.BusCardLeft}>
          <div className={styles.BusCardHeader}>
            <div className="flex items-center gap-2 min-w-0">
              <div className={styles.BusCardTitle}>{label}</div>

              {isActive ? (
                <div className={styles.BusCardActivePill}>Active</div>
              ) : null}
            </div>

            <button
              type="button"
              draggable
              onDragStart={onDragStartMap}
              onClick={(e) => e.stopPropagation()}
              title="Drag to vertical knob slider to map BUS volume"
              className={styles.BusCardMapButton}
            >
              <span aria-hidden="true" style={{ fontSize: 13, lineHeight: 1 }}>
                🎚️
              </span>
            </button>
          </div>

          <div className={styles.BusCardRoutingSlot}>
            <RoutingWell
              busId={busId}
              mode={routingMode}
              active={isActive}
              onDragMapBusVolume={onDragMapBusVolume}
            />
          </div>
        </div>

        <div className={styles.BusCardMeters}>
          <VerticalMeter value={meters.l} enabled={isActive} width={12} rounded={8} />
          <VerticalMeter value={meters.r} enabled={isActive} width={12} rounded={8} />
        </div>
      </div>
    </Panel>
  );
}