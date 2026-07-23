# Automatic Rig Input Analysis

## Purpose

The automatic rig-analysis prototype estimates a useful input operating point for an amp, NAM, Gateway, cab, IR, or complete guitar rig. It repeatedly plays one selected DI item through measured Input Calibrator trim values, compares the rig's post-processing response, and recommends an actually tested gain.

The analyzer does not know the subjectively best tone. It estimates a useful target input gain from changes in the rig's nonlinear response.

The final recommendation is always an actually measured candidate. Interpolation is used only to choose refinement regions.

## Files and installation

- `scripts/jsfx/RFX_InputCalibrator.jsfx`: existing pre-rig gain stage.
- `scripts/jsfx/RFX_RigAnalyzer.jsfx`: new transparent post-rig analyzer.
- `scripts/lua/RFX_RunRigAnalysis.lua`: automatic deferred ReaScript.

Install both JSFX files under the REAPER resource path's `Effects/RFX/` directory. Install or load the Lua file through **Actions > Show action list > ReaScript > Load**.

## Signal-chain placement

The selected DI item's track must use this order:

```text
RFX Input Calibrator
→ amp / NAM / Gateway / cab / IR / other rig processing
→ RFX Rig Analyzer
```

The script validates the order and never reorders arbitrary FX. The Input Calibrator's own Learn function is not used. Its first parameter, Input Trim, is the controlled pre-rig gain.

The Rig Analyzer is exact stereo pass-through when active and bypassed. Its bypass control only disables analysis and cancels an active pass.

## Selected-item requirements

Before launching the action:

1. Record or place one representative unprocessed DI item, ideally about eight seconds.
2. Select exactly that item.
3. Ensure it has an active take and a duration from 5 through 20 seconds.
4. Insert the required FX in the order above.
5. Ensure neither required FX is offline.
6. Disable any other Rig Analyzer instance in the project, because JSFX gmem namespaces are process-global.
7. Ensure REAPER is not recording.

Bypassed required FX are temporarily enabled for analysis and restored afterward.

## Automatic user workflow

One action launch performs the entire operation:

1. Validate the selected item, track, FX, order, offline state, and transport.
2. Capture all project state that may be affected.
3. Stop playback, temporarily disable repeat, enable the required FX, and optionally disable the track's main send.
4. Reset the analyzer session so serialized results cannot leak into the run.
5. Run the seven-point coarse sweep.
6. Request provisional stage analysis.
7. Generate and run a 1 dB fine sweep when useful.
8. Generate and run an optional 0.5 dB precision sweep when useful.
9. Request the final recommendation.
10. Print the result and analysis summary to the REAPER console.
11. Restore the captured project state.

No transport presses, gain changes, pass controls, or refinement choices are required while the script runs.

## Search strategy

### Coarse sweep

The editable `COARSE_CANDIDATES` constant is:

```text
-12, -8, -4, 0, +4, +8, +12 dB
```

These passes establish the broad output-response curve, possible compression knee, clipping onset, and refinement neighborhood.

### Fine sweep

After coarse analysis, the analyzer publishes a low bound, high bound, and normally a 1 dB step. The Lua script generates every aligned 1 dB value in that interval, clamps values to `-24..+24 dB`, and excludes candidates already measured within `0.05 dB`.

This allows recommendations such as `+3.0 dB`; the result is not restricted to the coarse list.

### Precision sweep

After fine analysis, a 0.5 dB sweep is requested when confidence is below 80, the best scores are separated by less than 8 points, the knee is unclear, the winner lacks neighbor support, or the analyzer explicitly requests refinement. Precision values are clamped and deduplicated exactly like fine values. Version 1 never tests increments below 0.5 dB.

### Candidate generation rules

- Bounds may be interpolated from the measured response, but returned targets may not.
- Each final target must match a stored measured pass.
- Duplicate values within `0.05 dB` are skipped by Lua.
- If a duplicate is deliberately submitted, the analyzer replaces the old result without increasing the unique count.
- Candidates are not assumed to arrive in gain order.
- At least five distinct valid passes are required for any recommendation.

## Per-pass sequence

For every candidate, the Lua state machine:

1. Stops transport and sets Input Calibrator parameter zero using normalized mapping: `(gainDb + 24) / 48`.
2. Reads the normalized parameter back and verifies it within `0.11 dB`.
3. Waits 150 ms for gain settling.
4. Moves the edit cursor to the item start.
5. Sends Begin Pass with candidate, stage, and a new command sequence.
6. Waits for a matching Measuring acknowledgment.
7. Starts playback and verifies that it started.
8. Watches `GetPlayPosition()` until the item end.
9. Stops within a nominal 20 ms end tolerance.
10. Sends Finalize Current Pass with a new sequence.
11. Waits for the matching pass result and verifies the returned candidate.
12. Logs and stores the result before advancing.

All waiting uses `reaper.defer()`; there are no blocking playback loops.

## Lua state machine

The principal states are:

