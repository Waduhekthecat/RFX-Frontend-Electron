import React from "react";
import { Inset } from "../../../components/ui/Panel";
import { styles } from "../_styles";

function lanesForMode(mode) {
  const m = String(mode || "linear").toLowerCase();
  if (m === "lcr") return { A: true, B: true, C: true };
  if (m === "parallel") return { A: true, B: true, C: false };
  return { A: true, B: false, C: false };
}

function ModeBadge({ mode }) {
  const m = String(mode || "linear").toUpperCase();
  return <div className={styles.ModeBadge}>{m}</div>;
}

function LanePill({ name, on, active, onDragMapBusVolume }) {
  return (
    <div
      className={[
        styles.LanePillBase,
        on ? styles.LanePillOn : styles.LanePillOff,
        active ? styles.LanePillActiveRing : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="text-[12px] font-semibold tracking-wide">{name}</div>

      <div className="ml-auto flex items-center gap-2">
        {on ? (
          <button
            type="button"
            draggable
            onClick={(e) => e.stopPropagation()}
            onDragStart={(e) => {
              e.stopPropagation();

              if (e.dataTransfer) {
                e.dataTransfer.setData("text/plain", `busvol:${name}`);
                e.dataTransfer.effectAllowed = "copy";
              }

              onDragMapBusVolume?.(name);
            }}
            title={`Drag to vertical knob slider to map ${name} volume`}
            className={styles.LaneMapButton}
          >
            <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>
              🎚️
            </span>
          </button>
        ) : (
          <div aria-hidden="true" style={{ width: 28 }} />
        )}

        <div
          className={[
            styles.LaneStatePillBase,
            on ? styles.LaneStateOn : styles.LaneStateOff,
          ].join(" ")}
        >
          {on ? "ON" : "OFF"}
        </div>
      </div>
    </div>
  );
}

export function RoutingWell({
  busId = "FX_1",
  mode = "linear",
  active = false,
  onDragMapBusVolume,
}) {
  const on = lanesForMode(mode);

  return (
    <Inset className={styles.RoutingWellRoot}>
      <div className={styles.RoutingWellHeader}>
        <div className={styles.RoutingWellTitle}>ROUTING</div>
        <ModeBadge mode={mode} />
      </div>

      <div className="flex flex-col gap-2 min-h-0">
        <LanePill
          name={`${busId}A`}
          on={on.A}
          active={active && on.A}
          onDragMapBusVolume={onDragMapBusVolume}
        />
        <LanePill
          name={`${busId}B`}
          on={on.B}
          active={active && on.B}
          onDragMapBusVolume={onDragMapBusVolume}
        />
        <LanePill
          name={`${busId}C`}
          on={on.C}
          active={active && on.C}
          onDragMapBusVolume={onDragMapBusVolume}
        />
      </div>

      <div className={styles.RoutingWellFooter}>
        Linear: A • Parallel: A+B • LCR: A+B+C
      </div>
    </Inset>
  );
}