local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")
local exporter = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_ExportVm.lua")
local installedExporter = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_ExportPluginList.lua")
local router = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Router.lua")
local looper = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_LooperCmds.lua")

local function get_ipc_dir()
  return "/tmp/rfx-ipc"
end

local function now_ms()
  return math.floor(reaper.time_precise() * 1000)
end

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

local function write_file(path, text)
  local f = io.open(path, "w")
  if not f then return false end
  f:write(text or "")
  f:close()
  return true
end

local function append_file(path, text)
  local f = io.open(path, "a")
  if not f then return false end
  f:write(text or "")
  f:close()
  return true
end

local function delete_file(path)
  os.remove(path)
end

local function write_json(path, obj)
  local ok, encoded = pcall(json.encode, obj)
  if not ok or not encoded then return false end
  return write_file(path, encoded)
end

local function reaper_log(target, name, _payload)
  reaper.ShowConsoleMsg(
    "[REAPER -> " ..
    tostring(target or "") ..
    "] " ..
    tostring(name or "") ..
    "\n"
  )
end

local function read_json(path)
  local raw = read_file(path)
  if not raw or raw == "" then return nil end

  local okDecode, cmdOrErr = pcall(json.decode, raw)
  if not okDecode then
    return nil, tostring(cmdOrErr)
  end
  return cmdOrErr, nil
end

local function log_debug(msg)
  append_file(get_ipc_dir() .. "/watcher_debug.log", "[" .. tostring(now_ms()) .. "] " .. tostring(msg) .. "\n")
end

local function log_error(msg)
  append_file(get_ipc_dir() .. "/commandwatcher_error.log", "[" .. tostring(now_ms()) .. "] " .. tostring(msg) .. "\n")
end

local function clamp01(n)
  local v = tonumber(n) or 0
  if v < 0 then return 0 end
  if v > 1 then return 1 end
  return v
end

local function normalize_param_name(s)
  s = tostring(s or ""):lower()
  s = s:gsub("%s+", " ")
  s = s:gsub("^%s+", "")
  s = s:gsub("%s+$", "")
  return s
end

local function should_include_param(paramName)
  local s = tostring(paramName or "")
  local trimmed = s:gsub("^%s+", "")
  local lower = trimmed:lower()
  return not lower:match("^midi")
end

local lastTickLog = 0
local pending_vm_export = false


-- ============================================================
-- RFX TUNER GMEM BRIDGE
-- JSFX should write tuner data to gmem namespace "RFX_TUNER".
-- CommandWorker polls it and writes /tmp/rfx-ipc/tuner.json for Electron.
--
-- gmem layout:
--   0 = hasPitch       (1/0)
--   1 = midiNote       (number)
--   2 = cents          (number)
--   3 = direction      (-1, 0, 1 or similar)
--   4 = confidence     (0..1)
--   5 = bendCentered   (1/0)
--   6 = eventCount     (incrementing value from JSFX)
-- ============================================================
reaper.gmem_attach("RFX_TUNER")

local noteNames = {
  "C", "C#", "D", "D#", "E", "F",
  "F#", "G", "G#", "A", "A#", "B"
}

local lastTunerEventCount = -1
local lastTunerWriteMs = 0

local function midi_to_note(midi)
  midi = math.floor((tonumber(midi) or 0) + 0.5)
  local name = noteNames[(midi % 12) + 1]
  local octave = math.floor(midi / 12) - 1
  return name, octave
end

local function read_tuner()
  local hasPitch = reaper.gmem_read(0) == 1
  local midiNote = math.floor((tonumber(reaper.gmem_read(1)) or 0) + 0.5)
  local note, octave = midi_to_note(midiNote)

  return {
    hasPitch = hasPitch,
    midiNote = midiNote,
    note = note,
    octave = octave,
    cents = tonumber(reaper.gmem_read(2)) or 0,
    direction = tonumber(reaper.gmem_read(3)) or 0,
    confidence = tonumber(reaper.gmem_read(4)) or 0,
    bendCentered = reaper.gmem_read(5) == 1,
    eventCount = tonumber(reaper.gmem_read(6)) or 0,
  }
end

local function tuner_path()
  return get_ipc_dir() .. "/tuner.json"
end


local function tuner_osc_queue_path()
  return get_ipc_dir() .. "/tuner_osc_queue.jsonl"
end

local function tuner_osc_bridge_path()
  return get_ipc_dir() .. "/rfx_osc_bridge.py"
end

local function write_tuner_osc_bridge_script()
  local script = [=[
#!/usr/bin/env python3
import json
import os
import socket
import struct
import time
import fcntl

IPC_DIR = "/tmp/rfx-ipc"
QUEUE_PATH = os.path.join(IPC_DIR, "tuner_osc_queue.jsonl")
LOCK_PATH = os.path.join(IPC_DIR, "rfx_osc_bridge.lock")
LOG_PATH = os.path.join(IPC_DIR, "rfx_osc_bridge.log")
DEST_IP = "127.0.0.1"
DEST_PORT = 19090
OSC_ADDRESS = "/rfx/tuner"

def log(msg):
    try:
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{time.time():.3f}] {msg}\n")
    except Exception:
        pass

def pad4(data: bytes) -> bytes:
    return data + (b"\0" * ((4 - (len(data) % 4)) % 4))

def osc_string(value: str) -> bytes:
    return pad4(str(value).encode("utf-8") + b"\0")

def osc_int(value) -> bytes:
    return struct.pack(">i", int(value))

def osc_float(value) -> bytes:
    return struct.pack(">f", float(value))

def make_tuner_packet(item: dict) -> bytes:
    # /rfx/tuner string note, int octave, float cents, float confidence, int hasPitch
    note = item.get("note") or "--"
    octave = int(item.get("octave") or 0)
    cents = float(item.get("cents") or 0.0)
    confidence = float(item.get("confidence") or 0.0)
    has_pitch = 1 if item.get("hasPitch") else 0

    return b"".join([
        osc_string(OSC_ADDRESS),
        osc_string(",siffi"),
        osc_string(note),
        osc_int(octave),
        osc_float(cents),
        osc_float(confidence),
        osc_int(has_pitch),
    ])

def main():
    os.makedirs(IPC_DIR, exist_ok=True)
    open(QUEUE_PATH, "a", encoding="utf-8").close()

    lock_file = open(LOCK_PATH, "w", encoding="utf-8")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        # Another bridge is already running.
        return

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    log(f"OSC bridge started -> {DEST_IP}:{DEST_PORT} address={OSC_ADDRESS}")

    with open(QUEUE_PATH, "r", encoding="utf-8") as q:
        q.seek(0, os.SEEK_END)

        while True:
            line = q.readline()
            if not line:
                time.sleep(0.01)
                continue

            line = line.strip()
            if not line:
                continue

            try:
                item = json.loads(line)
                packet = make_tuner_packet(item)
                sock.sendto(packet, (DEST_IP, DEST_PORT))
            except Exception as exc:
                log(f"send failed: {exc!r} line={line[:250]}")

if __name__ == "__main__":
    main()
]=]

  write_file(tuner_osc_bridge_path(), script)
