-- RFX_Boot_Ready.lua
-- Boot handshake:
--   REAPER -> rfx_view.json (full boot snapshot for UI/state storage)
--   REAPER -> rfx_req.json  (small envelope pointer)
--   REAPER -> OSC /rfx/ready (numeric seq ping)
--
-- Goals of this snapshot:
--  - Enough data for RFXCore to build the “shadow model” on boot
--  - Stable identifiers (track GUIDs, FX GUIDs)
--  - Track state (name, rec-arm, mute/solo, vol/pan, etc.)
--  - FX chain per track (id/name/enabled/offline)
--  - Routing graph (sends + receives with channel mapping)
--  - Basic project/transport context (tempo, play state, position, loop)
--
-- Safe to run repeatedly (idempotent snapshot overwrite).

local rp = reaper.GetResourcePath()

if _G.RFX_BOOT_READY_RUNNING then return end
_G.RFX_BOOT_READY_RUNNING = true

local VIEW_JSON_PATH = rp .. "/rfx_view.json"
local REQ_JSON_PATH  = rp .. "/rfx_req.json"

local EXTSTATE_NS = "RFX"
local EXTSTATE_KEY_TEMPLATE_VER = "templateVersion"

-- ============================================================
-- Minimal JSON encoder
-- ============================================================
local function json_escape(s)
  s = tostring(s or "")
  s = s:gsub("\\", "\\\\")
  s = s:gsub('"', '\\"')
  s = s:gsub("\r", "\\r")
  s = s:gsub("\n", "\\n")
  s = s:gsub("\t", "\\t")
  return s
end

local function json_encode(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" then return v and "true" or "false" end
  if t == "number" then
    if v ~= v or v == math.huge or v == -math.huge then return "null" end
    return tostring(v)
  end
  if t == "string" then return '"' .. json_escape(v) .. '"' end
  if t == "table" then
    local is_array = true
    local max_i = 0
    for k,_ in pairs(v) do
      if type(k) ~= "number" then is_array = false break end
      if k > max_i then max_i = k end
    end
    if is_array then
      local parts = {}
      for i = 1, max_i do parts[#parts+1] = json_encode(v[i]) end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k,val in pairs(v) do
        parts[#parts+1] = '"' .. json_escape(k) .. '":' .. json_encode(val)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  end
  return "null"
end

-- ============================================================
-- Atomic write (write temp -> rename)
-- ============================================================
local function write_file_atomic(path, text)
  local tmp = path .. ".tmp"
  local f = io.open(tmp, "w")
  if not f then return false end
  f:write(text or "")
  f:close()
  os.remove(path) -- ignore
  local ok = os.rename(tmp, path)
  if not ok then
    local f2 = io.open(path, "w")
    if not f2 then return false end
    f2:write(text or "")
    f2:close()
  end
  return true
end

-- ============================================================
-- Helpers (safe getters)
-- ============================================================
local function b01(x)
  if type(x) == "boolean" then return x end
  local n = tonumber(x)
  if not n then return false end
  return n > 0
end

local function n0(x)
  if type(x) == "boolean" then return x and 1 or 0 end
  local n = tonumber(x)
  if not n then return 0 end
  return n
end

local function i0(x)
  if type(x) == "boolean" then return x and 1 or 0 end
  local n = tonumber(x)
  if not n then return 0 end
  return math.floor(n)
end

local function get_project_info()
  local proj = 0
  local _, proj_path = reaper.EnumProjects(-1, "")
  local proj_name = reaper.GetProjectName(proj, "")
  if proj_name == "" then proj_name = "(unsaved project)" end
  return proj_name, proj_path
end

local function get_template_version()
  local proj = 0
  local ok, val = reaper.GetProjExtState(proj, EXTSTATE_NS, EXTSTATE_KEY_TEMPLATE_VER)
  if ok == 1 and val ~= "" then return val end
  return "unknown"
end

local function get_selected_track_index()
  local proj = 0
  local tr = reaper.GetSelectedTrack(proj, 0)
  if not tr then return -1 end
  local idx = reaper.GetMediaTrackInfo_Value(tr, "IP_TRACKNUMBER") -- 1-based
  return i0(idx) - 1
end

local function get_transport()
  local proj = 0
  local play = reaper.GetPlayState() -- 0=stopped,1=playing,2=pause,4=recording (bitmask)
  local isPlaying   = (play & 1) == 1
  local isPaused    = (play & 2) == 2
  local isRecording = (play & 4) == 4

  local pos = reaper.GetPlayPosition() or 0
  local editCur = reaper.GetCursorPosition() or 0

  local loopStart, loopEnd = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
  local loopEnabled = (loopEnd or 0) > (loopStart or 0)

  local bpm = reaper.Master_GetTempo() or 120

  -- time signature (may be 0,0 in some contexts; still useful)
  local _, num, den = reaper.TimeMap_GetTimeSigAtTime(proj, pos)
  num = i0(num)
  den = i0(den)

  return {
    playState = play,
    isPlaying = isPlaying,
    isPaused = isPaused,
    isRecording = isRecording,
    playPosSec = n0(pos),
    editCursorSec = n0(editCur),
    loop = {
      enabled = loopEnabled,
      startSec = n0(loopStart),
      endSec = n0(loopEnd),
    },
    tempoBpm = n0(bpm),
    timeSig = { num = num, den = den },
  }
end

-- ============================================================
-- FX inventory
-- ============================================================
local function get_track_fx_chain(tr)
  local fx = {}
  local cnt = reaper.TrackFX_GetCount(tr) or 0
  for fxIndex = 0, cnt - 1 do
    local _, fxName = reaper.TrackFX_GetFXName(tr, fxIndex, "")
    fxName = fxName or ""
    local fxGuid = reaper.TrackFX_GetFXGUID(tr, fxIndex) or ""
    local enabled = true
    if reaper.TrackFX_GetEnabled then
      enabled = b01(reaper.TrackFX_GetEnabled(tr, fxIndex))
    end
    local offline = false
    if reaper.TrackFX_GetOffline then
      offline = b01(reaper.TrackFX_GetOffline(tr, fxIndex))
    end

    fx[#fx+1] = {
      fxIndex = fxIndex,
      fxGuid = fxGuid,
      fxName = fxName,
      enabled = enabled,
      offline = offline,
    }
  end
  return fx
end

-- ============================================================
-- Routing graph (sends / receives)
-- ============================================================
local function get_send_one(tr, category, sendIndex)
  -- category: 0 = sends, -1 = receives
  local destTr = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "P_DESTTRACK")
  local srcTr  = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "P_SRCTRACK")
  local destGuid = ""
  local srcGuid  = ""
  if destTr then destGuid = reaper.GetTrackGUID(destTr) or "" end
  if srcTr  then srcGuid  = reaper.GetTrackGUID(srcTr)  or "" end

  local vol   = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "D_VOL")
  local pan   = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "D_PAN")
  local mute  = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "B_MUTE")
  local phase = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "B_PHASE")
  local mono  = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "B_MONO")
  local srcCh = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "I_SRCCHAN")
  local dstCh = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "I_DSTCHAN")
  local mode  = reaper.GetTrackSendInfo_Value(tr, category, sendIndex, "I_SENDMODE") -- 0=post-fader,1=pre-fx,2=pre-fader, etc.

  -- optional: unique send "name" (can be empty)
  local name = ""
  if reaper.GetTrackSendName then
    local ok, nm = reaper.GetTrackSendName(tr, category, sendIndex, "")
    if ok then name = nm or "" end
  end

  return {
    index = sendIndex,
    name = name,

    category = (category == 0 and "send" or "receive"),
    sendMode = i0(mode),

    srcTrackGuid = srcGuid,
    destTrackGuid = destGuid,

    vol = n0(vol),
    pan = n0(pan),
    mute = b01(mute),
    phaseInvert = b01(phase),
    mono = b01(mono),

    srcChan = i0(srcCh),
    dstChan = i0(dstCh),
  }
