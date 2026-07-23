local M = {}

local function normalize_mode(v)
  local s = tostring(v or ""):lower()
  if s == "linear" or s == "parallel" or s == "lcr" then
    return s
  end
  return "linear"
end

local function find_track_by_name(name)
  local trackCount = reaper.CountTracks(0)
  for i = 0, trackCount - 1 do
    local tr = reaper.GetTrack(0, i)
    local _, trName = reaper.GetTrackName(tr, "")
    if trName == name then
      return tr
    end
  end
  return nil
end

local function lane_should_be_armed(mode, lane)
  mode = normalize_mode(mode)

  if lane == "A" then return true end
  if lane == "B" then return mode == "parallel" or mode == "lcr" end
  if lane == "C" then return mode == "lcr" end
  return false
end

local function set_track_recarm(tr, armed)
  if not tr then return end
  reaper.SetMediaTrackInfo_Value(tr, "I_RECARM", armed and 1 or 0)
end

local function get_lane_track_names_for_bus(busId)
  return {
    A = busId .. "A",
    B = busId .. "B",
    C = busId .. "C",
  }
end

function M.apply_all_bus_lane_arming(busModes)
  local busIds = { "FX_1", "FX_2", "FX_3", "FX_4" }

  for i = 1, #busIds do
    local busId = busIds[i]
    local mode = normalize_mode((busModes or {})[busId])
    local names = get_lane_track_names_for_bus(busId)

    local trA = find_track_by_name(names.A)
    local trB = find_track_by_name(names.B)
    local trC = find_track_by_name(names.C)

    set_track_recarm(trA, lane_should_be_armed(mode, "A"))
    set_track_recarm(trB, lane_should_be_armed(mode, "B"))
    set_track_recarm(trC, lane_should_be_armed(mode, "C"))
  end
end

local function get_send_dest_track(srcTrack, sendIdx)
  if not srcTrack then return nil end

  local ok, dest = pcall(function()
    return reaper.GetTrackSendInfo_Value(srcTrack, 0, sendIdx, "P_DESTTRACK")
  end)

  if ok then
    return dest
  end

  return nil
end

local function delete_send_by_dest_track(srcTrack, destTrack)
  if not srcTrack or not destTrack then return end

  for sendIdx = reaper.GetTrackNumSends(srcTrack, 0) - 1, 0, -1 do
    local dst = get_send_dest_track(srcTrack, sendIdx)
    if dst == destTrack then
      reaper.RemoveTrackSend(srcTrack, 0, sendIdx)
    end
  end
end

local function ensure_send_exists(srcTrack, destTrack)
  if not srcTrack or not destTrack then return end

  for sendIdx = 0, reaper.GetTrackNumSends(srcTrack, 0) - 1 do
    local dst = get_send_dest_track(srcTrack, sendIdx)
    if dst == destTrack then
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "D_VOL", 1.0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "D_PAN", 0.0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "B_MUTE", 0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_SENDMODE", 0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_SRCCHAN", 0)
      reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_DSTCHAN", 0)
      return
    end
  end

  local sendIdx = reaper.CreateTrackSend(srcTrack, destTrack)
  if sendIdx >= 0 then
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "D_VOL", 1.0)
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "D_PAN", 0.0)
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "B_MUTE", 0)
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_SENDMODE", 0)
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_SRCCHAN", 0)
    reaper.SetTrackSendInfo_Value(srcTrack, 0, sendIdx, "I_DSTCHAN", 0)
  end
end

function M.rebuild_input_sends(activeBusId, busModes)
  local inputTr = find_track_by_name("INPUT")
  if not inputTr then
    return false, "INPUT track not found"
  end

  local busIds = { "FX_1", "FX_2", "FX_3", "FX_4" }

  for i = 1, #busIds do
    local busId = busIds[i]
    local names = get_lane_track_names_for_bus(busId)

    delete_send_by_dest_track(inputTr, find_track_by_name(names.A))
    delete_send_by_dest_track(inputTr, find_track_by_name(names.B))
    delete_send_by_dest_track(inputTr, find_track_by_name(names.C))
  end

  local mode = normalize_mode((busModes or {})[activeBusId])
  local names = get_lane_track_names_for_bus(activeBusId)

  if lane_should_be_armed(mode, "A") then
    ensure_send_exists(inputTr, find_track_by_name(names.A))
  end
  if lane_should_be_armed(mode, "B") then
    ensure_send_exists(inputTr, find_track_by_name(names.B))
  end
  if lane_should_be_armed(mode, "C") then
    ensure_send_exists(inputTr, find_track_by_name(names.C))
  end

  return true
end

function M.apply_routing_state(activeBusId, busModes)
  reaper.PreventUIRefresh(1)
  reaper.Undo_BeginBlock()

  M.apply_all_bus_lane_arming(busModes)
  local ok, err = M.rebuild_input_sends(activeBusId, busModes)

  reaper.TrackList_AdjustWindows(false)
  reaper.UpdateArrange()

  reaper.Undo_EndBlock("RFX Apply Routing State", -1)
  reaper.PreventUIRefresh(-1)

  return ok, err
end

return M
