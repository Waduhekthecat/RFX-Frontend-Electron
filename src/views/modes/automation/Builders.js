export const AUTOMATION_CAPTURE_STATUSES = Object.freeze({
  IDLE: "idle",
  ARMED: "armed",
  RECORDING: "recording",
  CAPTURED: "captured",
  PLAYING: "playing",
});

export function createAutomationParameter({
  trackGuid,
  trackName = null,
  fxGuid,
  fxName = null,
  paramIndex,
  paramName,
}) {
  return {
    trackGuid,
    trackName,
    fxGuid,
    fxName,
    paramIndex,
    paramName,
  };
}

export function createAutomationEnvelope({
  id,
  parameter,
  envelopeGuid = null,
  automationItemPath = null,
}) {
  return {
    id,
    parameter,
    envelopeGuid,
    automationItemPath,
  };
}

export function createAutomationCapture({
  status = AUTOMATION_CAPTURE_STATUSES.IDLE,
  parameters = [],
  envelopes = [],
  durationMs = null,
} = {}) {
  const validStatuses = Object.values(AUTOMATION_CAPTURE_STATUSES);

  if (!validStatuses.includes(status)) {
    throw new Error(
      `[RFX Automation] Invalid capture status: ${status}`
    );
  }

  return {
    status,
    parameters,
    envelopes,
    durationMs,
  };
}

export function createAutomationMacro({
  id,
  name,
  durationMs,
  envelopes = [],
}) {
  return {
    id,
    name,
    durationMs,
    envelopes,
  };
}