```text
VALIDATE → CAPTURE_CONTEXT → WAIT_FOR_ANALYZER_READY
→ RESET_ANALYZER → WAIT_FOR_RESET
→ BUILD_COARSE_SWEEP → SET_CANDIDATE → VERIFY_CANDIDATE
→ WAIT_FOR_GAIN_SETTLE → ARM_ANALYZER → WAIT_FOR_ANALYZER_ARM
→ START_PLAYBACK → WAIT_FOR_PLAYBACK_START → WAIT_FOR_ITEM_END
→ STOP_PLAYBACK → FINALIZE_PASS → WAIT_FOR_PASS_RESULT
→ STORE_PASS_RESULT → NEXT_CANDIDATE
→ REQUEST_STAGE_ANALYSIS → WAIT_FOR_STAGE_ANALYSIS
→ BUILD_FINE_SWEEP → BUILD_PRECISION_SWEEP
→ REQUEST_FINAL_RECOMMENDATION → WAIT_FOR_FINAL_RECOMMENDATION
→ PRINT_RESULT → RESTORE_CONTEXT → COMPLETE
```

Every asynchronous wait has a deadline and error path. `xpcall` protects every deferred callback, and `reaper.atexit()` invokes idempotent cleanup if the action is manually terminated.

## gmem protocol

Namespace: `RFX_RIG_ANALYZER`; protocol version: `1`.

| Index | Meaning |
| ---: | --- |
| 0 | Protocol version |
| 1 | Command |
| 2 | Command sequence |
| 3 | Requested candidate gain dB |
| 4 | Analyzer state |
| 5 | Analyzer event counter |
| 6 | Completed command sequence |
| 7 | Current pass progress, 0..1 |
| 8 | Stored valid unique pass count |
| 9 | Last-pass valid flag |
| 10 | Last-pass candidate gain dB |
| 11 | Last-pass RMS dBFS |
| 12 | Last-pass crest factor dB |
| 13 | Last-pass P95 peak dBFS |
| 14 | Last-pass maximum peak dBFS |
| 15 | Last-pass HF ratio |
| 16 | Last-pass transient activity |
| 17 | Last-pass clipped flag |
| 18 | Last-pass clipped-sample percentage |
| 19 | Last-pass confidence, 0..100 |
| 20 | Last-pass active seconds |
| 21 | Last-pass valid-window count |
| 22 | Recommended target input gain dB |
| 23 | Recommendation score |
| 24 | Recommendation confidence, 0..100 |
| 25 | Clear-knee flag |
| 26 | Refinement low bound dB |
| 27 | Refinement high bound dB |
| 28 | Refinement step dB |
| 29 | Refinement-requested flag |
| 30 | Winning raw pass index |
| 31 | Best/second-best score difference |
| 32 | Error code |
| 33 | Analysis stage |

Commands are None `0`, Reset `1`, Begin `2`, Cancel `3`, Finalize `4`, Analyze `5`, and Final Recommendation `6`. Analyzer states are Idle `0`, Measuring `1`, Pass Complete `2`, Pass Invalid `3`, Stage Ready `4`, Recommendation Ready `5`, Recommendation Unavailable `6`, Cancelled `7`, and Error `8`. Stages are None `0`, Coarse `1`, Fine `2`, Precision `3`, and Final `4`.

Commands are accepted once per sequence. Begin publishes a matching sequence as its arm acknowledgment; finalize and analysis commands publish their sequence only with the corresponding result state.

## Analyzer measurement details

The first 100 ms of each pass is warm-up and excluded from stored statistics. After warm-up, 10 ms windows use:

```text
magnitude = max(abs(left), abs(right))
```

Windows below `-60 dBFS` are rejected. A valid pass requires at least 20 windows and 0.25 seconds of active signal. The safety timeout is 25 seconds.

Metrics are:

- `maximum peak = max(magnitude)`.
- `P95 peak = nearest-rank 95th percentile of accepted 10 ms peaks`.
- `active RMS = sqrt(sum(active magnitude²) / active sample count)`.
- `crest = P95 peak dBFS - active RMS dBFS`.
- `active duration = active sample count / sample rate`.
- `clipped percentage = samples >= 0.9995 / analyzed samples × 100`.
- `HF ratio = high-band energy / mono total energy`, using a sample-rate-aware one-pole 4 kHz low-pass split of `0.5 × (left + right)`.
- `transient activity = average max(0, fast envelope - slow envelope)` over active samples, with 5 ms and 50 ms sample-rate-aware envelope releases.

Pass confidence is a measurement-reliability heuristic:

```text
up to 45 points: valid-window count
up to 25 points: active duration
20 points: normal explicit completion
10 points: no clipping
```

Timeout, cancellation, overflow, or insufficient signal yields zero confidence and no stored pass. A clipped but otherwise valid pass may be stored with reduced confidence.

## Fixed-memory layout

The analyzer reserves 32 values for each stored-pass field:

