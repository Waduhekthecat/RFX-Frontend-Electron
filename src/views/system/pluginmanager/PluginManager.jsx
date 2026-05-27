import React from "react";
import { useNavigate } from "react-router-dom";
import { styles } from "../_styles";
import { Section, ItemRow, Pill, Btn } from "../components/_index";

const SUPPORTED_PLUGINS = [
  {
    name: "Neural DSP",
    manufacturer: "Neural DSP",
    status: "Supported",
    license: "iLok / Vendor Account",
    installType: "Vendor installer",
    url: "https://neuraldsp.com",
    notes: [
      "Install the VST3 version.",
      "Use the default installer path.",
      "Activate before scanning in RFX.",
    ],
  },
  {
    name: "STL Tones",
    manufacturer: "STL Tones",
    status: "Supported",
    license: "Vendor Account / iLok depending on product",
    installType: "Vendor installer",
    url: "https://www.stltones.com",
    notes: [
      "Install the VST3 version.",
      "Open the plugin once if activation is required.",
      "Rescan after activation.",
    ],
  },
  {
    name: "Valhalla DSP",
    manufacturer: "Valhalla DSP",
    status: "Supported",
    license: "Serial / Vendor Account",
    installType: "Vendor installer",
    url: "https://valhalladsp.com",
    notes: [
      "Install VST3 effects only.",
      "Use default plugin paths.",
      "Recommended for reverb/delay chains.",
    ],
  },
];

function PluginCard({ plugin }) {
  return (
    <Section title={plugin.name}>
      <ItemRow
        title="Manufacturer"
        desc={plugin.manufacturer}
        right={<Pill>{plugin.status}</Pill>}
      />
      <ItemRow title="Install type" desc={plugin.installType} />
      <ItemRow title="License" desc={plugin.license} />

      <div style={{ padding: "14px 16px", borderTop: "1px solid #262a30" }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Beta notes</div>
        <ul style={{ margin: 0, paddingLeft: 20, color: "#c9c9c9" }}>
          {plugin.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>

      <ItemRow
        title="Download / purchase"
        desc="Open the official vendor website"
        right={
          <Btn onClick={() => window.open(plugin.url, "_blank", "noopener")}>
            Open
          </Btn>
        }
      />
    </Section>
  );
}

export function PluginManager() {
  const navigate = useNavigate();

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <div className={styles.title}>Plugin Manager</div>
        <div className={styles.subtitle}>
          Install guidance, supported plugins, scans, and plugin diagnostics.
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.grid}>
          <Section title="Plugin tools">
            <ItemRow
              title="Back to System"
              desc="Return to system settings"
              right={<Btn onClick={() => navigate("/system")}>Back</Btn>}
            />
            <ItemRow
              title="Scan plugins"
              desc="Rescan installed VST3 plugins"
              right={
                <Btn onClick={() => console.log("[Plugins] scan plugins")}>
                  Scan
                </Btn>
              }
            />
            <ItemRow
              title="Export diagnostics"
              desc="Export plugin scan logs and compatibility data"
              right={
                <Btn
                  onClick={() =>
                    console.log("[Plugins] export plugin diagnostics")
                  }
                >
                  Export
                </Btn>
              }
            />
          </Section>

          <Section title="Custom VST3 install">
            <ItemRow
              title="Beta support"
              desc="Only standard VST3 installs are officially supported for beta"
              right={<Pill>VST3</Pill>}
            />
            <ItemRow
              title="Recommended path"
              desc="Use the plugin vendor’s default VST3 installation location"
            />
            <ItemRow
              title="After installation"
              desc="Return to RFX and run Scan Plugins"
            />
          </Section>

          {SUPPORTED_PLUGINS.map((plugin) => (
            <PluginCard key={plugin.name} plugin={plugin} />
          ))}
        </div>
      </div>
    </div>
  );
}