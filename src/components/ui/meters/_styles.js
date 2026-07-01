import { cn } from "../../lib/cn";

export { cn };

export function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export function themeForLevel(level01) {
  const YELLOW_AT = 0.78;
  const RED_AT = 0.92;

  if (level01 >= RED_AT) {
    return {
      fill:
        "linear-gradient(180deg, rgba(255,120,120,0.92) 0%, rgba(255,60,60,0.96) 42%, rgba(200,18,18,0.98) 100%)",
      peak: "rgba(255,110,110,0.95)",
      glow: "rgba(255,80,80,0.35)",
      cap: "rgba(255,190,190,0.40)",
      clip: "rgba(255,70,70,0.95)",
    };
  }
  if (level01 >= YELLOW_AT) {
    return {
      fill:
        "linear-gradient(180deg, rgba(255,240,120,0.90) 0%, rgba(255,205,60,0.95) 50%, rgba(255,170,30,0.98) 100%)",
      peak: "rgba(255,235,120,0.95)",
      glow: "rgba(255,220,120,0.28)",
      cap: "rgba(255,245,190,0.38)",
      clip: "rgba(255,90,50,0.92)",
    };
  }
  return {
    fill:
      "linear-gradient(180deg, rgba(130,255,170,0.90) 0%, rgba(80,220,120,0.94) 45%, rgba(35,170,85,0.98) 100%)",
    peak: "rgba(120,255,170,0.95)",
    glow: "rgba(80,220,120,0.22)",
    cap: "rgba(190,255,215,0.35)",
    clip: "rgba(255,70,70,0.95)",
  };
}

export const styles = {
  wrapBase:
    "relative h-full overflow-hidden border border-white/15 bg-black/60 shadow-[inset_0_0_10px_rgba(0,0,0,0.85),0_0_10px_rgba(0,0,0,0.45)]",
  wrapEnabled: "opacity-100",
  wrapDisabled: "opacity-35 saturate-50",

  inner:
    "absolute inset-[3px] overflow-hidden rounded-sm border border-black/70 bg-[linear-gradient(90deg,rgba(255,255,255,0.06),rgba(255,255,255,0.01)_30%,rgba(0,0,0,0.35)_70%,rgba(255,255,255,0.04))]",
  segmentStack: "absolute inset-[3px] flex flex-col-reverse gap-px",
  segment:
    "flex-1 min-h-0 rounded-[1px] border border-black/30 transition-colors duration-75",
  segmentIdle: "bg-white/[0.045]",
  segmentGreen: "bg-green-400 shadow-[0_0_5px_rgba(74,222,128,0.55)]",
  segmentYellow: "bg-yellow-300 shadow-[0_0_5px_rgba(250,204,21,0.55)]",
  segmentRed: "bg-red-400 shadow-[0_0_5px_rgba(248,113,113,0.55)]",
  gridLines:
    "absolute inset-[3px] pointer-events-none bg-[repeating-linear-gradient(0deg,rgba(0,0,0,0.70)_0px,rgba(0,0,0,0.70)_1px,transparent_1px,transparent_5px)] opacity-60",
  glow: "absolute inset-0 pointer-events-none",
  peak: "absolute left-[3px] right-[3px] pointer-events-none rounded-full",
  clip: "absolute top-[3px] left-[4px] right-[4px] h-1.5 rounded-full pointer-events-none",
};
