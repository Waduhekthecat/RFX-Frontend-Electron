import React from "react";
import { useIntent } from "../../core/useIntent";
import { useRfxStore } from "../../core/rfx/Store";
import { KnobRow } from "../../components/controls/knobs/KnobRow";
import { Panel } from "../../components/ui/Panel";
import { BusCardArea } from "./components/_index";
import { normalizeMode, clamp01 } from "../../core/DomainHelpers";
import { styles, KNOB_STRIP_H } from "./_styles";

const EMPTY_ARR = Object.freeze([]);
const EMPTY_OBJ = Object.freeze({});

function getPrimaryKnobTarget(raw) {
  if (!raw) return null;
  return Array.isArray(raw) ? raw[0] || null : raw;
}

function readFxParam01(sources, fxGuid, paramIdx, fallback01 = 0.5) {
  const f = clamp01(fallback01);

  const overlayByGuid = sources?.overlayByGuid || EMPTY_OBJ;
  const snapshotByGuid = sources?.snapshotByGuid || EMPTY_OBJ;
  const entitiesByGuid = sources?.entitiesByGuid || EMPTY_OBJ;

  // 1) optimistic overlay (fastest)
  const patch = overlayByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) return clamp01(patch.value01);

  // 2) truth (snapshot OR entities)
  const manifest = snapshotByGuid?.[fxGuid] ?? entitiesByGuid?.[fxGuid];
  const p = manifest?.params?.find?.((x) => Number(x?.idx) === Number(paramIdx));
  if (p && Number.isFinite(Number(p.value01))) return clamp01(p.value01);

  return f;
}

export function PerformView() {
  const intent = useIntent();

  // ✅ IMPORTANT: never return [] / {} inline from selectors
  const buses = useRfxStore((s) => s.perf?.buses ?? EMPTY_ARR);
  const activeBusId = useRfxStore(
    (s) => s.perf?.activeBusId ?? s.meters?.activeBusId ?? null
  );
  const busModesById = useRfxStore((s) => s.perf?.busModesById ?? EMPTY_OBJ);
  const metersById = useRfxStore((s) => s.meters?.byId ?? EMPTY_OBJ);

  const knobValuesByBusId = useRfxStore((s) => s.perf?.knobValuesByBusId ?? EMPTY_OBJ);
  const knobMapByBusId = useRfxStore((s) => s.perf?.knobMapByBusId ?? EMPTY_OBJ);
  const mappingArmed = useRfxStore((s) => s.perf?.mappingArmed ?? null);

  // ✅ pull param sources so mapped knobs can DISPLAY param values
  const fxParamsOverlayByGuid = useRfxStore((s) => s.ops?.overlay?.fxParamsByGuid ?? EMPTY_OBJ);
  const fxParamsByGuidEntities = useRfxStore((s) => s.entities?.fxParamsByGuid ?? EMPTY_OBJ);
  const fxParamsByGuidSnapshot = useRfxStore((s) => s.snapshot?.fxParamsByGuid ?? EMPTY_OBJ);

  // ✅ stable bundle for useMemo deps
  const fxParamSources = React.useMemo(
    () => ({
      overlayByGuid: fxParamsOverlayByGuid,
      snapshotByGuid: fxParamsByGuidSnapshot,
      entitiesByGuid: fxParamsByGuidEntities,
    }),
    [fxParamsOverlayByGuid, fxParamsByGuidSnapshot, fxParamsByGuidEntities]
  );

  const vm = React.useMemo(() => {
    const first = buses?.[0]?.id ?? "NONE";
    return {
      buses,
      activeBusId: activeBusId || first,
      busModes: busModesById,
      meters: metersById,
    };
  }, [buses, activeBusId, busModesById, metersById]);

  const activeId = vm.activeBusId || "NONE";

  const knobs = React.useMemo(() => {
    const busId = String(activeId || "NONE");
    const values = knobValuesByBusId?.[busId] || EMPTY_OBJ;
    const maps = knobMapByBusId?.[busId] || EMPTY_OBJ;

    return Array.from({ length: 7 }).map((_, i) => {
      const knobId = `${busId}_k${i + 1}`;
      // const target = maps[knobId] || null;
      const target = getPrimaryKnobTarget(maps[knobId]);

      const mappedLabel = target
        ? `${target.fxName || "FX"} • ${target.paramName || `#${target.paramIdx}`}`
        : "";

      // Base knob value (unmapped fallback)
      const base01 = Number.isFinite(values[knobId]) ? values[knobId] : 0.5;

      // ✅ If mapped: DISPLAY current parameter value (overlay/truth). Otherwise show base knob.
      const display01 =
        target?.fxGuid && Number.isFinite(Number(target?.paramIdx))
          ? readFxParam01(
              fxParamSources,
              String(target.fxGuid),
              Number(target.paramIdx),
              base01
            )
          : clamp01(base01);

      return {
        id: knobId,
        label: target?.paramName ? String(target.paramName) : `K${i + 1}`,
        value: display01,
        mapped: !!target,
        mappedLabel,
      };
    });
  }, [activeId, knobValuesByBusId, knobMapByBusId, fxParamSources]);

  return (
    <div className={styles.Root}>
      <div className={styles.Column}>
        <div className={styles.Top}>
          <BusCardArea
            vm={vm}
            getRoutingMode={(busId) => normalizeMode(vm?.busModes?.[busId] || "linear")}
            onSelectBus={(busId) => intent({ name: "selectActiveBus", busId })}
          />
        </div>

        <Panel
          className={styles.KnobPanel}
          style={{ height: KNOB_STRIP_H, flex: `0 0 ${KNOB_STRIP_H}px` }}
        >
          <KnobRow knobs={knobs} busId={activeId} mappingArmed={mappingArmed} />
        </Panel>
      </div>
    </div>
  );
}