import { VerticalMeter } from "../meters/VerticalMeter";
import { cn } from "../../lib/cn";

export function MeterCard({
  label = "INPUT",
  value = 0,
  enabled = true,
  className = "",
}) {
  return (
    <div
      className={cn(
        "flex h-[262px] w-[86px] flex-col rounded-lg border border-white/[0.14] bg-black/35 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-10px_24px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.035)]",
        enabled ? "opacity-100" : "opacity-45",
        className
      )}
    >
      <div className="mb-3 text-center text-[13px] font-semibold leading-none tracking-wide text-white/78">
        {label}
      </div>

      <div className="mx-auto min-h-0 flex-1">
        <VerticalMeter value={value} enabled={enabled} width={22} rounded={5} />
      </div>
    </div>
  );
}
