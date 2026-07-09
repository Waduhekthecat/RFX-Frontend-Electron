----------------------------------------------------------------------
-- RFX_LooperCmds.lua
-- Looper command handlers for RFX
----------------------------------------------------------------------

local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")

local M = {}

local loopRecordCount = 0
local loopRecordStack = {}
local loopLengthBars = nil
local originalLpPreGuid = nil
local postFxRecordStartItemGuids = nil

----------------------------------------------------------------------
-- BASIC HELPERS
----------------------------------------------------------------------

local function get_ipc_dir()
  return "/tmp/rfx-ipc"
end

local function now_ms()
  return math.floor(reaper.time_precise() * 1000)
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

local function show(msg)
  -- Intentionally quiet. Public command handlers log one normalized line via dump_command().
  return msg
end

local function debug_log(msg)
  reaper.ShowConsoleMsg(tostring(msg or "") .. "\n")
end

local function normalize_looper_type(value)
  local s = tostring(value or ""):lower():gsub("%-", "_")

  if s == "pre_fx" then return "pre_fx" end
  if s == "post_fx" then return "post_fx" end

  return nil
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

local function read_state()
  local state = read_json(get_ipc_dir() .. "/state.json")
  if type(state) ~= "table" then return {} end
  return state
end

local function read_looper_type()
  local state = read_state()
  return normalize_looper_type(state.looperType) or "post_fx"
end

local function is_count_in_enabled()
  local state = read_state()
  return state.countInEnabled == true
end

local function get_track_name_for_looper_type(looperType)
  if looperType == "pre_fx" then return "LP_PRE" end
  return "LP_POST"
end

local function get_record_track_name()
  local looperType = read_looper_type()
  return get_track_name_for_looper_type(looperType), looperType
end

local function dump_command(name, payload)
  payload = type(payload) == "table" and payload or {}
  local trackName, looperType = get_record_track_name()
  local out = {}

  for k, v in pairs(payload) do
    out[k] = v
  end

  out.looperType = looperType
  out.recordTrack = trackName

  reaper_log("looper", name, out)
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

local function get_track_guid(track)
  if not track then return nil end
  return reaper.GetTrackGUID(track)
end

local function count_items_on_track(track)
  if not track then return 0 end
  return reaper.CountTrackMediaItems(track)
end

local function select_track(track)
  if not track then return end

  reaper.Main_OnCommand(40297, 0)
  reaper.SetTrackSelected(track, true)
end

local function cache_original_lp_pre_guid()
  if originalLpPreGuid then
    return originalLpPreGuid
  end

  local tr = find_track_by_name("LP_PRE")
  if not tr then
    return nil
  end

  originalLpPreGuid = get_track_guid(tr)

  show("[LOOPER] cached original LP_PRE guid=" .. tostring(originalLpPreGuid))

  return originalLpPreGuid
end

----------------------------------------------------------------------
-- REAPER TRANSPORT / PRE-ROLL HELPERS
----------------------------------------------------------------------

local function ensure_repeat_enabled()
  local repeatCmd = 1068
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
  reaper.Main_OnCommand(1013, 0)
end

local function stop_recording_continue_playback()
  reaper.Main_OnCommand(1013, 0)
end

local function start_playing()
  reaper.Main_OnCommand(1007, 0)
end

local function stop_transport_and_return_to_start()
  reaper.Main_OnCommand(1016, 0)
  goto_project_start()
  show("[LOOPER] playback stopped")
end

local function is_transport_stopped()
  return tonumber(reaper.GetPlayState()) == 0
end

local function has_bit(value, bit)
  value = tonumber(value) or 0
  bit = tonumber(bit) or 0
  if bit <= 0 then return false end
  return value % (bit * 2) >= bit
end

local function set_bit(value, bit, enabled)
  value = tonumber(value) or 0

  local alreadyEnabled = has_bit(value, bit)

  if enabled and not alreadyEnabled then
    return value + bit
  end

  if not enabled and alreadyEnabled then
    return value - bit
  end

  return value
end

