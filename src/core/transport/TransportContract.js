/**
 * Transport contract (runtime + JSDoc).
 * This file is the “lock” so UI/core won’t change when ElectronTransport arrives.
 */

/**
 * @typedef {any} SnapshotLike
 */

/**
 * Canonical syscalls. Keep these stable.
 *
 * @typedef {(
 *   | { name: "selectActiveBus", busId: string }
 *   | { name: "setRoutingMode", busId: string, mode: "linear"|"parallel"|"lcr" }
 *   | { name: "syncView" }
 *   | { name: "setPerformMode" }
 *   | { name: "setEditMode" }
 *   | { name: "setLooperMode", looperType: "pre-fx"|"post-fx" }
 *   | { name: "setAutomationMode" }
 *   | { name: "setTunerMode" }
 *   | { name: "toggleRecArm", trackGuid: string, value: boolean }
 *   | { name: "toggleMute",   trackGuid: string, value: boolean }
 *   | { name: "toggleSolo",   trackGuid: string, value: boolean }
 *   | { name: "setVol",       trackGuid: string, value: number }
 *   | { name: "setTrackPan",       trackGuid: string, value: number }
 *   | { name: "setTrackVolume",       trackGuid: string, value: number }
 *   | { name: "setBusVolume",       trackGuid: string, value: number }
 *   | { name: "setPan",       trackGuid: string, value: number }
 *   | { name: "toggleFx",     fxGuid: string, value: boolean }
 *   | { name: "reorderFx",    trackGuid: string, fromIndex: number, toIndex: number }
 *   | { name: "getPluginParams", fxGuid: string }
 *   | { name: "setParamValue", fxGuid: string, paramIdx: number, value01: number }
 *   | { name: "startLooperRecord", recordCount: number }
 *   | { name: "stopLooperRecord" }
 *   | { name: "startLooperPlayback" }
 *   | { name: "stopLooperPlayback" }
 *   | { name: "undoLooperOverdub" }
 *   | { name: "undoLooperRecord" }
 *   | { name: "clearLooper" }
 *   | { name: "toggleLooperType", looperType: "pre-fx"|"post-fx" }
 *   | { name: string, [k: string]: any } // escape hatch (keep last)
 * )} Syscall
 */

/**
 * @typedef {{ ok:true,  seq:number|null } | { ok:false, error:string }} BootResult
 * @typedef {{ ok:true } | { ok:false, error:string }} SyscallResult
 */

/**
 * @typedef {Object} Transport
 * @property {() => Promise<BootResult>} boot
 * @property {() => SnapshotLike} getSnapshot
 * @property {(cb:(snap:SnapshotLike)=>void) => () => void} subscribe
 * @property {(req:Syscall) => Promise<SyscallResult>} syscall
 * @property {(on:boolean)=>void} [setMetersEnabled] // optional dev helper
 */

// Export something so bundlers keep the file (optional)
export const TRANSPORT_CONTRACT_VERSION = "rfx_transport_contract_v1";