```text
0..31 gain                 256..287 clipped percentage
32..63 maximum peak       288..319 HF ratio
64..95 P95 peak           320..351 transient activity
96..127 RMS               352..383 confidence
128..159 crest            384..415 valid
160..191 active seconds   416..447 stage
192..223 valid windows    448..479 score
224..255 clipped          480..511 sorted indices
512..3511 window scratch
```

The 3,000-value scratch region exceeds the 2,500 possible 10 ms windows in the 25-second safety limit. Bounds are checked. Sorting, pass finalization, stage analysis, and recommendation calculation occur only in `@block`.

## Response-knee detection and candidate scoring

Valid pass indices are sorted by measured candidate gain. For adjacent candidates:

```text
RMS growth slope = output RMS delta dB / input gain delta dB
```

A supported knee is flagged when the local average slope is between `0.15` and `0.85`; the score's preferred transition slope is `0.65`. Candidate scoring adds:

- up to 30 points for proximity to the preferred knee slope;
- up to 20 points for continuing positive RMS growth;
- up to 15 points for moderate crest reduction;
- 20% of pass confidence;
- 10 points for two-sided neighbor support.

It penalizes:

- clipped candidates by 120 points and excludes them from winning when any safe candidate exists;
- a slope below 0.15 by 30 points;
- pass confidence below 55 by 25 points;
- abrupt crest collapse over 5 dB by 20 points;
- transient retention below 60% by 25 points;
- HF-ratio growth above 1.35× by 18 points;
- sweep edges by 12 points;
- disagreement between left/right local slopes by `8 × absolute slope difference`.

The highest-scoring non-clipped measured candidate becomes provisional/final winner. All-clipped results produce Recommendation Unavailable.

## Recommendation confidence

Recommendation confidence is clamped to 0..100 and combines:

```text
up to 30: distinct valid pass count
up to 30: average pass confidence
15: clear knee
10: non-clipped winner
10: winner has both neighbors
up to 10: score separation from second place
5: fine or precision data exists
```

A boundary winner loses neighbor support. Low confidence, close scores, unclear knee, and boundary support can request further refinement.

## Console output

The Lua script clears/separates the console, prints validation context, every candidate and result, stage recommendations and refinement bounds, then a final block containing:

- Recommended Target Input Gain;
- recommendation score and confidence;
- total, coarse, fine, and precision pass counts;
- clear-knee status;
- nearest measured clipping onset;
- the provisional-estimate disclaimer.

## Timeouts and cancellation

Configurable defaults are analyzer-ready 2 s, reset 2 s, gain verification 1 s, gain settle 150 ms plus margin, analyzer arm 2 s, playback start 2 s, pass finalization 3 s, stage analysis 3 s, and final recommendation 3 s. Pass playback times out after item duration plus 3 s. Unexpected early transport stop aborts the full analysis.

Every failure prints `[RFX Rig Analysis] ERROR: <reason>`, sends analyzer cancellation when possible, and restores state.

## Output silencing and restoration

`SILENCE_OUTPUT_DURING_ANALYSIS = true` temporarily sets the track's main-send state to zero. This keeps the track and complete FX chain processing while preventing repeated audible output through the master. Existing sends are not altered.

The script captures and restores:

- transport/play position and edit cursor;
- time selection, loop points, and repeat state;
- selected items and tracks;
- Input Calibrator trim, internal bypass, and FX enabled state;
- Rig Analyzer internal bypass and FX enabled state;
- track main send, mute, solo, record arm, and monitoring state.

It does not edit the item's position, length, take gain/pan/pitch, playback rate, source, fades, snap offset, or mute state. Cleanup is idempotent and registered with `reaper.atexit()`.

## Serialization

Serialization version 1 stores the completed pass arrays, stages, scores, provisional/final recommendation, confidence, refinement bounds/step, knee flag, winning index, and score separation. It does not store an active measurement, command, accumulators, progress, warm-up state, or sorting scratch.

On load, stored count/gains/confidence/valid flags are clamped, analyzer activity is forced to Idle, and partial state is cleared. Every Lua run sends Reset Session before measuring.

## Limitations

- Results depend on using the identical DI item, routing, rig parameters, and sample rate for every pass.
- The comparative HF metric uses a mono proxy and can under-report anti-phase stereo content.
- The scoring constants are prototype heuristics and require validation across many real rigs.
- Plugin internal oversampling or nondeterministic behavior can reduce repeatability.
- The analyzer detects digital output clipping, not hidden clipping inside an earlier rig stage.
- Main-send silencing does not silence independent hardware or pre-fader sends.
- Version 1 supports one track, 32 unique passes, and a minimum refinement step of 0.5 dB.
- Only one enabled RFX Rig Analyzer may exist during a run; Lua rejects additional enabled instances to prevent shared-memory contention.

## Future RFX triggering

RFX can later invoke `RFX_RunRigAnalysis.lua` as a normal REAPER action after selecting the target DI item. This prototype intentionally contains no Electron, OSC, HTTP, file-polling, frontend, or RFX-specific IPC integration.