local function set_preroll_before_recording_enabled(enabled)
  if not reaper.SNM_GetIntConfigVar or not reaper.SNM_SetIntConfigVar then
    show("[LOOPER PREROLL] SWS SNM config functions unavailable; cannot set pre-roll")
    return false, "SWS extension required for pre-roll config"
  end

  local current = reaper.SNM_GetIntConfigVar("preroll", -1)

  if current == nil or tonumber(current) < 0 then
    show("[LOOPER PREROLL] failed to read preroll config var")
    return false, "failed to read preroll config var"
  end

  local nextValue = set_bit(current, 2, enabled == true)

  if nextValue ~= current then
    reaper.SNM_SetIntConfigVar("preroll", nextValue)
  end

  show(
    "[LOOPER PREROLL] before_recording=" ..
    tostring(enabled == true) ..
    " current=" ..
    tostring(current) ..
    " next=" ..
    tostring(nextValue)
  )

  return true
end

local function arm_preroll_if_needed()
  local countInEnabled = is_count_in_enabled()
  local stopped = is_transport_stopped()
  local shouldArm = countInEnabled and stopped

  show("[LOOPER PREROLL] countInEnabled=" .. tostring(countInEnabled))
  show("[LOOPER PREROLL] transportStopped=" .. tostring(stopped))
  show("[LOOPER PREROLL] shouldArm=" .. tostring(shouldArm))

  if shouldArm then
    return set_preroll_before_recording_enabled(true)
  end

  set_preroll_before_recording_enabled(false)
  return true
end

local function unarm_preroll()
  return set_preroll_before_recording_enabled(false)
end

----------------------------------------------------------------------
-- ITEM HELPERS
----------------------------------------------------------------------

local function get_item_debug_string(item)
  if not item then return "item=nil" end

  local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  local takeCount = reaper.CountTakes(item)
  local guid = reaper.BR_GetMediaItemGUID and reaper.BR_GetMediaItemGUID(item) or tostring(item)

  return
    "item=" .. tostring(item) ..
    " guid=" .. tostring(guid) ..
    " pos=" .. tostring(pos) ..
    " len=" .. tostring(len) ..
    " end=" .. tostring(pos + len) ..
    " takes=" .. tostring(takeCount)
end

local function get_item_guid(item)
  if not item then return nil end
  if reaper.BR_GetMediaItemGUID then
    local guid = reaper.BR_GetMediaItemGUID(item)
    if guid and guid ~= "" then
      return tostring(guid)
    end
  end
  return tostring(item)
end

local function snapshot_track_item_guids(track)
  local snapshot = {
    guids = {},
    count = 0,
  }

  if not track then
    return snapshot
  end

  local itemCount = reaper.CountTrackMediaItems(track)

  for i = 0, itemCount - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local guid = get_item_guid(item)

    if guid then
      snapshot.guids[guid] = true
      snapshot.count = snapshot.count + 1
    end
  end

  return snapshot
end

