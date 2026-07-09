import React from "react";
import { NavLink } from "react-router-dom";
import { styles, cx } from "./_styles";
import { modeManager } from "../../core/modes/ModeManager";
import { RFX_MODES } from "../../core/modes/Modes";

const BASE_TABS = [
  { label: "Perform", to: "/", mode: RFX_MODES.PERFORM },
  { label: "FX", to: "/fx-modules" },
  { label: "Edit", to: "/edit", mode: RFX_MODES.EDIT },
  { label: "Looper", to: "/looper", mode: RFX_MODES.LOOPER },
  { label: "Automation", to: "/automation", mode: RFX_MODES.AUTOMATION },
  { label: "Tuner", to: "/tuner", mode: RFX_MODES.TUNER },
  { label: "Routing", to: "/routing" },
  { label: "System", to: "/system" },
];

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
  const tabs = React.useMemo(() => {
    const devTab = import.meta.env.DEV
      ? [{ label: "Core", to: "/dev/core" }]
      : [];
    return [...BASE_TABS, ...devTab];
  }, []);

  const setAppMode = React.useCallback((nextMode) => {
    modeManager.setMode(nextMode, {
      dispatchIfUnchanged: true,
      source: "ui",
    });
  }, []);

  return (
    <div className={styles.wrap}>
      {/* LEFT */}
      <div className={styles.left}>
        <div className={styles.brand}>RFX</div>
        <div className={styles.env}>Beta</div>

      </div>

      {/* CENTER */}
      <div className={styles.centerOuter}>
        <div className={styles.tabsWrap}>
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              onClick={() => {
                if (t.mode) setAppMode(t.mode);
              }}
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
