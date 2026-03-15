local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")
local exporter = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_ExportVm.lua")
local installedExporter = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_ExportPluginList.lua")
local router = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Router.lua")

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

local function write_result(id, name, okFlag, err)
  local result = {
    id = id or "",
    ts = now_ms(),
    name = name or "",
    ok = okFlag == true,
    error = err or "",
  }
  local ok = write_json(get_ipc_dir() .. "/res.json", result)
  if not ok then
    log_debug("FAILED to write res.json")
  end
end

local function state_path()
  return get_ipc_dir() .. "/state.json"
end

local function default_state()
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

local function normalize_bus_id(v)
  local s = tostring(v or "")
  if s == "FX_1" or s == "FX_2" or s == "FX_3" or s == "FX_4" then
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

  state.busModes.FX_1 = normalize_mode(state.busModes.FX_1) or "linear"
  state.busModes.FX_2 = normalize_mode(state.busModes.FX_2) or "linear"
  state.busModes.FX_3 = normalize_mode(state.busModes.FX_3) or "linear"
  state.busModes.FX_4 = normalize_mode(state.busModes.FX_4) or "linear"

  return state
end

local function write_state(state)
  return write_json(state_path(), state)
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

  reaper.ShowConsoleMsg("[RFX] SYNCVIEW FROM RFX ts=" .. tostring(ts) .. "\n")
  log_debug("SYNCVIEW FROM RFX ts=" .. tostring(ts))

  local ok = exporter.export_vm()

  if not ok then
    reaper.ShowConsoleMsg("[RFX] SYNCVIEW export_vm FAILED ts=" .. tostring(now_ms()) .. "\n")
    log_error("SYNCVIEW export_vm failed ts=" .. tostring(now_ms()))
    return false, "syncView export_vm failed"
  end

  reaper.ShowConsoleMsg("[RFX] SYNCVIEW export_vm WROTE vm.json ts=" .. tostring(now_ms()) .. "\n")
  log_debug("SYNCVIEW export_vm wrote vm.json ts=" .. tostring(now_ms()))
  return true
end

local function exec_selectActiveBus(payload)
  local busId = normalize_bus_id(payload.busId)
  if not busId then
    return false, "invalid busId"
  end

  local state = read_state()
  state.activeBusId = busId

  if not write_state(state) then
    return false, "failed to write state.json"
  end

  local okRouting, routingErr = apply_routing_from_state(state)
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

  local okRouting, routingErr = apply_routing_from_state(state)
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
    else
      log_error("deferred export_vm() failed")
    end
  end

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
      reaper.ShowConsoleMsg("[RFX] CMD received name=" .. cmdName .. " id=" .. cmdId .. "\n")
      
      local okExec, okFlag, err = pcall(execute_command, cmd)
      
      if okExec then
        write_result(cmd.id, cmd.name, okFlag, err)
        log_debug("Command result: ok=" .. tostring(okFlag) .. " err=" .. tostring(err or ""))
        reaper.ShowConsoleMsg(
          "[RFX] CMD result name=" .. cmdName ..
          " ok=" .. tostring(okFlag) ..
          " err=" .. tostring(err or "") .. "\n"
        )
      else
        write_result(cmd.id, cmd.name, false, "runtime error: " .. tostring(okFlag))
        log_error("Runtime error while executing command: " .. tostring(okFlag))
        reaper.ShowConsoleMsg(
          "[RFX] CMD runtime error name=" .. cmdName ..
          " err=" .. tostring(okFlag) .. "\n"
        )
      end

      delete_file(cmdPath)
    end
  end

  reaper.defer(process_once)
end

write_heartbeat()
log_debug("Watcher started. IPC dir=" .. get_ipc_dir())

do
  local s = read_state()
  write_state(s)

  local okRouting, errRouting = apply_routing_from_state(s)
  if okRouting then
    log_debug("routing state applied at startup")
  else
    log_error("startup routing apply failed: " .. tostring(errRouting or "unknown"))
  end

  local okVm = exporter.export_vm()
  if okVm then
    log_debug("vm.json exported at startup")
  else
    log_error("failed to export vm.json at startup")
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
