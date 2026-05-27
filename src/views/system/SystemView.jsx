import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { styles } from "./_styles";
import { ItemRow, Pill, Btn, Toggle } from "./components/_index";
import { Panel, PanelBody, PanelHeader } from "../../components/ui/Panel";
import { Stripe, } from "../../components/ui/Stripe";

/**
 * SystemView
 * - Settings that are NOT simply “command REAPER”
 * - Placeholder UI now; wire into native modules / OS services later
 * - Left-column accordion with right-column visual/detail panel
 */

function SmallToggle({ value, onChange }) {
  return (
    <div style={{ transform: "scale(0.82)", transformOrigin: "right center" }}>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}

function AccordionSection({ id, title, openSection, setOpenSection, children }) {
  const isOpen = openSection === id;

  return (
    <div
      style={{
        border: "1px solid #2a2e35",
        borderRadius: 16,
        overflow: "hidden",
        background: "#090c0f",
      }}
    >
      <button
        type="button"
        onClick={() => setOpenSection(isOpen ? null : id)}
        style={{
          width: "100%",
          height: 64,
          border: "none",
          background: isOpen ? "#12161b" : "#090c0f",
          color: "#f4f4f4",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 18px",
          fontWeight: 850,
          fontSize: 18,
          cursor: "pointer",
        }}
      >
        <span>{title}</span>

        <span
          style={{
            opacity: 0.8,
            fontSize: 18,
            lineHeight: 1,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 160ms ease",
          }}
        >
          ▾
        </span>
      </button>

      {isOpen ? (
        <div
          style={{
            borderTop: "1px solid #2a2e35",
            padding: 14,
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function SystemItemRow({ title, desc, right }) {
  return (
    <ItemRow
      title={
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
          }}
        >
          {title}
        </span>
      }
      desc={desc}
      right={right}
    />
  );
}

export function SystemView() {
  const navigate = useNavigate();

  const [openSection, setOpenSection] = useState(null);

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
    navigate("/", { replace: true });

    setTimeout(() => {
      window.location.reload();
    }, 0);
  }

  return (
    <div className={styles.wrap}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: 58,
          bottom: 0,
          width: 2,
          zIndex: 1,
          pointerEvents: "none",
        }}
      >
        <Stripe width={8} color="#00aaff" stripeSize={1} gapSize={2} angle={120} />
      </div>
      <div
        className={styles.header}
        style={{
          marginLeft: 30,
          marginBottom: 18,
        }}
      >
        <div
          className={styles.title}
          style={{
            fontSize: 34,
            fontWeight: 900,
            letterSpacing: "0.08em",
          }}
        >
          SYSTEM
        </div>
      </div>

      <div className={styles.body}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(420px, 0.95fr) minmax(420px, 1.05fr)",
            gap: 16,
            alignItems: "start",
          }}
        >
          <div
            style={{
              display: "grid",
              gap: 14,
            }}
          >
            <AccordionSection
              id="connectivity"
              title="Connectivity"
              openSection={openSection}
              setOpenSection={setOpenSection}
            >
              <SystemItemRow
                title="Wi-Fi"
                desc={wifiEnabled ? "Enabled" : "Disabled"}
                right={
                  <SmallToggle
                    value={wifiEnabled}
                    onChange={setWifiEnabled}
                  />
                }
              />
              <SystemItemRow
                title="Bluetooth"
                desc={btEnabled ? "Enabled" : "Disabled"}
                right={
                  <SmallToggle value={btEnabled} onChange={setBtEnabled} />
                }
              />
              <SystemItemRow
                title="MIDI"
                desc={midiEnabled ? "Enabled" : "Disabled"}
                right={
                  <SmallToggle
                    value={midiEnabled}
                    onChange={setMidiEnabled}
                  />
                }
              />
            </AccordionSection>

            <AccordionSection
              id="plugins"
              title="Plugins"
              openSection={openSection}
              setOpenSection={setOpenSection}
            >
              <SystemItemRow
                title="Plugin Manager"
                desc="Install guidance, supported plugins, scans, and plugin diagnostics"
                right={
                  <Btn onClick={() => navigate("/system/plugins")}>Open</Btn>
                }
              />
              <SystemItemRow
                title="Scan plugins"
                desc="Rescan installed VST3 plugins"
                right={
                  <Btn onClick={() => console.log("[System] scan plugins")}>
                    Scan
                  </Btn>
                }
              />
              <SystemItemRow
                title="Plugin diagnostics"
                desc="Export plugin scan logs and compatibility data"
                right={
                  <Btn
                    onClick={() =>
                      console.log("[System] export plugin diagnostics")
                    }
                  >
                    Export
                  </Btn>
                }
              />
            </AccordionSection>

            <AccordionSection
              id="device"
              title="Devices"
              openSection={openSection}
              setOpenSection={setOpenSection}
            >
              <SystemItemRow
                title="User PC"
                desc={deviceStatus}
                right={<Pill>{deviceStatus}</Pill>}
              />
              <SystemItemRow
                title="Pair / Connect"
                desc="Connect RFX to a companion app or desktop controller"
                right={
                  <Btn onClick={() => console.log("[System] connect device")}>
                    Connect
                  </Btn>
                }
              />
              <SystemItemRow
                title="Forget device"
                desc="Clear saved pairing and connection info"
                right={
                  <Btn onClick={() => console.log("[System] forget device")}>
                    Forget
                  </Btn>
                }
              />
            </AccordionSection>

            <AccordionSection
              id="update"
              title="Update"
              openSection={openSection}
              setOpenSection={setOpenSection}
            >
              <SystemItemRow
                title="Current build"
                desc={`${buildInfo.version} • ${buildInfo.channel}`}
                right={<Pill>{buildInfo.channel}</Pill>}
              />
              <SystemItemRow
                title="Check for updates"
                desc="Downloads and installs RFX updates (not REAPER)"
                right={
                  <Btn onClick={() => console.log("[System] check updates")}>
                    Check
                  </Btn>
                }
              />
              <SystemItemRow
                title="Install from USB"
                desc="Offline update flow for touring rigs"
                right={
                  <Btn onClick={() => console.log("[System] install usb")}>
                    Install
                  </Btn>
                }
              />
            </AccordionSection>

            <AccordionSection
              id="debug"
              title="Debug"
              openSection={openSection}
              setOpenSection={setOpenSection}
            >
              <SystemItemRow
                title="Developer mode"
                desc={devMode ? "Enabled (extra logs/tools visible)" : "Disabled"}
                right={<SmallToggle value={devMode} onChange={setDevMode} />}
              />
              <SystemItemRow
                title="Open logs"
                desc="View system / transport logs"
                right={
                  <Btn onClick={() => console.log("[System] open logs")}>
                    Open
                  </Btn>
                }
              />
              <SystemItemRow
                title="Diagnostics"
                desc="Export a debug bundle for support"
                right={
                  <Btn
                    onClick={() => console.log("[System] export diagnostics")}
                  >
                    Export
                  </Btn>
                }
              />
              <SystemItemRow
                title="Restart UI"
                desc="Soft restart (frontend only)"
                right={<Btn onClick={handleRestart}>Restart</Btn>}
              />
            </AccordionSection>
          </div>

          <Panel
            style={{
              height: "calc(100vh - 158px)",
              minHeight: 400,
              borderRadius: 18,
            }}
          >
            <PanelHeader>
              <div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 850,
                    color: "#f4f4f4",
                  }}
                >
                  System Detail
                </div>
                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    color: "#b9bec7",
                  }}
                >
                  Select a system option to view setup guidance, visuals, or
                  device status here.
                </div>
              </div>
            </PanelHeader>

            <PanelBody>
              <div
                style={{
                  height: "calc(100vh - 250px)",
                  minHeight: 390,
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 16,
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  padding: 28,
                  color: "#8f96a3",
                  fontSize: 15,
                  lineHeight: 1.45,
                }}
              >
                Visual configuration panel placeholder
              </div>
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}