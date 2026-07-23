# RFX Input Calibrator REAPER Test Plan

## Setup

1.  Install `RFX_InputCalibrator.jsfx` under `Effects/RFX/`.
2.  Scan for new plug-ins in REAPER.
3.  Create a clean test track with no processing before or after the
    calibrator unless a test explicitly requires it.
4.  Insert **JS: RFX Input Calibrator** as the first FX.
5.  Default settings unless stated otherwise:
    -   Input Trim: 0.0 dB
    -   Target Peak: -7.0 dBFS
    -   Learn Duration: 5 s
    -   Learn Behavior: Apply Result
    -   Bypass: Active

Allow \~100 ms for gain smoothing and \~300 ms for meter release after
changes.

## Functional Tests

### 1. Unity Gain

Expected: Output equals input.

### 2. +6 dB Gain

Expected gain ≈ 1.995x (±0.5%).

### 3. -6 dB Gain

Expected gain ≈ 0.501x (±0.5%).

### 4. Smooth Gain Changes

Sweep Input Trim from -24 dB to +24 dB. Expected: No zipper noise or
clicks.

### 5. Learn using Known Sine

Feed a -18 dBFS sine. Expected: - Measured peak ≈ -18 dBFS - Calculated
trim ≈ +11 dB - Preview mode does not modify Input Trim.

### 6. Learn using Guitar DI

Expected: - ≥20 valid windows - Calibrated status - Plausible trim.

### 7. Silence Failure

Expected: - Not Enough Signal - Trim unchanged - Result invalid.

### 8. Insufficient Signal

Feed less than 20 valid windows. Expected: - Failure - Trim unchanged.

### 9. Preview Only

Expected: - Diagnostics update - Input Trim unchanged.

### 10. Apply Result

Expected: - Trim automatically written - Smooth gain transition.

### 11. Bypass

Verify: - Exact pass-through - Meters remain active - Learn cancelled
when bypass enabled - Learn cannot begin while bypassed.

### 12. Mono / Stereo Analysis

Verify: - Left-only - Right-only - Dual mono - Stereo

Analysis should always use the larger instantaneous channel magnitude
while applying identical gain to both channels.

## Advanced Diagnostics

### 13. Early Completion

Set Learn Duration to 10 seconds.

Expected calibration may finish early once: - ≥20 valid windows - ≥3 s
active playing - Confidence ≥80%

### 14. RMS

Verify RMS is reported and is always below the measured peak.

### 15. Playing Dynamics

Compare compressed and dynamic guitar recordings.

Expected labels: - Compressed - Average - Dynamic - Very Dynamic

### 16. Confidence

Verify: - Good performance → high confidence - Short performance →
reduced confidence - Clipped signal → reduced confidence - Silence → 0%

### 17. Clipping Detection

Feed clipped input.

Expected: - WARNING displayed - Confidence reduced - Calibration still
completes if sufficient data exists.

### 18. Sample Rate Change

Change audio device sample rate during Learn.

Expected: - Learn cancelled safely - Trim unchanged

### 19. Serialization

Save and reload the project.

Verify persistence of: - Measured Peak - Calculated Trim - Result
Valid - RMS - Playing Dynamics - Confidence - Active Playing - Clipping

Verify no fade from unity on load.

## gmem Telemetry

    Index Meaning
  ------- ------------------------
        0 Protocol Version
        1 Learn Active
        2 Progress
        3 Input Meter
        4 Output Meter
        5 95th Percentile Peak
        6 Calculated Trim
        7 Result Valid
        8 Status
        9 Event Counter
       10 Valid Windows
       11 Target Peak
       12 Current Trim
       13 RMS
       14 Playing Dynamics
       15 Confidence
       16 Active Playing Seconds
       17 Input Clipped

## NAM Integration

Insert immediately before NAM Gateway.

Verify: - Calibration computed from raw DI. - Output reaches target
peak. - Amp responds consistently before/after calibration. - Stereo
routing preserved.
