// Documentation-only inventory of places that send RFX intents.
// This file is intentionally all comments. It has no imports, exports, or runtime purpose.
//
// To refresh the direct-call list:
//   rg -n "dispatchIntent\s*\(" src lua
//
// To refresh the useIntent wrapper list:
//   rg -n "\buseIntent\b|\bintent\?\.\(|\bintent\(" src

// =============================================================================
// Direct dispatchIntent(...) callsites
// =============================================================================

// src/core/useIntent.js
// function useIntent()
// - Returns the stable UI command boundary.
// - Every caller of the returned `intent(...)` function eventually reaches:
//
// return React.useCallback(
//   (intent) => dispatchIntent(intent),
//   [dispatchIntent]
// );

// src/core/midi/MidiRuntime.js
// function MidiRuntime()
// - initMidi receives a dispatchIntent adapter.
// - Adds session looperType to setLooperMode intents before forwarding.
//
// dispatchIntent: (intent) => {
//   const nextIntent =
//     intent?.name === "setLooperMode"
//       ? { ...intent, looperType: useRfxStore.getState().session?.looperType ?? DEFAULT_LOOPER_TYPE }
//       : intent;
//
//   return dispatchIntent(nextIntent);
// },

// src/core/modes/ModeManager.js
// class ModeManager
// function setMode(nextMode, options)
// - Dispatches the mode intent again when the mode is unchanged and
//   dispatchIfUnchanged is true.
//
// void this.dispatchIntent({ name: intentName });
//
// - Dispatches the mode intent when switching to a new RFX mode.
//
// void this.dispatchIntent({ name: intentName });

// src/views/edit/components/mixControls/BusMixControls.jsx
// function BusMixControls({ busId })
// function endGesture(finalValue01)
// - Commits a bus volume drag.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid: targetGuid,
//   value: clamp01(finalValue01),
//   phase: "commit",
//   gestureId,
// });
//
// const resetBusVol = React.useCallback(...)
// - Commits the default bus volume after double tap.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid: targetGuid,
//   value: next,
//   phase: "commit",
//   gestureId,
// });
//
// const busScrub = useScrubValue({ onChange })
// - Previews bus volume while scrubbing.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid: targetGuid,
//   value: clamped,
//   phase: "preview",
//   gestureId: gestureIdRef.current,
// });

// src/views/edit/components/mixControls/TrackMixControls.jsx
// function TrackMixControls({ trackGuid })
// function endVolGesture(finalValue01)
// - Commits a track volume drag.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid,
//   value: clamp01(finalValue01),
//   phase: "commit",
//   gestureId,
// });
//
// function endPanGesture(finalValue01)
// - Commits a track pan drag.
//
// dispatchIntent({
//   name: "setTrackPan",
//   trackGuid,
//   value: clamp01(finalValue01),
//   phase: "commit",
//   gestureId,
// });
//
// const resetTrackVol = React.useCallback(...)
// - Commits the default track volume after double tap.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid,
//   value: next,
//   phase: "commit",
//   gestureId,
// });
//
// const resetTrackPan = React.useCallback(...)
// - Commits the default track pan after double tap.
//
// dispatchIntent({
//   name: "setTrackPan",
//   trackGuid,
//   value: next,
//   phase: "commit",
//   gestureId,
// });
//
// const volScrub = useScrubValue({ onChange })
// - Previews track volume while scrubbing.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid,
//   value: clamped,
//   phase: "preview",
//   gestureId: volGestureIdRef.current,
// });
//
// const panScrub = useScrubValue({ onChange })
// - Previews track pan while scrubbing.
//
// dispatchIntent({
//   name: "setTrackPan",
//   trackGuid,
//   value: clamped,
//   phase: "preview",
//   gestureId: panGestureIdRef.current,
// });

// src/views/edit/plugin/PluginView.jsx
// function PluginView()
// const onParamScrub = React.useCallback(...)
// - Previews a plugin parameter drag.
//
// dispatchIntent({
//   name: "setParamValue",
//   trackGuid,
//   fxGuid,
//   paramIdx: idx,
//   value01: clamp01(next01),
//   phase: "preview",
//   gestureId,
// });
//
// const onParamCommit = React.useCallback(...)
// - Commits a plugin parameter drag.
//
// dispatchIntent({
//   name: "setParamValue",
//   trackGuid,
//   fxGuid,
//   paramIdx: idx,
//   value01: clamp01(final01),
//   phase: "commit",
//   gestureId,
// });

