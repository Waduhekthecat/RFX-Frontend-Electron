----------------------------------------------------------------------
-- RFX_LooperCmds.lua
-- Looper command handlers for RFX
----------------------------------------------------------------------

local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")

local M = {}

local loopRecordCount = 0

----------------------------------------------------------------------
-- BASIC HELPERS
----------------------------------------------------------------------

local function get_ipc_dir()
  return "/tmp/rfx-ipc"
end

local function now_ms()
  return math.floor(reaper.time_precise() * 1000)
end

local function show(msg)
  reaper.ShowConsoleMsg(tostring(msg) .. "\n")
end

local function read_file(path)
  local f = io.open(path, "r")
  if not f then return nil end
  local s = f:read("*a")
  f:close()
  return s
end

local function read_json(path)
  local raw = read_file(path)
  if not raw or raw == "" then return nil end

  local ok, decoded = pcall(json.decode, raw)
  if not ok then
    show("[LOOPER] WARN failed to decode json: " .. tostring(decoded))
    return nil
  end

  return decoded
end

local function read_active_bus_id()
  local state = read_json(get_ipc_dir() .. "/state.json")

  if type(state) == "table" and state.activeBusId then
    return tostring(state.activeBusId)
  end

  return "FX_1"
end

local function dump_command(name, payload)
  payload = payload or {}

  show("")
  show("========================================")
  show("[RFX LOOPER COMMAND]")
  show("ts: " .. tostring(now_ms()))
  show("name: " .. tostring(name or ""))

  if payload.recordCount ~= nil then
    show("recordCount: " .. tostring(payload.recordCount))
  end

  if payload.looperType ~= nil then
    show("looperType: " .. tostring(payload.looperType))
  end

  show("========================================")
end

----------------------------------------------------------------------
-- TRACK HELPERS
----------------------------------------------------------------------

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

local function get_track_name(track)
  if not track then return "" end
  local _, name = reaper.GetTrackName(track)
  return tostring(name or "")
end

local function arm_output_stereo(trackName)
  local tr = find_track_by_name(trackName)

  if not tr then
    show("[LOOPER] ERROR missing record target track: " .. tostring(trackName))
    return false
  end

  reaper.SetMediaTrackInfo_Value(tr, "B_MUTE", 0)
  reaper.SetMediaTrackInfo_Value(tr, "I_RECARM", 1)
  reaper.SetMediaTrackInfo_Value(tr, "I_RECMODE", 1)

  show("[LOOPER] armed output stereo: " .. trackName)
  return true
end

local function create_send(sourceTrack, destTrack)
  if not sourceTrack or not destTrack then return false end

  local sendIndex = reaper.CreateTrackSend(sourceTrack, destTrack)

  if sendIndex == nil or sendIndex < 0 then
    return false
  end

  reaper.SetTrackSendInfo_Value(sourceTrack, 0, sendIndex, "D_VOL", 1.0)
  reaper.SetTrackSendInfo_Value(sourceTrack, 0, sendIndex, "B_MUTE", 0)

  show("[LOOPER] send: " .. get_track_name(sourceTrack) .. " -> " .. get_track_name(destTrack))
  return true
end

local function remove_sends_to_track(sourceTrack, destTrack)
  if not sourceTrack or not destTrack then return false end

  local sendCount = reaper.GetTrackNumSends(sourceTrack, 0)

  for sendIndex = sendCount - 1, 0, -1 do
    local existingDest = reaper.GetTrackSendInfo_Value(sourceTrack, 0, sendIndex, "P_DESTTRACK")
    if existingDest == destTrack then
      reaper.RemoveTrackSend(sourceTrack, 0, sendIndex)
    end
  end

  return true
end

----------------------------------------------------------------------
-- REAPER TRANSPORT HELPERS
----------------------------------------------------------------------

local function ensure_repeat_enabled()
  local repeatCmd = 1068 -- Transport: Toggle repeat
  local state = reaper.GetToggleCommandState(repeatCmd)

  if tonumber(state) ~= 1 then
    reaper.Main_OnCommand(repeatCmd, 0)
    show("[LOOPER] repeat playback enabled")
  else
    show("[LOOPER] repeat playback already enabled")
  end
end

local function goto_project_start()
  reaper.SetEditCurPos(0, true, false)
  show("[LOOPER] playhead moved to project start")
end

local function start_recording()
  reaper.Main_OnCommand(1013, 0) -- Transport: Record
end

local function stop_recording_continue_playback()
  reaper.Main_OnCommand(1013, 0) -- Transport: Record toggle
end

local function start_playing()
  reaper.Main_OnCommand(1007, 0) -- Transport: Play
end

local function stop_transport_and_return_to_start()
  reaper.Main_OnCommand(1016, 0) -- Transport: Stop
  goto_project_start()

  show("[LOOPER] playback stopped")
end

----------------------------------------------------------------------
-- ROUTING HELPERS
----------------------------------------------------------------------

