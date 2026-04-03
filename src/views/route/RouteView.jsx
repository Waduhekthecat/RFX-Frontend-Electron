import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTransportVM } from "../../core/useTransportVM";
import { normalizeMode, availableLanes } from "../../core/DomainHelpers";

import { Card, MiniLabel, NodePill } from "./components/_index";
import { styles } from "./_styles";
import {
  cablePath,
  centerLeft,
  centerRight,
  strokeFor,
  strokeW,
  toLocal,
} from "./_geom";

function asArray(x) {
  return Array.isArray(x) ? x : [];
}
function norm(s) {
  return String(s ?? "").trim();
}

// availableLanes(mode) imported from DomainHelpers — returns same ["A"], ["A","B"], or ["A","B","C"]

function extractBuses(vm) {
  const buses =
    asArray(vm?.buses) ||
    asArray(vm?.busList) ||
    asArray(vm?.states) ||
    asArray(vm?.session?.buses);

  if (buses.length) {
    if (typeof buses[0] === "string") return buses.map((id) => ({ id }));
    return buses;
  }
  return [{ id: "FX_1" }, { id: "FX_2" }, { id: "FX_3" }, { id: "FX_4" }];
}

function busIdOf(bus, i) {
  return norm(bus?.id) || norm(bus?.busId) || norm(bus?.name) || `FX_${i + 1}`;
}

// ----------------------------
// Armed detection (best-effort)
// ----------------------------
function isLaneArmed(vm, busId, laneLetter) {
  const laneId = `${busId}${laneLetter}`;

  const armedList =
    asArray(vm?.armedTracks) || asArray(vm?.armed) || asArray(vm?.recordArmed);
  if (armedList.includes(laneId)) return true;

  if (vm?.recArmed && typeof vm.recArmed === "object") {
    if (vm.recArmed[laneId]) return true;
  }

  const tracks = asArray(vm?.tracks) || asArray(vm?.session?.tracks) || [];
  const tr = tracks.find((t) => norm(t?.id) === laneId || norm(t?.name) === laneId);
  if (!tr) return false;

  return Boolean(
    tr?.recArm ??
      tr?.rec_armed ??
      tr?.armed ??
      tr?.isArmed ??
      tr?.recordArmed ??
      tr?.record_arm
  );
}

