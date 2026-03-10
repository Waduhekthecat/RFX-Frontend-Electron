local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")

local M = {}

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

local function log_export(msg)
  local line = "[" .. tostring(now_ms()) .. "] " .. tostring(msg) .. "\n"
  append_file(get_ipc_dir() .. "/export_debug.log", line)
end

local function clamp01(n)
  n = tonumber(n) or 0
  if n < 0 then return 0 end
  if n > 1 then return 1 end
  return n
end

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
    local _, trName = reaper.GetTrackName(tr)
    if trName == name then
      return tr
    end
  end
  return nil
end

local function read_state()
  local path = get_ipc_dir() .. "/state.json"
  local raw = read_file(path)
  if not raw or raw == "" then
    return {
      activeBusId = "FX_1",
      busModes = {
        FX_1 = "linear",
        FX_2 = "linear",
        FX_3 = "linear",
        FX_4 = "linear",
      },
    }
  end

  local okDecode, stateOrErr = pcall(json.decode, raw)
  if not okDecode or type(stateOrErr) ~= "table" then
    return {
      activeBusId = "FX_1",
      busModes = {
        FX_1 = "linear",
        FX_2 = "linear",
        FX_3 = "linear",
        FX_4 = "linear",
      },
    }
  end

  local s = stateOrErr
  if type(s.busModes) ~= "table" then
    s.busModes = {}
  end

  if s.activeBusId ~= "FX_1" and s.activeBusId ~= "FX_2" and s.activeBusId ~= "FX_3" and s.activeBusId ~= "FX_4" then
    s.activeBusId = "FX_1"
  end

  if s.busModes.FX_1 ~= "linear" and s.busModes.FX_1 ~= "parallel" and s.busModes.FX_1 ~= "lcr" then
    s.busModes.FX_1 = "linear"
  end
  if s.busModes.FX_2 ~= "linear" and s.busModes.FX_2 ~= "parallel" and s.busModes.FX_2 ~= "lcr" then
    s.busModes.FX_2 = "linear"
  end
  if s.busModes.FX_3 ~= "linear" and s.busModes.FX_3 ~= "parallel" and s.busModes.FX_3 ~= "lcr" then
    s.busModes.FX_3 = "linear"
  end
  if s.busModes.FX_4 ~= "linear" and s.busModes.FX_4 ~= "parallel" and s.busModes.FX_4 ~= "lcr" then
    s.busModes.FX_4 = "linear"
  end

  return s
end

local function reaper_vol_to_ui01(vol)
  local n = tonumber(vol) or 1.0
  return clamp01(n)
end

local function track_recarm_bool(tr)
  if not tr then return false end
  return (reaper.GetMediaTrackInfo_Value(tr, "I_RECARM") or 0) > 0.5
end

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
  }
end

local function collect_tracks()
  local out = {}

  local inputTr = find_track_by_name("INPUT")
  out[#out + 1] = {
    id = "INPUT",
    label = "INPUT",
    busId = "",
    lane = "",
    recArm = track_recarm_bool(inputTr),
  }

  local specs = get_lane_specs()

  for i = 1, #specs do
    local s = specs[i]
    local tr = find_track_by_name(s.id)

    out[#out + 1] = {
      id = s.id,
      label = s.id,
      busId = s.busId,
      lane = s.lane,
      recArm = track_recarm_bool(tr),
    }
  end

  return out
end

local function collect_track_mix()
  local mix = {}

  local ids = {
    "INPUT",
    "FX_1A", "FX_1B", "FX_1C",
    "FX_2A", "FX_2B", "FX_2C",
    "FX_3A", "FX_3B", "FX_3C",
    "FX_4A", "FX_4B", "FX_4C",
  }

  for i = 1, #ids do
    local id = ids[i]
    local tr = find_track_by_name(id)

    local vol = 0.716
    local pan = 0.0

    if tr then
      vol = reaper.GetMediaTrackInfo_Value(tr, "D_VOL")
      pan = reaper.GetMediaTrackInfo_Value(tr, "D_PAN")
    end

    mix[id] = {
      vol = reaper_vol_to_ui01(vol),
      pan = tonumber(pan) or 0.0,
    }
  end

  return mix
end

