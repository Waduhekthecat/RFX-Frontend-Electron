import React from "react";
import { Slider } from "../controls/sliders/_index";

export function MapCard({
    paramName,
    pluginName,
    value01 = 0.5,
    invert = false,
    onChange01,
    onToggleInvert,
    onUnmap,
    onRange,
    onExtra,
}) {
    return (
        <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-3 grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px] gap-3 items-stretch">
            <div className="min-w-0 flex flex-col justify-center gap-3">
                <div className="min-w-0">
                    <div className="text-[12px] font-semibold tracking-wide text-white truncate">
                        {String(paramName || "Parameter")}
                    </div>
                    <div className="text-[11px] text-white/45 truncate">
                        {String(pluginName || "Plugin")}
                    </div>
                </div>

                <Slider
                    label=""
                    min={0}
                    max={1}
                    step={0.001}
                    value={value01}
                    valueText={value01.toFixed(2)}
                    widthClass="w-full"
                    onChange={(next) => onChange01?.(next)}
                />
            </div>

            <button
                type="button"
                onClick={onToggleInvert}
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                {invert ? "DIRECT" : "INVERT"}
            </button>

            <button
                type="button"
                onClick={onRange}
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                RANGE
            </button>

            <button
                type="button"
                onClick={onUnmap}
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                UNMAP
            </button>

            <button
                type="button"
                onClick={onExtra}
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/45"
            >
                —
            </button>
        </div>
    );
}