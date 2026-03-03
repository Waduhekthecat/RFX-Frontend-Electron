// src/views/edit/plugin/PluginView.jsx
import React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Panel } from "../../../components/ui/Panel";
import { styles } from "./_styles";
import { useIntent } from "../../../core/useIntent";
import { useRfxStore } from "../../../core/rfx/Store";
import { ParamCard } from "./components/ParamCard";
import { makeMockParamManifestForFx } from "../../../core/transport/MockParameterGenerator";
import { useIntentBuffered } from "../../../core/useIntentBuffered";

const EMPTY = Object.freeze({});
const EMPTY_ARR = Object.freeze([]);

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

function canonicalTrackGuid(id) {
  return String(id || "").replace(/^([A-Za-z]+_\d+)_([ABC])$/, "$1$2");
}

export function PluginView() {
  const { trackId, fxId } = useParams();
  const nav = useNavigate();
  const intent = useIntent();
  const { send, flush } = useIntentBuffered({ intervalMs: 50 });

  const trackGuid = React.useMemo(() => canonicalTrackGuid(trackId), [trackId]);
  const fxGuid = String(fxId || "");

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
  const truthManifest = useRfxStore((s) => s.entities.fxParamsByGuid?.[fxGuid] || null);

  // Fallback manifest so UI can be built even if truth isn’t ready yet
  const [mockManifest, setMockManifest] = React.useState(null);

  // Kick the syscall when entering PluginView
  React.useEffect(() => {
    if (!trackGuid || !fxGuid) return;
    intent({ name: "getPluginParams", trackGuid, fxGuid });
  }, [intent, trackGuid, fxGuid]);

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

  const manifest = truthManifest || mockManifest;
  const params = Array.isArray(manifest?.params) ? manifest.params : EMPTY_ARR;

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

  const onMap = React.useCallback((p) => {
    // Modal later
    console.log("MAP param", { trackGuid, fxGuid, param: p });
  }, [trackGuid, fxGuid]);

  return (
    <div className={styles.Root}>
      <Panel className={styles.Panel}>
        <div className={styles.Header}>
          <div>
            <div className={styles.Title}>PLUGIN</div>
            <div className={styles.Subtitle}>
              {trackGuid} • {fxGuid}
            </div>
          </div>

          <button
            type="button"
            onClick={() => nav("/edit")}
            className={styles.BackButton}
          >
            BACK
          </button>
        </div>

        <div className="h-px bg-white/10" />

        <div className="p-4 min-h-0 flex-1 overflow-auto">
          {!manifest ? (
            <div className="text-white/45 text-[12px]">Loading parameters…</div>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-white truncate">
                    {manifest?.plugin?.fxName || fx?.name || "Plugin"}
                  </div>
                  <div className="text-[11px] text-white/45 truncate">
                    {manifest?.scan?.filter ? `Source: ${manifest.scan.filter}` : "Source: mock"}
                    {" • "}
                    {params.length} params
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {params.map((p) => (
                  <ParamCard
                    key={p.idx}
                    trackGuid={trackGuid}
                    fxGuid={fxGuid}
                    p={p}
                    onChange01={onParamScrub}
                    onCommit01={onParamCommit}
                    onMap={onMap}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}