local function collect_new_items_since_snapshot(track, snapshot)
  local items = {}

  if not track or not snapshot or type(snapshot.guids) ~= "table" then
    return items
  end

  local itemCount = reaper.CountTrackMediaItems(track)

  for i = 0, itemCount - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local guid = get_item_guid(item)

    if guid and not snapshot.guids[guid] then
      items[#items + 1] = item
    end
  end

  return items
end

local function debug_dump_loop_items(trackName)
  local tr = find_track_by_name(trackName)

  if not tr then
    show("[LOOPER DEBUG] " .. tostring(trackName) .. " missing")
    return
  end

  local itemCount = reaper.CountTrackMediaItems(tr)

  show("---------- " .. tostring(trackName) .. " ITEMS ----------")
  show("itemCount=" .. tostring(itemCount))
  show("stackSize=" .. tostring(#loopRecordStack))

  for i = 0, itemCount - 1 do
    local item = reaper.GetTrackMediaItem(tr, i)
    show("#" .. tostring(i) .. " " .. get_item_debug_string(item))
  end

  show("-----------------------------------")
end

local function get_latest_item_on_track(track)
  if not track then return nil end

  local latestItem = nil
  local latestEnd = -1
  local latestIndex = -1
  local itemCount = reaper.CountTrackMediaItems(track)

  for i = 0, itemCount - 1 do
    local item = reaper.GetTrackMediaItem(track, i)
    local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
    local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
    local itemEnd = pos + len

    if itemEnd >= latestEnd then
      latestEnd = itemEnd
      latestIndex = i
      latestItem = item
    end
  end

  if latestItem then
    show("[LOOPER DEBUG] fallback latest item index=" .. tostring(latestIndex))
    show("[LOOPER DEBUG] fallback latest " .. get_item_debug_string(latestItem))
  end

  return latestItem
end

local function get_selected_item_on_track(track)
  if not track then return nil end

  local selectedCount = reaper.CountSelectedMediaItems(0)

  for i = selectedCount - 1, 0, -1 do
    local item = reaper.GetSelectedMediaItem(0, i)
    local itemTrack = reaper.GetMediaItemTrack(item)

    if itemTrack == track then
      return item
    end
  end

  return nil
end

local function push_latest_loop_record()
  local trackName, looperType = get_record_track_name()
  local tr = find_track_by_name(trackName)

  if not tr then
    show("[LOOPER STACK PUSH] failed: " .. tostring(trackName) .. " missing")
    return false
  end

  if looperType == "post_fx" then
    local newItems = collect_new_items_since_snapshot(tr, postFxRecordStartItemGuids)
    local snapshotCount = postFxRecordStartItemGuids and postFxRecordStartItemGuids.count or 0

    debug_log("[LOOPER POST_FX STACK PUSH] snapshot item count=" .. tostring(snapshotCount))
    debug_log("[LOOPER POST_FX STACK PUSH] new item count=" .. tostring(#newItems))

    if #newItems > 0 then
      loopRecordStack[#loopRecordStack + 1] = {
        item = newItems[#newItems],
        items = newItems,
        trackName = trackName,
        looperType = looperType,
      }

      postFxRecordStartItemGuids = nil

      show("[LOOPER STACK PUSH]")
      show("looperType=" .. tostring(looperType))
      show("recordTrack=" .. tostring(trackName))
      show("itemCount=" .. tostring(#newItems))
      show("stack size=" .. tostring(#loopRecordStack))

      for i = 1, #newItems do
        show("#" .. tostring(i) .. " " .. get_item_debug_string(newItems[i]))
      end

      return true
    end

    postFxRecordStartItemGuids = nil
  end

  local item = get_selected_item_on_track(tr) or get_latest_item_on_track(tr)

  if not item then
    show("[LOOPER STACK PUSH] failed: no " .. tostring(trackName) .. " item found")
    return false
  end

  loopRecordStack[#loopRecordStack + 1] = {
    item = item,
    trackName = trackName,
    looperType = looperType,
  }

  show("[LOOPER STACK PUSH]")
  show("looperType=" .. tostring(looperType))
  show("recordTrack=" .. tostring(trackName))
  show("stack size=" .. tostring(#loopRecordStack))
  show(get_item_debug_string(item))

  return true
end

local function pop_latest_loop_record()
  local entry = loopRecordStack[#loopRecordStack]
  loopRecordStack[#loopRecordStack] = nil

  show("[LOOPER STACK POP]")
  show("stack size after pop=" .. tostring(#loopRecordStack))

  if entry then
    show("looperType=" .. tostring(entry.looperType))
    show("recordTrack=" .. tostring(entry.trackName))
    if type(entry.items) == "table" then
      show("itemCount=" .. tostring(#entry.items))
      for i = 1, #entry.items do
        show("#" .. tostring(i) .. " " .. get_item_debug_string(entry.items[i]))
      end
    else
      show(get_item_debug_string(entry.item))
    end
  else
    show("entry=nil")
  end

  return entry
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

  reaper.UpdateArrange()

  show("[LOOPER] deleted " .. tostring(itemCount) .. " item(s) from " .. tostring(trackName))

  return true
end

local function get_original_lp_pre_track()
  local keepGuid = cache_original_lp_pre_guid()

  if keepGuid then
    for i = 0, reaper.CountTracks(0) - 1 do
      local tr = reaper.GetTrack(0, i)
      if get_track_name(tr) == "LP_PRE" and get_track_guid(tr) == keepGuid then
        return tr
      end
    end
  end

  return find_track_by_name("LP_PRE")
end

local function get_latest_copied_lp_pre_track()
  local keepGuid = cache_original_lp_pre_guid()
  local latest = nil

  for i = 0, reaper.CountTracks(0) - 1 do
    local tr = reaper.GetTrack(0, i)
    local name = get_track_name(tr)
    local guid = get_track_guid(tr)

    if name == "LP_PRE" and guid ~= keepGuid then
      latest = tr
    end
  end

  return latest
end

local function clear_original_lp_pre_audio_and_select()
  local tr = get_original_lp_pre_track()

  if not tr then
    return false, "original LP_PRE track not found"
  end

  local itemCount = reaper.CountTrackMediaItems(tr)

  for i = itemCount - 1, 0, -1 do
    local item = reaper.GetTrackMediaItem(tr, i)
    reaper.DeleteTrackMediaItem(tr, item)
  end

  select_track(tr)
  goto_project_start()
  reaper.UpdateArrange()

  show("[LOOPER] cleared original LP_PRE audio")
  show("[LOOPER] selected original LP_PRE")
  show("[LOOPER] playhead reset to project start")

  return true
end

local function undo_pre_fx_latest_overdub()
  unarm_preroll()

  local copiedTrack = get_latest_copied_lp_pre_track()

  if copiedTrack then
    show("[LOOPER PRE UNDO] deleting latest copied LP_PRE guid=" .. tostring(get_track_guid(copiedTrack)))
    reaper.DeleteTrack(copiedTrack)
  else
    show("[LOOPER PRE UNDO] no copied LP_PRE track found")
  end

  local ok, err = clear_original_lp_pre_audio_and_select()
  if not ok then
    return false, err
  end

  loopRecordCount = math.max(0, loopRecordCount - 1)

  show("[LOOPER PRE UNDO] loopRecordCount=" .. tostring(loopRecordCount))

  return true
end

local function clear_pre_fx_loop_audio()
  local keepGuid = cache_original_lp_pre_guid()

  if not keepGuid then
    return false, "LP_PRE track not found; could not cache original guid"
  end

  local deletedTracks = 0

  for i = reaper.CountTracks(0) - 1, 0, -1 do
    local tr = reaper.GetTrack(0, i)
    local name = get_track_name(tr)
    local guid = get_track_guid(tr)

    if name == "LP_PRE" and guid ~= keepGuid then
      show("[LOOPER] deleting copied LP_PRE track guid=" .. tostring(guid))
      reaper.DeleteTrack(tr)
      deletedTracks = deletedTracks + 1
    end
  end

  local ok, err = clear_original_lp_pre_audio_and_select()
  if not ok then
    return false, err
  end

  show("[LOOPER] pre_fx deleted copied LP_PRE track count=" .. tostring(deletedTracks))
  show("[LOOPER] pre_fx cleared original LP_PRE audio")

  return true
end

local function delete_latest_loop_record()
  local currentTrackName, currentLooperType = get_record_track_name()

  debug_dump_loop_items(currentTrackName)

  local entry = pop_latest_loop_record()
  local source = "stack"
  local trackName = currentTrackName
  local item = nil
  local items = nil

  if entry then
    trackName = entry.trackName or currentTrackName
    item = entry.item
    if type(entry.items) == "table" and #entry.items > 0 then
      items = entry.items
    end
  end

  local tr = find_track_by_name(trackName)

  if not tr then
    return false, "missing track: " .. tostring(trackName)
  end

  if items then
    local deletedCount = 0

    show("[LOOPER UNDO DELETE]")
    show("currentLooperType=" .. tostring(currentLooperType))
    show("deleteTrack=" .. tostring(trackName))
    show("source=" .. tostring(source))
    show("itemCount=" .. tostring(#items))

    for i = #items, 1, -1 do
      local stackItem = items[i]

      if stackItem and reaper.ValidatePtr2(0, stackItem, "MediaItem*") then
        show("#" .. tostring(i) .. " " .. get_item_debug_string(stackItem))
        reaper.DeleteTrackMediaItem(tr, stackItem)
        deletedCount = deletedCount + 1
      else
        show("#" .. tostring(i) .. " invalid item")
      end
    end

    if deletedCount > 0 then
      reaper.UpdateArrange()
      debug_log("[LOOPER] deleted item count during undo=" .. tostring(deletedCount))
      show("[LOOPER] deleted loop layer from " .. tostring(trackName) .. " via " .. tostring(source))
      return true, "items"
    end

    show("[LOOPER] stack layer had no valid items; falling back to latest item")
  end

  if not item or not reaper.ValidatePtr2(0, item, "MediaItem*") then
    source = "fallback-latest"
    trackName = currentTrackName
    tr = find_track_by_name(trackName)
    item = get_latest_item_on_track(tr)
  end

  if not item then
    return false, "no item found on " .. tostring(trackName)
  end

  show("[LOOPER UNDO DELETE]")
  show("currentLooperType=" .. tostring(currentLooperType))
  show("deleteTrack=" .. tostring(trackName))
  show("source=" .. tostring(source))
  show(get_item_debug_string(item))

  reaper.DeleteTrackMediaItem(tr, item)
  reaper.UpdateArrange()

  debug_log("[LOOPER] deleted item count during undo=1")
  show("[LOOPER] deleted loop item from " .. tostring(trackName) .. " via " .. tostring(source))

  return true, "item"
end

local function clear_loop_time_selection()
  reaper.GetSet_LoopTimeRange(true, false, 0, 0, false)
  show("[LOOPER] loop/time selection cleared")
end

local function set_time_selection_from_project_start_to_latest_loop_item_end()
  local trackName, looperType = get_record_track_name()
  local tr = find_track_by_name(trackName)

  if not tr then
    return false, "missing " .. tostring(trackName) .. " track"
  end

  local item = get_latest_item_on_track(tr)

  if not item then
    return false, "no recorded item found on " .. tostring(trackName)
  end

  local pos = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local len = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  local itemEnd = pos + len

  reaper.GetSet_LoopTimeRange(true, false, 0, itemEnd, false)
  goto_project_start()

  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] recordTrack=" .. tostring(trackName))
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

local function undo_latest_loop_recording(payload, shouldStopPlayback)
  payload = payload or {}

  local trackName, looperType = get_record_track_name()

  unarm_preroll()

  if shouldStopPlayback then
    stop_transport_and_return_to_start()
  end

  local recCount = tonumber(payload.recordCount)
  if recCount == nil then
    recCount = loopRecordCount
  end

  show("[LOOPER] undo payload recordCount=" .. tostring(payload.recordCount))
  show("[LOOPER] undo resolved recCount=" .. tostring(recCount))
  show("[LOOPER] undo looperType=" .. tostring(looperType))
  show("[LOOPER] undo activeRecordTrack=" .. tostring(trackName))

  local okDelete, deletedOrErr = delete_latest_loop_record()

  if not okDelete and not shouldStopPlayback then
    show("[LOOPER] delete while playing failed, stopping transport and retrying")

    stop_transport_and_return_to_start()

    okDelete, deletedOrErr = delete_latest_loop_record()
  end

  if not okDelete then
    return false, tostring(deletedOrErr or "failed to delete latest loop recording")
  end

  loopRecordCount = math.max(0, recCount - 1)

  local tr = find_track_by_name(trackName)
  local remaining = count_items_on_track(tr)

  if remaining <= 0 then
    loopRecordCount = 0
    loopRecordStack = {}
    clear_loop_time_selection()
    goto_project_start()
    show("[LOOPER] no loop items remain on " .. tostring(trackName) .. "; loop state reset")
  end

  show("[LOOPER] undo deleted latest " .. tostring(trackName) .. " " .. tostring(deletedOrErr))
  show("[LOOPER] loopRecordCount=" .. tostring(loopRecordCount))
  show("[LOOPER] stackSize=" .. tostring(#loopRecordStack))

  return true
end

----------------------------------------------------------------------
-- CLEAR HELPERS
----------------------------------------------------------------------

local function clear_loop_audio_for_type(looperType)
  looperType = normalize_looper_type(looperType)

  if looperType == "pre_fx" then
    return clear_pre_fx_loop_audio()
  end

  if looperType == "post_fx" then
    return delete_all_items_on_track("LP_POST")
  end

  return false, "unknown looper type: " .. tostring(looperType)
end

----------------------------------------------------------------------
-- INITIAL BOOT CACHE
----------------------------------------------------------------------

cache_original_lp_pre_guid()

----------------------------------------------------------------------
-- START RECORD
----------------------------------------------------------------------

local function start_record_now(payload)
  payload = payload or {}

  local recCount = get_record_count(payload)
  local trackName, looperType = get_record_track_name()

  show("[LOOPER] start recording")
  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] recordTrack=" .. tostring(trackName))
  show("[LOOPER] recCount=" .. tostring(recCount))
  show("[LOOPER] loopRecordCount before start=" .. tostring(loopRecordCount))

  local okPreroll, prerollErr = arm_preroll_if_needed()
  if not okPreroll then
    show("[LOOPER PREROLL] WARN " .. tostring(prerollErr or "failed to arm pre-roll"))
  end

  if recCount == 0 then
    ensure_repeat_enabled()
    goto_project_start()
  end

  if looperType == "post_fx" then
    local lpPostTrack = find_track_by_name("LP_POST")
    postFxRecordStartItemGuids = snapshot_track_item_guids(lpPostTrack)
    debug_log("[LOOPER POST_FX SNAPSHOT] item count at record start=" .. tostring(postFxRecordStartItemGuids.count))
  else
    postFxRecordStartItemGuids = nil
  end

  start_recording()

  loopRecordCount = recCount + 1

  show("[LOOPER] recording started")
  show("[LOOPER] loopRecordCount after start=" .. tostring(loopRecordCount))

  return true
end

----------------------------------------------------------------------
-- LOOPER COMMANDS
----------------------------------------------------------------------

function M.start_record(payload)
  dump_command("startLooperRecord", payload)
  return start_record_now(payload)
end

function M.stop_record(payload)
  dump_command("stopLooperRecord", payload)

  unarm_preroll()

  local recCount = get_record_count(payload)
  local trackName, looperType = get_record_track_name()

  show("[LOOPER] stop recording")
  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] recordTrack=" .. tostring(trackName))
  show("[LOOPER] recCount=" .. tostring(recCount))
  show("[LOOPER] loopRecordCount at stop=" .. tostring(loopRecordCount))

  if looperType == "pre_fx" then
    local actionId
    local effectiveRecCount = tonumber(payload and payload.recordCount) or loopRecordCount

    show("[LOOPER] pre_fx payload.recordCount=" .. tostring(payload and payload.recordCount))
    show("[LOOPER] pre_fx loopRecordCount=" .. tostring(loopRecordCount))
    show("[LOOPER] pre_fx effectiveRecCount=" .. tostring(effectiveRecCount))

    if effectiveRecCount <= 1 then
      actionId = "_4e9c4e29f54f461e914debb2fd456355"
      show("[LOOPER] pre_fx first loop stop")
    else
      actionId = "_089a392ff23d45c1a5f8bf46f9a8dc8c"
      show("[LOOPER] pre_fx overdub stop")
    end

    show("[LOOPER] customActionId=" .. tostring(actionId))

    local cmdId = reaper.NamedCommandLookup(actionId)
    if not cmdId or cmdId == 0 then
      return false, "custom action not found: " .. tostring(actionId)
    end

    reaper.Main_OnCommand(cmdId, 0)

    loopRecordCount = effectiveRecCount

    show("[LOOPER] loopRecordCount=" .. tostring(loopRecordCount))

    return true
  end

  if looperType == "post_fx" then
    local effectiveRecCount = tonumber(payload and payload.recordCount) or loopRecordCount

    show("[LOOPER] post_fx payload.recordCount=" .. tostring(payload and payload.recordCount))
    show("[LOOPER] post_fx loopRecordCount=" .. tostring(loopRecordCount))
    show("[LOOPER] post_fx effectiveRecCount=" .. tostring(effectiveRecCount))

    stop_recording_continue_playback()

    local okPush = push_latest_loop_record()
    if not okPush then
      return false, "no recorded item found on " .. tostring(trackName)
    end

    if effectiveRecCount <= 1 then
      local okRange, rangeErr = set_time_selection_from_project_start_to_latest_loop_item_end()
      if not okRange then
        return false, tostring(rangeErr or "failed to set loop range")
      end

      ensure_repeat_enabled()
      goto_project_start()
      start_playing()

      show("[LOOPER] post_fx first loop captured; playback started from project start")
    else
      goto_project_start()
      start_playing()

      show("[LOOPER] post_fx overdub stopped; playback restarted from project start")
    end

    loopRecordCount = effectiveRecCount

    show("[LOOPER] loopRecordCount=" .. tostring(loopRecordCount))

    return true
  end

  return false, "unknown looper type: " .. tostring(looperType)
end

function M.start_playback(payload)
  dump_command("startLooperPlayback", payload)

  unarm_preroll()
  ensure_repeat_enabled()
  goto_project_start()
  start_playing()

  show("[LOOPER] start playback from project start")

  return true
end

function M.stop_playback(payload)
  dump_command("stopLooperPlayback", payload)

  unarm_preroll()
  stop_transport_and_return_to_start()

  show("[LOOPER] stop playback")

  return true
end

function M.undo_overdub(payload)
  dump_command("undoLooperOverdub", payload)

  local trackName, looperType = get_record_track_name()

  show("[LOOPER] undo overdub")
  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] recordTrack=" .. tostring(trackName))

  if looperType == "pre_fx" then
    return undo_pre_fx_latest_overdub()
  end

  return undo_latest_loop_recording(payload, false)
end

function M.undo_record(payload)
  dump_command("undoLooperRecord", payload)

  local trackName, looperType = get_record_track_name()

  show("[LOOPER] undo record")
  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] recordTrack=" .. tostring(trackName))

  if looperType == "pre_fx" then
    stop_transport_and_return_to_start()
    return undo_pre_fx_latest_overdub()
  end

  return undo_latest_loop_recording(payload, true)
end

function M.clear(payload)
  dump_command("clearLooper", payload)

  payload = payload or {}

  unarm_preroll()

  local payloadLooperType = normalize_looper_type(payload.looperType)
  local looperType = payloadLooperType or read_looper_type()
  local trackName = get_track_name_for_looper_type(looperType)

  show("[LOOPER] delete loop audio")
  show("[LOOPER] looperType=" .. tostring(looperType))
  show("[LOOPER] activeRecordTrack=" .. tostring(trackName))
  show("[LOOPER] clear reason=" .. tostring(payload.reason))

  stop_transport_and_return_to_start()

  if looperType == "post_fx" then
    local okPost, postErr = delete_all_items_on_track("LP_POST")
    if not okPost then
      return false, tostring(postErr or "failed to clear LP_POST audio")
    end

    show("[LOOPER] post_fx cleared all LP_POST audio")

  elseif looperType == "pre_fx" then
    local okPre, preErr = clear_pre_fx_loop_audio()
    if not okPre then
      return false, tostring(preErr or "failed to clear LP_PRE audio")
    end

    show("[LOOPER] pre_fx cleared copied LP_PRE tracks and original LP_PRE audio")

  else
    return false, "unknown looper type: " .. tostring(looperType)
  end

  loopRecordCount = 0
  loopRecordStack = {}
  loopLengthBars = nil
  postFxRecordStartItemGuids = nil

  clear_loop_time_selection()
  goto_project_start()
  reaper.UpdateArrange()

  show("[LOOPER] record count reset to 0")
  show("[LOOPER] stack reset")
  show("[LOOPER] loopLengthBars reset")
  show("[LOOPER] post_fx record snapshot reset")
  show("[LOOPER] time selection cleared")
  show("[LOOPER] playhead moved to project start")
  show("[LOOPER] delete loop audio complete")

  return true
end

function M.toggle_type(payload)
  dump_command("toggleLooperType", payload)

  payload = payload or {}

  unarm_preroll()

  local requestedType = normalize_looper_type(payload.looperType)
  local stateType = read_looper_type()

  show("[LOOPER] toggle type")
  show("[LOOPER] requestedType=" .. tostring(requestedType))
  show("[LOOPER] stateType=" .. tostring(stateType))
  show("[LOOPER] loopRecordCount before toggle=" .. tostring(loopRecordCount))

  local typeToClear = nil

  if requestedType == "pre_fx" then
    typeToClear = "post_fx"
  elseif requestedType == "post_fx" then
    typeToClear = "pre_fx"
  else
    typeToClear = stateType
  end

  show("[LOOPER] clearing loop audio for previous type=" .. tostring(typeToClear))

  local okClear, clearErr = M.clear({
    looperType = typeToClear,
    reason = "toggleLooperType",
  })

  if not okClear then
    return false, tostring(clearErr or "failed to clear loop audio before type switch")
  end

  loopRecordCount = 0
  loopRecordStack = {}
  postFxRecordStartItemGuids = nil

  if requestedType == "pre_fx" then
    cache_original_lp_pre_guid()
  end

  stop_transport_and_return_to_start()

  if requestedType == "post_fx" then
    local lpPostTrack = find_track_by_name("LP_POST")

    if lpPostTrack then
      select_track(lpPostTrack)
      show("[LOOPER] selected LP_POST")
    else
      show("[LOOPER] WARN LP_POST track not found")
    end

  elseif requestedType == "pre_fx" then
    local lpPreTrack = find_track_by_name("LP_PRE")

    if lpPreTrack then
      select_track(lpPreTrack)
      show("[LOOPER] selected LP_PRE")
    else
      show("[LOOPER] WARN LP_PRE track not found")
    end
  end

  show("[LOOPER] looper type changed to " .. tostring(requestedType or stateType))
  show("[LOOPER] record count reset to 0")
  show("[LOOPER] stack reset")
  show("[LOOPER] playback stopped")
  show("[LOOPER] playhead moved to project start")

  return true
end


----------------------------------------------------------------------
-- LOOP LENGTH
----------------------------------------------------------------------

local function set_time_selection_from_project_start_to_measure_count(measureCount)
  measureCount = tonumber(measureCount)

  if not measureCount then
    return false, "invalid measure count"
  end

  measureCount = math.floor(measureCount + 0.5)

  if measureCount < 1 then
    return false, "measure count must be >= 1"
  end

  local startTime = reaper.TimeMap2_beatsToTime(0, 0)
  local endTime = reaper.TimeMap2_beatsToTime(0, 0, measureCount)

  reaper.GetSet_LoopTimeRange(true, false, startTime, endTime, false)
  goto_project_start()

  show("[LOOPER LENGTH]")
  show("measureCount=" .. tostring(measureCount))
  show("startTime=" .. tostring(startTime))
  show("endTime=" .. tostring(endTime))
  show("time selection set: " .. tostring(startTime) .. " -> " .. tostring(endTime))

  return true
end

function M.set_loop_length_enabled(payload)
  dump_command("setLoopLengthEnabled", payload)

  payload = payload or {}

  local enabled = payload.enabled == true

  local ok, payloadJson = pcall(json.encode, payload)
  if not ok then
    payloadJson = "<encode failed>"
  end

  show("[LOOPER LENGTH ENABLED]")
  show("payload=" .. tostring(payloadJson))
  show("enabled=" .. tostring(enabled))
  show("loopLengthBars=" .. tostring(loopLengthBars))

  return true, nil, {
    loopLengthEnabled = enabled,
    loopLengthBars = loopLengthBars,
  }
end

function M.set_loop_length(payload)
  dump_command("setLoopLength", payload)

  payload = payload or {}

  local bars = tonumber(payload.bars or payload.lengthBars or payload.loopLengthBars)

  if not bars then
    return false, "invalid loop length bars"
  end

  bars = math.floor(bars + 0.5)

  if bars < 1 then
    return false, "loop length bars must be >= 1"
  end

  loopLengthBars = bars

  local okRange, rangeErr =
    set_time_selection_from_project_start_to_measure_count(loopLengthBars)

  if not okRange then
    return false, tostring(rangeErr or "failed to set loop length time selection")
  end

  local ok, payloadJson = pcall(json.encode, payload)
  if not ok then
    payloadJson = "<encode failed>"
  end

  show("[LOOPER LENGTH]")
  show("payload=" .. tostring(payloadJson))
  show("loopLengthBars=" .. tostring(loopLengthBars))

  return true, nil, {
    loopLengthBars = loopLengthBars,
  }
end

return M