end

local function ensure_tuner_osc_bridge()
  write_tuner_osc_bridge_script()

  -- Start a persistent Python OSC bridge in the background.
  -- The Python script uses a file lock, so rerunning CommandWorker should not create duplicates.
  local cmd =
    "/usr/bin/env python3 " ..
    string.format("%q", tuner_osc_bridge_path()) ..
    " >/tmp/rfx-ipc/rfx_osc_bridge_stdout.log 2>/tmp/rfx-ipc/rfx_osc_bridge_stderr.log &"

  os.execute(cmd)
  log_debug("requested tuner OSC bridge start: " .. tuner_osc_bridge_path())
end

local function send_tuner_osc(tuner)
  local ok, encoded = pcall(json.encode, {
    ts = now_ms(),
    hasPitch = tuner.hasPitch,
    midiNote = tuner.midiNote,
    note = tuner.note,
    octave = tuner.octave,
    cents = tuner.cents,
    direction = tuner.direction,
    confidence = tuner.confidence,
    bendCentered = tuner.bendCentered,
    eventCount = tuner.eventCount,
  })

  if ok and encoded then
    append_file(tuner_osc_queue_path(), encoded .. "\n")
    return true
  end

  return false
end

local function poll_tuner_bridge(state)
  state = state or read_state()

  -- Only publish/log live tuner state while the app is in tuner mode.
  if state.mode ~= "tuner" then
    return true
  end

  local tuner = read_tuner()
  local t = now_ms()

  local eventChanged = tuner.eventCount ~= lastTunerEventCount
  local dueRefresh = (t - lastTunerWriteMs) >= 100

  -- Do not spam the console, JSON file, or OSC bridge on every defer tick.
  -- This keeps output live but capped to roughly 30 FPS.
  if (not eventChanged and not dueRefresh) or (t - lastTunerWriteMs) < 33 then
    return true
  end

  if eventChanged then
    if tuner.hasPitch then
      reaper.ShowConsoleMsg(
        string.format(
          "[RFX TUNER] %s%d  %+0.1f¢\n",
          tuner.note,
          tuner.octave,
          tuner.cents
        )
      )
    else
      reaper.ShowConsoleMsg("[RFX TUNER] --\n")
    end
  end

  if not tuner.hasPitch then
    lastTunerEventCount = tuner.eventCount
    lastTunerWriteMs = t
    return true
  end

  lastTunerEventCount = tuner.eventCount
  lastTunerWriteMs = t

  local payload = {
    ts = t,
    hasPitch = tuner.hasPitch,
    midiNote = tuner.midiNote,
    note = tuner.note,
    octave = tuner.octave,
    cents = tuner.cents,
    direction = tuner.direction,
    confidence = tuner.confidence,
    bendCentered = tuner.bendCentered,
    eventCount = tuner.eventCount,
  }

  -- Keep JSON output for debugging/Electron fallback.
  local okJson = write_json(tuner_path(), payload)

  -- Send live OSC via the persistent Python UDP bridge.
  send_tuner_osc(tuner)

  return okJson
end

local function request_vm_export(reason)
  pending_vm_export = true
  local why = tostring(reason or "unknown")
  append_file(get_ipc_dir() .. "/watcher_debug.log", "[" .. tostring(now_ms()) .. "] request_vm_export reason=" .. why .. "\n")
end

local function write_heartbeat()
  write_json(get_ipc_dir() .. "/watcher_alive.json", {
    ts = now_ms(),
    ok = true,
    script = "RFX_CmdWatch.lua",
  })
end

local function write_result(id, name, okFlag, err, extra)
  local result = {
    id = id or "",
    ts = now_ms(),
    name = name or "",
    ok = okFlag == true,
    error = err or "",
  }

  if type(extra) == "table" then
    for k, v in pairs(extra) do
      result[k] = v
    end
  end

  local ok = write_json(get_ipc_dir() .. "/res.json", result)
  if ok then
    reaper_log("res", name, result)
  end
  if not ok then
    log_debug("FAILED to write res.json")
  end
end

local function state_path()
  return get_ipc_dir() .. "/state.json"
end

local function default_state()
  return {
    mode = "perform",
    looperType = "post_fx",
    activeBusId = "FX_1",
    tempoBpm = 120,
    clickEnabled = false,
    countInEnabled = false,
    busModes = {
      FX_1 = "linear",
      FX_2 = "linear",
      FX_3 = "linear",
      FX_4 = "linear",
    },
  }
end

local function clamp_tempo_bpm(v)
  local bpm = tonumber(v)
  if not bpm then return nil end

  bpm = math.floor(bpm + 0.5)

  if bpm < 40 then return 40 end
  if bpm > 240 then return 240 end

  return bpm
end

local function normalize_bus_id(v)
  local s = tostring(v or "")
  if s == "FX_1" or s == "FX_2" or s == "FX_3" or s == "FX_4" then
    return s
  end
  return nil
end

local function normalize_app_mode(v)
  local s = tostring(v or ""):lower()
  if s == "perform" or s == "edit" or s == "looper" or s == "automation" or s == "tuner" then
    return s
  end
  return nil
end

local function normalize_mode(v)
  local s = tostring(v or ""):lower()
  if s == "linear" or s == "parallel" or s == "lcr" then
    return s
  end
  return nil
end

local function normalize_looper_type(v)
  local s = tostring(v or ""):lower()
  s = s:gsub("%-", "_")

  if s == "pre_fx" then return "pre_fx" end
  if s == "post_fx" then return "post_fx" end

  return "post_fx"
end

