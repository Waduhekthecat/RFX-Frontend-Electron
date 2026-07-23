# RFX Input Calibrator

## Overview

RFX Input Calibrator is a JSFX designed to sit immediately before an amp
model such as NAM Gateway. It measures the incoming DI before any gain
is applied and calculates the trim required to align the guitar's
95th-percentile peak with a user-selected target level.

## Host Parameters

1.  Input Trim
2.  Target Peak
3.  Learn
4.  Learn Duration
5.  Learn Behavior
6.  Bypass

## Signal Path

Input → Analyzer → Shared Smoothed Gain → Output

The analyzer always measures the untouched input. Gain is applied
afterward using one shared gain value for both channels to preserve
stereo imaging.

## Calibration Algorithm

During Learn the plug-in:

-   Captures 10 ms peak windows.
-   Rejects windows below -50 dBFS.
-   Requires at least 20 accepted windows.
-   Sorts accepted peaks.
-   Selects the nearest-rank 95th percentile.
-   Calculates:

Trim = Target Peak − Measured Peak

The result is clamped to ±24 dB.

## Learn Modes

Preview Only displays the calculated trim without modifying Input Trim.

Apply Result automatically writes the calculated trim to Input Trim.

## Early Completion

Calibration can finish before the requested Learn Duration when: - at
least 20 valid windows exist - at least 3 seconds of active playing have
been captured - confidence reaches 80% or greater

Otherwise Learn continues until the requested duration expires.

## Diagnostics

Successful Learn also computes:

-   95th Percentile Peak
-   RMS
-   Playing Dynamics (crest factor)
-   Confidence Score
-   Active Playing Time
-   Input Clipping Detection

These diagnostics help determine calibration quality but do not affect
the calculated trim.

## Stereo Behaviour

Analysis uses the maximum instantaneous magnitude of the left and right
channels while applying identical gain to both outputs.

This supports: - Mono Left - Mono Right - Dual Mono - Stereo

## Telemetry

Telemetry is published through:

options:gmem=RFX_INPUT_CALIBRATOR

Protocol Version 1 exposes:

0--12 Original calibration telemetry

13 RMS

14 Playing Dynamics

15 Confidence

16 Active Playing Seconds

17 Input Clipped

Telemetry is read-only. Sliders remain the authoritative control
surface.

## Persistence

REAPER stores all slider values automatically.

The plug-in additionally serializes:

-   Measured Peak
-   Calculated Trim
-   Result Valid
-   RMS
-   Playing Dynamics
-   Confidence
-   Active Playing Time
-   Clipping Status

Gain initializes directly from the stored trim to avoid an audible fade
on project load.

## Intended Workflow

1.  Insert before the amp model.
2.  Select a target peak.
3.  Perform a representative DI performance.
4.  Run Learn.
5.  Review diagnostics.
6.  Accept or preview the calculated trim.
7.  Play through the calibrated amp model.

The result is consistent, repeatable input calibration while preserving
the natural dynamics of the instrument.
