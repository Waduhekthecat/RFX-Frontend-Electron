import React from "react";
import { BrowserRouter, HashRouter, Routes, Route } from "react-router-dom";
import { TransportProvider } from "../core/transport/TransportProvider";
import { BootGate } from "../views/boot/components/BootGate";
import { Shell } from "./shell/Shell";
import { Nav } from "./nav/_index";
import { PerformView } from "../views/perform/PerformView";
import { EditView } from "../views/edit/EditView";
import { PluginView } from "../views/edit/plugin/PluginView";
import { RouteView } from "../views/route/RouteView";
import { SystemView } from "../views/system/SystemView";
import { CoreInspectorView } from "../views/dev/CoreInspectorView";
import { PluginManager } from "../views/system/pluginmanager/PluginManager";
import { MidiRuntime } from "../core/midi/MidiRuntime";

const Router =
    import.meta.env.MODE === "development" ? BrowserRouter : HashRouter;

export function App() {
    return (
        <React.StrictMode>
            <TransportProvider>
                <MidiRuntime />
                <BootGate allowSkip autoStart>
                    <Router>
                        <Routes>
                            <Route element={<Shell nav={<Nav />} />}>
                                <Route path="/" element={<PerformView />} />
                                <Route path="/edit" element={<EditView />}>
                                    <Route
                                        path="plugin/:trackId/:fxId"
                                        element={<PluginView />}
                                    />
                                </Route>
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