import React from "react";

function formatPluginName(name = "") {
  return String(name)
    .replace(/^\s*(vst3?|au|clap|js|dx):\s*/i, "")
    .replace(/\s*\([^)]*\)\s*$/g, "")
    .trim();
}

export function AutomatableParameterCard({
  parameter,
  onRemove,
  onToggleArmed,
  armed = false,
}) {
  return (
    <div
      className={`flex min-h-[120px] flex-col rounded-xl border p-4 transition-all duration-200 ${
        armed
          ? "border-emerald-300/55 bg-emerald-400/10 shadow-[0_0_22px_rgba(52,211,153,0.18),inset_0_0_0_1px_rgba(52,211,153,0.10)]"
          : "border-violet-300/20 bg-violet-400/5"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-white">
            {parameter.paramName || `Parameter ${parameter.paramIndex}`}
          </div>
          {parameter.fxName ? (
            <div className="mt-2 truncate text-xs text-white/55">
              {formatPluginName(parameter.fxName)}
            </div>
          ) : null}
          {parameter.trackName ? (
            <div className="mt-1 truncate text-xs text-white/40">
              {parameter.trackName}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-stretch gap-2">
          <button
            type="button"
            onClick={() => onRemove(parameter)}
            className="flex h-10 w-[68px] items-center justify-center rounded-xl border border-red-300/20 bg-red-400/5 px-3 text-[10px] font-semibold text-red-100/80 transition-colors hover:border-red-300/40 hover:bg-red-400/15"
          >
            REMOVE
          </button>

          <button
            type="button"
            onClick={() => onToggleArmed(parameter)}
            aria-pressed={armed}
            className={`flex h-10 w-[68px] items-center justify-center rounded-xl border px-3 text-[11px] font-semibold transition-colors ${
              armed
                ? "border-emerald-300/35 bg-emerald-500/15 text-emerald-100"
                : "border-cyan-300/45 bg-cyan-500/15 text-cyan-100 shadow-[0_0_0_1px_rgba(34,211,238,0.25)] hover:bg-cyan-500/25"
            }`}
            title={armed ? "Disarm automation parameter" : "Arm automation parameter"}
            aria-label={armed ? "Disarm automation parameter" : "Arm automation parameter"}
          >
            {armed ? "UNARM" : "ARM"}
          </button>
        </div>
      </div>
    </div>
  );
}
