import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styles } from "./_styles";
import { ItemRow, Section, Pill, Btn, Toggle } from "./components/_index";

/**
 * SystemView
 * - Settings that are NOT simply “command REAPER”
 * - Placeholder UI now; wire into native modules / OS services later
 * - Touch-friendly, simple cards
 */

export function SystemView() {
  const navigate = useNavigate();

  // Local-only state for now (wire later)
  const [wifiEnabled, setWifiEnabled] = useState(false);
  const [btEnabled, setBtEnabled] = useState(false);
  const [midiEnabled, setMidiEnabled] = useState(true);
  const [devMode, setDevMode] = useState(false);

  const deviceStatus = useMemo(() => "Not connected", []);

  const buildInfo = useMemo(
    () => ({
      version: "RFX (dev)",
      channel: "local",
    }),
    []
  );

  function handleRestart() {
    // First move the app back to the Perform route.
    navigate("/", { replace: true });

    // Then reload on the next tick so the browser reloads the root route
    // instead of the current /system route.
    setTimeout(() => {
      window.location.reload();
    }, 0);
  }

  return (
    <div className={styles.wrap}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>System</div>
        <div className={styles.subtitle}>
          Device settings, connectivity, updates, and debug tools.
        </div>
      </div>

      {/* Body */}
      <div className={styles.body}>
        <div className={styles.grid}>
          {/* Connectivity */}
          <Section title="Connectivity">
            <ItemRow
              title="Wi-Fi"
              desc={wifiEnabled ? "Enabled" : "Disabled"}
              right={<Toggle value={wifiEnabled} onChange={setWifiEnabled} />}
            />
            <ItemRow
              title="Bluetooth"
              desc={btEnabled ? "Enabled" : "Disabled"}
              right={<Toggle value={btEnabled} onChange={setBtEnabled} />}
            />
            <ItemRow
              title="MIDI"
              desc={midiEnabled ? "Enabled" : "Disabled"}
              right={<Toggle value={midiEnabled} onChange={setMidiEnabled} />}
            />
          </Section>

          {/* Companion / Device */}
          <Section title="Connect to device">
            <ItemRow
              title="User PC"
              desc={deviceStatus}
              right={<Pill>{deviceStatus}</Pill>}
            />
            <ItemRow
              title="Pair / Connect"
              desc="Connect RFX to a companion app or desktop controller"
              right={
                <Btn onClick={() => console.log("[System] connect device")}>
                  Connect
                </Btn>
              }
            />
            <ItemRow
              title="Forget device"
              desc="Clear saved pairing and connection info"
              right={
                <Btn onClick={() => console.log("[System] forget device")}>
                  Forget
                </Btn>
              }
            />
          </Section>

          {/* Updates */}
          <Section title="Update">
            <ItemRow
              title="Current build"
              desc={`${buildInfo.version} • ${buildInfo.channel}`}
              right={<Pill>{buildInfo.channel}</Pill>}
            />
            <ItemRow
              title="Check for updates"
              desc="Downloads and installs RFX updates (not REAPER)"
              right={
                <Btn onClick={() => console.log("[System] check updates")}>
                  Check
                </Btn>
              }
            />
            <ItemRow
              title="Install from USB"
              desc="Offline update flow for touring rigs"
              right={
                <Btn onClick={() => console.log("[System] install usb")}>
                  Install
                </Btn>
              }
            />
          </Section>

          {/* Debug */}
          <Section title="Debug">
            <ItemRow
              title="Developer mode"
              desc={devMode ? "Enabled (extra logs/tools visible)" : "Disabled"}
              right={<Toggle value={devMode} onChange={setDevMode} />}
            />
            <ItemRow
              title="Open logs"
              desc="View system / transport logs"
              right={
                <Btn onClick={() => console.log("[System] open logs")}>
                  Open
                </Btn>
              }
            />
            <ItemRow
              title="Diagnostics"
              desc="Export a debug bundle for support"
              right={
                <Btn onClick={() => console.log("[System] export diagnostics")}>
                  Export
                </Btn>
              }
            />
            <ItemRow
              title="Restart UI"
              desc="Soft restart (frontend only)"
              right={<Btn onClick={handleRestart}>Restart</Btn>}
            />
          </Section>
        </div>
      </div>
    </div>
  );
}