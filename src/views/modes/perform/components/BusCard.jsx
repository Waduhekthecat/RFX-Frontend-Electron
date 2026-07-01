import React from "react";
import { useNavigate } from "react-router-dom";
import { Panel } from "../../../../components/ui/Panel";
import { MeterCard } from "../../../../components/ui/cards/MeterCard";
import { TrackCard } from "../../../../components/ui/cards/TrackCard";
import { canonicalTrackGuid, normalizeMode } from "../../../../core/DomainHelpers";
import { modeManager } from "../../../../core/modes/ModeManager";
import { RFX_MODES } from "../../../../core/modes/Modes";
import { useRfxStore } from "../../../../core/rfx/Store";
import { styles } from "../_styles";

const LANE_IDS = ["A", "B", "C"];
const EMPTY_ARR = Object.freeze([]);
const PLUGIN_MAX = 5;

function RoutingModeBadge({ mode }) {
  const m = normalizeMode(mode);
  const label =
    m === "linear" ? "LINEAR" : m === "parallel" ? "PARALLEL" : "LCR";
  const tone =
    m === "lcr"
      ? styles.BusCardModeBadgeLcr
      : m === "parallel"
        ? styles.BusCardModeBadgeParallel
        : styles.BusCardModeBadgeLinear;

  return (
    <span
      className={[styles.BusCardModeBadgeBase, tone].join(" ")}
      title={`Routing mode: ${label}`}
    >
      {label}
    </span>
  );
}

function readMeterValue(meters, keys, fallback = 0) {
  for (const key of keys) {
    const value = Number(meters?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function readBusMeterValue(meters) {
  const l = readMeterValue(meters, ["l", "left"], 0);
  const r = readMeterValue(meters, ["r", "right"], 0);
  return Math.max(l, r);
}

function lanesForMode(mode) {
  const m = normalizeMode(mode);
  return {
    A: true,
    B: m === "parallel" || m === "lcr",
    C: m === "lcr",
  };
}

function cleanPluginName(name) {
  return String(name || "Plugin")
    .replace(/^\s*(VST3?|AU|JS|CLAP|LV2|AAX)\s*:\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim() || "Plugin";
}

function fxCardsForTrack({
  trackGuid,
  baseOrderByTrackGuid,
  overlayOrderByTrackGuid,
  fxByGuid,
  fxOverlay,
}) {
  const order =
    overlayOrderByTrackGuid?.[trackGuid] ??
    baseOrderByTrackGuid?.[trackGuid] ??
    EMPTY_ARR;
  const cards = [];

  for (const fxGuid of order) {
    if (cards.length >= PLUGIN_MAX) break;

    const base = fxByGuid?.[fxGuid];
    if (!base) continue;

    const patch = fxOverlay?.[fxGuid];
    const fx = patch ? { ...base, ...patch } : base;
    if (fx?.removed) continue;

    cards.push({
      id: fxGuid,
      label: cleanPluginName(fx.name),
      empty: false,
    });
  }

  if (cards.length < PLUGIN_MAX) {
    cards.push({
      id: `${trackGuid}:add`,
      label: "Add",
      empty: true,
    });
  }

  return cards;
}

export function BusCard({
  bus,
  isActive,
  showActiveRing = true,
  meters = { l: 0, r: 0 },
  routingMode = "linear",
  onDragMapBusVolume,
}) {
  const navigate = useNavigate();
  const busId = bus?.id || "FX_?";
  const label = bus?.label ?? busId;
  const outputMeterValue = readBusMeterValue(meters);
  const inputMeterValue = readMeterValue(
    meters,
    ["input", "in", "pre", "source"],
    outputMeterValue
  );
  const activeLanes = lanesForMode(routingMode);
  const baseFxOrderByTrackGuid = useRfxStore(
    (s) => s.entities.fxOrderByTrackGuid || {}
  );
  const overlayFxOrderByTrackGuid = useRfxStore(
    (s) => s.ops.overlay.fxOrderByTrackGuid || {}
  );
  const fxByGuid = useRfxStore((s) => s.entities.fxByGuid || {});
  const fxOverlay = useRfxStore((s) => s.ops.overlay.fx || {});

  const goEdit = React.useCallback((lane) => {
    modeManager.setMode(RFX_MODES.EDIT, {
      dispatchIfUnchanged: true,
      source: "ui",
    });
    navigate("/edit", {
      state: {
        busId,
        lane,
      },
    });
  }, [busId, navigate]);

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
      interactive={false}
      active={isActive && showActiveRing}
      style={{
        backgroundImage:
          "linear-gradient(180deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.012) 100%)",
        backgroundColor: "rgba(8,9,11,0.72)",
      }}
      className={styles.BusCardButton}
    >
      <div className={styles.BusCardHeader}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={styles.BusCardTitle}>{label}</div>
          <RoutingModeBadge mode={routingMode} />
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

      <div className={styles.BusCardInnerRow}>
        <div className={styles.BusCardSideMeter}>
          <MeterCard label="INPUT" value={inputMeterValue} enabled={isActive} />
        </div>

        <div className={styles.BusCardLeft}>
          <div className={styles.BusCardRoutingSlot}>
            <div className={styles.BusCardTrackGrid}>
              {LANE_IDS.map((lane) => {
                const laneEnabled = isActive && activeLanes[lane];
                const trackGuid = canonicalTrackGuid(`${busId}${lane}`);
                const fxCards = fxCardsForTrack({
                  trackGuid,
                  baseOrderByTrackGuid: baseFxOrderByTrackGuid,
                  overlayOrderByTrackGuid: overlayFxOrderByTrackGuid,
                  fxByGuid,
                  fxOverlay,
                });

                return (
                  <TrackCard
                    key={lane}
                    trackName={trackGuid}
                    value={laneEnabled ? outputMeterValue : 0}
                    enabled={laneEnabled}
                    fxCards={fxCards}
                    onAddFx={() => goEdit(lane)}
                    className="w-full"
                  />
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.BusCardSideMeter}>
          <MeterCard label="OUTPUT" value={outputMeterValue} enabled={isActive} />
        </div>
      </div>
    </Panel>
  );
}
