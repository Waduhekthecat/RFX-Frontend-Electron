# Automatic Rig Analysis Test Plan

## Test setup

1. Install `RFX_InputCalibrator.jsfx` and `RFX_RigAnalyzer.jsfx` under `Effects/RFX/`.
2. Load `RFX_RunRigAnalysis.lua` as a REAPER action.
3. Create a track with the Input Calibrator first, a test rig in the middle, and Rig Analyzer last.
4. Use an approximately eight-second representative DI item unless a case specifies otherwise.
5. Save a disposable test project before state-restoration tests.

Initial tolerances are peak ±0.2 dB, RMS ±0.2 dB, crest ±0.3 dB, Input Calibrator readback ±0.11 dB, repeated final recommendation ±1 dB, and playback stop position ±30 ms.

## 1. Loading and transparency

1. Load the analyzer and confirm no JSFX compiler error.
2. Route independent left/right test signals through it and null input against output.
3. Repeat with slider bypass enabled.
4. Begin a manual or gmem pass, enable bypass, and confirm state Cancelled.
5. Begin a pass, change device sample rate, and confirm cancellation/error telemetry.

Expected: exact stereo pass-through in all audio modes; bypass and rate change cancel measurement without muting or changing audio.

## 2. Lua validation

Run the action separately with:

- no selected item;
- multiple selected items;
- an item without an active take;
- a 4.9-second item;
- a 20.1-second item;
- REAPER recording;
- missing Input Calibrator;
- missing Rig Analyzer;
- analyzer before calibrator;
- either required FX offline.
- another enabled Rig Analyzer instance elsewhere in the project.

Also verify name discovery with `RFX Input Calibrator`, `JS: RFX Input Calibrator`, path/underscore variants, `RFX Rig Analyzer`, and `JS: RFX Rig Analyzer`.

Expected: a clear console error, no sweep, and no project mutation. Valid 5.0- and 20.0-second items are accepted.

## 3. Input Calibrator control

1. Test requested candidates at `-24`, `-12`, `0`, `+12`, and `+24 dB`.
2. Confirm normalized mapping `(gain + 24) / 48` and readback within ±0.11 dB.
3. Start with a nonzero trim and both active/bypassed internal and FX states.
4. Run a successful sweep and a forced failure.

Expected: candidate values are accurate; Target Peak, Learn, Learn Duration, and Learn Behavior never change; original trim and both bypass forms restore after success/failure.

## 4. Playback automation

1. Launch once and do not touch transport through all passes.
2. Verify every pass starts at the selected item position and ends within ±30 ms.
3. Confirm the identical item is replayed once per candidate with repeat disabled.
4. Stop transport manually mid-pass.
5. Force playback-start and playback-duration timeouts.
6. terminate the deferred script through the action list while running.

Expected: no manual interaction is required; unexpected stops/timeouts abort; `atexit` cleanup restores state.

## 5. Known-signal measurements

Use a unity/linear rig for deterministic checks.

1. Feed a sine whose post-rig peak is known.
2. Confirm maximum and P95 peak within ±0.2 dB.
3. Confirm sine RMS approximately peak minus 3.01 dB within ±0.2 dB.
4. Confirm crest within ±0.3 dB.
5. Put a transient only in the first 80 ms and confirm it is excluded by warm-up.
6. Feed silence and confirm Pass Invalid.
7. Feed less than 0.25 seconds active audio and confirm invalidity.
8. Feed samples at/above 0.9995 and verify clipping plus clipped percentage.
9. Compare low-pass and bright versions of the same signal; HF ratio should rise.
10. Compare sustained and percussive signals; transient activity should rise for the latter.
11. Compare otherwise identical clipped and unclipped passes; clipped confidence should be 10 points lower.
12. Cancel a pass and confirm confidence zero or near zero.

## 6. Pass storage and sequencing

1. Submit candidates in unsorted order and verify later gain sorting works.
2. Confirm each result's candidate matches its Begin Pass command sequence.
3. Measure the same gain twice within 0.05 dB.
4. Verify the newest result replaces the old slot and stored count does not increase.
5. Store 32 unique gains and inspect all arrays/table rows.
6. Attempt a 33rd unique pass with a diagnostic candidate sequence.
7. Send stale/duplicate command sequences.

Expected: fixed bounds are respected, 32 unique passes remain intact, duplicates replace, and stale sequences do not retrigger commands.

## 7. Coarse sweep

1. Use a nonlinear rig with a visible compression transition.
2. Launch the Lua action once.
3. Confirm passes at exactly `-12, -8, -4, 0, +4, +8, +12 dB`.
4. Confirm Stage Ready after all seven passes.
5. Inspect provisional winner, knee flag, low/high bounds, and 1 dB step.

Expected: all seven complete automatically, at least five valid passes yield stage analysis, and a useful interval can request fine refinement.

## 8. Fine sweep

