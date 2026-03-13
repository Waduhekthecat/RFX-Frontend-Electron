// src/app/nav/Nav.jsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useTransport } from "../../core/transport/TransportProvider";
import { styles, cx } from "./_styles";

const BASE_TABS = [
  { label: "Perform", to: "/" },
  { label: "Edit", to: "/edit" },
  { label: "Routing", to: "/routing" },
  { label: "System", to: "/system" },
];

function useVM() {
  const t = useTransport();
  const [vm, setVm] = React.useState(() => t.getSnapshot());
  React.useEffect(() => t.subscribe(setVm), [t]);
  return vm;
}

function normalizeMode(m) {
  const x = String(m || "linear").toLowerCase();
  if (x === "lcr") return "lcr";
  if (x === "parallel") return "parallel";
  return "linear";
}

function ModeBadge({ mode }) {
  const m = normalizeMode(mode);
  const label = m === "linear" ? "LINEAR" : m === "parallel" ? "PAR" : "LCR";

  const tone =
    m === "lcr"
      ? "bg-blue-400/15 text-blue-200 border-blue-400/25"
      : m === "parallel"
        ? "bg-yellow-400/15 text-yellow-200 border-yellow-400/25"
        : "bg-white/10 text-white/75 border-white/15";

  return (
    <span
      className={cx(styles.badgeBase, tone)}
      title={`Routing mode: ${label}`}
    >
      {label}
    </span>
  );
}

function StatusDot({ label, active }) {
  return (
    <div className={styles.statusWrap}>
      <div
        className={cx(
          styles.statusDotBase,
          active ? "bg-green-400" : "bg-red-500"
        )}
      />
      <span className={styles.statusLabel}>{label}</span>
    </div>
  );
}

export function Nav() {
  const vm = useVM();

  const tabs = React.useMemo(() => {
    const devTab = import.meta.env.DEV
      ? [{ label: "Core", to: "/dev/core" }]
      : [];
    return [...BASE_TABS, ...devTab];
  }, []);

  const activeBusId = vm.activeBusId || "FX_1";
  const mode = normalizeMode(vm.busModes?.[activeBusId] || "linear");

  return (
    <div className={styles.wrap}>
      {/* LEFT */}
      <div className={styles.left}>
        <div className={styles.brand}>RFX</div>
        <div className={styles.env}>Beta</div>

        <div className={styles.divider} />

        <div className={styles.activeRow}>
          <span className={styles.activeLabel}>Active</span>
          <span className={styles.activeBus}>{activeBusId}</span>
          <ModeBadge mode={mode} />
        </div>
      </div>

      {/* CENTER */}
      <div className={styles.centerOuter}>
        <div className={styles.tabsWrap}>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                cx(
                  styles.tabBase,
                  isActive ? styles.tabActive : styles.tabIdle
                )
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>

      {/* RIGHT */}
      <div className={styles.right}>
        <StatusDot label="OSC" active />
        <StatusDot label="REAPER" active />
        <StatusDot label="AUDIO" active />
      </div>
    </div>
  );
}