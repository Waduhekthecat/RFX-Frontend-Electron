local M = {}

local function decode_error(str, idx, msg)
  error(string.format("Error at position %d: %s", idx, msg))
end

local function skip_ws(str, idx)
  while true do
    local c = str:sub(idx, idx)
    if c == "" then return idx end
    if c ~= " " and c ~= "\n" and c ~= "\r" and c ~= "\t" then
      return idx
    end
    idx = idx + 1
  end
end

local parse_value

local function parse_string(str, idx)
  if str:sub(idx, idx) ~= '"' then
    decode_error(str, idx, "expected string")
  end
  idx = idx + 1
  local out = {}

  while true do
    local c = str:sub(idx, idx)
    if c == "" then
      decode_error(str, idx, "unterminated string")
    elseif c == '"' then
      return table.concat(out), idx + 1
    elseif c == "\\" then
      local esc = str:sub(idx + 1, idx + 1)
      if esc == '"' then out[#out + 1] = '"'
      elseif esc == "\\" then out[#out + 1] = "\\"
      elseif esc == "/" then out[#out + 1] = "/"
      elseif esc == "b" then out[#out + 1] = "\b"
      elseif esc == "f" then out[#out + 1] = "\f"
      elseif esc == "n" then out[#out + 1] = "\n"
      elseif esc == "r" then out[#out + 1] = "\r"
      elseif esc == "t" then out[#out + 1] = "\t"
      else
        decode_error(str, idx, "invalid escape character")
      end
      idx = idx + 2
    else
      out[#out + 1] = c
      idx = idx + 1
    end
  end
end

local function parse_number(str, idx)
  local start_idx = idx
  local c = str:sub(idx, idx)

  if c == "-" then
    idx = idx + 1
  end

  c = str:sub(idx, idx)
  if c == "0" then
    idx = idx + 1
  else
    if not c:match("%d") then
      decode_error(str, idx, "invalid number")
    end
    while str:sub(idx, idx):match("%d") do
      idx = idx + 1
    end
  end

  if str:sub(idx, idx) == "." then
    idx = idx + 1
    if not str:sub(idx, idx):match("%d") then
      decode_error(str, idx, "invalid number")
    end
    while str:sub(idx, idx):match("%d") do
      idx = idx + 1
    end
  end

  c = str:sub(idx, idx)
  if c == "e" or c == "E" then
    idx = idx + 1
    c = str:sub(idx, idx)
    if c == "+" or c == "-" then
      idx = idx + 1
    end
    if not str:sub(idx, idx):match("%d") then
      decode_error(str, idx, "invalid exponent")
    end
    while str:sub(idx, idx):match("%d") do
      idx = idx + 1
    end
  end

  local num = tonumber(str:sub(start_idx, idx - 1))
  if num == nil then
    decode_error(str, start_idx, "invalid number")
  end
  return num, idx
end

local function parse_array(str, idx)
  if str:sub(idx, idx) ~= "[" then
    decode_error(str, idx, "expected '['")
  end
  idx = idx + 1
  idx = skip_ws(str, idx)

  local res = {}
  if str:sub(idx, idx) == "]" then
    return res, idx + 1
  end

  while true do
    local val
    val, idx = parse_value(str, idx)
    res[#res + 1] = val
    idx = skip_ws(str, idx)

    local c = str:sub(idx, idx)
    if c == "]" then
      return res, idx + 1
    elseif c ~= "," then
      decode_error(str, idx, "expected ',' or ']'")
    end
    idx = skip_ws(str, idx + 1)
  end
end

local function parse_object(str, idx)
  if str:sub(idx, idx) ~= "{" then
    decode_error(str, idx, "expected '{'")
  end
  idx = idx + 1
  idx = skip_ws(str, idx)

  local obj = {}
  if str:sub(idx, idx) == "}" then
    return obj, idx + 1
  end

  while true do
    local key
    key, idx = parse_string(str, idx)
    idx = skip_ws(str, idx)

    if str:sub(idx, idx) ~= ":" then
      decode_error(str, idx, "expected ':' after object key")
    end
    idx = skip_ws(str, idx + 1)

    local val
    val, idx = parse_value(str, idx)
    obj[key] = val
    idx = skip_ws(str, idx)

    local c = str:sub(idx, idx)
    if c == "}" then
      return obj, idx + 1
    elseif c ~= "," then
      decode_error(str, idx, "expected ',' or '}'")
    end
    idx = skip_ws(str, idx + 1)
  end
end

parse_value = function(str, idx)
  idx = skip_ws(str, idx)
  local c = str:sub(idx, idx)

  if c == '"' then
    return parse_string(str, idx)
  elseif c == "{" then
    return parse_object(str, idx)
  elseif c == "[" then
    return parse_array(str, idx)
  elseif c == "-" or c:match("%d") then
    return parse_number(str, idx)
  elseif str:sub(idx, idx + 3) == "true" then
    return true, idx + 4
  elseif str:sub(idx, idx + 4) == "false" then
    return false, idx + 5
  elseif str:sub(idx, idx + 3) == "null" then
    return nil, idx + 4
  else
    decode_error(str, idx, "unexpected character '" .. c .. "'")
  end
end

function M.decode(str)
  local res, idx = parse_value(str, 1)
  idx = skip_ws(str, idx)
  if idx <= #str then
    decode_error(str, idx, "trailing garbage")
  end
  return res
end

local function escape_str(s)
  s = s:gsub("\\", "\\\\")
  s = s:gsub('"', '\\"')
  s = s:gsub("\b", "\\b")
  s = s:gsub("\f", "\\f")
  s = s:gsub("\n", "\\n")
  s = s:gsub("\r", "\\r")
  s = s:gsub("\t", "\\t")
  return s
end

local function is_array(t)
  local max = 0
  local count = 0
  for k, _ in pairs(t) do
    if type(k) ~= "number" or k < 1 or k % 1 ~= 0 then
      return false
    end
    if k > max then max = k end
    count = count + 1
  end
  return max == count
end

local function encode_value(v)
  local tv = type(v)

  if tv == "nil" then
    return "null"
  elseif tv == "boolean" then
    return v and "true" or "false"
  elseif tv == "number" then
    return tostring(v)
  elseif tv == "string" then
    return '"' .. escape_str(v) .. '"'
  elseif tv == "table" then
    if is_array(v) then
      local parts = {}
      for i = 1, #v do
        parts[#parts + 1] = encode_value(v[i])
      end
      return "[" .. table.concat(parts, ",") .. "]"
    else
      local parts = {}
      for k, val in pairs(v) do
        parts[#parts + 1] = '"' .. escape_str(tostring(k)) .. '":' .. encode_value(val)
      end
      return "{" .. table.concat(parts, ",") .. "}"
    end
  else
    error("unsupported type for JSON encode: " .. tv)
  end
end

function M.encode(v)
  return encode_value(v)
end

return M