1. Use a coarse knee between tested values.
2. Confirm Lua builds aligned 1 dB candidates inside published bounds.
3. Verify values are clamped to `-24..+24 dB` and coarse duplicates are omitted.
4. Confirm a candidate such as `+3.0 dB` can be measured and become provisional winner.
5. Verify coarse and fine results are analyzed together.

## 9. Precision sweep

1. Test a fine result with confidence below 80.
2. Test nearly tied top scores (difference below 8).
3. Test unclear knee and boundary-winner cases.
4. Confirm generated values use 0.5 dB increments and never smaller.
5. Confirm duplicates are skipped and a value such as `+3.5 dB` can win.
6. Test a high-confidence, well-supported fine result and confirm precision can be skipped.

## 10. Recommendation behavior

1. Request analysis with fewer than five valid passes; expect unavailable.
2. Create safe and clipped candidates; confirm clipped candidates cannot win.
3. Make every useful candidate clipped; expect unavailable.
4. Create a response with transient collapse and confirm the affected score drops.
5. Create abrupt HF increase and severe crest collapse; confirm penalties.
6. Compare an interior candidate with similar edge candidate; confirm neighbor support.
7. Verify a strong RMS plateau is penalized.
8. Verify the returned gain exists in the measured-result list.
9. Verify no interpolated/unmeasured target is returned.
10. Confirm a non-coarse fine/precision value can be final.
11. Confirm an unsafe total-search boundary reduces recommendation confidence.
12. Repeat the complete analysis using identical DI/rig state; target should repeat within ±1 dB.

## 11. gmem protocol

Use a temporary ReaScript/gmem monitor and verify:

1. Protocol version is 1 and command cells use sequences.
2. Reset acknowledges Idle with the matching sequence.
3. Begin acknowledges Measuring with the matching sequence.
4. Finalize reports Pass Complete/Invalid with the finalize sequence.
5. `gmem[9..21]` match the last pass.
6. Analyze reports Stage Ready and `gmem[22..31]` are coherent.
7. Final reports Recommendation Ready or Unavailable.
8. `gmem[32]` contains meaningful error codes and `gmem[33]` the current stage.

## 12. Console output

Confirm the console prints:

- header, selected duration, track, and FX indices;
- each stage and candidate;
- RMS, P95, crest, HF, transient, clipping, and pass confidence;
- coarse and fine refinement ranges;
- final target, score, recommendation confidence, and knee flag;
- coarse/fine/precision counts and nearest clipping onset;
- the provisional-estimate disclaimer;
- clear `[RFX Rig Analysis] ERROR:` messages on failure.

## 13. Cleanup and restoration

Before the run, set distinctive values for cursor, time selection, loop points, repeat, selected items/tracks, track main send, mute, solo, record arm, monitoring, calibrator trim/bypass, and analyzer bypass. Also test from stopped, playing, and paused transport states.

Verify restoration after:

- success;
- validation failure;
- analyzer-arm timeout;
- unexpected transport stop;
- invalid pass;
- stage-analysis timeout;
- final-recommendation unavailable;
- manual script termination;
- an injected Lua runtime error.

Expected: all captured state restores, cleanup is idempotent, and no temporary pass remains active. Confirm item position, length, take gain/pan/pitch, rate, source, fades, snap offset, and mute state never change.

## 14. Output silencing

1. Set `SILENCE_OUTPUT_DURING_ANALYSIS = true` and confirm the track main send disables while the full FX chain continues processing.
2. Confirm independent sends are unchanged.
3. Repeat with the constant false.
4. Verify the original main-send value restores in all exit paths.

## 15. Serialization

1. Complete several passes and save/reload the project.
2. Verify pass results, stages, scores, bounds, and recommendation persist.
3. Save during an active pass, reload, and confirm analyzer starts Idle without partial accumulators/progress/commands.
4. Corrupt or exceed stored-count values in a diagnostic copy and confirm clamping.
5. Launch Lua after reload and confirm Reset Session removes stale results before the new sweep.

## 16. Real-rig matrix

Repeat with:

- Gateway or NAM complete chain;
- clean amp model;
- high-gain amp model;
- model that clips early;
- model with a strong compression knee;
- model with bright saturation increase;
- stereo cab/IR chain;
- the same DI repeated several times.

For each, inspect response smoothness, refinement usefulness, clipping avoidance, final measured-candidate membership, and ±1 dB repeatability.

## First smoke-test order

1. Analyzer loads without error.
2. Active exact stereo pass-through.
3. Bypassed exact stereo pass-through.
4. One manual/gmem known-sine pass.
5. P95 accuracy.
6. RMS accuracy.
7. Crest accuracy.
8. Silence invalidity.
9. Clipping detection/percentage.
10. Lua rejects no selected item.
11. Lua discovers both FX and validates order.
12. Input trim set/readback/restoration.
13. One complete seven-point coarse run.
14. Automatic 1 dB fine refinement.
15. Final console result and complete project-state restoration.
