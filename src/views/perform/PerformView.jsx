import React from "react";
import { useIntent } from "../../core/useIntent";
import { useRfxStore } from "../../core/rfx/Store";
import { KnobRow } from "../../components/controls/knobs/KnobRow";
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

  const patch = overlayByGuid?.[fxGuid]?.[paramIdx];
  if (patch && Number.isFinite(Number(patch.value01))) {
    return clamp01(patch.value01);
  }

  const manifest = entitiesByGuid?.[fxGuid] ?? snapshotByGuid?.[fxGuid];
  const p = manifest?.params?.find?.((x) => Number(x?.idx) === Number(paramIdx));

  if (p && Number.isFinite(Number(p.value01))) {
    return clamp01(p.value01);
  }

  return f;
}

export function PerformView() {
  const intent = useIntent();
  const [knobRowExpanded, setKnobRowExpanded] = React.useState(false);

  const buses = useRfxStore((s) => s.perf?.buses ?? EMPTY_ARR);

  const activeBusId = useRfxStore(
    (s) => s.perf?.activeBusId ?? s.meters?.activeBusId ?? null
  );

  const busModesById = useRfxStore((s) => s.perf?.busModesById ?? EMPTY_OBJ);
  const metersById = useRfxStore((s) => s.meters?.byId ?? EMPTY_OBJ);

  const knobValuesByBusId = useRfxStore(
    (s) => s.perf?.knobValuesByBusId ?? EMPTY_OBJ
  );

  const knobMapByBusId = useRfxStore(
    (s) => s.perf?.knobMapByBusId ?? EMPTY_OBJ
  );

  const mappingArmed = useRfxStore((s) => s.perf?.mappingArmed ?? null);

  const fxParamsOverlayByGuid = useRfxStore(
    (s) => s.ops?.overlay?.fxParamsByGuid ?? EMPTY_OBJ
  );

  const fxParamsByGuidEntities = useRfxStore(
    (s) => s.entities?.fxParamsByGuid ?? EMPTY_OBJ
  );

  const fxParamsByGuidSnapshot = useRfxStore(
    (s) => s.snapshot?.fxParamsByGuid ?? EMPTY_OBJ
  );

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
    const target = getPrimaryKnobTarget(maps[knobId]);

    const mappedLabel = target
      ? `${target.fxName || "FX"} • ${target.paramName || `#${target.paramIdx}`}`
      : "";

    const base01 = Number.isFinite(values[knobId]) ? values[knobId] : 0.5;

    const param01 =
      target?.fxGuid && Number.isFinite(Number(target?.paramIdx))
        ? readFxParam01(
            fxParamSources,
            String(target.fxGuid),
            Number(target.paramIdx),
            base01
          )
        : null;

    const display01 =
      param01 !== null
        ? target?.invert === true
          ? clamp01(1 - param01)
          : clamp01(param01)
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
        <div
          className={styles.Top}
          style={{
            paddingBottom: knobRowExpanded ? 0 : KNOB_STRIP_H + 12,
          }}
        >
          <BusCardArea
            vm={vm}
            getRoutingMode={(busId) =>
              normalizeMode(vm?.busModes?.[busId] || "linear")
            }
            onSelectBus={(busId) => intent({ name: "selectActiveBus", busId })}
          />
        </div>

        <div
          // className={styles.KnobPanel}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            top: knobRowExpanded ? 0 : "auto",
            zIndex: knobRowExpanded ? 999 : 10,
            height: knobRowExpanded ? "auto" : KNOB_STRIP_H,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <KnobRow
            knobs={knobs}
            busId={activeId}
            knobMapByBusId={knobMapByBusId}
            mappingArmed={mappingArmed}
            mapDragActive={false}
            onExpandedChange={setKnobRowExpanded}
          />
        </div>
      </div>
    </div>
  );
}