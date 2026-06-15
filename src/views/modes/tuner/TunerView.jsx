import React from "react";
import { Panel, Inset } from "../../../components/ui/Panel";

export function TunerView() {
  return (
    <div className="h-full w-full p-3 min-h-0">
      <div className="h-full min-h-0 flex flex-col gap-3">
        <Panel className="min-h-0">
          <div className="px-4 py-3 flex items-center justify-between gap-3">
            <div className="text-[18px] font-semibold tracking-wide truncate">
              TUNER
            </div>
          </div>
        </Panel>

        <Panel className="flex-1 min-h-0">
          <div className="p-4 h-full min-h-0">
            <Inset className="h-full min-h-0 p-4" />
          </div>
        </Panel>
      </div>
    </div>
  );
}