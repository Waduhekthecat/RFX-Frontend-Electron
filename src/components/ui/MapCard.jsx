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
    badgeLabel = "",
    draggableActive = false,
    draggableGhost = false,
    onDragHoldStart,
    onDragHoldMove,
    onDragHoldEnd,
}) {
    const handlePointerDown = React.useCallback((evt) => {
        if (evt.target?.closest?.("button,input,[role='slider'],[data-no-mapcard-drag='true']")) return;
        onDragHoldStart?.(evt);
    }, [onDragHoldStart]);

    const handlePointerMove = React.useCallback((evt) => {
        onDragHoldMove?.(evt);
    }, [onDragHoldMove]);

    const handlePointerEnd = React.useCallback(() => {
        onDragHoldEnd?.();
    }, [onDragHoldEnd]);

    return (
        <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerEnd}
            onPointerCancel={handlePointerEnd}
            className={`h-full rounded-2xl border p-3 grid grid-cols-[minmax(0,1fr)_120px_120px_120px_120px] gap-3 items-stretch select-none transition ${
                draggableActive
                    ? "border-cyan-300/80 bg-cyan-500/10 opacity-95"
                    : draggableGhost
                      ? "border-white/10 bg-white/5 opacity-70"
                      : "border-white/10 bg-white/5"
            }`}
        >
            <div className="min-w-0 flex flex-col justify-center gap-3">
                <div className="min-w-0">
                    {/* <div className="text-[12px] font-semibold tracking-wide text-white truncate">
                        {String(paramName || "Parameter")} */}
                        <div className="flex items-center gap-2 min-w-0">
                        <div className="text-[12px] font-semibold tracking-wide text-white truncate">
                            {String(paramName || "Parameter")}
                        </div>
                        {badgeLabel ? (
                            <span className="shrink-0 rounded-md border border-cyan-300/50 bg-cyan-400/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-100">
                                {badgeLabel}
                            </span>
                        ) : null}
                    </div>
                    <div className="text-[11px] text-white/45 truncate">
                        {String(pluginName || "Plugin")}
                    </div>
                </div>
                <div data-no-mapcard-drag="true">
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
            </div>

            <button
                type="button"
                onClick={onToggleInvert}
                data-no-mapcard-drag="true"
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                {invert ? "DIRECT" : "INVERT"}
            </button>

            <button
                type="button"
                onClick={onRange}
                data-no-mapcard-drag="true"
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                RANGE
            </button>

            <button
                type="button"
                onClick={onUnmap}
                data-no-mapcard-drag="true"
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/70"
            >
                UNMAP
            </button>

            <button
                type="button"
                onClick={onExtra}
                data-no-mapcard-drag="true"
                className="rounded-2xl border border-white/10 bg-white/5 text-[12px] font-bold text-white/45"
            >
                —
            </button>
        </div>
    );
}