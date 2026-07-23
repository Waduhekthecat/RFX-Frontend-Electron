local json = dofile(reaper.GetResourcePath() .. "/Scripts/reascripts/RFX_Json.lua")

local M = {}

local function get_ipc_dir()
  return "/tmp/rfx-ipc"
end

local function output_path()
  return get_ipc_dir() .. "/installed_plugins.json"
end

local function ensure_ipc_dir()
  reaper.RecursiveCreateDirectory(get_ipc_dir(), 0)
end

local function now_ms()
  return math.floor(reaper.time_precise() * 1000)
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

local function trim(s)
  s = tostring(s or "")
  s = s:gsub("^%s+", "")
  s = s:gsub("%s+$", "")
  return s
end

local function lower_trim(s)
  return string.lower(trim(s))
end

local function detect_format(raw)
  local s = trim(raw)

  if s:match("^VST3i:") then return "VST3i" end
  if s:match("^VST3:") then return "VST3" end
  if s:match("^VSTi:") then return "VSTi" end
  if s:match("^VST:") then return "VST" end
  if s:match("^CLAPi:") then return "CLAPi" end
  if s:match("^CLAP:") then return "CLAP" end
  if s:match("^LV2i:") then return "LV2i" end
  if s:match("^LV2:") then return "LV2" end
  if s:match("^DXi:") then return "DXi" end
  if s:match("^DX:") then return "DX" end
  if s:match("^AUi:") then return "AUi" end
  if s:match("^AU:") then return "AU" end
  if s:match("^JS:") then return "JS" end
  if s:match("^ReWire:") then return "ReWire" end

  return ""
end

local function strip_format_prefix(raw)
  local s = trim(raw)

  s = s:gsub("^VST3i:%s*", "")
  s = s:gsub("^VST3:%s*", "")
  s = s:gsub("^VSTi:%s*", "")
  s = s:gsub("^VST:%s*", "")
  s = s:gsub("^CLAPi:%s*", "")
  s = s:gsub("^CLAP:%s*", "")
  s = s:gsub("^LV2i:%s*", "")
  s = s:gsub("^LV2:%s*", "")
  s = s:gsub("^DXi:%s*", "")
  s = s:gsub("^DX:%s*", "")
  s = s:gsub("^AUi:%s*", "")
  s = s:gsub("^AU:%s*", "")
  s = s:gsub("^JS:%s*", "")
  s = s:gsub("^ReWire:%s*", "")

  return trim(s)
end

local function split_vendor_and_name(displayName)
  local s = trim(displayName)
  if s == "" then
    return "", ""
  end

  local base, vendor = s:match("^(.-)%s*%((.-)%)%s*$")
  if base and vendor and trim(base) ~= "" then
    return trim(base), trim(vendor)
  end

  return s, ""
end

local function should_exclude_plugin(raw)
  local s = lower_trim(raw)
  local format = detect_format(raw)

  -- RFX is Windows-based, so hide AU entirely
  if format == "AU" or format == "AUi" then
    return true
  end

  -- Hide JS and all project-local JSFX
  if s:match("^js:") then
    return true
  end

  if s:find("<project>", 1, true) then
    return true
  end

  -- Hide formats / pseudo-items we do not want in the browser
  if format == "ReWire" then
    return true
  end

  if s == "container" then
    return true
  end

  if s == "video processor" then
    return true
  end

  return false
end

local function format_rank(format)
  if format == "VST3i" then return 1 end
  if format == "VST3"  then return 2 end
  if format == "VSTi"  then return 3 end
  if format == "VST"   then return 4 end
  if format == "CLAPi" then return 5 end
  if format == "CLAP"  then return 6 end
  if format == "LV2i"  then return 7 end
  if format == "LV2"   then return 8 end
  if format == "DXi"   then return 9 end
  if format == "DX"    then return 10 end
  return 999
end

local function has_variant_suffix(raw)
  local s = strip_format_prefix(raw)
  local lower = string.lower(s)

  if lower:find("%(mono%)", 1, false) then return true end
  if lower:find("%(%d+%s*out%)", 1, false) then return true end
  if lower:find("%(%d+%-%>%d+ch%)", 1, false) then return true end
  if lower:find("%(%d+ch%)", 1, false) then return true end

  return false
end

local function make_group_key(name, raw)
  local base = lower_trim(name)

  -- Keep clearly distinct functional variants separate
  if has_variant_suffix(raw) then
    return lower_trim(strip_format_prefix(raw))
  end

  return base
end

local function build_candidate_rows()
  local rows = {}
  local seenRaw = {}

  local i = 0
  while true do
    local ok, rawName = reaper.EnumInstalledFX(i)
    if not ok then break end

    local raw = trim(rawName)
    if raw ~= "" and not should_exclude_plugin(raw) then
      local rawKey = lower_trim(raw)
      if not seenRaw[rawKey] then
        seenRaw[rawKey] = true

        local format = detect_format(raw)
        local displayName = strip_format_prefix(raw)
        local name, vendor = split_vendor_and_name(displayName)

        rows[#rows + 1] = {
          name = name ~= "" and name or displayName,
          id = raw,
          raw = raw,
          format = format,
          vendor = vendor,
          _groupKey = make_group_key(name ~= "" and name or displayName, raw),
          _rank = format_rank(format),
        }
      end
    end

    i = i + 1
  end

  return rows
end

local function choose_preferred_rows(candidates)
  local bestByGroup = {}

  for i = 1, #candidates do
    local row = candidates[i]
    local key = row._groupKey or lower_trim(row.name or row.raw or "")
    local cur = bestByGroup[key]

    if not cur then
      bestByGroup[key] = row
    else
      if row._rank < cur._rank then
        bestByGroup[key] = row
      elseif row._rank == cur._rank then
        local rowRaw = lower_trim(row.raw or "")
        local curRaw = lower_trim(cur.raw or "")
        if rowRaw < curRaw then
          bestByGroup[key] = row
        end
      end
    end
  end

  local rows = {}
  for _, row in pairs(bestByGroup) do
    rows[#rows + 1] = {
      name = row.name,
      id = row.id,
      raw = row.raw,
      format = row.format,
      vendor = row.vendor,
    }
  end

  table.sort(rows, function(a, b)
    local aName = lower_trim(a.name or a.raw or "")
    local bName = lower_trim(b.name or b.raw or "")
    if aName ~= bName then return aName < bName end

    local aRank = format_rank(a.format or "")
    local bRank = format_rank(b.format or "")
    if aRank ~= bRank then return aRank < bRank end

    return lower_trim(a.raw or "") < lower_trim(b.raw or "")
  end)

  return rows
end

local function build_plugin_rows()
  local candidates = build_candidate_rows()
  local rows = choose_preferred_rows(candidates)
  return rows
end

function M.export_installed_plugins()
  ensure_ipc_dir()
  log_export("export_installed_plugins() begin path=" .. output_path())

  local okBuild, rowsOrErr = pcall(build_plugin_rows)
  if not okBuild then
    log_export("build_plugin_rows failed: " .. tostring(rowsOrErr))
    return false
  end

  local rows = rowsOrErr

  local okEncode, encoded = pcall(json.encode, rows)
  if not okEncode or not encoded then
    log_export("json.encode(installed_plugins) failed: " .. tostring(encoded))
    return false
  end

  local okWrite = write_file(output_path(), encoded)
  if not okWrite then
    log_export("failed to write " .. output_path())
    return false
  end

  log_export("export_installed_plugins() success count=" .. tostring(#rows))
  return true
end

return M
