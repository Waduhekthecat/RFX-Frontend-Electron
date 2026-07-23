-- RFX Automatic Rig Input Analysis
-- Standalone deferred ReaScript. Future RFX integration can invoke this as a
-- normal REAPER action after the representative DI item has been selected.

local COARSE_CANDIDATES = { -12, -8, -4, 0, 4, 8, 12 }
local MIN_ITEM_DURATION = 5.0
local MAX_ITEM_DURATION = 20.0
local GAIN_SETTLE_SECONDS = 0.150
local END_TOLERANCE_SECONDS = 0.020
local CANDIDATE_EPSILON_DB = 0.05
local CANDIDATE_READBACK_TOLERANCE_DB = 0.11
local INPUT_GAIN_MIN_DB = -24.0
local INPUT_GAIN_MAX_DB = 24.0
local SILENCE_OUTPUT_DURING_ANALYSIS = true
local ENABLE_PRECISION_SWEEP = true
local CONSOLE_VERBOSITY = 1 -- 0 final/errors, 1 stages/passes, 2 state transitions

local TIMEOUTS = {
  analyzer_ready = 2.0,
  reset = 2.0,
  gain_verify = 1.0,
  gain_settle = GAIN_SETTLE_SECONDS + 1.0,
  analyzer_arm = 2.0,
  playback_start = 2.0,
  pass_finalize = 3.0,
  stage_analysis = 3.0,
  final_recommendation = 3.0,
}

local INPUT_CALIBRATOR_NAME_PATTERNS = {
  "rfxinputcalibrator",
}

local RIG_ANALYZER_NAME_PATTERNS = {
  "rfxriganalyzer",
}

local CMD = { NONE = 0, RESET = 1, BEGIN = 2, CANCEL = 3, FINALIZE = 4, ANALYZE = 5, RECOMMEND = 6 }
local ANALYZER_STATE = {
  IDLE = 0, MEASURING = 1, PASS_COMPLETE = 2, PASS_INVALID = 3,
  STAGE_READY = 4, RECOMMENDATION_READY = 5,
  RECOMMENDATION_UNAVAILABLE = 6, CANCELLED = 7, ERROR = 8,
}
local STAGE = { NONE = 0, COARSE = 1, FINE = 2, PRECISION = 3, FINAL = 4 }

local state = "VALIDATE"
local state_started_at = 0
local state_deadline = math.huge
local running = true
local cleanup_done = false
local context_captured = false
local context = {}
local selected_item, selected_take, target_track
local item_start, item_end, item_duration
local input_fx_index, analyzer_fx_index
local command_sequence = 0
local pending_sequence = -1
local current_candidate = 0
local current_stage = STAGE.NONE
local stage_candidates = {}
local candidate_index = 1
local measured_candidates = {}
local results = {}
local counts = { [STAGE.COARSE] = 0, [STAGE.FINE] = 0, [STAGE.PRECISION] = 0 }
local settle_until = 0
local last_stage_analysis = nil
local failure_message = nil
local gmem_attached = false
local guarded_tick

local function now()
  return reaper.time_precise()
end

local function console(message, level)
  level = level or 1
  if CONSOLE_VERBOSITY >= level then
    reaper.ShowConsoleMsg(tostring(message) .. "\n")
  end
end

local function format_db(value)
  return string.format("%+.1f dB", value or 0)
end

local function clamp(value, low, high)
  return math.max(low, math.min(high, value))
end

local function play_state_has(value, flag)
  return math.floor((value or 0) / flag) % 2 == 1
end

local function set_state(next_state, timeout)
  state = next_state
  state_started_at = now()
  state_deadline = timeout and (state_started_at + timeout) or math.huge
  console("[state] " .. next_state, 2)
end

local function state_timed_out()
  return now() > state_deadline
end

local function normalized_fx_name(name)
  return (name or ""):lower():gsub("[^%w]", "")
end

local function name_matches(name, patterns)
  local compact = normalized_fx_name(name)
  for _, pattern in ipairs(patterns) do
    if compact:find(pattern, 1, true) then return true end
  end
  return false
end