local function route_active_bus_to_lp_post()
  local activeBusId = read_active_bus_id()
  local busTrack = find_track_by_name(activeBusId)
  local lpPost = find_track_by_name("LP_POST")

  if not busTrack then
    return false, "missing active bus track: " .. tostring(activeBusId)
  end

  if not lpPost then
    return false, "missing LP_POST track"
  end

  show("[LOOPER] routing active bus to LP_POST")
  show("[LOOPER] activeBusId=" .. tostring(activeBusId))

  reaper.SetMediaTrackInfo_Value(busTrack, "B_MAINSEND", 0)
  show("[LOOPER] disabled master send: " .. tostring(activeBusId))

  remove_sends_to_track(busTrack, lpPost)

  if not create_send(busTrack, lpPost) then
    return false, "failed to create send: " .. tostring(activeBusId) .. " -> LP_POST"
  end

  if not arm_output_stereo("LP_POST") then
    return false, "failed to arm LP_POST"
  end

  return true
end

----------------------------------------------------------------------
-- ITEM / LOOP RANGE HELPERS
----------------------------------------------------------------------

local function get_latest_item_on_track(track)
  if not track then return nil end

  local latestItem = nil
  local latestEnd = -1
  local itemCount = reaper.CountTrackMediaItems(track)

  for i = 0, itemCount - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local itemEnd = pos + len

    if itemEnd > latestEnd then
      latestEnd = itemEnd
      latestItem = item
    end
  end

  return latestItem
end

local function delete_all_items_on_track(trackName)
  local tr = find_track_by_name(trackName)

  if not tr then
    return false, "missing track: " .. tostring(trackName)
  end

  local itemCount = reaper.CountTrackMediaItems(tr)

  for i = itemCount - 1, 0, -1 do
    local item = reaper.GetTrackMediaItem(tr, i)
    reaper.DeleteTrackMediaItem(tr, item)
  end

  show("[LOOPER] deleted " .. tostring(itemCount) .. " item(s) from " .. tostring(trackName))

  return true
end

local function clear_loop_time_selection()
  reaper.GetSet_LoopTimeRange(true, false, 0, 0, false)
  show("[LOOPER] loop/time selection cleared")
end

local function set_time_selection_from_project_start_to_lp_post_item_end()
  local lpPost = find_track_by_name("LP_POST")
  if not lpPost then
    return false, "missing LP_POST track"
  end

  local item = get_latest_item_on_track(lpPost)
  if not item then
    return false, "no recorded item found on LP_POST"
  end

  local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  local itemEnd = pos + len

  reaper.GetSet_LoopTimeRange(true, false, 0, itemEnd, false)
  goto_project_start()

  show("[LOOPER] recorded item start=" .. tostring(pos))
  show("[LOOPER] recorded item end=" .. tostring(itemEnd))
  show("[LOOPER] time selection set: 0 -> " .. tostring(itemEnd))

  return true
end

local function get_record_count(payload)
  if payload and payload.recordCount ~= nil then
    return tonumber(payload.recordCount) or loopRecordCount
  end

  return loopRecordCount
end

----------------------------------------------------------------------
-- LOOPER COMMANDS
----------------------------------------------------------------------

function M.start_record(payload)
  dump_command("startLooperRecord", payload)

  local okRoute, routeErr = route_active_bus_to_lp_post()
  if not okRoute then
    return false, tostring(routeErr or "failed to route active bus to LP_POST")
  end

  ensure_repeat_enabled()

  show("[LOOPER] start recording on LP_POST")
  start_recording()

  return true
end

function M.stop_record(payload)
  dump_command("stopLooperRecord", payload)

  local recCount = get_record_count(payload)

  show("[LOOPER] stop recording on LP_POST")
  show("[LOOPER] recCount=" .. tostring(recCount))

  stop_recording_continue_playback()

  if recCount == 0 then
    local okRange, rangeErr = set_time_selection_from_project_start_to_lp_post_item_end()
    if not okRange then
      return false, tostring(rangeErr or "failed to set loop range")
    end

    ensure_repeat_enabled()
    start_playing()

    show("[LOOPER] first loop captured; playback continuing from project start")
  else
    show("[LOOPER] overdub stopped; playback continuing")
  end

  loopRecordCount = recCount + 1
  show("[LOOPER] loopRecordCount=" .. tostring(loopRecordCount))

  return true
end

function M.start_playback(payload)
  dump_command("startLooperPlayback", payload)

  ensure_repeat_enabled()
  goto_project_start()
  start_playing()

  show("[LOOPER] start playback from project start")

  return true
end

function M.stop_playback(payload)
  dump_command("stopLooperPlayback", payload)

  stop_transport_and_return_to_start()

  show("[LOOPER] stop playback")

  return true
end

function M.undo_overdub(payload)
  dump_command("undoLooperOverdub", payload)
  show("[LOOPER] undo overdub")
  return true
end

function M.undo_record(payload)
  dump_command("undoLooperRecord", payload)
  show("[LOOPER] undo record")
  return true
end

function M.clear(payload)
  dump_command("clearLooper", payload)
  show("[LOOPER] clear")

  local okDelete, deleteErr = delete_all_items_on_track("LP_POST")
  if not okDelete then
    return false, tostring(deleteErr or "failed to delete LP_POST audio")
  end

  loopRecordCount = 0
  show("[LOOPER] record count reset to 0")

  clear_loop_time_selection()
  goto_project_start()

  show("[LOOPER] loop audio cleared")

  return true
end

function M.toggle_type(payload)
  dump_command("toggleLooperType", payload)

  local looperTypeRaw = tostring(payload and payload.looperType or "")
  local looperType = looperTypeRaw:gsub("%-", "_")

  loopRecordCount = 0

  show("[LOOPER] looper type changed to " .. tostring(looperType))
  show("[LOOPER] record count reset to 0")

  return true
end

return M