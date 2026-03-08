// src/views/edit/plugin/PluginView.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Panel, Inset } from "../../../components/ui/Panel";
import { styles, KNOB_STRIP_H } from "./_styles";
import { useIntent } from "../../../core/useIntent";
import { useRfxStore } from "../../../core/rfx/Store";
import { ParamCard } from "./components/ParamCard";
import { makeMockParamManifestForFx } from "../../../core/transport/MockParameterGenerator";
import { useIntentBuffered } from "../../../core/useIntentBuffered";
import { KnobRow } from "../../../components/controls/knobs/KnobRow";

const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function canonicalTrackGuid(id) {
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

function readFxParam01(sources, fxGuid, paramIdx, fallback01 = 0.5) {
  const overlayByGuid = sources?.overlayByGuid || EMPTY_OBJ;
  const snapshotByGuid = sources?.snapshotByGuid || EMPTY_OBJ;
  const entitiesByGuid = sources?.entitiesByGuid || EMPTY_OBJ;

  // 1) optimistic overlay
  const patch = overlayByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) return clamp01(patch.value01);

  // 2) truth
  const manifest = snapshotByGuid?.[fxGuid] ?? entitiesByGuid?.[fxGuid];
  const p = manifest?.params?.find?.((x) => Number(x?.idx) === Number(paramIdx));
  if (p && Number.isFinite(Number(p.value01))) return clamp01(p.value01);

  return clamp01(fallback01);
}

