export const CONTROL_COLORS = {
  greenFaint: "border-emerald-300/25 bg-emerald-400/5 hover:border-emerald-300/45 hover:bg-emerald-400/15",
  greenActive: "border-emerald-300 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.35)]",

  redFaint: "border-red-300/25 bg-red-400/5 hover:border-red-300/45 hover:bg-red-400/15",
  redActive: "border-red-300 bg-red-400/25 shadow-[0_0_20px_rgba(248,113,113,0.45)]",

  orangeFaint: "border-orange-300/25 bg-orange-400/5 hover:border-orange-300/45 hover:bg-orange-400/15",
  orangeActive: "border-orange-300 bg-orange-400/25 shadow-[0_0_20px_rgba(251,146,60,0.45)]",

  blueFaint: "border-sky-300/25 bg-sky-400/5",
  blueActive: "border-sky-300 bg-sky-400/20 shadow-[0_0_18px_rgba(56,189,248,0.35)]",

  grayFaint: "border-white/15 bg-white/5 hover:border-white/25 hover:bg-white/10",
  whiteActive: "border-white/80 bg-white/15 shadow-[0_0_18px_rgba(255,255,255,0.25)]",
  amberFaint: "border-amber-300/25 bg-amber-400/10 hover:border-amber-300/45 hover:bg-amber-400/15",
  amberActive: "border-amber-300/70 bg-amber-400/20 shadow-[0_0_18px_rgba(251,191,36,0.35)]",
  purpleFaint: "border-purple-300/25 bg-purple-400/10 hover:border-purple-300/45 hover:bg-purple-400/15",
  purpleActive: "border-purple-300/70 bg-purple-400/20 shadow-[0_0_18px_rgba(192,132,252,0.35)]",
};

export const styles = {
  Root: "h-full w-full p-3 min-h-0",
  Column: "h-full min-h-0 flex flex-col gap-3",
  HeaderInner: "px-4 py-3 flex items-center justify-between gap-3",
  HeaderTitleGroup: "flex items-center gap-3 min-w-0",
  HeaderTitle: "text-[18px] font-semibold tracking-wide truncate",
  LooperTypeBadge: "rounded-full border px-3 py-1 text-xs font-semibold text-white/80",
  MainPanel: "flex-1 min-h-0",
  MainPanelInner: "p-4 h-full min-h-0",
  MainInset: "h-full min-h-0 p-4",
  LayoutGrid: "grid h-full min-h-0 grid-cols-[repeat(4,minmax(0,1fr))_minmax(190px,0.75fr)] grid-rows-[minmax(0,1fr)_auto_auto] gap-3",
  TimelineSlot: "col-span-5 row-span-1 min-h-0",
  ControlGrid: "col-span-4 row-span-2 grid grid-cols-4 grid-rows-2 gap-3 items-stretch",
  ExpressionPanel: "col-start-5 row-start-2 row-span-2 h-full rounded-xl border px-3 py-4 transition-all duration-150",
};
