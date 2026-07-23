import React, { useState } from "react";
import { Panel } from "../../components/ui/Panel";
import ampsCabsBackground from "../../assets/ampsCabsBG.png";
import {
  DEFAULT_FX_MODULES_INSTRUMENT,
  useRfxStore,
} from "../../core/rfx/Store";

const INSTRUMENTS = ["Guitar", "Bass", "Vox", "Drums", "Synth"];
const DISABLED_INSTRUMENTS = new Set(["Vox", "Drums", "Synth"]);

const guitarFxCategories = [
  {
    id: "amplifier-cabinet",
    label: "Amplifier / Cabinet",
    description: "Amplifiers, combo captures, cabinets, and IR processing.",
  },
  {
    id: "saturation",
    label: "Saturation",
    description: "Overdrive, distortion, fuzz, and harmonic character.",
  },
  {
    id: "dynamics",
    label: "Dynamics",
    description: "Control level, transients, peaks, and dynamic range.",
  },
  {
    id: "modulation",
    label: "Modulation",
    description: "Movement, sweep, pulse, and rhythmic modulation.",
  },
  {
    id: "texture",
    label: "Texture",
    description: "Lo-fi processing, degradation, noise, and character.",
  },
  {
    id: "shape",
    label: "Shape",
    description: "Equalization, transient shaping, and resonance control.",
  },
  {
    id: "atmosphere",
    label: "Atmosphere",
    description: "Delay and reverb for ambience, depth, and reflections.",
  },
  {
    id: "space",
    label: "Space",
    description: "Stereo width, placement, and spatial image control.",
  },
  {
    id: "pitch",
    label: "Pitch",
    description: "Drop tuning, pitch shifting, and harmonization.",
  },
];

const ampCabSubcategories = [
  {
    id: "amplifier",
    label: "Amplifiers",
    description: "Load an amplifier while preserving your existing cabinet.",
  },
  {
    id: "cabinet",
    label: "Cabinets / IRs",
    description: "Add a cabinet model or load an impulse response.",
  },
  {
    id: "combo",
    label: "Combos",
    description: "Load an amp and cabinet capture together.",
  },
  {
    id: "cloud",
    label: "Cloud",
    description: "Browse modules available from the cloud.",
  },
];

function CategoryIcon({ categoryId }) {
  const commonProps = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.7,
  };

  const icon = {
    "amplifier-cabinet": (
      <>
        <rect x="4" y="3.5" width="16" height="17" rx="2" />
        <path d="M7 7h10" />
        <circle cx="12" cy="14" r="3.5" />
        <circle cx="12" cy="14" r="1" />
      </>
    ),
    saturation: (
      <path d="M13.7 3.2c.5 3.2-2.1 4.4-1.5 7.1.8-.7 1.5-1.7 1.8-2.7 2.3 1.8 3.8 4.2 3.5 7.1-.3 3.5-2.7 5.8-5.8 5.8s-5.5-2.2-5.5-5.3c0-2.5 1.5-4.4 3.6-6.2.1 1.5.5 2.6 1.2 3.3-.2-3.9.7-6.9 2.7-9.1Z" />
    ),
    dynamics: (
      <>
        <path d="M5 17V9M9.7 19V5M14.3 16V8M19 14v-4" />
        <path d="M3 12h18" opacity="0.45" />
      </>
    ),
    modulation: <path d="M3 12c2.2-6 4.5-6 6.7 0s4.5 6 6.7 0S20.8 6 23 12" />,
    texture: (
      <>
        <circle cx="6" cy="7" r="1" />
        <circle cx="12" cy="5" r="1" />
        <circle cx="18" cy="8" r="1" />
        <circle cx="8" cy="14" r="1" />
        <circle cx="15" cy="12" r="1" />
        <circle cx="18" cy="18" r="1" />
        <path d="M4 18 20 4" opacity="0.45" />
      </>
    ),
    shape: (
      <>
        <path d="M6 4v16M12 4v16M18 4v16" />
        <path d="M3.5 9h5M9.5 15h5M15.5 8h5" />
      </>
    ),
    atmosphere: (
      <>
        <path d="M5 17a4 4 0 0 1 .8-7.9A6.5 6.5 0 0 1 18.2 11 3 3 0 0 1 18 17H5Z" />
        <path d="M8 20h8" opacity="0.5" />
      </>
    ),
    space: (
      <>
        <path d="M9 6 3 12l6 6M15 6l6 6-6 6" />
        <path d="M4 12h16" />
      </>
    ),
    pitch: (
      <>
        <path d="M8 18V6M5 9l3-3 3 3M16 6v12M13 15l3 3 3-3" />
      </>
    ),
    amplifier: (
      <>
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <path d="M6 10h12M7 14h7" />
        <circle cx="17.5" cy="14" r="1.5" />
      </>
    ),
    cabinet: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <circle cx="12" cy="12" r="5" />
        <circle cx="12" cy="12" r="1.5" />
      </>
    ),
    combo: (
      <>
        <rect x="4" y="3" width="16" height="18" rx="2" />
        <path d="M7 7h10" />
        <circle cx="12" cy="14" r="3.5" />
        <path d="M7 5.5h.01M10 5.5h.01" />
      </>
    ),
    cloud: (
      <>
        <path d="M7.5 17.5H6a3.5 3.5 0 0 1-.6-6.95A5.8 5.8 0 0 1 16.5 9a4.25 4.25 0 0 1 .5 8.47" />
        <path d="M9.2 15.3a4.1 4.1 0 0 1 5.6 0M10.7 17.2a2 2 0 0 1 2.6 0" />
        <circle cx="12" cy="19.1" r=".55" fill="currentColor" stroke="none" />
      </>
    ),
  }[categoryId];

  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-full w-full"
      {...commonProps}
    >
      {icon}
    </svg>
  );
}

