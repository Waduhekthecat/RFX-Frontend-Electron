import React from "react";
import { Panel, PanelHeader, PanelBody, Inset } from "../../../components/ui/Panel";
import { Badge } from "../../../components/ui/Badge";
import SimpleBar from "simplebar-react";
import "simplebar-react/dist/simplebar.min.css";

import { useInstalledFxFromTransport } from "./UseInstalledFxFromTransport";
import { FilterModal } from "./FilterModal";
import { InstalledFxCardArea } from "./InstalledFxCardArea";
import {
  norm,
  normalizeInstalledFx,
  getPluginType,
  getPluginFormat,
} from "./InstalledFxUtils";
import { styles } from "../_styles";

export function InstalledFxShell({ installedFx, onPick, className = "" }) {
  const transportData = useInstalledFxFromTransport();
  const normalized = normalizeInstalledFx(installedFx ?? transportData);

  const data = normalized;
  const all = data.plugins ?? [];

  const [filterOpen, setFilterOpen] = React.useState(false);

  const [typeFilter, setTypeFilter] = React.useState("all");
  const [vendorFilter, setVendorFilter] = React.useState("all");
  const [formatFilter, setFormatFilter] = React.useState("all");

  const typeOptions = React.useMemo(() => {
    const s = new Set();
    for (const p of all) {
      const t = getPluginType(p);
      if (t) s.add(t);
    }
    const items = Array.from(s).sort();
    return [{ value: "all", label: "All Types" }].concat(
      items.map((t) => ({ value: t, label: String(t).toUpperCase() }))
    );
  }, [all]);

  const vendorOptions = React.useMemo(() => {
    const s = new Set();
    for (const p of all) {
      const v = norm(p?.vendor);
      if (v) s.add(v);
    }
    const items = Array.from(s).sort((a, b) => a.localeCompare(b));
    return [{ value: "all", label: "All Vendors" }].concat(
      items.map((v) => ({ value: v, label: v }))
    );
  }, [all]);

  const formatOptions = React.useMemo(() => {
    const s = new Set();
    for (const p of all) {
      const f = getPluginFormat(p);
      if (f) s.add(f);
    }
    const items = Array.from(s).sort();
    return [{ value: "all", label: "All Formats" }].concat(
      items.map((f) => ({ value: f, label: String(f).toUpperCase() }))
    );
  }, [all]);

  const filtered = React.useMemo(() => {
    let arr = all;

    if (typeFilter !== "all") {
      arr = arr.filter((p) => getPluginType(p) === typeFilter);
    }

    if (vendorFilter !== "all") {
      arr = arr.filter((p) => norm(p?.vendor) === vendorFilter);
    }

    if (formatFilter !== "all") {
      arr = arr.filter((p) => getPluginFormat(p) === formatFilter);
    }

    return arr;
  }, [all, typeFilter, vendorFilter, formatFilter]);

  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) +
    (vendorFilter !== "all" ? 1 : 0) +
    (formatFilter !== "all" ? 1 : 0);

  function clearFilters() {
    setTypeFilter("all");
    setVendorFilter("all");
    setFormatFilter("all");
  }

  return (
    <Panel className={[styles.InstalledFxShellRoot, className].join(" ")}>
      <PanelHeader>
        <div className={styles.InstalledFxHeaderLeft}>
          <div className={styles.InstalledFxHeaderTitle}>INSTALLED</div>

          <Badge tone="neutral" className={styles.InstalledFxHeaderBadge}>
            {filtered.length}/{all.length || data.count || 0}
          </Badge>

          {activeFilterCount > 0 ? (
            <Badge tone="neutral" className={styles.InstalledFxHeaderBadge}>
              {activeFilterCount} FILTER{activeFilterCount > 1 ? "S" : ""}
            </Badge>
          ) : null}
        </div>

        <div className={styles.InstalledFxHeaderRight}>
          <button
            type="button"
            onClick={() => setFilterOpen(true)}
            className={styles.InstalledFxFilterBtn}
          >
            Filter
          </button>
        </div>
      </PanelHeader>

      <PanelBody className="flex-1 min-h-0">
        <Inset className={styles.InstalledFxInset}>
          <SimpleBar className={styles.InstalledFxScroll}>
            <div className={styles.InstalledFxScrollInner}>
              {all.length === 0 ? (
                <div className="h-full min-h-[160px] flex items-center justify-center text-white/35 text-[12px] border border-dashed border-white/10 rounded-2xl">
                  No installed plugins loaded yet
                </div>
              ) : (
                <InstalledFxCardArea items={filtered} onPick={onPick} />
              )}
            </div>
          </SimpleBar>
        </Inset>
      </PanelBody>

      <FilterModal
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        typeValue={typeFilter}
        vendorValue={vendorFilter}
        formatValue={formatFilter}
        typeOptions={typeOptions}
        vendorOptions={vendorOptions}
        formatOptions={formatOptions}
        onTypeChange={setTypeFilter}
        onVendorChange={setVendorFilter}
        onFormatChange={setFormatFilter}
        onClear={clearFilters}
      />
    </Panel>
  );
}