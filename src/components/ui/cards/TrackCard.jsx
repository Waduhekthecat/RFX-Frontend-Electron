import { VerticalMeter } from "../meters/VerticalMeter";
import { PanKnob } from "../../controls/knobs/PanKnob";
import { cn } from "../../lib/cn";

const DEFAULT_FX = Object.freeze([
  { id: "add-1", label: "Add", empty: true },
  { id: "add-2", label: "Add", empty: true },
  { id: "add-3", label: "Add", empty: true },
  { id: "add-4", label: "Add", empty: true },
  { id: "add-5", label: "Add", empty: true },
]);

function FxCard({ fx, disabled, onAdd }) {
  const empty = fx?.empty !== false;
  const interactive = empty && typeof onAdd === "function";

  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={interactive ? onAdd : undefined}
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 rounded border px-2 text-left text-[10px] font-semibold leading-none transition",
        empty
          ? "border-white/10 bg-black/15 text-white/42 hover:border-white/20 hover:text-white/62"
          : "border-green-400/20 bg-green-400/10 text-green-100",
        interactive ? "cursor-pointer" : "cursor-default",
        disabled && !interactive && "pointer-events-none opacity-40",
        disabled && interactive && "opacity-55"
      )}
    >
      {empty ? (
        <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded border border-white/12 bg-white/[0.03] text-[10px] leading-none text-white/36">
          +
        </span>
      ) : null}
      <span className={cn("truncate", disabled && "blur-[0.35px]")}>
        {fx?.label || "Add"}
      </span>
    </button>
  );
}

export function TrackCard({
  trackName = "FX_1A",
  value = 0,
  pan = 0,
  enabled = true,
  fxCards = null,
  onAddFx,
  className = "",
}) {
  const visibleFx = (Array.isArray(fxCards) ? fxCards : DEFAULT_FX).slice(0, 5);

  return (
    <div
      className={cn(
        "flex h-[262px] w-[280px] flex-col rounded-lg border border-white/10 bg-white/[0.055] px-[7px] pb-[7px] pt-3 shadow-[0_0_18px_rgba(0,0,0,0.60)]",
        enabled ? "opacity-100" : "opacity-30 saturate-50",
        className
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2 px-1">
        <div
          className={cn(
            "min-w-0 truncate text-[17px] font-semibold leading-none tracking-wide text-white/86",
            !enabled && "blur-[0.45px]"
          )}
        >
          {trackName}
        </div>
        <div
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            enabled
              ? "bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.65)]"
              : "bg-white/18"
          )}
        />
      </div>

      <div className="min-h-0 flex-1 rounded-lg border border-black/40 bg-black/35 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-10px_24px_rgba(0,0,0,0.55)]">
        <div className="grid h-full min-h-0 grid-cols-[24px_52px_1fr] gap-3">
          <div className="h-full min-h-0">
            <VerticalMeter value={value} enabled={enabled} width={16} rounded={4} />
          </div>

          <div className="flex items-start justify-center pt-1">
            <PanKnob value={pan} disabled={!enabled} size={34} />
          </div>

          <div className="flex h-full min-h-0 min-w-0 flex-col gap-1">
            {visibleFx.map((fx, index) => (
              <FxCard
                key={fx?.id || `${fx?.label || "fx"}-${index}`}
                fx={fx}
                disabled={!enabled}
                onAdd={fx?.empty ? onAddFx : undefined}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