local function read_state()
  local state, err = read_json(state_path())
  if not state then
    if err then
      log_debug("read_state decode failed, using defaults: " .. tostring(err))
    end
    state = default_state()
    write_json(state_path(), state)
    return state
  end

  if type(state) ~= "table" then
    state = default_state()
  end

  if type(state.busModes) ~= "table" then
    state.busModes = default_state().busModes
  end

  if not normalize_bus_id(state.activeBusId) then
    state.activeBusId = "FX_1"
  end
  
  state.mode = normalize_app_mode(state.mode) or "perform"
  state.looperType = normalize_looper_type(state.looperType)
  state.tempoBpm = clamp_tempo_bpm(state.tempoBpm) or 120
  state.clickEnabled = state.clickEnabled == true
  state.countInEnabled = state.countInEnabled == true
  state.busModes.FX_1 = normalize_mode(state.busModes.FX_1) or "linear"
  state.busModes.FX_2 = normalize_mode(state.busModes.FX_2) or "linear"
  state.busModes.FX_3 = normalize_mode(state.busModes.FX_3) or "linear"
  state.busModes.FX_4 = normalize_mode(state.busModes.FX_4) or "linear"
  
  return state
end

local function write_state(state)
  local ok = write_json(state_path(), state)
  if ok then
    reaper_log("state", "writeState", state)
  end
  return ok
end

local function apply_routing_from_state(state)
  state = state or read_state()

  local activeBusId = normalize_bus_id(state.activeBusId) or "FX_1"
  local busModes = state.busModes or {
    FX_1 = "linear",
    FX_2 = "linear",
    FX_3 = "linear",
    FX_4 = "linear",
  }

  local ok, err = router.apply_routing_state(activeBusId, busModes)
  if not ok then
    log_error("routing apply failed: " .. tostring(err or "unknown"))
    return false, err or "routing apply failed"
  end

  return true
end

local function find_track_by_name(name)
  local trackCount = reaper.CountTracks(0)
  for i = 0, trackCount - 1 do
    local tr = reaper.GetTrack(0, i)
    local _, trName = reaper.GetTrackName(tr)
    if trName == name then
      return tr
    end
  end
  return nil
end

local FX_BUS_IDS = { "FX_1", "FX_2", "FX_3", "FX_4" }

local function get_lane_specs()
  return {
    { id = "FX_1A", busId = "FX_1", lane = "A" },
    { id = "FX_1B", busId = "FX_1", lane = "B" },
    { id = "FX_1C", busId = "FX_1", lane = "C" },

    { id = "FX_2A", busId = "FX_2", lane = "A" },
    { id = "FX_2B", busId = "FX_2", lane = "B" },
    { id = "FX_2C", busId = "FX_2", lane = "C" },

    { id = "FX_3A", busId = "FX_3", lane = "A" },
    { id = "FX_3B", busId = "FX_3", lane = "B" },
    { id = "FX_3C", busId = "FX_3", lane = "C" },

    { id = "FX_4A", busId = "FX_4", lane = "A" },
    { id = "FX_4B", busId = "FX_4", lane = "B" },
    { id = "FX_4C", busId = "FX_4", lane = "C" },
    
    { id = "LP_POST", busId = "", lane = "" },
    { id = "FX_PRE", busId = "", lane = "" },
  }
  
end

local function lane_enabled_for_mode(lane, mode)
  if lane == "A" then return true end
  if lane == "B" then return mode == "parallel" or mode == "lcr" end
  if lane == "C" then return mode == "lcr" end
  return false
end

local function set_master_send(track, enabled)
  if not track then return false end
  reaper.SetMediaTrackInfo_Value(track, "B_MAINSEND", enabled and 1 or 0)
  return true
end

local function remove_sends_to_track(srcTrack, destTrack)
  if not srcTrack or not destTrack then return end

  local sendCount = reaper.GetTrackNumSends(srcTrack, 0)

  for sendIndex = sendCount - 1, 0, -1 do
    local existingDest = reaper.GetTrackSendInfo_Value(srcTrack, 0, sendIndex, "P_DESTTRACK")
    if existingDest == destTrack then
      reaper.RemoveTrackSend(srcTrack, 0, sendIndex)
    end
  end
end

local function ensure_send_to_track(srcTrack, destTrack)
  if not srcTrack or not destTrack then
    return false, "missing src or dest track"
  end

  local sendCount = reaper.GetTrackNumSends(srcTrack, 0)

  for sendIndex = 0, sendCount - 1 do
    local existingDest = reaper.GetTrackSendInfo_Value(srcTrack, 0, sendIndex, "P_DESTTRACK")
    if existingDest == destTrack then
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIndex, "I_SENDMODE", 0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIndex, "D_VOL", 1.0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIndex, "D_PAN", 0.0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIndex, "B_MUTE", 0)
      return true
    end
  end

  local newSendIndex = reaper.CreateTrackSend(srcTrack, destTrack)
  if newSendIndex == nil or newSendIndex < 0 then
    return false, "failed to create send"
  end

  reaper.SetTrackSendInfo_Value(srcTrack, 0, newSendIndex, "I_SENDMODE", 0)
  reaper.SetTrackSendInfo_Value(srcTrack, 0, newSendIndex, "D_VOL", 1.0)
  reaper.SetTrackSendInfo_Value(srcTrack, 0, newSendIndex, "D_PAN", 0.0)
  reaper.SetTrackSendInfo_Value(srcTrack, 0, newSendIndex, "B_MUTE", 0)

  return true
end

local function set_track_selected(track, selected)
  if not track then return false end
  reaper.SetTrackSelected(track, selected and true or false)
  return true
end

local function set_record_arm_no_input_monitor(track, enabled)
  if not track then return false end

  reaper.SetMediaTrackInfo_Value(track, "I_RECARM", enabled and 1 or 0)
  reaper.SetMediaTrackInfo_Value(track, "I_RECMON", enabled and 1 or 0) -- input monitoring on/off
  reaper.SetMediaTrackInfo_Value(track, "I_RECINPUT", -1) -- no input
  reaper.SetMediaTrackInfo_Value(track, "I_RECMODE", 2) -- record disabled / monitor only

  return true
end

local function apply_active_bus_monitoring(previousBusId, nextBusId)
  previousBusId = normalize_bus_id(previousBusId)
  nextBusId = normalize_bus_id(nextBusId)

  if previousBusId and previousBusId ~= nextBusId then
    set_record_arm_no_input_monitor(find_track_by_name(previousBusId), false)
  end

  if nextBusId then
    set_record_arm_no_input_monitor(find_track_by_name(nextBusId), true)
  end

  log_debug(
    "active bus monitoring previous=" ..
    tostring(previousBusId) ..
    " next=" ..
    tostring(nextBusId)
  )

  return true
end