export function PluginView() {
  // ---------------------------
  // Route + intent
  // ---------------------------
  const { trackId, fxId } = useParams();
  const nav = useNavigate();
  const intent = useIntent();
  const { send, flush } = useIntentBuffered({ intervalMs: 5 });

  const trackGuid = React.useMemo(() => canonicalTrackGuid(trackId), [trackId]);
  const fxGuid = String(fxId || "");

  // ---------------------------
  // Store selectors (stable, declared before memos that depend on them)
  // ---------------------------
  const activeBusId = useRfxStore(
    (s) => s.perf?.activeBusId || s.meters?.activeBusId || null
  );

  const knobValuesByBusId = useRfxStore((s) => s.perf?.knobValuesByBusId || EMPTY_OBJ);
  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId || EMPTY_OBJ);
  const mappingArmed = useRfxStore((s) => s.perf?.mappingArmed ?? null);

  const commitKnobMapping = useRfxStore((s) => s.commitKnobMapping);
  const unmapParamFromBus = useRfxStore((s) => s.unmapParamFromBus);

  // param sources for live knob rendering
  const fxParamsOverlayByGuid = useRfxStore((s) => s.ops?.overlay?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidEntities = useRfxStore((s) => s.entities?.fxParamsByGuid || EMPTY_OBJ);
  const fxParamsByGuidSnapshot = useRfxStore((s) => s.snapshot?.fxParamsByGuid || EMPTY_OBJ);

  const fxParamSources = React.useMemo(
    () => ({
      overlayByGuid: fxParamsOverlayByGuid,
      snapshotByGuid: fxParamsByGuidSnapshot,
      entitiesByGuid: fxParamsByGuidEntities,
    }),
    [fxParamsOverlayByGuid, fxParamsByGuidSnapshot, fxParamsByGuidEntities]
  );

  // ---------------------------
  // Truth: FX meta
  // ---------------------------
  const fxByGuid = useRfxStore((s) => s.entities.fxByGuid || EMPTY);
  const fxOverlay = useRfxStore((s) => s.ops.overlay.fx || EMPTY);

  const baseFx = fxByGuid[fxGuid];
  const patchFx = fxOverlay[fxGuid];
  const fx = baseFx ? (patchFx ? { ...baseFx, ...patchFx } : baseFx) : null;

  // ---------------------------
  // Truth: params manifests (lazy-loaded)
  // ---------------------------
  const truthManifest = useRfxStore(
    (s) =>
      s.entities.fxParamsByGuid?.[fxGuid] ??
      s.snapshot.fxParamsByGuid?.[fxGuid] ??
      null
  );

  // Fallback manifest so UI can be built even if truth isn’t ready yet
  const [mockManifest, setMockManifest] = React.useState(null);

  // Effective manifest/params
  const manifest = truthManifest || mockManifest;
  const params = Array.isArray(manifest?.params) ? manifest.params : EMPTY_ARR;

  // ✅ Use plugin name as the view title
  const pluginName = String(manifest?.plugin?.fxName || fx?.name || "Plugin");

  // ---------------------------
  // UI state: mapping modal
  // ---------------------------
  const [mapModalOpen, setMapModalOpen] = React.useState(false);
  const [mapParam, setMapParam] = React.useState(null);

  // ---------------------------
  // Compute reverse map: paramIdx -> [K1, K4...]
  // ---------------------------
  const mappedKnobsByParamIdx = React.useMemo(() => {
    const busId = String(activeBusId || "");
    if (!busId) return EMPTY_OBJ;

    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;
    const out = {}; // { [paramIdx]: ["K1", "K4"] }

    for (const [knobId, t] of Object.entries(maps)) {
      if (!t) continue;
      if (String(t.fxGuid) !== String(fxGuid)) continue;

      const idx = Number(t.paramIdx);
      if (!Number.isFinite(idx)) continue;

      const m = String(knobId).match(/_k(\d+)$/);
      const n = m ? Number(m[1]) : null;
      const label = n ? `K${n}` : knobId;

      (out[idx] ||= []).push(label);
    }

    for (const k of Object.keys(out)) out[k].sort();
    return out;
  }, [activeBusId, knobMapByBusId, fxGuid]);

  // ---------------------------
  // Kick the syscall when entering PluginView
  // ---------------------------
  const requestedParamsRef = React.useRef(new Set());

  React.useEffect(() => {
    if (!trackGuid || !fxGuid) return;
    if (truthManifest) return;

    const key = `${trackGuid}:${fxGuid}`;
    if (requestedParamsRef.current.has(key)) return;

    requestedParamsRef.current.add(key);
    intent({ name: "getPluginParams", trackGuid, fxGuid });
  }, [trackGuid, fxGuid, truthManifest, intent]);

  // Build fallback mock manifest (only if no truth yet)
  React.useEffect(() => {
    if (truthManifest) {
      setMockManifest(null);
      return;
    }
    if (!fx) return;

    setMockManifest(
      makeMockParamManifestForFx({
        ...fx,
        id: fxGuid,
        guid: fxGuid,
        trackGuid,
      })
    );
  }, [truthManifest, fx, fxGuid, trackGuid]);

  // ---------------------------
  // Buffered continuous updates
  // ---------------------------
  const onParamScrub = React.useCallback(
    (p, next01) => {
      if (!p) return;
      const idx = Number(p.idx);
      if (!Number.isFinite(idx)) return;

      const key = `${fxGuid}:param:${idx}`;
      send(key, {
        name: "setParamValue",
        trackGuid,
        fxGuid,
        paramIdx: idx,
        value01: clamp01(next01),
      });
    },
    [send, fxGuid, trackGuid]
  );

  const onParamCommit = React.useCallback(() => {
    flush();
  }, [flush]);

  // ---------------------------
  // Mapping actions
  // ---------------------------
  const onMap = React.useCallback((p) => {
    if (!p) return;
    setMapParam(p);
    setMapModalOpen(true);
  }, []);

  const onUnmap = React.useCallback(
    (p) => {
      const busId = String(activeBusId || "");
      const idx = Number(p?.idx);
      if (!busId || !Number.isFinite(idx)) return;

      unmapParamFromBus?.({ busId, fxGuid, paramIdx: idx });
    },
    [activeBusId, unmapParamFromBus, fxGuid]
  );

  // ---------------------------
  // Modal derived fields (avoid TDZ)
  // ---------------------------
  const modalBusId = String(activeBusId || "");
  const modalParamIdx = Number(mapParam?.idx);
  const modalHasIdx = Number.isFinite(modalParamIdx);

  // ---------------------------
  // Bottom knob strip (live)
  // ---------------------------
  const bottomBusId = String(activeBusId || "NONE");

  const bottomKnobs = React.useMemo(() => {
    const busId = bottomBusId;
    const values = knobValuesByBusId?.[busId] || EMPTY_OBJ;
    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;

    return Array.from({ length: 7 }).map((_, i) => {
      const knobId = `${busId}_k${i + 1}`;
      const target = maps[knobId] || null;

      const base01 = Number.isFinite(values[knobId]) ? values[knobId] : 0.5;

      const display01 =
        target?.fxGuid && Number.isFinite(Number(target?.paramIdx))
          ? readFxParam01(
            fxParamSources,
            String(target.fxGuid),
            Number(target.paramIdx),
            base01
          )
          : clamp01(base01);

      const mappedLabel = target
        ? `${target.fxName || "FX"} • ${target.paramName || `#${target.paramIdx}`}`
        : "";

      return {
        id: knobId,
        label: target?.paramName ? String(target.paramName) : `K${i + 1}`,
        value: display01,
        mapped: !!target,
        mappedLabel,
      };
    });
  }, [bottomBusId, knobValuesByBusId, knobMapByBusId, fxParamSources]);

  return (
    <div className={styles.Root}>
      <div className={styles.Column}>
        <Panel className={styles.panelHeader}>
          <div className={styles.Header}>
            <div className={styles.Title}>{pluginName}</div>
            <button type="button" onClick={() => nav("/edit")} className={styles.BackButton}>BACK</button>
          </div>
        </Panel>

        {/* <div className="h-px bg-white/10" /> */}

        <div className="p-0 min-h-0 flex-1 overflow-auto">
          {!manifest ? (
            <div className="text-white/45 text-[12px]">Loading parameters…</div>
          ) : (
            <>
              {/* ✅ Remove the "EQ" + "Source..." block to reclaim space */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 content-start">
                {params.map((p) => (
                  <ParamCard
                    key={p.idx}
                    trackGuid={trackGuid}
                    fxGuid={fxGuid}
                    p={p}
                    onChange01={onParamScrub}
                    onCommit01={onParamCommit}
                    onMap={onMap}
                    onUnmap={onUnmap}
                    mappedKnobs={mappedKnobsByParamIdx?.[Number(p.idx)] || []}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ✅ Bottom live knob row */}
        {/* <div className="h-px bg-white/10" /> */}
        <Panel className={styles.KnobPanel} style={{ height: KNOB_STRIP_H, flex: `0 0 ${KNOB_STRIP_H}px` }}>
          <KnobRow knobs={bottomKnobs} busId={bottomBusId} mappingArmed={mappingArmed} />
        </Panel>

        {/* ✅ MAP MODAL */}
        {mapModalOpen ? (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            {/* backdrop */}
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => {
                setMapModalOpen(false);
                setMapParam(null);
              }}
            />

            {/* modal */}
            <div
              className="relative w-[560px] max-w-[92vw] rounded-2xl border border-white/10 bg-[#0b0f14] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-white">
                    Map parameter to knob
                  </div>
                  <div className="text-[11px] text-white/45 truncate">
                    {pluginName}
                    {" • "}
                    {String(
                      mapParam?.uiLabel ||
                      mapParam?.name ||
                      `Param ${modalHasIdx ? modalParamIdx : ""}`
                    )}
                    {" • "}
                    Bus: {String(activeBusId || "NONE")}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMapModalOpen(false);
                    setMapParam(null);
                  }}
                  className="h-8 px-3 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-white/80"
                >
                  CLOSE
                </button>
              </div>

              <div className="h-px bg-white/10" />

              <div className="p-4">
                {(() => {
                  const busId = modalBusId;
                  const idx = modalParamIdx;

                  if (!busId || !Number.isFinite(idx)) {
                    return (
                      <div className="text-[12px] text-white/45">
                        Missing busId or param index.
                      </div>
                    );
                  }

                  const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;

                  const knobs = Array.from({ length: 7 }).map((_, i) => {
                    const knobId = `${busId}_k${i + 1}`;
                    const target = maps[knobId] || null;
                    const mappedText = target
                      ? `${target.fxName || "FX"} • ${target.paramName || `#${target.paramIdx}`
                      }`
                      : "Unmapped";

                    return { knobId, label: `K${i + 1}`, mappedText, target };
                  });

                  return (
                    <div className="grid grid-cols-1 gap-2">
                      {knobs.map((k) => (
                        <button
                          key={k.knobId}
                          type="button"
                          className="w-full text-left rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-3 py-2"
                          onClick={() => {
                            commitKnobMapping?.({
                              busId,
                              knobId: k.knobId,
                              trackGuid,
                              fxGuid,
                              paramIdx: idx,
                              paramName: String(
                                mapParam?.uiLabel || mapParam?.name || `Param ${idx}`
                              ),
                              fxName: pluginName,
                              trackName: String(trackGuid),
                              label: String(
                                mapParam?.uiLabel || mapParam?.name || `Param ${idx}`
                              ),
                            });

                            setMapModalOpen(false);
                            setMapParam(null);
                          }}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[12px] font-semibold text-white">
                              {k.label}
                            </div>
                            <div className="text-[11px] text-white/50 truncate">
                              {k.mappedText}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}