// src/views/modes/perform/PerformView.jsx
// function PerformView()
// const onSliderChange = React.useCallback(...)
// - Previews the mapped bus volume from the perform slider.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid: normBusId(mappedBusId),
//   value: clamp01(next01),
//   phase: "preview",
//   gestureId: `perfSlider:${activeId}`,
// });
//
// const onSliderCommit = React.useCallback(...)
// - Commits the mapped bus volume from the perform slider.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   trackGuid: normBusId(mappedBusId),
//   value: clamp01(value01),
//   phase: "commit",
//   gestureId: `perfSlider:${activeId}`,
// });

// src/views/modes/looper/LooperView.jsx
// function LooperView()
// const dispatchLooperIntent = useCallback(...)
// - Generic looper command wrapper. The many dispatchLooperIntent(...) calls below
//   are indirect calls into dispatchIntent.
//
// void dispatchIntent(payload ? { name, ...payload } : { name });
//
// const dispatchDestinationExpression = useCallback(...)
// - Previews/commits destination expression mapped plugin params.
//
// dispatchIntent({
//   name: "setParamValue",
//   phase,
//   gestureId,
//   trackGuid: target.trackGuid,
//   fxGuid: String(target.fxGuid),
//   paramIdx: Number(target.paramIdx),
//   value01: target.invert === true ? clamp01(1 - normalized) : normalized,
// });
//
// - Previews/commits destination expression mapped bus volume.
//
// dispatchIntent({
//   name: "setTrackVolume",
//   phase,
//   gestureId,
//   trackGuid: expressionBusVolumeTarget,
//   value: normalized,
// });

// src/components/controls/knobs/KnobRow.jsx
// function KnobRow(...)
// const onKnobChange = React.useCallback(...)
// - Previews a single mapped parameter.
//
// dispatchIntent({
//   name: "setParamValue",
//   phase: "preview",
//   gestureId: `knob:${busKey}:${knobId}`,
//   trackGuid: target.trackGuid,
//   fxGuid: String(target.fxGuid),
//   paramIdx: Number(target.paramIdx),
//   value01: target?.invert === true ? clamp01(1 - v01) : v01,
// });
//
// - Previews each mapped parameter for grouped knob targets.
//
// dispatchIntent({
//   name: "setParamValue",
//   phase: "preview",
//   gestureId: `knob:${busKey}:${knobId}`,
//   trackGuid: target.trackGuid,
//   fxGuid: target.fxGuid,
//   paramIdx: target.paramIdx,
//   value01: nextValue,
// });
//
// const onKnobCommit = React.useCallback(...)
// - Commits each mapped parameter for a knob gesture.
//
// dispatchIntent({
//   name: "setParamValue",
//   phase: "commit",
//   gestureId: `knob:${busKey}:${knobId}`,
//   trackGuid: target.trackGuid,
//   fxGuid,
//   paramIdx,
//   value01: commitValue,
// });
//
// const onMappedParamChange = React.useCallback(...)
// - Previews and immediately commits a mapped parameter edit from the expanded map card.
//
// dispatchIntent({
//   name: "setParamValue",
//   phase: "preview",
//   gestureId,
//   trackGuid: entry.trackGuid,
//   fxGuid: entry.fxGuid,
//   paramIdx: entry.paramIdx,
//   value01,
// });
//
// dispatchIntent({
//   name: "setParamValue",
//   phase: "commit",
//   gestureId,
//   trackGuid: entry.trackGuid,
//   fxGuid: entry.fxGuid,
//   paramIdx: entry.paramIdx,
//   value01,
// });

// =============================================================================
// Indirect useIntent(...) callsites
// =============================================================================

// src/core/useIntentBuffered.js
// function useIntentBuffered()
// const flush = React.useCallback(...)
// - Sends each buffered intent through the `intent` function returned by useIntent().
//
// for (const it of items) {
//   intentRef.current?.(it);
// }

// src/views/boot/components/BootGate.jsx
// function BootGate(...)
// const runBoot = React.useCallback(...)
// - Syncs the view after boot reaches READY/reaperReady.
//
// await intent({ name: "syncView" });
//
// React.useEffect(... transport.onReaperReady ...)
// - Syncs the view after a reaper-ready event.
//
// await intent({ name: "syncView" });

