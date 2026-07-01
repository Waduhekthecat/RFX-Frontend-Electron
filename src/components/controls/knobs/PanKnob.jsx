import React from "react";
import { cn } from "../../lib/cn";

function clampPan(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < -1) return -1;
  if (n > 1) return 1;
  return n;
}

function formatPan(value) {
  if (Math.abs(value) < 0.01) return "C";
  return value < 0 ? `L${Math.round(Math.abs(value) * 100)}` : `R${Math.round(value * 100)}`;
}

export function PanKnob({
  value = 0,
  label = "PAN",
  size = 44,
  disabled = false,
  className = "",
}) {
  const pan = clampPan(value);
  const angle = -135 + ((pan + 1) / 2) * 270;

  return (
    <div
      className={cn(
        "inline-flex flex-col items-center gap-1 select-none",
        disabled && "opacity-40 saturate-50",
        className
      )}
    >
      <div className="text-[9px] font-semibold leading-none tracking-wide text-green-300/75">
        {label}
      </div>

      <div
        className="relative rounded-full border border-white/10 bg-black/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.16),inset_0_-8px_14px_rgba(0,0,0,0.88),0_0_10px_rgba(0,0,0,0.7)]"
        style={{
          width: size,
          height: size,
          backgroundImage:
            "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.16), transparent 28%), radial-gradient(circle, rgba(12,14,18,0.94), rgba(2,3,5,0.98))",
        }}
        title={`Pan: ${formatPan(pan)}`}
      >
        <div
          className="absolute left-1/2 top-1/2 h-[42%] w-[3px] origin-bottom rounded-full bg-green-300/90 shadow-[0_0_6px_rgba(134,239,172,0.45)]"
          style={{
            transform: `translate(-50%, -100%) rotate(${angle}deg)`,
          }}
        />

        <div className="absolute inset-[8px] rounded-full border border-white/[0.06]" />
        <div className="absolute bottom-[5px] left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-white/25" />
        <div className="absolute left-[5px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-white/18" />
        <div className="absolute right-[5px] top-1/2 h-1 w-1 -translate-y-1/2 rounded-full bg-white/18" />
      </div>

      <div className="text-[9px] leading-none text-white/45">{formatPan(pan)}</div>
    </div>
  );
}