local function set_record_output_stereo(track, armed)
  if not track then return false end

  reaper.SetMediaTrackInfo_Value(track, "I_RECMODE", 1)
  reaper.SetMediaTrackInfo_Value(track, "I_RECARM", armed and 1 or 0)

  return true
end

local function set_track_main_send_enabled(track, enabled)
  if not track then return false end

  reaper.SetMediaTrackInfo_Value(track, "B_MAINSEND", enabled and 1 or 0)
  return true
end

local function get_track_main_send_enabled(track)
  if not track then return false end

  local value = reaper.GetMediaTrackInfo_Value(track, "B_MAINSEND")
  return value ~= nil and value ~= 0
end

local function apply_tuner_record_state()
  local inputTrack = find_track_by_name("INPUT")
  local tuneTrack = find_track_by_name("RFX_TUNE")

  if inputTrack then
    set_record_arm_no_input_monitor(inputTrack, false)
  end

  if tuneTrack then
    reaper.SetMediaTrackInfo_Value(tuneTrack, "I_RECMODE", 1)
    reaper.SetMediaTrackInfo_Value(tuneTrack, "I_RECARM", 1)
    reaper.SetMediaTrackInfo_Value(tuneTrack, "I_RECMON", 0)
    set_track_main_send_enabled(tuneTrack, false)
  end

  return true
end

local function apply_looper_record_arm(looperType)
  
  local lpPre = find_track_by_name("LP_PRE")
  local lpPost = find_track_by_name("LP_POST")

  if looperType == "pre_fx" then
    -- PRE-FX should only select LP_PRE, not arm it
    set_track_selected(lpPre, true)
    set_record_output_stereo(lpPost, false)

    log_debug("selected LP_PRE for pre_fx looper")
  else
    -- POST-FX still arms LP_POST normally
    set_track_selected(lpPre, false)
    set_record_output_stereo(lpPost, true)

    log_debug("armed LP_POST for post_fx looper")
  end

  return true
end

local function clear_looper_record_arms()
  local lpPre = find_track_by_name("LP_PRE")
  local lpPost = find_track_by_name("LP_POST")

  set_track_selected(lpPre, false)
  set_record_output_stereo(lpPost, false)

  log_debug("unselected LP_PRE and disarmed LP_POST")

  return true
end

local function clear_fx_bus_sends_to_lp_post()
  local lpPost = find_track_by_name("LP_POST")
  if not lpPost then return end

  for i = 1, #FX_BUS_IDS do
    local busTrack = find_track_by_name(FX_BUS_IDS[i])
    if busTrack then
      remove_sends_to_track(busTrack, lpPost)
    end
  end
end

local function clear_input_sends_to_lp_pre()
  local inputTrack = find_track_by_name("INPUT")
  local lpPre = find_track_by_name("LP_PRE")

  if inputTrack and lpPre then
    remove_sends_to_track(inputTrack, lpPre)
  end
end

local function clear_input_sends_to_fx_lanes()
  local inputTrack = find_track_by_name("INPUT")
  if not inputTrack then return end

  local specs = get_lane_specs()

  for i = 1, #specs do
    local laneTrack = find_track_by_name(specs[i].id)
    if laneTrack then
      remove_sends_to_track(inputTrack, laneTrack)
    end
  end
end

local function clear_lp_pre_sends_to_fx_lanes()
  local lpPre = find_track_by_name("LP_PRE")
  if not lpPre then return end

  local specs = get_lane_specs()

  for i = 1, #specs do
    local laneTrack = find_track_by_name(specs[i].id)
    if laneTrack then
      remove_sends_to_track(lpPre, laneTrack)
    end
  end
end

local function clear_looper_insert_routing()
  clear_fx_bus_sends_to_lp_post()
  clear_input_sends_to_lp_pre()
  clear_lp_pre_sends_to_fx_lanes()
end

local function apply_perform_output_routing()
  clear_looper_insert_routing()

  for i = 1, #FX_BUS_IDS do
    local busTrack = find_track_by_name(FX_BUS_IDS[i])
    if busTrack then
      set_master_send(busTrack, true)
    end
  end

  local lpPre = find_track_by_name("LP_PRE")
  if lpPre then
    set_master_send(lpPre, false)
  end
  clear_looper_record_arms()
  return true
end

local function apply_looper_postfx_routing(state)
  local activeBusId = normalize_bus_id(state and state.activeBusId) or "FX_1"

  local activeBusTrack = find_track_by_name(activeBusId)
  if not activeBusTrack then
    return false, "active bus track not found: " .. tostring(activeBusId)
  end

  local lpPost = find_track_by_name("LP_POST")
  if not lpPost then
    return false, "LP_POST track not found"
  end

  clear_looper_insert_routing()

  for i = 1, #FX_BUS_IDS do
    local busId = FX_BUS_IDS[i]
    local busTrack = find_track_by_name(busId)

    if busTrack then
      set_master_send(busTrack, busId ~= activeBusId)
    end
  end

  local okSend, sendErr = ensure_send_to_track(activeBusTrack, lpPost)
  if not okSend then
    return false, sendErr or "failed to send active bus to LP_POST"
  end
  apply_looper_record_arm("post_fx")
  return true
end

local function apply_looper_prefx_routing(state)
  local activeBusId = normalize_bus_id(state and state.activeBusId) or "FX_1"
  local busMode = normalize_mode(state.busModes and state.busModes[activeBusId]) or "linear"

  local inputTrack = find_track_by_name("INPUT")
  local lpPre = find_track_by_name("LP_PRE")

  if not inputTrack then
    return false, "INPUT track not found"
  end

  if not lpPre then
    return false, "LP_PRE track not found"
  end

  clear_looper_insert_routing()
  clear_input_sends_to_fx_lanes()

  set_master_send(lpPre, false)

  for i = 1, #FX_BUS_IDS do
    local busTrack = find_track_by_name(FX_BUS_IDS[i])
    if busTrack then
      set_master_send(busTrack, true)
    end
  end

  local okInputSend, inputSendErr = ensure_send_to_track(inputTrack, lpPre)
  if not okInputSend then
    return false, inputSendErr or "failed to send INPUT to LP_PRE"
  end

  local specs = get_lane_specs()

  for i = 1, #specs do
    local spec = specs[i]

    if spec.busId == activeBusId and lane_enabled_for_mode(spec.lane, busMode) then
      local laneTrack = find_track_by_name(spec.id)

      if not laneTrack then
        return false, "missing active bus lane track: " .. tostring(spec.id)
      end

      local okLaneSend, laneSendErr = ensure_send_to_track(lpPre, laneTrack)
      if not okLaneSend then
        return false, laneSendErr or "failed to send LP_PRE to " .. tostring(spec.id)
      end
    end
  end
  apply_looper_record_arm("pre_fx")
  return true