// src/views/edit/EditView.jsx
// function TrackStrip(...)
// function addFromInstalled(picked)
// - Adds a plugin to the active track.
//
// intent?.({ name: "addFx", trackGuid: tg, fxRaw });
//
// function toggleFx(fxId)
// - Toggles plugin enabled state.
//
// intent?.({ name: "toggleFx", fxGuid: fxId, trackGuid: tg, value: nextEnabled });
//
// function removeFx(fxId)
// - Removes a plugin.
//
// intent?.({ name: "removeFx", fxGuid: fxId, trackGuid: tg });
//
// function reorderFx(srcId, dstId)
// - Reorders plugins in a track chain.
//
// intent?.({ name: "reorderFx", trackGuid: tg, fromIndex: srcIdx, toIndex: dstIdx });
//
// function goParams(fxId)
// - Requests plugin params before navigating to the plugin subview.
//
// intent?.({ name: "getPluginParams", fxGuid: fxId });
//
// function EditView()
// function setMode(nextMode)
// - Changes the routing mode for the selected bus.
//
// intent({ name: "setRoutingMode", busId: bus.id, mode: m });

// src/views/edit/plugin/PluginView.jsx
// function PluginView()
// React.useEffect(... fxGuid/truthManifest ...)
// - Requests plugin params when the manifest is missing.
//
// intent?.({ name: "getPluginParams", fxGuid });

// src/views/modes/perform/PerformView.jsx
// function PerformView()
// BusCardArea onSelectBus
// - Selects the active perform bus.
//
// intent({ name: "selectActiveBus", busId });

// =============================================================================
// Indirect dispatchLooperIntent(...) callsites in LooperView
// =============================================================================

// src/views/modes/looper/LooperView.jsx
// function LooperView()
// const handleTapTempo = useCallback(...)
//   dispatchLooperIntent("setTempo", { bpm: nextBpm });
//
// const toggleClick = useCallback(...)
//   dispatchLooperIntent("setClickEnabled", { enabled: nextClickEnabled });
//
// const toggleCountIn = useCallback(...)
//   dispatchLooperIntent("setCountInEnabled", { enabled: nextCountInEnabled });
//
// const toggleLoopLength = useCallback(...)
//   dispatchLooperIntent("setLoopLengthEnabled", { enabled: nextEnabled });
//
// const cycleLoopLength = useCallback(...)
//   dispatchLooperIntent("setLoopLength", { bars: nextLoopLength });
//
// const updateTimeSignature = useCallback(...)
//   dispatchLooperIntent("setTimeSignature", {
//     beatsPerMeasure: nextBeatsPerMeasure,
//     noteLength: nextNoteLength,
//   });
//
// const handleLooperControl = useCallback(...)
//   dispatchLooperIntent("stopLooperPlayback");
//   dispatchLooperIntent("clearLooper");
//   dispatchLooperIntent("setLoopLengthEnabled", { enabled: false });
//   dispatchLooperIntent("startLooperPlayback");
//   dispatchLooperIntent("undoLooperOverdub");
//   dispatchLooperIntent("undoLooperRecord");
//   dispatchLooperIntent("toggleLooperType", { looperType: nextLooperType.id });
//   dispatchLooperIntent("startLooperRecord", {
//     recordCount,
//     inputGain01: playbackMasterVolumeRef.current,
//   });
//   dispatchLooperIntent("stopLooperRecord");

// =============================================================================
// Intent name strings
// =============================================================================

// "addFx"
// "clearLooper"
// "getPluginParams"
// "removeFx"
// "reorderFx"
// "selectActiveBus"
// "setAutomationMode"
// "setClickEnabled"
// "setCountInEnabled"
// "setEditMode"
// "setLooperMode"
// "setLoopLength"
// "setLoopLengthEnabled"
// "setParamValue"
// "setPerformMode"
// "setRoutingMode"
// "setTempo"
// "setTimeSignature"
// "setTrackPan"
// "setTrackVolume"
// "setTunerMode"
// "startLooperPlayback"
// "startLooperRecord"
// "stopLooperPlayback"
// "stopLooperRecord"
// "syncView"
// "toggleFx"
// "toggleLooperType"
// "undoLooperOverdub"
// "undoLooperRecord"
