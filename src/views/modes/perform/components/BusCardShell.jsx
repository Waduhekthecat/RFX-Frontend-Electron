import { Panel, PanelHeader, PanelBody, Inset } from "../../../components/ui/Panel";
import { Badge } from "../../../components/ui/Badge";

export function BusCardShell({ title = "FX_1", active = false }) {
  return (
    <Panel active={active} className="h-[160px] flex flex-col">
      <PanelHeader>
        <div className="flex items-center gap-2">
          <span className="font-semibold">{title}</span>
          {active && <Badge tone="active">ACTIVE</Badge>}
        </div>
        <span className="text-white/40">LCR</span>
      </PanelHeader>

      <PanelBody className="flex-1 min-h-0">
        <Inset className="h-full" />
      </PanelBody>
    </Panel>
  );
}