end

local function apply_routing_for_app_mode(state)

  state = state or read_state()

  local okRouting, routingErr =
    apply_routing_from_state(state)

  if not okRouting then
    return false, routingErr
  end

  if state.mode == "looper" then

    if state.looperType == "pre_fx" then
      return apply_looper_prefx_routing(state)
    end

    return apply_looper_postfx_routing(state)
  end

  return apply_perform_output_routing()
end

local function find_fx_index_by_guid(track, targetGuid)
  if not track then return nil end
  targetGuid = tostring(targetGuid or "")

  local fxCount = reaper.TrackFX_GetCount(track)
  for fxIndex = 0, fxCount - 1 do
    local fxGuid = reaper.TrackFX_GetFXGUID(track, fxIndex)
    if tostring(fxGuid or "") == targetGuid then
      return fxIndex
    end
  end

  return nil
end

local function fx_params_cache_path()
  return get_ipc_dir() .. "/fx_params_cache.json"
end

local function read_fx_params_cache()
  local data, _err = read_json(fx_params_cache_path())
  if not data or type(data) ~= "table" then
    return {}
  end
  return data
end

local function write_fx_params_cache(cache)
  return write_json(fx_params_cache_path(), cache or {})
end

local function remove_fx_from_params_cache(fxGuid)
  fxGuid = tostring(fxGuid or "")
  if fxGuid == "" then return true end

  local cache = read_fx_params_cache()
  if type(cache) ~= "table" then
    cache = {}
  end

  cache[fxGuid] = nil
  return write_fx_params_cache(cache)
end

local function find_track_and_fx_index_by_fx_guid(targetGuid)
  targetGuid = tostring(targetGuid or "")
  if targetGuid == "" then return nil, nil end

  local trackCount = reaper.CountTracks(0)
  for i = 0, trackCount - 1 do
    local tr = reaper.GetTrack(0, i)
    local fxCount = reaper.TrackFX_GetCount(tr)
    for fxIndex = 0, fxCount - 1 do
      local fxGuid = reaper.TrackFX_GetFXGUID(tr, fxIndex)
      if tostring(fxGuid or "") == targetGuid then
        return tr, fxIndex
      end
    end
  end

  return nil, nil
end

local function refresh_fx_params_cache_entry(fxGuid)
  fxGuid = tostring(fxGuid or "")
  if fxGuid == "" then
    return false, "missing fxGuid"
  end

  local tr, fxIndex = find_track_and_fx_index_by_fx_guid(fxGuid)
  if not tr or fxIndex == nil then
    return false, "fx not found: " .. fxGuid
  end

  local paramCount = reaper.TrackFX_GetNumParams(tr, fxIndex)
  local params = {}

  for paramIdx = 0, paramCount - 1 do
    local _, paramName = reaper.TrackFX_GetParamName(tr, fxIndex, paramIdx, "")

    if should_include_param(paramName) then
      local value01 = reaper.TrackFX_GetParamNormalized(tr, fxIndex, paramIdx)

      local fmt = ""
      if reaper.TrackFX_GetFormattedParamValue then
        local okFmt, formatted = pcall(function()
          local _, s = reaper.TrackFX_GetFormattedParamValue(tr, fxIndex, paramIdx, "")
          return s
        end)
        if okFmt and formatted then
          fmt = tostring(formatted)
        end
      end

      params[#params + 1] = {
        idx = paramIdx,
        name = tostring(paramName or ("Param " .. tostring(paramIdx + 1))),
        nameNorm = normalize_param_name(paramName or ("Param " .. tostring(paramIdx + 1))),
        value01 = clamp01(tonumber(value01) or 0),
        fmt = tostring(fmt or ""),
      }
    end
  end

  local cache = read_fx_params_cache()
  cache[fxGuid] = {
    fxGuid = fxGuid,
    params = params,
    ts = now_ms(),
  }

  local okWrite = write_fx_params_cache(cache)
  if not okWrite then
    return false, "failed to write fx_params_cache.json"
  end

  return true
end

-- local function exec_syncView(_payload)
 -- request_vm_export("syncView")
 -- return true
--end
local function exec_syncView(_payload)
  local ts = now_ms()

  log_debug("SYNCVIEW FROM RFX ts=" .. tostring(ts))

  local ok = exporter.export_vm()

  if not ok then
    log_error("SYNCVIEW export_vm failed ts=" .. tostring(now_ms()))
    reaper_log("vm", "syncView", {
      ok = false,
      error = "syncView export_vm failed",
      ts = now_ms(),
    })
    return false, "syncView export_vm failed"
  end

  log_debug("SYNCVIEW export_vm wrote vm.json ts=" .. tostring(now_ms()))
  reaper_log("vm", "syncView", {
    ok = true,
    ts = now_ms(),
  })
  return true
end

local function exec_selectActiveBus(payload)
  local busId = normalize_bus_id(payload.busId)
  if not busId then
    return false, "invalid busId"
  end

  local state = read_state()
  local previousBusId = normalize_bus_id(state.activeBusId) or "FX_1"

  state.activeBusId = busId

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  apply_active_bus_monitoring(previousBusId, busId)

  local okRouting, routingErr = apply_routing_for_app_mode(state)
  if not okRouting then
    return false, "state saved but routing apply failed: " .. tostring(routingErr or "")
  end

  request_vm_export("selectActiveBus")
  return true
end

local function exec_setRoutingMode(payload)
  local busId = normalize_bus_id(payload.busId)
  local mode = normalize_mode(payload.mode)

  if not busId then
    return false, "invalid busId"
  end
  if not mode then
    return false, "invalid mode"
  end

  local state = read_state()
  state.busModes[busId] = mode

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  local okRouting, routingErr = apply_routing_for_app_mode(state)
  if not okRouting then
    return false, "state saved but routing apply failed: " .. tostring(routingErr or "")
  end

  request_vm_export("setRoutingMode")
  return true
end

local function infer_track_guid_from_fx_guid(fxGuid)
  local s = tostring(fxGuid or "")
  local prefix = s:match("^(.-)::fx::")
  if prefix and prefix ~= "" then
    return prefix
  end
  return nil
end

