import React from "react";
import { Panel } from "../../components/ui/Panel";
import {
  DEFAULT_FX_MODULES_INSTRUMENT,
  useRfxStore,
} from "../../core/rfx/Store";

const INSTRUMENTS = ["Guitar", "Bass", "Vox", "Drums", "Synth"];
const DISABLED_INSTRUMENTS = new Set(["Vox", "Drums", "Synth"]);

export function FxModulesView() {
  const selectedInstrument = useRfxStore(
    (state) => state.session?.fxModulesInstrument ?? DEFAULT_FX_MODULES_INSTRUMENT
  );
  const setSelectedInstrument = useRfxStore(
    (state) => state.setFxModulesInstrument
  );

  return (
    <div className="h-full w-full p-3 min-h-0">
      <div className="h-full min-h-0 flex flex-col gap-3">
        <Panel className="min-h-0">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-[18px] font-semibold tracking-wide truncate">
                FX MODULES
              </h1>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                Instrument
              </div>

              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
                {INSTRUMENTS.map((instrument) => {
                  const active = selectedInstrument === instrument;
                  const disabled = DISABLED_INSTRUMENTS.has(instrument);

                  return (
                    <button
                      key={instrument}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) setSelectedInstrument(instrument);
                      }}
                      className={[
                        "h-8 min-w-[72px] rounded-lg px-3 text-[12px] font-semibold transition",
                        disabled
                          ? "border border-transparent text-white/25 opacity-35 blur-[0.4px] cursor-not-allowed"
                          : active
                          ? "border border-emerald-300 bg-emerald-400/20 text-white shadow-[0_0_18px_rgba(52,211,153,0.3)]"
                          : "border border-transparent text-white/60 hover:bg-white/10 hover:text-white",
                      ].join(" ")}
                    >
                      {instrument}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
