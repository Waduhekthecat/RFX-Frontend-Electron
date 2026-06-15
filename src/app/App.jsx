import React from "react";
import { BrowserRouter, HashRouter, Routes, Route, useNavigate } from "react-router-dom";

import { TransportProvider } from "../core/transport/TransportProvider";
import { BootGate } from "../views/boot/components/BootGate";
import { Shell } from "./shell/Shell";
import { Nav } from "./nav/_index";
import { PerformView } from "../views/modes/perform/PerformView";
import { EditView } from "../views/edit/EditView";
import { PluginView } from "../views/edit/plugin/PluginView";
import { RouteView } from "../views/route/RouteView";
import { SystemView } from "../views/system/SystemView";
import { CoreInspectorView } from "../views/dev/CoreInspectorView";
import { PluginManager } from "../views/system/pluginmanager/PluginManager";
import { MidiNavigationBridge } from "../core/midi/MidiCommandBridge";
import { MidiRuntime } from "../core/midi/MidiRuntime";
import { LooperView } from "../views/modes/looper/LooperView"; 
import { AutomationView } from "../views/modes/automation/AutomationView";
import { TunerView } from "../views/modes/tuner/TunerView";

const Router =
    import.meta.env.MODE === "development" ? BrowserRouter : HashRouter;

export function App() {
    return (
        <React.StrictMode>
            <TransportProvider>
                <MidiRuntime />
                <BootGate allowSkip autoStart>
                    <Router>
                        <MidiNavigationBridge />
                        <Routes>
                            <Route element={<Shell nav={<Nav />} />}>
                                <Route path="/" element={<PerformView />} />
                                <Route path="/edit" element={<EditView />}>
                                    <Route
                                        path="plugin/:trackId/:fxId"
                                        element={<PluginView />}
                                    />
                                </Route>
                                <Route path="/looper" element={<LooperView />} />
                                <Route path="/automation" element={<AutomationView />} />
                                <Route path="/tuner" element={<TunerView />} />
                                <Route path="/routing" element={<RouteView />} />
                                <Route path="/system" element={<SystemView />} />
                                <Route path="/system/plugins" element={<PluginManager />} />
                                <Route path="/dev/core" element={<CoreInspectorView />} />
                            </Route>
                        </Routes>
                    </Router>
                </BootGate>
            </TransportProvider>
        </React.StrictMode>
    );
}