local function find_matching_installed_fx_raw(targetRaw)
  targetRaw = tostring(targetRaw or "")
  local targetLower = string.lower(targetRaw)

  local i = 0
  while true do
    local ok, name = reaper.EnumInstalledFX(i)
    if not ok then break end

    local raw = tostring(name or "")
    local rawLower = string.lower(raw)

    if rawLower == targetLower then
      return raw
    end

    if targetLower:match("^js:%s*") and rawLower:match("^js:%s*") then
      local targetTail = targetLower:gsub("^js:%s*", "")
      local rawTail = rawLower:gsub("^js:%s*", "")

      if rawTail == targetTail or rawTail:match(targetTail .. "$") then
        return raw
      end
    end

    i = i + 1
  end

  return nil
end

local function exec_addFx(payload)
  local trackGuid = tostring(payload.trackGuid or "")
  local fxRaw = tostring(payload.fxRaw or payload.raw or payload.fxName or "")

  log_debug("exec_addFx begin trackGuid=" .. tostring(trackGuid) .. " fxRaw=" .. tostring(fxRaw))

  if fxRaw == "" then
    return false, "missing fxRaw"
  end

  local tr = find_track_by_name(trackGuid)
  if not tr then
    return false, "track not found: " .. trackGuid
  end

  local resolvedRaw = fxRaw
  local matchedRaw = find_matching_installed_fx_raw(fxRaw)
  log_debug("exec_addFx matchedRaw=" .. tostring(matchedRaw))

  if matchedRaw and matchedRaw ~= "" then
    resolvedRaw = matchedRaw
  end

  local beforeCount = reaper.TrackFX_GetCount(tr)
  log_debug("exec_addFx beforeCount=" .. tostring(beforeCount))

  local fxIndex = reaper.TrackFX_AddByName(tr, resolvedRaw, false, 1)
  log_debug("exec_addFx TrackFX_AddByName result fxIndex=" .. tostring(fxIndex))
  log_debug("exec_addFx resolvedRaw=" .. tostring(resolvedRaw))

  local afterCount = reaper.TrackFX_GetCount(tr)
  log_debug("exec_addFx afterCount=" .. tostring(afterCount))

  if fxIndex == nil or fxIndex < 0 or afterCount <= beforeCount then
    return false, "failed to add fx: " .. tostring(resolvedRaw)
  end

  local _, fxName = reaper.TrackFX_GetFXName(tr, fxIndex, "")
  local _, trName = reaper.GetTrackName(tr)
  local resolvedFxGuid = reaper.TrackFX_GetFXGUID(tr, fxIndex)
  if not resolvedFxGuid or resolvedFxGuid == "" then
    resolvedFxGuid = trName .. "::fx::" .. tostring(fxIndex) .. "::" .. tostring(fxName)
  end

  log_debug("exec_addFx added fxName=" .. tostring(fxName))
  log_debug("exec_addFx resolved fxGuid=" .. tostring(resolvedFxGuid))

  local okRefresh, refreshErr = refresh_fx_params_cache_entry(resolvedFxGuid)
  if not okRefresh then
    log_debug("exec_addFx param cache refresh skipped/failed: " .. tostring(refreshErr or "unknown"))
  end

  local ok = exporter.export_vm()
  if not ok then
    return false, "fx added but export_vm failed"
  end

  return true
end

local function exec_removeFx(payload)
  local fxGuid = tostring(payload.fxGuid or "")
  if fxGuid == "" then
    return false, "missing fxGuid"
  end

  local trackGuid = tostring(payload.trackGuid or "")
  if trackGuid == "" then
    trackGuid = infer_track_guid_from_fx_guid(fxGuid) or ""
  end

  if trackGuid == "" then
    return false, "missing trackGuid and could not infer from fxGuid"
  end

  local tr = find_track_by_name(trackGuid)
  if not tr then
    return false, "track not found: " .. trackGuid
  end

  local fxIndex = find_fx_index_by_guid(tr, fxGuid)
  if fxIndex == nil then
    return false, "fx not found: " .. fxGuid
  end

  reaper.TrackFX_Delete(tr, fxIndex)

  local okCache = remove_fx_from_params_cache(fxGuid)
  if not okCache then
    return false, "fx removed but failed to update fx_params_cache.json"
  end

  request_vm_export("removeFx")
  return true
end

local function exec_toggleFx(payload)
  local fxGuid = tostring(payload.fxGuid or "")
  local value = payload.value == true

  if fxGuid == "" then
    return false, "missing fxGuid"
  end

  local trackGuid = tostring(payload.trackGuid or "")
  if trackGuid == "" then
    trackGuid = infer_track_guid_from_fx_guid(fxGuid) or ""
  end

  if trackGuid == "" then
    return false, "missing trackGuid and could not infer from fxGuid"
  end

  local tr = find_track_by_name(trackGuid)
  if not tr then
    return false, "track not found: " .. trackGuid
  end

  local fxIndex = find_fx_index_by_guid(tr, fxGuid)
  if fxIndex == nil then
    return false, "fx not found: " .. fxGuid
  end

  reaper.TrackFX_SetEnabled(tr, fxIndex, value)

  request_vm_export("toggleFx")
  return true
end

local function exec_reorderFx(payload)
  local trackGuid = tostring(payload.trackGuid or "")
  local fromIndex = tonumber(payload.fromIndex)
  local toIndex = tonumber(payload.toIndex)

  local tr = find_track_by_name(trackGuid)
  if not tr then
    return false, "track not found: " .. trackGuid
  end

  if fromIndex == nil or toIndex == nil then
    return false, "invalid indices"
  end

  reaper.TrackFX_CopyToTrack(tr, fromIndex, tr, toIndex, true)

  request_vm_export("reorderFx")
  return true
end

local function exec_getPluginParams(payload)
  local fxGuid = tostring(payload.fxGuid or "")
  if fxGuid == "" then
    return false, "missing fxGuid"
  end

  log_debug("exec_getPluginParams begin fxGuid=" .. tostring(fxGuid))

  local okRefresh, refreshErr = refresh_fx_params_cache_entry(fxGuid)
  if not okRefresh then
    return false, tostring(refreshErr or "failed to refresh fx params cache")
  end

  request_vm_export("getPluginParams")
  return true
end

