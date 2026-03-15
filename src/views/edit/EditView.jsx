// src/views/edit/EditView.jsx
import React from "react";
import { useNavigate, Outlet, useLocation } from "react-router-dom";
import { useTransport } from "../../core/transport/TransportProvider";
import { useRfxStore } from "../../core/rfx/Store";
import { uid } from "../../core/rfx/Util";
import { useIntent } from "../../core/useIntent";
import { Panel, Inset } from "../../components/ui/Panel";
import { Badge } from "../../components/ui/Badge";
import { InstalledFxShell } from "./components/InstalledFxShell";
import { BusMixControls, TrackMixControls } from "./components/mixControls/_index";

// ---------------------------
// VM hook (transport snapshot)
// ---------------------------
function useVM() {
  const t = useTransport();
  const [vm, setVm] = React.useState(() => t.getSnapshot());
  React.useEffect(() => t.subscribe(setVm), [t]);
  return vm;
}

// ---------------------------
// Canonical IDs
// ---------------------------
function canonicalTrackGuid(id) {
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

// ---------------------------
// Routing helpers
// ---------------------------
function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function lanesForMode(mode) {
  const m = normalizeMode(mode);
  if (m === "lcr") return { A: true, B: true, C: true };
  if (m === "parallel") return { A: true, B: true, C: false };
  return { A: true, B: false, C: false };
}

function availableLanes(mode) {
  const on = lanesForMode(mode);
  const out = [];
  if (on.A) out.push("A");
  if (on.B) out.push("B");
  if (on.C) out.push("C");
  return out;
}

function nextValidLane(mode, preferred) {
  const lanes = availableLanes(mode);
  if (preferred && lanes.includes(preferred)) return preferred;
  return lanes[0] || "A";
}

// ---------------------------
// UI bits
// ---------------------------
function SegButton({ active, disabled, children, onClick }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        "px-3 py-2 rounded-xl border text-[12px] font-semibold tracking-wide",
        "transition",
        disabled ? "opacity-35 cursor-not-allowed" : "hover:bg-white/10",
        active
          ? "bg-white/12 border-white/20 text-white"
          : "bg-white/5 border-white/10 text-white/70",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function ModeSelector({ mode, onChange }) {
  const m = normalizeMode(mode);
  return (
    <div className="flex items-center gap-2">
      <SegButton active={m === "linear"} onClick={() => onChange("linear")}>
        LINEAR
      </SegButton>
      <SegButton active={m === "parallel"} onClick={() => onChange("parallel")}>
        PAR
      </SegButton>
      <SegButton active={m === "lcr"} onClick={() => onChange("lcr")}>
        LCR
      </SegButton>
    </div>
  );
}

function TrackSelector({ busId, mode, lane, onChange }) {
  const lanes = availableLanes(mode);

  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-white/50 tracking-wide mr-1">TRACK</div>

      {lanes.map((L) => (
        <SegButton key={L} active={lane === L} onClick={() => onChange(L)}>
          {busId}
          {L}
        </SegButton>
      ))}
    </div>
  );
}

// ---------------------------
// Left plugin chain (max 5, reorder, toggle, remove, params)
// ---------------------------
const PLUGIN_MAX = 5;

function Grip() {
  return (
    <div
      className={[
        "w-10 h-full rounded-xl border border-white/10 bg-white/5",
        "flex items-center justify-center",
      ].join(" ")}
      title="Drag to reorder"
    >
      <div className="flex flex-col gap-1 opacity-70">
        <div className="w-4 h-0.5 bg-white/35 rounded" />
        <div className="w-4 h-0.5 bg-white/35 rounded" />
        <div className="w-4 h-0.5 bg-white/35 rounded" />
      </div>
    </div>
  );
}

function SmallIconButton({ title, onClick, disabled, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={[
        "h-8 px-2 rounded-lg border text-[12px] font-semibold",
        "transition",
        disabled ? "opacity-35 cursor-not-allowed" : "hover:bg-white/10",
        "bg-white/5 border-white/10 text-white/80",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function PluginCard({
  fx,
  index,
  canDrag,
  onDragStart,
  onDragOver,
  onDrop,
  onToggle,
  onRemove,
  onParams,
}) {
  const subtitle = [fx.vendor, fx.format].filter(Boolean).join(" • ") || "Unknown";

  return (
    <div
      draggable={canDrag}
      onDragStart={(e) => onDragStart?.(e, fx.id)}
      onDragOver={(e) => onDragOver?.(e)}
      onDrop={(e) => onDrop?.(e, fx.id)}
      className={[
        "flex items-stretch gap-3",
        "px-3 py-3 rounded-2xl border border-white/10 bg-white/5",
        "min-h-[84px]",
      ].join(" ")}
    >
      <div className="w-6 text-[11px] text-white/45 tabular-nums pt-1">{index}</div>

      <div className="flex-1 min-w-0 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold leading-tight truncate">{fx.name}</div>
            <div className="text-[11px] text-white/45 leading-tight truncate">{subtitle}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onToggle?.(fx.id)}
              className="rounded-full"
              title="Toggle enable"
            >
              <Badge tone={fx.enabled ? "active" : "neutral"} className="text-[10px]">
                {fx.enabled ? "ON" : "OFF"}
              </Badge>
            </button>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <SmallIconButton title="Edit parameters" onClick={() => onParams?.(fx.id)}>
              PARAMS
            </SmallIconButton>
            <SmallIconButton title="Remove plugin" onClick={() => onRemove?.(fx.id)}>
              REMOVE
            </SmallIconButton>
          </div>
          <div className="text-[10px] text-white/35">FX SLOT</div>
        </div>
      </div>

      <div className="shrink-0">
        <Grip />
      </div>
    </div>
  );
}

const EMPTY_ORDER = Object.freeze([]);

function TrackDetailCard({ trackGuid, intent }) {
  const nav = useNavigate();
  const tg = React.useMemo(() => canonicalTrackGuid(trackGuid), [trackGuid]);

  const order = useRfxStore(
    React.useCallback(
      (s) =>
        s.ops.overlay.fxOrderByTrackGuid?.[tg] ??
        s.entities.fxOrderByTrackGuid?.[tg] ??
        EMPTY_ORDER,
      [tg]
    )
  );

  const fxByGuid = useRfxStore((s) => s.entities.fxByGuid);
  const fxOverlay = useRfxStore((s) => s.ops.overlay.fx || {});
  const entities = useRfxStore((s) => s.entities);

  const chain = React.useMemo(() => {
    const out = [];
    for (const fxGuid of order || EMPTY_ORDER) {
      const base = fxByGuid?.[fxGuid];
      if (!base) continue;
      const patch = fxOverlay?.[fxGuid];
      const fx = patch ? { ...base, ...patch } : base;
      if (fx?.removed) continue;

      out.push({
        id: fxGuid,
        name: String(fx.name || "Plugin"),
        vendor: String(fx.vendor || "").trim() || "Unknown",
        format: String(fx.format || "").trim() || "",
        enabled: fx.enabled !== false,
      });
    }
    return out;
  }, [order, fxByGuid, fxOverlay]);

  const dragSrcIdRef = React.useRef(null);

  function addFromInstalled(picked) {
    if (!picked) return;
    if (chain.length >= PLUGIN_MAX) return;

    const fxRaw = String(picked?.raw || "").trim();
    if (!fxRaw) {
      console.warn("Picked plugin is missing raw identifier:", picked);
      return;
    }

    intent?.({
      name: "addFx",
      trackGuid: tg,
      fxRaw,
    });
  }

  function toggleFx(fxId) {
    const fx = chain.find((x) => x.id === fxId);
    const nextEnabled = fx ? !fx.enabled : true;
    intent?.({ name: "toggleFx", fxGuid: fxId, trackGuid: tg, value: nextEnabled });
  }

  function removeFx(fxId) {
    intent?.({ name: "removeFx", fxGuid: fxId, trackGuid: tg });
  }

  function reorderFx(srcId, dstId) {
    if (!srcId || !dstId || srcId === dstId) return;

    const srcIdx = chain.findIndex((x) => x.id === srcId);
    const dstIdx = chain.findIndex((x) => x.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;

    intent?.({ name: "reorderFx", trackGuid: tg, fromIndex: srcIdx, toIndex: dstIdx });
  }

  function goParams(fxId) {
    const paramsLoaded = !!entities?.fxParamsByGuid?.[fxId];

    if (!paramsLoaded) {
      intent?.({
        name: "getPluginParams",
        fxGuid: fxId,
      });
    }

    nav(`/edit/plugin/${encodeURIComponent(tg)}/${encodeURIComponent(fxId)}`);
  }

  function onDragStart(e, fxId) {
    dragSrcIdRef.current = fxId;
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", fxId);
    } catch { }
  }

  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }

  function onDrop(e, dstId) {
    e.preventDefault();

    const srcId =
      dragSrcIdRef.current ||
      (() => {
        try {
          return e.dataTransfer.getData("text/plain");
        } catch {
          return null;
        }
      })();

    dragSrcIdRef.current = null;
    reorderFx(srcId, dstId);
  }

  const isFull = chain.length >= PLUGIN_MAX;

  return (
    <Panel className="h-full min-h-0 flex flex-col">
      <div className="p-4 flex-1 min-h-0">
        <div className="grid grid-cols-12 gap-3 h-full min-h-0">
          <Inset className="col-span-7 h-full min-h-0 p-3 flex flex-col gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-[14px] font-semibold tracking-wide text-white">{tg}</div>
              </div>

              <div className="flex items-center flex-1 min-w-0">
                <TrackMixControls trackGuid={tg} />
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="text-[11px] font-semibold tracking-wide text-white/70">
                  PLUGINS
                </div>
                <div className="text-[10px] text-white/35">
                  {chain.length}/{PLUGIN_MAX}
                </div>
                {isFull ? (
                  <Badge tone="neutral" className="text-[10px]">
                    MAX
                  </Badge>
                ) : null}
              </div>

              <div className="text-[10px] text-white/35">
                Drag to reorder • Click ON/OFF to toggle
              </div>
            </div>

            <div className="flex flex-col gap-3 overflow-auto min-h-0 pr-1">
              {chain.length === 0 ? (
                <div className="h-full flex items-center justify-center text-white/35 text-[12px] border border-dashed border-white/10 rounded-2xl">
                  Pick a plugin on the right to add (max {PLUGIN_MAX})
                </div>
              ) : (
                chain.map((fx, i) => (
                  <PluginCard
                    key={fx.id}
                    fx={fx}
                    index={i + 1}
                    canDrag={chain.length > 1}
                    onDragStart={onDragStart}
                    onDragOver={onDragOver}
                    onDrop={onDrop}
                    onToggle={toggleFx}
                    onRemove={removeFx}
                    onParams={goParams}
                  />
                ))
              )}
            </div>
          </Inset>

          <div className="col-span-5 h-full min-h-0">
            <InstalledFxShell
              className="h-full"
              onPick={(p) => {
                if (isFull) {
                  console.warn(`Plugin chain is full (max ${PLUGIN_MAX}).`);
                  return;
                }
                addFromInstalled(p);
              }}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export function EditView() {
  const location = useLocation();
  const inPluginSubView = location.pathname.startsWith("/edit/plugin/");
  if (inPluginSubView) return <Outlet />;

  const vm = useVM();
  const intent = useIntent();

  const activeBusId = vm?.activeBusId || vm?.buses?.[0]?.id || "FX_1";
  const bus =
    vm?.buses?.find?.((b) => b.id === activeBusId) || {
      id: activeBusId,
      label: activeBusId,
    };

  const mode = normalizeMode((vm?.busModes && vm.busModes[bus.id]) || "linear");

  const [laneByBus, setLaneByBus] = React.useState({});
  const lane = nextValidLane(mode, laneByBus[bus.id]);

  React.useEffect(() => {
    setLaneByBus((prev) => {
      const next = { ...prev };
      next[bus.id] = nextValidLane(mode, next[bus.id]);
      return next;
    });
  }, [bus.id, mode]);

  function setLane(L) {
    setLaneByBus((prev) => ({ ...prev, [bus.id]: L }));
  }

  function setMode(nextMode) {
    const m = normalizeMode(nextMode);
    intent({ name: "setRoutingMode", busId: bus.id, mode: m });
  }

  const uiTrackGuid = `${bus.id}_${lane}`;

  return (
    <div className="h-full w-full p-3 min-h-0">
      <div className="h-full min-h-0 flex flex-col gap-3">
        <Panel className="min-h-0">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="text-[18px] font-semibold tracking-wide truncate">
                  EDIT • {bus.label}
                </div>
                <Badge tone="active">Active Bus</Badge>
              </div>

              <div className="h-6 w-px bg-white/10" />

              <TrackSelector busId={bus.id} mode={mode} lane={lane} onChange={setLane} />
            </div>

            <div className="flex items-center gap-2">
              <BusMixControls busId={bus.id} />
              <div className="h-6 w-px bg-white/10 mx-1" />
              <div className="flex items-center gap-2">
                <div className="text-[11px] text-white/50 tracking-wide">MODE</div>
                <ModeSelector mode={mode} onChange={setMode} />
              </div>
            </div>
          </div>
        </Panel>

        <div className="flex-1 min-h-0">
          <TrackDetailCard trackGuid={uiTrackGuid} intent={intent} />
        </div>
      </div>
    </div>
  );
}