export function FxModulesView() {
  const [viewLevel, setViewLevel] = useState("categories");
  const [selectedAmpCabType, setSelectedAmpCabType] = useState(null);
  const selectedInstrument = useRfxStore(
    (state) => state.session?.fxModulesInstrument ?? DEFAULT_FX_MODULES_INSTRUMENT
  );
  const setSelectedInstrument = useRfxStore(
    (state) => state.setFxModulesInstrument
  );
  const isAmpCabinetView =
    selectedInstrument === "Guitar" && viewLevel === "amp-cabinet";

  const handleAmpCabTypeSelect = (type) => {
    setSelectedAmpCabType(type);

    // TODO: Open the installed model or IR browser for this type.
  };

  const handleAmpCabBack = () => {
    setSelectedAmpCabType(null);
    setViewLevel("categories");
  };

  return (
    <div className="h-full w-full p-3 min-h-0">
      <div className="h-full min-h-0 flex flex-col gap-3">
        <Panel className="min-h-0">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-[18px] font-semibold tracking-wide">
                {isAmpCabinetView ? "Amp & Cabinet" : "FX MODULES"}
              </h1>
              {isAmpCabinetView ? (
                <p className="mt-0.5 truncate text-[12px] text-white/45">
                  Choose the type of module to add to your signal chain.
                </p>
              ) : null}
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

        {selectedInstrument === "Guitar" && viewLevel === "categories" ? (
          <div className="grid min-h-0 flex-1 auto-rows-[104px] grid-cols-1 content-start gap-3 overflow-y-auto md:grid-cols-2 xl:auto-rows-auto xl:grid-cols-3 xl:grid-rows-3">
            {guitarFxCategories.map((category) => {
              const available = category.id === "amplifier-cabinet";

              return (
                <button
                  key={category.id}
                  type="button"
                  disabled={!available}
                  onClick={() => setViewLevel("amp-cabinet")}
                  className={[
                    "flex h-full items-center gap-4 rounded-xl border border-white/10 bg-white/[0.045] px-4 text-left shadow-[0_8px_20px_rgba(0,0,0,0.18)] transition duration-150",
                    available
                      ? "group hover:border-emerald-300/25 hover:bg-white/[0.075] hover:shadow-[0_10px_24px_rgba(0,0,0,0.28)] active:border-emerald-300/35 active:bg-emerald-400/[0.07] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
                      : "cursor-not-allowed opacity-30 blur-[0.7px]",
                  ].join(" ")}
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/25 text-emerald-200/70 transition group-hover:border-emerald-300/20 group-hover:bg-emerald-400/[0.08] group-hover:text-emerald-100">
                    <div className="h-6 w-6">
                      <CategoryIcon categoryId={category.id} />
                    </div>
                  </div>

                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[16px] font-semibold leading-5 tracking-wide text-white/90">
                      {category.label}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-white/45">
                      {category.description}
                    </p>
                  </div>

                  <div className="shrink-0 text-[25px] font-light leading-none text-white/25 transition group-hover:translate-x-0.5 group-hover:text-emerald-200/70">
                    ›
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}

        {selectedInstrument === "Guitar" && viewLevel === "amp-cabinet" ? (
          <section
            className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-hidden rounded-xl border border-white/10 bg-cover bg-bottom bg-no-repeat shadow-[inset_0_0_45px_rgba(0,0,0,0.2),0_8px_20px_rgba(0,0,0,0.18)]"
            style={{ backgroundImage: `url(${ampsCabsBackground})` }}
          >
            <div
              className="pointer-events-none absolute inset-0 bg-black/10"
              aria-hidden="true"
            />

            <div className="relative z-10 flex shrink-0 items-stretch gap-3 overflow-x-auto rounded-xl border border-white/10 bg-black/20 p-3">
              <button
                type="button"
                onClick={handleAmpCabBack}
                className="shrink-0 rounded-lg border border-white/10 bg-[#151719] px-3 py-2 text-[12px] font-semibold text-white/60 transition hover:border-emerald-300/25 hover:bg-[#1d2022] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/60"
              >
                ← FX Modules
              </button>

              <div className="grid min-w-[680px] flex-1 grid-cols-4 gap-2">
                {ampCabSubcategories.map((subcategory) => {
                  const selected = selectedAmpCabType === subcategory.id;

                  return (
                    <button
                      key={subcategory.id}
                      type="button"
                      onClick={() => handleAmpCabTypeSelect(subcategory.id)}
                      aria-pressed={selected}
                      className={[
                        "flex min-h-[72px] items-center gap-3 rounded-lg border px-3 text-left shadow-[0_6px_16px_rgba(0,0,0,0.16)] transition duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25",
                        selected
                          ? "border-emerald-300/30 bg-[#111010] text-white"
                          : "border-white/10 bg-[#151719] text-white/75",
                      ].join(" ")}
                    >
                      <div
                        className={[
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition",
                          selected
                            ? "border-white/10 bg-[#0f1113] text-white/90"
                            : "border-white/10 bg-[#0f1113] text-emerald-200/65",
                        ].join(" ")}
                      >
                        <div className="h-5 w-5">
                          <CategoryIcon categoryId={subcategory.id} />
                        </div>
                      </div>

                      <span className="truncate text-[13px] font-semibold tracking-wide">
                        {subcategory.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="relative z-10 min-h-0 flex-1" aria-hidden="true" />
          </section>
        ) : null}
      </div>
    </div>
  );
}