local function exec_setParamValue(payload)
  local fxGuid = tostring(payload.fxGuid or "")
  local paramIdx = tonumber(payload.paramIdx)
  local value01 = tonumber(payload.value01)

  if fxGuid == "" then
    return false, "missing fxGuid"
  end
  if paramIdx == nil then
    return false, "missing paramIdx"
  end
  if value01 == nil then
    return false, "missing value01"
  end

  value01 = clamp01(value01)

  local tr, fxIndex = find_track_and_fx_index_by_fx_guid(fxGuid)
  if not tr or fxIndex == nil then
    return false, "fx not found: " .. fxGuid
  end

  reaper.TrackFX_SetParamNormalized(tr, fxIndex, paramIdx, value01)

  local okRefresh, refreshErr = refresh_fx_params_cache_entry(fxGuid)
  if not okRefresh then
    return false, "param set but cache refresh failed: " .. tostring(refreshErr or "")
  end

  request_vm_export("setParamValue")
  return true
end

local function exec_refreshInstalledPlugins(_payload)
  local ok = installedExporter.export_installed_plugins()
  if not ok then
    return false, "failed to export installed plugins"
  end
  return true
end

local function exec_setLooperType(payload)
  local looperType = normalize_looper_type(payload and payload.looperType)

  local state = read_state()
  state.looperType = looperType

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  local okRouting, routingErr = apply_routing_for_app_mode(state)
  if not okRouting then
    return false, "looper type saved but routing apply failed: " .. tostring(routingErr or "")
  end

  local okLooper, looperErr = looper.toggle_type({
    looperType = looperType,
  })

  if not okLooper then
    return false, "routing updated but looper type handler failed: " .. tostring(looperErr or "")
  end

  request_vm_export("setLooperType:" .. tostring(looperType))

  return true, nil, {
    looperType = looperType,
  }
end

local function exec_setTimeSignature(payload)
  payload = payload or {}

  local beatsPerMeasure = tonumber(payload.beatsPerMeasure)
  local noteLength = tonumber(payload.noteLength)

  if not beatsPerMeasure then
    return false, "invalid beatsPerMeasure"
  end

  if not noteLength then
    return false, "invalid noteLength"
  end

  beatsPerMeasure = math.floor(beatsPerMeasure + 0.5)
  noteLength = math.floor(noteLength + 0.5)

  if beatsPerMeasure < 1 or beatsPerMeasure > 32 then
    return false, "beatsPerMeasure out of range"
  end

  if noteLength ~= 1 and noteLength ~= 2 and noteLength ~= 4 and noteLength ~= 8 and noteLength ~= 16 and noteLength ~= 32 then
    return false, "noteLength must be 1, 2, 4, 8, 16, or 32"
  end

  reaper.SetTempoTimeSigMarker(
    0,      -- project
    -1,     -- marker index: -1 edits project/default time signature
    0,      -- time position
    -1,     -- measure position, -1 = ignore
    -1,     -- beat position, -1 = ignore
    -1,     -- bpm, -1 = keep current tempo
    beatsPerMeasure,
    noteLength,
    false   -- no sort needed for default marker
  )

  reaper_log("state", "setTimeSignature", {
    beatsPerMeasure = beatsPerMeasure,
    noteLength = noteLength,
  })

  return true, nil, {
    beatsPerMeasure = beatsPerMeasure,
    noteLength = noteLength,
  }
end

local function exec_setTempo(payload)
  local bpm = clamp_tempo_bpm(payload and payload.bpm)

  if not bpm then
    return false, "invalid bpm"
  end

  local state = read_state()
  state.tempoBpm = bpm

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  reaper.SetCurrentBPM(0, bpm, true)

  log_debug("setTempo bpm=" .. tostring(bpm))

  return true, nil, {
    tempoBpm = bpm,
  }
end

local function normalize_bool(v)
  return v == true
end
local function set_toggle_action_enabled(cmdId, enabled)
  local isEnabled = reaper.GetToggleCommandState(cmdId) == 1

  if isEnabled ~= enabled then
    reaper.Main_OnCommand(cmdId, 0)
  end

  return true
end

local function set_reaper_metronome_enabled(enabled)
  return set_toggle_action_enabled(40364, enabled) -- Options: Toggle metronome
end

local function set_reaper_preroll_record_enabled(enabled)
  return set_toggle_action_enabled(41819, enabled) -- Pre-roll: Toggle pre-roll on record
end

local function exec_setClickEnabled(payload)
  local enabled = normalize_bool(payload and payload.enabled)

  local state = read_state()
  state.clickEnabled = enabled

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  set_reaper_metronome_enabled(enabled)

  log_debug("setClickEnabled enabled=" .. tostring(enabled))

  return true, nil, {
    clickEnabled = enabled,
  }
end

local function exec_setCountInEnabled(payload)
  local enabled = normalize_bool(payload and payload.enabled)

  local state = read_state()
  state.countInEnabled = enabled

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  set_reaper_preroll_record_enabled(enabled)

  log_debug("setCountInEnabled preRollBeforeRecording enabled=" .. tostring(enabled))

  return true, nil, {
    countInEnabled = enabled,
  }
end

local function exec_toggle_tuner_master_send(_payload)
  local tuneTrack = find_track_by_name("RFX_TUNE")
  if not tuneTrack then
    return false, "RFX_TUNE track not found"
  end

  local enabled = get_track_main_send_enabled(tuneTrack)
  local ok = set_track_main_send_enabled(tuneTrack, not enabled)
  if not ok then
    return false, "failed to toggle RFX_TUNE main send"
  end

  return true, nil, {
    enabled = not enabled,
    muted = not (not enabled),
  }
end

local function exec_get_tuner_master_send_state(_payload)
  local tuneTrack = find_track_by_name("RFX_TUNE")
  if not tuneTrack then
    return false, "RFX_TUNE track not found"
  end

  local enabled = get_track_main_send_enabled(tuneTrack)
  return true, nil, {
    enabled = enabled,
    muted = not enabled,
  }
end

local function exec_setMode(modeName, payload)
  local mode = normalize_app_mode(modeName)
  if not mode then
    return false, "invalid app mode"
  end

  local state = read_state()
  state.mode = mode

  if not write_state(state) then
    return false, "failed to write state.json"
  end
  
  local okRouting, routingErr = apply_routing_for_app_mode(state)
    if not okRouting then
      return false, "mode saved but routing apply failed: " .. tostring(routingErr or "")
    end

  if mode == "tuner" then
    local okTunerRecord, tunerRecordErr = apply_tuner_record_state()
    if not okTunerRecord then
      return false, "mode saved but tuner record apply failed: " .. tostring(tunerRecordErr or "")
    end
  end

  local payloadStr = "{}"
  local okEncode, encoded = pcall(json.encode, payload or {})

  if okEncode and encoded then
    payloadStr = tostring(encoded)
  end

  log_debug(
    "MODE switched mode=" ..
    tostring(mode) ..
    " payload=" ..
    payloadStr
  )

  request_vm_export("setMode:" .. tostring(mode))

  return true, nil, { mode = mode }
