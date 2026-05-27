export const styles = {
  Root: "h-full w-full p-3 min-h-0",
  Column: "h-full min-h-0 flex flex-col gap-3 relative",
  Top: "flex-1 min-h-0",
  KnobPanel: "min-h-0",

  BusCardAreaGrid: "grid grid-cols-2 grid-rows-2 gap-3 h-full min-h-0",
  BusCardButton: "h-full min-h-0 text-left",
  BusCardInnerRow: "h-full min-h-0 flex",
  BusCardLeft: "flex-1 p-3 min-w-0 min-h-0 flex flex-col gap-2",
   BusCardHeader: "grid grid-cols-[1fr_auto_auto] items-center gap-2",
  BusCardMapButton: "h-6 w-6 rounded-md border border-white/15 bg-white/10 hover:bg-white/20 active:bg-white/25 flex items-center justify-center cursor-grab active:cursor-grabbing",
  BusCardTitle: "text-lg font-semibold tracking-wide",
  BusCardActivePill: "text-[11px] px-2 py-0.5 rounded-full bg-white/15 border border-white/10",
  BusCardRoutingSlot: "flex-1 min-h-0",
  BusCardMeters: "px-3 py-2 flex items-stretch gap-2 min-h-0",
  
  // RoutingWell
  RoutingWellRoot: "h-full min-h-0 p-3 flex flex-col gap-2",
  RoutingWellHeader: "flex items-center justify-between",
  RoutingWellTitle: "text-[11px] font-semibold tracking-wide text-white/70",
  RoutingWellFooter: "pt-1 text-[10px] text-white/35",
  ModeBadge: "text-[10px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/70",
  LanePillBase: "flex items-center justify-between px-2 py-1 rounded-lg border min-w-0",
  LanePillOn: "bg-white/10 border-white/15",
  LanePillOff: "bg-black/20 border-white/5 opacity-45",
  LanePillActiveRing: "ring-1 ring-green-400/40",
  LaneStatePillBase: "text-[10px] px-2 py-0.5 rounded-full border",
  LaneStateOn: "bg-green-400/10 text-green-200 border-green-400/20",
  LaneStateOff: "bg-white/5 text-white/40 border-white/10",

  // PluginList (if you end up using it in Perform)
  PluginInset: "h-full min-h-0 p-2",
  PluginHeader: "flex items-center justify-between px-1 pb-2",
  PluginTitle: "text-[11px] font-semibold tracking-wide text-white/70",
  PluginCount: "text-[10px] text-white/35",
  PluginRows: "flex flex-col gap-1 min-h-0",
  PluginRowBase: "flex items-center gap-2 px-2 py-1.5 rounded-lg",
  PluginRowActive: "bg-white/10 border border-white/10",
  PluginRowIdle: "bg-white/0",
  PluginIndex: "w-5 text-[11px] opacity-60 tabular-nums",
  PluginName: "text-[12px] font-semibold leading-tight truncate",
  PluginVendor: "text-[11px] opacity-55 leading-tight truncate",
  PluginStateOn: "bg-green-400/10 text-green-200 border-green-400/20",
  PluginStateOff: "bg-white/5 text-white/40 border-white/10",
  
};

export const KNOB_STRIP_H = 185;