// ----------------------------
// RouteView
// ----------------------------
export function RouteView() {
  const vm = useTransportVM();

  const buses = useMemo(() => extractBuses(vm), [vm]);
  const activeBusId = norm(vm?.activeBusId || "");
  const busModes = vm?.busModes || {};

  const rows = useMemo(() => {
    return buses.slice(0, 4).map((b, i) => {
      const id = busIdOf(b, i);
      const mode = normalizeMode(busModes?.[id] || b?.mode || "linear");
      const enabledLetters = availableLanes(mode);
      return { id, mode, enabledLetters };
    });
  }, [buses, busModes]);

  const laneIdsByBus = useMemo(() => {
    const out = {};
    for (const r of rows) {
      const enabled = r.enabledLetters;
      const armedLetters = enabled.filter((L) => isLaneArmed(vm, r.id, L));
      const hasAnyArmed = armedLetters.length > 0;
      const lettersToRender = hasAnyArmed ? armedLetters : enabled;
      out[r.id] = lettersToRender.map((L) => `${r.id}${L}`);
    }
    return out;
  }, [rows, vm]);

  // Refs for measuring ports
  const stageRef = useRef(null);
  const inputRef = useRef(null);
  const outputRef = useRef(null);

  const laneRefs = useRef({});
  const busRefs = useRef({});

  const [layout, setLayout] = useState(null);

  useLayoutEffect(() => {
    if (!stageRef.current) return;

    const measure = () => {
      const stageRect = stageRef.current.getBoundingClientRect();

      const inputEl = inputRef.current;
      const outputEl = outputRef.current;
      if (!inputEl || !outputEl) return;

      const inputRect = inputEl.getBoundingClientRect();
      const outputRect = outputEl.getBoundingClientRect();

      const laneRects = {};
      const busRects = {};

      for (const r of rows) {
        const busEl = busRefs.current[r.id];
        if (busEl) busRects[r.id] = busEl.getBoundingClientRect();

        const laneIds = laneIdsByBus[r.id] || [];
        for (const laneId of laneIds) {
          const el = laneRefs.current[laneId];
          if (el) laneRects[laneId] = el.getBoundingClientRect();
        }
      }

      setLayout({ stageRect, inputRect, outputRect, laneRects, busRects });
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(stageRef.current);

    const t = setTimeout(measure, 0);
    return () => {
      clearTimeout(t);
      ro.disconnect();
    };
  }, [rows, laneIdsByBus]);

  const cables = useMemo(() => {
    if (!layout) return [];

    const { stageRect, inputRect, outputRect, laneRects, busRects } = layout;

    const inPort = toLocal(centerRight(inputRect), stageRect);
    const outPort = toLocal(centerLeft(outputRect), stageRect);

    const result = [];

    for (const r of rows) {
      const isActiveBus = r.id === activeBusId;
      const laneIds = laneIdsByBus[r.id] || [];

      for (const laneId of laneIds) {
        const laneRect = laneRects[laneId];
        if (!laneRect) continue;

        const a = inPort;
        const b = toLocal(centerLeft(laneRect), stageRect);

        result.push({
          key: `in-${laneId}`,
          d: cablePath(a, b, 0.55),
          active: isActiveBus,
        });
      }

      const busRect = busRects[r.id];
      if (busRect) {
        const busIn = toLocal(centerLeft(busRect), stageRect);

        for (const laneId of laneIds) {
          const laneRect = laneRects[laneId];
          if (!laneRect) continue;

          const laneOut = toLocal(centerRight(laneRect), stageRect);

          result.push({
            key: `lane-${laneId}-to-bus-${r.id}`,
            d: cablePath(laneOut, busIn, 0.5),
            active: isActiveBus,
          });
        }

        const busOut = toLocal(centerRight(busRect), stageRect);
        result.push({
          key: `bus-${r.id}-to-out`,
          d: cablePath(busOut, outPort, 0.35),
          active: isActiveBus,
        });
      }
    }

    return result;
  }, [layout, rows, activeBusId, laneIdsByBus]);

  return (
    <div className={styles.wrap}>
      <div className={styles.body}>
        <Card className="h-full p-6 relative overflow-hidden">
          {/* Stage */}
          <div ref={stageRef} className={styles.stageWrap}>
            <svg className={styles.stageSvg}>
              <defs>
                <filter
                  id={styles.glowFilterId}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {cables.map((c) => (
                <path
                  key={c.key}
                  d={c.d}
                  fill="none"
                  stroke={c.active ? strokeFor(true) : strokeFor(false)}
                  strokeWidth={strokeW(c.active)}
                  strokeLinecap="round"
                  filter={c.active ? `url(#${styles.glowFilterId})` : "none"}
                />
              ))}
            </svg>
          </div>

          {/* Content */}
          <div className={styles.content}>
            <div className="grid h-full" style={styles.grid}>
              {/* INPUT */}
              <div className={styles.portCell}>
                <div ref={inputRef}>
                  <NodePill label="INPUT" />
                </div>
              </div>

              {/* LANES */}
              <div className={styles.lanesCol}>
                {rows.map((r) => {
                  const isActive = r.id === activeBusId;
                  const laneIds = laneIdsByBus[r.id] || [];

                  return (
                    <div key={r.id} className={styles.laneGroup}>
                      <div className={styles.laneHeader}>
                        <MiniLabel>{r.id}</MiniLabel>
                        <MiniLabel>
                          {r.mode === "linear"
                            ? "Linear"
                            : r.mode === "parallel"
                            ? "Parallel"
                            : "LCR"}
                        </MiniLabel>
                      </div>

                      <div className={styles.laneList}>
                        {laneIds.map((laneId) => (
                          <div
                            key={laneId}
                            ref={(el) => {
                              if (el) laneRefs.current[laneId] = el;
                            }}
                          >
                            <NodePill label={laneId} active={isActive} />
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* BUSES */}
              <div className={styles.busesCol}>
                {rows.map((r) => {
                  const isActive = r.id === activeBusId;
                  return (
                    <div key={r.id} className={styles.portCell}>
                      <div
                        ref={(el) => {
                          if (el) busRefs.current[r.id] = el;
                        }}
                      >
                        <NodePill label={r.id} active={isActive} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* OUTPUT */}
              <div className={styles.portCell}>
                <div ref={outputRef}>
                  <NodePill label="OUTPUT" />
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}