end

local function execute_command(cmd)
  local name = tostring(cmd.name or "")
  local payload = cmd.payload or {}

  if name == "syncView" then
    return exec_syncView(payload)
  elseif name == "selectActiveBus" then
    return exec_selectActiveBus(payload)
  elseif name == "setRoutingMode" then
    return exec_setRoutingMode(payload)
  elseif name == "addFx" then
    return exec_addFx(payload)
  elseif name == "removeFx" then
    return exec_removeFx(payload)
  elseif name == "toggleFx" then
    return exec_toggleFx(payload)
  elseif name == "reorderFx" then
    return exec_reorderFx(payload)
  elseif name == "getPluginParams" then
    return exec_getPluginParams(payload)
  elseif name == "setParamValue" then
    return exec_setParamValue(payload)
  elseif name == "refreshInstalledPlugins" then
    return exec_refreshInstalledPlugins(payload)
  elseif name == "setTempo" then
    return exec_setTempo(payload)
  elseif name == "setClickEnabled" then
    return exec_setClickEnabled(payload)
  elseif name == "setCountInEnabled" then
    return exec_setCountInEnabled(payload)
  elseif name == "setTimeSignature" then
    return exec_setTimeSignature(payload)
    
  elseif name == "setPerformMode" then
    return exec_setMode("perform", payload)
  elseif name == "setEditMode" then
    return exec_setMode("edit", payload)
  elseif name == "setLooperMode" then
    return exec_setMode("looper", payload)
  elseif name == "setAutomationMode" then
    return exec_setMode("automation", payload)
  elseif name == "setTunerMode" then
    return exec_setMode("tuner", payload)
  elseif name == "toggleTunerMasterSend" then
    return exec_toggle_tuner_master_send(payload)
  elseif name == "getTunerMasterSendState" then
    return exec_get_tuner_master_send_state(payload)

  elseif name == "startLooperRecord" then
    return looper.start_record(payload)
  elseif name == "stopLooperRecord" then
    return looper.stop_record(payload)
  elseif name == "startLooperPlayback" then
    return looper.start_playback(payload)
  elseif name == "stopLooperPlayback" then
    return looper.stop_playback(payload)
  elseif name == "undoLooperOverdub" then
    return looper.undo_overdub(payload)
  elseif name == "undoLooperRecord" then
    return looper.undo_record(payload)
 elseif name == "clearLooper"
     or name == "deleteLoopAudio"
     or name == "deleteLooperAudio"
     or name == "clearLoopAudio" then
 
     payload.reason = payload.reason or name
     return looper.clear(payload)
 
   elseif name == "setLoopLengthEnabled" then
     return looper.set_loop_length_enabled(payload)
  elseif name == "setLoopLength" then
    return looper.set_loop_length(payload)

  elseif name == "setLooperType" or name == "toggleLooperType" then
    return exec_setLooperType(payload)
  
  
  end

  return false, "unknown command: " .. name
end

local function process_once()
  local t = now_ms()
  if t - lastTickLog > 1000 then
    lastTickLog = t
    log_debug("loop tick")
    write_heartbeat()
  end

  if pending_vm_export then
    pending_vm_export = false

    local okVm = exporter.export_vm()
    if okVm then
      log_debug("deferred export_vm() success")
      reaper_log("vm", "exportVm", {
        ok = true,
        reason = "deferred",
        ts = now_ms(),
      })
    else
      log_error("deferred export_vm() failed")
      reaper_log("vm", "exportVm", {
        ok = false,
        reason = "deferred",
        ts = now_ms(),
      })
    end
  end

  local stateForTuner = read_state()
  poll_tuner_bridge(stateForTuner)

  local cmdPath = get_ipc_dir() .. "/cmd.json"
  local raw = read_file(cmdPath)

  if raw and raw ~= "" then
    log_debug("cmd.json exists, raw length=" .. tostring(#raw))

    local okDecode, cmdOrErr = pcall(json.decode, raw)

    if not okDecode then
      log_debug("json.decode failed: " .. tostring(cmdOrErr))
      write_file(get_ipc_dir() .. "/cmd_decode_error.txt", raw)
      write_file(get_ipc_dir() .. "/cmd_decode_error_message.txt", tostring(cmdOrErr))
    elseif not cmdOrErr then
      log_debug("json.decode returned nil")
      write_file(get_ipc_dir() .. "/cmd_decode_nil.txt", raw)
    else
      local cmd = cmdOrErr

      local cmdName = tostring(cmd.name or "")
      local cmdId = tostring(cmd.id or "")
      
      log_debug("Received command: " .. cmdName .. " id=" .. cmdId)
      reaper_log("cmd", cmdName, cmd.payload or {})
      
      local okExec, okFlag, err, extra = pcall(execute_command, cmd)
      
      if okExec then
        write_result(cmd.id, cmd.name, okFlag, err, extra)
        log_debug("Command result: ok=" .. tostring(okFlag) .. " err=" .. tostring(err or ""))
      else
        write_result(cmd.id, cmd.name, false, "runtime error: " .. tostring(okFlag))
        log_error("Runtime error while executing command: " .. tostring(okFlag))
      end

      delete_file(cmdPath)
    end
  end

  reaper.defer(process_once)
end

write_heartbeat()
log_debug("Watcher started. IPC dir=" .. get_ipc_dir())
ensure_tuner_osc_bridge()

do
  local s = read_state()
  write_state(s)
  set_reaper_metronome_enabled(s.clickEnabled == true)
  set_reaper_preroll_record_enabled(s.countInEnabled == true)
  local okRouting, errRouting = apply_routing_for_app_mode(s)
  if okRouting then
    log_debug("routing state applied at startup")
  else
    log_error("startup routing apply failed: " .. tostring(errRouting or "unknown"))
  end

  local okVm = exporter.export_vm()
  if okVm then
    log_debug("vm.json exported at startup")
    reaper_log("vm", "exportVm", {
      ok = true,
      reason = "startup",
      ts = now_ms(),
    })
  else
    log_error("failed to export vm.json at startup")
    reaper_log("vm", "exportVm", {
      ok = false,
      reason = "startup",
      ts = now_ms(),
    })
  end
end

do
  local ok = installedExporter.export_installed_plugins()
  if ok then
    log_debug("installed_plugins.json exported at startup")
  else
    log_debug("failed to export installed_plugins.json at startup")
  end
end

process_once()