local function find_track_fx(track, patterns)
  local matches = {}
  for fx = 0, reaper.TrackFX_GetCount(track) - 1 do
    local _, name = reaper.TrackFX_GetFXName(track, fx, "")
    if name_matches(name, patterns) then
      matches[#matches + 1] = { index = fx, name = name }
    end
  end
  return matches
end

local function fx_is_offline(track, fx)
  return reaper.TrackFX_GetOffline and reaper.TrackFX_GetOffline(track, fx) or false
end

local function find_conflicting_analyzer(target, target_fx)
  local function inspect_track(track)
    if not track then return nil end
    for fx = 0, reaper.TrackFX_GetCount(track) - 1 do
      local is_target_instance = track == target and fx == target_fx
      if not is_target_instance then
        local _, name = reaper.TrackFX_GetFXName(track, fx, "")
        if name_matches(name, RIG_ANALYZER_NAME_PATTERNS)
           and reaper.TrackFX_GetEnabled(track, fx)
           and not fx_is_offline(track, fx) then
          return name
        end
      end
    end
    return nil
  end

  local conflict = inspect_track(reaper.GetMasterTrack(0))
  if conflict then return conflict end
  for track_index = 0, reaper.CountTracks(0) - 1 do
    conflict = inspect_track(reaper.GetTrack(0, track_index))
    if conflict then return conflict end
  end
  return nil
end

local function fail(message)
  if failure_message then return end
  failure_message = message
  reaper.ShowConsoleMsg("[RFX Rig Analysis] ERROR: " .. tostring(message) .. "\n")
  set_state("ERROR")
end

local function db_to_normalized(db)
  return clamp((db - INPUT_GAIN_MIN_DB) / (INPUT_GAIN_MAX_DB - INPUT_GAIN_MIN_DB), 0, 1)
end

local function normalized_to_db(value)
  return INPUT_GAIN_MIN_DB + clamp(value, 0, 1) * (INPUT_GAIN_MAX_DB - INPUT_GAIN_MIN_DB)
end

local function validate_project()
  if play_state_has(reaper.GetPlayState(), 4) then
    return nil, "Cannot run while REAPER is recording."
  end

  local selected_count = reaper.CountSelectedMediaItems(0)
  if selected_count ~= 1 then
    return nil, "Select exactly one representative DI media item."
  end

  local item = reaper.GetSelectedMediaItem(0, 0)
  local take = item and reaper.GetActiveTake(item) or nil
  if not take then return nil, "The selected item has no active take." end

  local position = reaper.GetMediaItemInfo_Value(item, "D_POSITION")
  local duration = reaper.GetMediaItemInfo_Value(item, "D_LENGTH")
  if not duration or duration <= 0 then return nil, "The selected item has an invalid duration." end
  if duration < MIN_ITEM_DURATION then
    return nil, string.format("Selected item is too short (%.2f s); minimum is %.1f s.", duration, MIN_ITEM_DURATION)
  end
  if duration > MAX_ITEM_DURATION then
    return nil, string.format("Selected item is too long (%.2f s); maximum is %.1f s.", duration, MAX_ITEM_DURATION)
  end

  local track = reaper.GetMediaItemTrack(item)
  if not track then return nil, "The selected item does not belong to a valid track." end

  local input_matches = find_track_fx(track, INPUT_CALIBRATOR_NAME_PATTERNS)
  local analyzer_matches = find_track_fx(track, RIG_ANALYZER_NAME_PATTERNS)
  if #input_matches == 0 then return nil, "RFX Input Calibrator was not found on the selected item's track." end
  if #analyzer_matches == 0 then return nil, "RFX Rig Analyzer was not found on the selected item's track." end
  if #input_matches > 1 then return nil, "Multiple RFX Input Calibrator instances were found; keep exactly one for analysis." end
  if #analyzer_matches > 1 then return nil, "Multiple RFX Rig Analyzer instances were found; keep exactly one for analysis." end

  local input_index = input_matches[1].index
  local analyzer_index = analyzer_matches[1].index
  if input_index >= analyzer_index then
    return nil, "RFX Input Calibrator must appear before RFX Rig Analyzer in the FX chain."
  end
  if fx_is_offline(track, input_index) then return nil, "RFX Input Calibrator is offline." end
  if fx_is_offline(track, analyzer_index) then return nil, "RFX Rig Analyzer is offline." end
  local conflicting_analyzer = find_conflicting_analyzer(track, analyzer_index)
  if conflicting_analyzer then
    return nil, "Another enabled RFX Rig Analyzer exists in the project; disable it to avoid gmem contention."
  end

  return {
    item = item,
    take = take,
    track = track,
    position = position,
    duration = duration,
    item_end = position + duration,
    input_fx = input_index,
    analyzer_fx = analyzer_index,
    input_name = input_matches[1].name,
    analyzer_name = analyzer_matches[1].name,
  }
end

local function capture_selection()
  local selected_items = {}
  for i = 0, reaper.CountSelectedMediaItems(0) - 1 do
    selected_items[#selected_items + 1] = reaper.GetSelectedMediaItem(0, i)
  end
  local selected_tracks = {}
  local selected_track_count = reaper.CountSelectedTracks2 and reaper.CountSelectedTracks2(0, true)
                               or reaper.CountSelectedTracks(0)
  for i = 0, selected_track_count - 1 do
    local track = reaper.GetSelectedTrack2 and reaper.GetSelectedTrack2(0, i, true)
                  or reaper.GetSelectedTrack(0, i)
    if track then selected_tracks[#selected_tracks + 1] = track end
  end
  return selected_items, selected_tracks
end

local function capture_context()
  local selected_items, selected_tracks = capture_selection()
  local time_start, time_end = reaper.GetSet_LoopTimeRange(false, false, 0, 0, false)
  local loop_start, loop_end = reaper.GetSet_LoopTimeRange(false, true, 0, 0, false)
  context = {
    play_state = reaper.GetPlayState(),
    play_position = reaper.GetPlayPosition(),
    cursor = reaper.GetCursorPosition(),
    time_start = time_start,
    time_end = time_end,
    loop_start = loop_start,
    loop_end = loop_end,
    repeat_state = reaper.GetSetRepeat(-1),
    selected_items = selected_items,
    selected_tracks = selected_tracks,
    input_trim_normalized = reaper.TrackFX_GetParamNormalized(target_track, input_fx_index, 0),
    input_internal_bypass = reaper.TrackFX_GetParamNormalized(target_track, input_fx_index, 5),
    analyzer_internal_bypass = reaper.TrackFX_GetParamNormalized(target_track, analyzer_fx_index, 4),
    input_enabled = reaper.TrackFX_GetEnabled(target_track, input_fx_index),
    analyzer_enabled = reaper.TrackFX_GetEnabled(target_track, analyzer_fx_index),
    track_mute = reaper.GetMediaTrackInfo_Value(target_track, "B_MUTE"),
    track_solo = reaper.GetMediaTrackInfo_Value(target_track, "I_SOLO"),
    track_main_send = reaper.GetMediaTrackInfo_Value(target_track, "B_MAINSEND"),
    track_record_arm = reaper.GetMediaTrackInfo_Value(target_track, "I_RECARM"),
    track_monitoring = reaper.GetMediaTrackInfo_Value(target_track, "I_RECMON"),
  }
  context_captured = true
end

local function restore_selection()
  for i = 0, reaper.CountMediaItems(0) - 1 do
    reaper.SetMediaItemSelected(reaper.GetMediaItem(0, i), false)
  end
  for _, item in ipairs(context.selected_items or {}) do
    if reaper.ValidatePtr2(0, item, "MediaItem*") then reaper.SetMediaItemSelected(item, true) end
  end
  for i = 0, reaper.CountTracks(0) - 1 do
    reaper.SetTrackSelected(reaper.GetTrack(0, i), false)
  end
  local master = reaper.GetMasterTrack(0)
  if master then reaper.SetTrackSelected(master, false) end
  for _, track in ipairs(context.selected_tracks or {}) do
    if reaper.ValidatePtr2(0, track, "MediaTrack*") then reaper.SetTrackSelected(track, true) end
  end
end

local function send_command(command, candidate, stage_value)
  command_sequence = command_sequence + 1
  if candidate ~= nil then reaper.gmem_write(3, candidate) end
  if stage_value ~= nil then reaper.gmem_write(33, stage_value) end
  reaper.gmem_write(2, command_sequence)
  reaper.gmem_write(1, command)
  return command_sequence
end

local function cleanup()
  if cleanup_done then return end
  cleanup_done = true

  if context_captured then
    if gmem_attached then send_command(CMD.CANCEL, nil, STAGE.NONE) end
    reaper.OnStopButton()

    if reaper.ValidatePtr2(0, target_track, "MediaTrack*") then
      reaper.TrackFX_SetParamNormalized(target_track, input_fx_index, 0, context.input_trim_normalized)
      reaper.TrackFX_SetParamNormalized(target_track, input_fx_index, 5, context.input_internal_bypass)
      reaper.TrackFX_SetParamNormalized(target_track, analyzer_fx_index, 4, context.analyzer_internal_bypass)
      reaper.TrackFX_SetEnabled(target_track, input_fx_index, context.input_enabled)
      reaper.TrackFX_SetEnabled(target_track, analyzer_fx_index, context.analyzer_enabled)
      reaper.SetMediaTrackInfo_Value(target_track, "B_MAINSEND", context.track_main_send)
      reaper.SetMediaTrackInfo_Value(target_track, "B_MUTE", context.track_mute)
      reaper.SetMediaTrackInfo_Value(target_track, "I_SOLO", context.track_solo)
      reaper.SetMediaTrackInfo_Value(target_track, "I_RECARM", context.track_record_arm)
      reaper.SetMediaTrackInfo_Value(target_track, "I_RECMON", context.track_monitoring)
    end

    reaper.GetSet_LoopTimeRange(true, false, context.time_start, context.time_end, false)
    reaper.GetSet_LoopTimeRange(true, true, context.loop_start, context.loop_end, false)
    reaper.GetSetRepeat(context.repeat_state)
    restore_selection()

    if play_state_has(context.play_state, 1) then
      reaper.SetEditCurPos(context.play_position, false, false)
      reaper.OnPlayButton()
      reaper.SetEditCurPos(context.cursor, false, false)
    elseif play_state_has(context.play_state, 2) then
      reaper.SetEditCurPos(context.play_position, false, false)
      reaper.OnPlayButton()
      reaper.OnPauseButton()
      reaper.SetEditCurPos(context.cursor, false, false)
    else
      reaper.SetEditCurPos(context.cursor, false, false)
    end
    reaper.UpdateArrange()
  end
end

reaper.atexit(cleanup)

local function candidate_already_measured(candidate)
  for _, measured in ipairs(measured_candidates) do
    if math.abs(measured - candidate) <= CANDIDATE_EPSILON_DB then return true end
  end
  return false
end

local function queue_contains(queue, candidate)
  for _, queued in ipairs(queue) do
    if math.abs(queued - candidate) <= CANDIDATE_EPSILON_DB then return true end
  end
  return false
end

local function generate_candidates(low, high, step)
  local requested_low, requested_high = low, high
  low = clamp(math.min(requested_low, requested_high), INPUT_GAIN_MIN_DB, INPUT_GAIN_MAX_DB)
  high = clamp(math.max(requested_low, requested_high), INPUT_GAIN_MIN_DB, INPUT_GAIN_MAX_DB)
  step = math.max(0.5, step)
  local first = math.ceil((low - 0.000001) / step) * step
  local generated = {}
  local value = first
  local guard = 0
  while value <= high + 0.000001 and guard < 200 do
    local rounded = math.floor(value * 10 + 0.5) / 10
    if not candidate_already_measured(rounded) and not queue_contains(generated, rounded) then
      generated[#generated + 1] = clamp(rounded, INPUT_GAIN_MIN_DB, INPUT_GAIN_MAX_DB)
    end
    value = value + step
    guard = guard + 1
  end
  return generated
end

local function begin_stage(stage_value, candidates)
  current_stage = stage_value
  stage_candidates = candidates
  candidate_index = 1
  if #stage_candidates == 0 then
    set_state("REQUEST_STAGE_ANALYSIS")
  else
    set_state("SET_CANDIDATE")
  end
end

local function read_stage_analysis()
  return {
    gain = reaper.gmem_read(22),
    score = reaper.gmem_read(23),
    confidence = reaper.gmem_read(24),
    knee = reaper.gmem_read(25) >= 0.5,
    low = reaper.gmem_read(26),
    high = reaper.gmem_read(27),
    step = math.max(0.5, reaper.gmem_read(28)),
    refine = reaper.gmem_read(29) >= 0.5,
    winner_index = math.floor(reaper.gmem_read(30) + 0.5),
    second_difference = reaper.gmem_read(31),
  }
end

local function print_pass_result(result)
  console("Pass complete:", 1)
  console(string.format("  RMS: %.1f dBFS", result.rms), 1)
  console(string.format("  P95 Peak: %.1f dBFS", result.p95), 1)
  console(string.format("  Crest: %.1f dB", result.crest), 1)
  console(string.format("  HF Ratio: %.5f", result.hf), 1)
  console(string.format("  Transient Activity: %.6f", result.transient), 1)
  console(string.format("  Clipping: %s (%.4f%%)", result.clipped and "Yes" or "No", result.clip_percent), 1)
  console(string.format("  Confidence: %.0f%%", result.confidence), 1)
end

local function print_stage_result(label, analysis)
  console(label .. " sweep complete", 1)
  console("Provisional target: " .. format_db(analysis.gain), 1)
  console("Recommendation confidence: " .. string.format("%.0f%%", analysis.confidence), 1)
  console("Clear knee detected: " .. (analysis.knee and "Yes" or "No"), 1)
  console("Refinement requested: " .. (analysis.refine and "Yes" or "No"), 1)
  console(string.format("Refinement range: %+.1f dB to %+.1f dB", analysis.low, analysis.high), 1)
  console(string.format("Refinement step: %.1f dB", analysis.step), 1)
end

local function nearest_clipping_onset()
  local nearest = nil
  for _, result in ipairs(results) do
    if result.clipped and (not nearest or result.candidate < nearest) then nearest = result.candidate end
  end
  return nearest
end

local function print_final_result(analysis)
  local clipping_onset = nearest_clipping_onset()
  reaper.ShowConsoleMsg("============================================================\n")
  reaper.ShowConsoleMsg("RFX RIG ANALYSIS COMPLETE\n")
  reaper.ShowConsoleMsg("Recommended Target Input Gain: " .. format_db(analysis.gain) .. "\n")
  reaper.ShowConsoleMsg(string.format("Recommendation Confidence: %.0f%%\n", analysis.confidence))
  reaper.ShowConsoleMsg(string.format("Recommendation Score: %.1f\n", analysis.score))
  reaper.ShowConsoleMsg(string.format("Valid Distinct Passes: %d\n", math.floor(reaper.gmem_read(8) + 0.5)))
  reaper.ShowConsoleMsg(string.format("Coarse Passes: %d\n", counts[STAGE.COARSE]))
  reaper.ShowConsoleMsg(string.format("Fine Passes: %d\n", counts[STAGE.FINE]))
  reaper.ShowConsoleMsg(string.format("Precision Passes: %d\n", counts[STAGE.PRECISION]))
  reaper.ShowConsoleMsg("Clear Response Knee: " .. (analysis.knee and "Yes" or "No") .. "\n")
  reaper.ShowConsoleMsg("Nearest Clipping Onset: " .. (clipping_onset and format_db(clipping_onset) or "None measured") .. "\n")
  reaper.ShowConsoleMsg("============================================================\n")
  reaper.ShowConsoleMsg("The recommendation is a provisional operating-point estimate based on nonlinear response changes.\n")
end

local function tick()
  if not running then return end

  if state == "VALIDATE" then
    if reaper.ClearConsole then reaper.ClearConsole() end
    reaper.ShowConsoleMsg("============================================================\n")
    reaper.ShowConsoleMsg("RFX RIG ANALYSIS\n")
    reaper.ShowConsoleMsg("============================================================\n")
    local validated, validation_error = validate_project()
    if not validated then fail(validation_error) else
      selected_item = validated.item
      selected_take = validated.take
      target_track = validated.track
      item_start = validated.position
      item_duration = validated.duration
      item_end = validated.item_end
      input_fx_index = validated.input_fx
      analyzer_fx_index = validated.analyzer_fx
      local _, track_name = reaper.GetTrackName(target_track)
      console(string.format("Selected item duration: %.2f seconds", item_duration), 1)
      console("Track: " .. (track_name or "(unnamed)"), 1)
      console("Input Calibrator FX index: " .. input_fx_index, 1)
      console("Rig Analyzer FX index: " .. analyzer_fx_index, 1)
      console("Output silenced during analysis: " .. (SILENCE_OUTPUT_DURING_ANALYSIS and "Yes" or "No"), 1)
      set_state("CAPTURE_CONTEXT")
    end

  elseif state == "CAPTURE_CONTEXT" then
    capture_context()
    reaper.OnStopButton()
    reaper.GetSetRepeat(0)
    reaper.TrackFX_SetEnabled(target_track, input_fx_index, true)
    reaper.TrackFX_SetEnabled(target_track, analyzer_fx_index, true)
    reaper.TrackFX_SetParamNormalized(target_track, input_fx_index, 5, 0)
    reaper.TrackFX_SetParamNormalized(target_track, analyzer_fx_index, 4, 0)
    if SILENCE_OUTPUT_DURING_ANALYSIS then
      reaper.SetMediaTrackInfo_Value(target_track, "B_MAINSEND", 0)
    end
    reaper.gmem_attach("RFX_RIG_ANALYZER")
    gmem_attached = true
    reaper.gmem_write(0, 0) -- Require a fresh live heartbeat from the enabled JSFX.
    command_sequence = math.floor(reaper.gmem_read(2) + 0.5) + 100
    set_state("WAIT_FOR_ANALYZER_READY", TIMEOUTS.analyzer_ready)

  elseif state == "WAIT_FOR_ANALYZER_READY" then
    if math.floor(reaper.gmem_read(0) + 0.5) == 1 then
      set_state("RESET_ANALYZER")
    elseif state_timed_out() then
      fail("RFX Rig Analyzer did not publish protocol version 1 after being enabled.")
    end

  elseif state == "RESET_ANALYZER" then
    pending_sequence = send_command(CMD.RESET, nil, STAGE.NONE)
    set_state("WAIT_FOR_RESET", TIMEOUTS.reset)

  elseif state == "WAIT_FOR_RESET" then
    if math.floor(reaper.gmem_read(6) + 0.5) == pending_sequence
       and math.floor(reaper.gmem_read(4) + 0.5) == ANALYZER_STATE.IDLE then
      set_state("BUILD_COARSE_SWEEP")
    elseif state_timed_out() then fail("Timed out waiting for analyzer session reset.") end

  elseif state == "BUILD_COARSE_SWEEP" then
    console("\nStage 1: Coarse Sweep", 1)
    begin_stage(STAGE.COARSE, { table.unpack(COARSE_CANDIDATES) })

  elseif state == "SET_CANDIDATE" then
    if candidate_index > #stage_candidates then
      set_state("REQUEST_STAGE_ANALYSIS")
    else
      current_candidate = clamp(stage_candidates[candidate_index], INPUT_GAIN_MIN_DB, INPUT_GAIN_MAX_DB)
      console(string.format("Pass %d/%d: %+.1f dB", candidate_index, #stage_candidates, current_candidate), 1)
      reaper.OnStopButton()
      reaper.TrackFX_SetParamNormalized(target_track, input_fx_index, 0, db_to_normalized(current_candidate))
      set_state("VERIFY_CANDIDATE", TIMEOUTS.gain_verify)
    end

  elseif state == "VERIFY_CANDIDATE" then
    local actual = normalized_to_db(reaper.TrackFX_GetParamNormalized(target_track, input_fx_index, 0))
    if math.abs(actual - current_candidate) <= CANDIDATE_READBACK_TOLERANCE_DB then
      settle_until = now() + GAIN_SETTLE_SECONDS
      set_state("WAIT_FOR_GAIN_SETTLE", TIMEOUTS.gain_settle)
    elseif state_timed_out() then
      fail(string.format("Input Calibrator trim readback failed: requested %.2f dB, read %.2f dB.", current_candidate, actual))
    end

  elseif state == "WAIT_FOR_GAIN_SETTLE" then
    if now() >= settle_until then set_state("ARM_ANALYZER")
    elseif state_timed_out() then fail("Timed out waiting for Input Calibrator gain settling.") end

  elseif state == "ARM_ANALYZER" then
    reaper.SetEditCurPos(item_start, false, false)
    pending_sequence = send_command(CMD.BEGIN, current_candidate, current_stage)
    set_state("WAIT_FOR_ANALYZER_ARM", TIMEOUTS.analyzer_arm)

  elseif state == "WAIT_FOR_ANALYZER_ARM" then
    local completed = math.floor(reaper.gmem_read(6) + 0.5)
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if completed == pending_sequence and analyzer_state == ANALYZER_STATE.MEASURING then
      set_state("START_PLAYBACK")
    elseif completed == pending_sequence and analyzer_state == ANALYZER_STATE.ERROR then
      fail("Analyzer rejected Begin Pass (error code " .. math.floor(reaper.gmem_read(32) + 0.5) .. ").")
    elseif state_timed_out() then fail("Timed out waiting for analyzer arm acknowledgment.") end

  elseif state == "START_PLAYBACK" then
    reaper.OnPlayButton()
    set_state("WAIT_FOR_PLAYBACK_START", TIMEOUTS.playback_start)

  elseif state == "WAIT_FOR_PLAYBACK_START" then
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if analyzer_state ~= ANALYZER_STATE.MEASURING then
      fail("Analyzer left Measuring state before playback started.")
    elseif play_state_has(reaper.GetPlayState(), 1) then
      set_state("WAIT_FOR_ITEM_END", item_duration + 3.0)
    elseif state_timed_out() then fail("Playback did not start.") end

  elseif state == "WAIT_FOR_ITEM_END" then
    local play_state = reaper.GetPlayState()
    local play_position = reaper.GetPlayPosition()
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if analyzer_state ~= ANALYZER_STATE.MEASURING then
      fail("Analyzer stopped measuring during playback (state " .. analyzer_state .. ").")
    elseif play_position >= item_end - END_TOLERANCE_SECONDS then
      set_state("STOP_PLAYBACK")
    elseif not play_state_has(play_state, 1) then
      send_command(CMD.CANCEL, nil, current_stage)
      fail("Playback stopped unexpectedly before the selected item ended.")
    elseif state_timed_out() then
      send_command(CMD.CANCEL, nil, current_stage)
      fail("Pass playback timed out.")
    end

  elseif state == "STOP_PLAYBACK" then
    reaper.OnStopButton()
    set_state("FINALIZE_PASS")

  elseif state == "FINALIZE_PASS" then
    pending_sequence = send_command(CMD.FINALIZE, current_candidate, current_stage)
    set_state("WAIT_FOR_PASS_RESULT", TIMEOUTS.pass_finalize)

  elseif state == "WAIT_FOR_PASS_RESULT" then
    local completed = math.floor(reaper.gmem_read(6) + 0.5)
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if completed == pending_sequence and analyzer_state == ANALYZER_STATE.PASS_COMPLETE then
      set_state("STORE_PASS_RESULT")
    elseif completed == pending_sequence and analyzer_state == ANALYZER_STATE.PASS_INVALID then
      fail("Analyzer reported an invalid pass (error code " .. math.floor(reaper.gmem_read(32) + 0.5) .. ").")
    elseif completed == pending_sequence and analyzer_state == ANALYZER_STATE.ERROR then
      fail("Analyzer failed to finalize the pass (error code " .. math.floor(reaper.gmem_read(32) + 0.5) .. ").")
    elseif state_timed_out() then fail("Timed out waiting for pass finalization.") end

  elseif state == "STORE_PASS_RESULT" then
    local returned_candidate = reaper.gmem_read(10)
    if math.abs(returned_candidate - current_candidate) > CANDIDATE_READBACK_TOLERANCE_DB then
      fail(string.format("Pass sequence mismatch: requested %.2f dB, analyzer returned %.2f dB.", current_candidate, returned_candidate))
    elseif reaper.gmem_read(9) < 0.5 then
      fail("Analyzer completed the pass without a valid result.")
    else
      local result = {
        stage = current_stage,
        candidate = returned_candidate,
        rms = reaper.gmem_read(11), crest = reaper.gmem_read(12),
        p95 = reaper.gmem_read(13), maximum = reaper.gmem_read(14),
        hf = reaper.gmem_read(15), transient = reaper.gmem_read(16),
        clipped = reaper.gmem_read(17) >= 0.5,
        clip_percent = reaper.gmem_read(18), confidence = reaper.gmem_read(19),
        active = reaper.gmem_read(20), windows = math.floor(reaper.gmem_read(21) + 0.5),
      }
      results[#results + 1] = result
      measured_candidates[#measured_candidates + 1] = returned_candidate
      counts[current_stage] = (counts[current_stage] or 0) + 1
      print_pass_result(result)
      set_state("NEXT_CANDIDATE")
    end

  elseif state == "NEXT_CANDIDATE" then
    candidate_index = candidate_index + 1
    set_state("SET_CANDIDATE")

  elseif state == "REQUEST_STAGE_ANALYSIS" then
    pending_sequence = send_command(CMD.ANALYZE, nil, current_stage)
    set_state("WAIT_FOR_STAGE_ANALYSIS", TIMEOUTS.stage_analysis)

  elseif state == "WAIT_FOR_STAGE_ANALYSIS" then
    local completed = math.floor(reaper.gmem_read(6) + 0.5)
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if completed == pending_sequence and analyzer_state == ANALYZER_STATE.STAGE_READY then
      last_stage_analysis = read_stage_analysis()
      local label = current_stage == STAGE.COARSE and "Coarse"
                    or current_stage == STAGE.FINE and "Fine" or "Precision"
      print_stage_result(label, last_stage_analysis)
      if current_stage == STAGE.COARSE then set_state("BUILD_FINE_SWEEP")
      elseif current_stage == STAGE.FINE then set_state("BUILD_PRECISION_SWEEP")
      else set_state("REQUEST_FINAL_RECOMMENDATION") end
    elseif completed == pending_sequence and analyzer_state == ANALYZER_STATE.RECOMMENDATION_UNAVAILABLE then
      fail("Analyzer could not analyze the current sweep (error code " .. math.floor(reaper.gmem_read(32) + 0.5) .. ").")
    elseif state_timed_out() then fail("Timed out waiting for stage analysis.") end

  elseif state == "BUILD_FINE_SWEEP" then
    if last_stage_analysis.refine then
      console("\nStage 2: Fine Sweep", 1)
      local fine = generate_candidates(last_stage_analysis.low, last_stage_analysis.high, 1.0)
      begin_stage(STAGE.FINE, fine)
    else
      set_state("REQUEST_FINAL_RECOMMENDATION")
    end

  elseif state == "BUILD_PRECISION_SWEEP" then
    local should_refine = ENABLE_PRECISION_SWEEP and (
      last_stage_analysis.refine
      or last_stage_analysis.confidence < 80
      or last_stage_analysis.second_difference < 8
      or not last_stage_analysis.knee)
    if should_refine then
      console("\nStage 3: Precision Sweep", 1)
      local precision = generate_candidates(last_stage_analysis.low, last_stage_analysis.high, 0.5)
      if #precision > 0 then begin_stage(STAGE.PRECISION, precision)
      else set_state("REQUEST_FINAL_RECOMMENDATION") end
    else
      set_state("REQUEST_FINAL_RECOMMENDATION")
    end

  elseif state == "REQUEST_FINAL_RECOMMENDATION" then
    pending_sequence = send_command(CMD.RECOMMEND, nil, STAGE.FINAL)
    set_state("WAIT_FOR_FINAL_RECOMMENDATION", TIMEOUTS.final_recommendation)

  elseif state == "WAIT_FOR_FINAL_RECOMMENDATION" then
    local completed = math.floor(reaper.gmem_read(6) + 0.5)
    local analyzer_state = math.floor(reaper.gmem_read(4) + 0.5)
    if completed == pending_sequence and analyzer_state == ANALYZER_STATE.RECOMMENDATION_READY then
      last_stage_analysis = read_stage_analysis()
      set_state("PRINT_RESULT")
    elseif completed == pending_sequence and analyzer_state == ANALYZER_STATE.RECOMMENDATION_UNAVAILABLE then
      fail("No safe final recommendation was available (error code " .. math.floor(reaper.gmem_read(32) + 0.5) .. ").")
    elseif state_timed_out() then fail("Timed out waiting for the final recommendation.") end

  elseif state == "PRINT_RESULT" then
    print_final_result(last_stage_analysis)
    set_state("RESTORE_CONTEXT")

  elseif state == "RESTORE_CONTEXT" then
    cleanup()
    set_state("COMPLETE")

  elseif state == "COMPLETE" then
    running = false

  elseif state == "ERROR" or state == "CANCELLED" then
    cleanup()
    running = false
  end

  if running then reaper.defer(guarded_tick) end
end

guarded_tick = function()
  local ok, err = xpcall(tick, debug.traceback)
  if not ok then
    reaper.ShowConsoleMsg("[RFX Rig Analysis] ERROR: Unexpected script failure:\n" .. tostring(err) .. "\n")
    cleanup()
    running = false
  end
end

-- All subsequent iterations are scheduled by tick; no playback loop blocks REAPER.
guarded_tick()