end

local function get_track_routing(tr)
  local routing = { sends = {}, receives = {} }

  local sendCount = reaper.GetTrackNumSends(tr, 0) or 0
  for i = 0, sendCount - 1 do
    routing.sends[#routing.sends+1] = get_send_one(tr, 0, i)
  end

  local recvCount = reaper.GetTrackNumSends(tr, -1) or 0
  for i = 0, recvCount - 1 do
    routing.receives[#routing.receives+1] = get_send_one(tr, -1, i)
  end

  return routing
end

-- ============================================================
-- Track inventory (full state for shadow model)
-- ============================================================
local function get_track_state(tr, trackIndex0)
  local _, name = reaper.GetTrackName(tr, "")
  if name == "" then name = ("Track " .. tostring(trackIndex0 + 1)) end

  local guid = reaper.GetTrackGUID(tr) or ""

  local trackNumber = reaper.GetMediaTrackInfo_Value(tr, "IP_TRACKNUMBER") -- 1-based
  local folderDepth = reaper.GetMediaTrackInfo_Value(tr, "I_FOLDERDEPTH")  -- -1 end, 0 normal, 1 start folder
  local selected    = b01(reaper.GetMediaTrackInfo_Value(tr, "I_SELECTED"))
  local recArm      = b01(reaper.GetMediaTrackInfo_Value(tr, "I_RECARM"))
  local recMon      = i0(reaper.GetMediaTrackInfo_Value(tr, "I_RECMON"))   -- 0 off, 1 on, 2 auto-tape
  local recMode     = i0(reaper.GetMediaTrackInfo_Value(tr, "I_RECMODE"))
  local input       = i0(reaper.GetMediaTrackInfo_Value(tr, "I_RECINPUT")) -- input id
  local mute        = b01(reaper.GetMediaTrackInfo_Value(tr, "B_MUTE"))
  local solo        = i0(reaper.GetMediaTrackInfo_Value(tr, "I_SOLO"))     -- 0/1/2 etc
  local phase       = b01(reaper.GetMediaTrackInfo_Value(tr, "B_PHASE"))
  local vol         = n0(reaper.GetMediaTrackInfo_Value(tr, "D_VOL"))
  local pan         = n0(reaper.GetMediaTrackInfo_Value(tr, "D_PAN"))
  local width       = n0(reaper.GetMediaTrackInfo_Value(tr, "D_WIDTH"))
  local panLaw      = n0(reaper.GetMediaTrackInfo_Value(tr, "D_PANLAW"))
  local tcMode      = i0(reaper.GetMediaTrackInfo_Value(tr, "I_TCPHIDE"))  -- UI hide (TCP); can be useful but optional
  local mcMode      = i0(reaper.GetMediaTrackInfo_Value(tr, "I_MCPHIDE"))  -- UI hide (MCP)

  local colorNative = i0(reaper.GetTrackColor(tr) or 0) -- native int; RFX can decode later if desired

  local fxChain = get_track_fx_chain(tr)
  local routing = get_track_routing(tr)

  -- parent folder (if any)
  local parentGuid = ""
  if reaper.GetParentTrack then
    local p = reaper.GetParentTrack(tr)
    if p then parentGuid = reaper.GetTrackGUID(p) or "" end
  end

  -- Master/Hardware output info
  local bMasterSend = b01(reaper.GetMediaTrackInfo_Value(tr, "B_MAINSEND"))

  return {
    trackIndex = trackIndex0,
    trackNumber = i0(trackNumber),
    trackName = name,
    trackGuid = guid,

    parentGuid = parentGuid,
    folderDepth = i0(folderDepth),

    selected = selected,

    recArm = recArm,
    recMon = recMon,
    recMode = recMode,
    recInput = input,

    mute = mute,
    solo = solo,
    phaseInvert = phase,

    vol = vol,
    pan = pan,
    width = width,
    panLaw = panLaw,

    masterSend = bMasterSend,

    tcpHide = tcMode,
    mcpHide = mcMode,

    color = colorNative,

    fxCount = #fxChain,
    fx = fxChain,

    routing = routing,
  }
end

local function get_all_tracks()
  local proj = 0
  local tracks = {}
  local n = reaper.CountTracks(proj) or 0
  for i = 0, n - 1 do
    local tr = reaper.GetTrack(proj, i)
    tracks[#tracks+1] = get_track_state(tr, i)
  end
  return tracks
end

-- ============================================================
-- OSC ping (your pipeline expects NUMBER value)
-- ============================================================
local function send_ready_ping(seq)
  if not reaper.OscLocalMessageToHost then
    return false, "OscLocalMessageToHost not available"
  end
  reaper.OscLocalMessageToHost("/rfx/ready", seq) -- IMPORTANT: number only
  return true
end

-- ============================================================
-- Main
-- ============================================================
local function main()
  local reaper_ver = reaper.GetAppVersion() or "unknown"
  local projectName, projectPath = get_project_info()
  local templateVersion = get_template_version()

  local tracks = get_all_tracks()
  local selectedTrackIndex = get_selected_track_index()
  local transport = get_transport()

  -- numeric seq helps Electron confirm it read the matching JSON
  local seq = math.floor((reaper.time_precise() or os.clock()) * 1000)

  local view_payload = {
    schema = "rfx_view_boot_v2",
    type = "bootReady",
    ok = true,
    seq = seq,

    reaper = {
      version = reaper_ver,
      resourcePath = rp,
    },

    project = {
      name = projectName,
      path = projectPath,
      templateVersion = templateVersion,
    },

    selection = {
      selectedTrackIndex = selectedTrackIndex,
    },

    transport = transport,

    trackCount = #tracks,
    tracks = tracks,

    ts = os.time(),
  }

  local req_payload = {
    type = "bootReady",
    ok = true,
    seq = seq,
    outPath = VIEW_JSON_PATH,
    message = "wrote rfx_view.json boot snapshot (v2)",
    ts = os.time(),
  }

  local view_json = json_encode(view_payload)
  local req_json  = json_encode(req_payload)

  if not write_file_atomic(VIEW_JSON_PATH, view_json) then
    reaper.ShowConsoleMsg("[RFX_Boot_Ready] FAILED writing " .. VIEW_JSON_PATH .. "\n")
    return
  end

  if not write_file_atomic(REQ_JSON_PATH, req_json) then
    reaper.ShowConsoleMsg("[RFX_Boot_Ready] WARN could not write " .. REQ_JSON_PATH .. "\n")
  end

  local sent, err = send_ready_ping(seq)
  if sent then
    reaper.ShowConsoleMsg("[RFX_Boot_Ready] wrote rfx_view.json + sent /rfx/ready " .. tostring(seq) .. "\n")
  else
    reaper.ShowConsoleMsg("[RFX_Boot_Ready] wrote rfx_view.json but OSC failed: " .. tostring(err) .. "\n")
  end
end

main()
_G.RFX_BOOT_READY_RUNNING = nil