local function collect_fx()
  local fxByGuid = {}
  local fxOrderByTrackGuid = {}

  local trackIds = {
    "INPUT",
    "FX_1", "FX_2", "FX_3", "FX_4",
    "FX_1A", "FX_1B", "FX_1C",
    "FX_2A", "FX_2B", "FX_2C",
    "FX_3A", "FX_3B", "FX_3C",
    "FX_4A", "FX_4B", "FX_4C",
  }

  for i = 1, #trackIds do
    local trackId = trackIds[i]
    local tr = find_track_by_name(trackId)
    local order = {}

    if tr then
      local fxCount = reaper.TrackFX_GetCount(tr)
      for fxIndex = 0, fxCount - 1 do
        local _, fxName = reaper.TrackFX_GetFXName(tr, fxIndex, "")
        local enabled = reaper.TrackFX_GetEnabled(tr, fxIndex)

        local fxGuid = reaper.TrackFX_GetFXGUID(tr, fxIndex)
        if not fxGuid or fxGuid == "" then
          fxGuid = trackId .. "::fx::fallback::" .. tostring(fxIndex) .. "::" .. tostring(fxName)
        end

        order[#order + 1] = fxGuid
        fxByGuid[fxGuid] = {
          guid = fxGuid,
          trackGuid = trackId,
          fxIndex = fxIndex,
          name = fxName or ("FX " .. tostring(fxIndex + 1)),
          vendor = "",
          format = "",
          enabled = enabled == true,
          raw = nil,
        }
      end
    end

    fxOrderByTrackGuid[trackId] = order
  end

  return fxByGuid, fxOrderByTrackGuid
end

local function lane_enabled_for_mode(lane, mode)
  if lane == "A" then return true end
  if lane == "B" then return mode == "parallel" or mode == "lcr" end
  if lane == "C" then return mode == "lcr" end
  return false
end

local function collect_routes(state)
  local routes = {}
  local inputTr = find_track_by_name("INPUT")

  if not inputTr then
    return routes
  end

  local specs = get_lane_specs()

  for i = 1, #specs do
    local s = specs[i]
    local mode = normalize_mode(state.busModes[s.busId])
    local isActiveBus = (state.activeBusId == s.busId)
    local shouldRoute = isActiveBus and lane_enabled_for_mode(s.lane, mode)

    if shouldRoute then
      routes[#routes + 1] = {
        id = "INPUT->" .. s.id,
        category = "send",
        trackGuid = "INPUT",
        srcTrackGuid = "INPUT",
        destTrackGuid = s.id,
        sendMode = 0,
        vol = 1.0,
        pan = 0.0,
        mute = false,
        phaseInvert = false,
        mono = false,
        srcChan = 0,
        dstChan = 0,
      }
    end
  end

  return routes
end

local function pretty_json(jsonStr)
  local indent = 0
  local inString = false
  local out = {}

  local function addIndent()
    out[#out+1] = string.rep("  ", indent)
  end

  for i = 1, #jsonStr do
    local c = jsonStr:sub(i,i)

    if c == '"' then
      out[#out+1] = c
      local escaped = jsonStr:sub(i-1,i-1) == "\\"
      if not escaped then
        inString = not inString
      end

    elseif not inString and (c == "{" or c == "[") then
      out[#out+1] = c
      out[#out+1] = "\n"
      indent = indent + 1
      addIndent()

    elseif not inString and (c == "}" or c == "]") then
      out[#out+1] = "\n"
      indent = indent - 1
      addIndent()
      out[#out+1] = c

    elseif not inString and c == "," then
      out[#out+1] = c
      out[#out+1] = "\n"
      addIndent()

    elseif not inString and c == ":" then
      out[#out+1] = ": "

    else
      out[#out+1] = c
    end
  end

  return table.concat(out)
end

function M.export_vm()
  log_export("export_vm() begin")

  local okCollect, fxByGuid, fxOrderByTrackGuid = pcall(function()
    local a, b = collect_fx()
    return a, b
  end)

  if not okCollect then
    write_file(get_ipc_dir() .. "/export_error.txt", "collect_fx failed: " .. tostring(fxByGuid))
    log_export("collect_fx failed: " .. tostring(fxByGuid))
    return false
  end

  local state = read_state()
  local tracks = collect_tracks()
  local trackMix = collect_track_mix()
  local routes = collect_routes(state)

  local okVm, vmOrErr = pcall(function()
    return {
      schemaVersion = 1,
      schema = "rfx_vm_v1",
      seq = now_ms(),
      ts = now_ms(),

      capabilities = {
        routingModes = { "linear", "parallel", "lcr" }
      },

      buses = {
        { id = "FX_1", label = "FX_1", busNum = 1 },
        { id = "FX_2", label = "FX_2", busNum = 2 },
        { id = "FX_3", label = "FX_3", busNum = 3 },
        { id = "FX_4", label = "FX_4", busNum = 4 },
      },

      activeBusId = state.activeBusId,

      busModes = {
        FX_1 = state.busModes.FX_1,
        FX_2 = state.busModes.FX_2,
        FX_3 = state.busModes.FX_3,
        FX_4 = state.busModes.FX_4,
      },

      busMix = {
        FX_1 = { vol = 0.716 },
        FX_2 = { vol = 0.716 },
        FX_3 = { vol = 0.716 },
        FX_4 = { vol = 0.716 },
      },

      tracks = tracks,
      trackMix = trackMix,
      routes = routes,

      meters = {},
      fxByGuid = fxByGuid,
      fxOrderByTrackGuid = fxOrderByTrackGuid,
      fxParamsByGuid = {},
      fxEnabledByGuid = {},
      fxReorderLastByTrackGuid = {},
    }
  end)

  if not okVm then
    write_file(get_ipc_dir() .. "/export_error.txt", "vm build failed: " .. tostring(vmOrErr))
    log_export("vm build failed: " .. tostring(vmOrErr))
    return false
  end

  local vm = vmOrErr

  local okEncode, encoded = pcall(json.encode, vm)
  if okEncode and encoded then
    encoded = pretty_json(encoded)
  end
  if not okEncode or not encoded then
    write_file(get_ipc_dir() .. "/export_error.txt", "json.encode(vm) failed: " .. tostring(encoded))
    log_export("json.encode(vm) failed: " .. tostring(encoded))
    return false
  end

  local path = get_ipc_dir() .. "/vm.json"
  local okWrite = write_file(path, encoded)
  if not okWrite then
    write_file(get_ipc_dir() .. "/export_error.txt", "failed to write vm.json to " .. path)
    log_export("failed to write vm.json to " .. path)
    return false
  end

  write_file(get_ipc_dir() .. "/export_ok.txt", "vm exported at " .. tostring(vm.ts))
  log_export("export_vm() success")
  return true
end

return M
