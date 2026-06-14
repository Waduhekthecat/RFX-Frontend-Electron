// midi/midiMain.cjs

let midi = null;
let input = null;

function initMidiMain(mainWindow) {
  try {
    midi = require("midi");
  } catch (error) {
    console.error("[MIDI] Failed to load midi package:", error);
    return;
  }

  input = new midi.Input();

  const portCount = input.getPortCount();

  console.log(`[MIDI] Found ${portCount} input ports.`);

  for (let i = 0; i < portCount; i++) {
    console.log(`[MIDI] Input ${i}: ${input.getPortName(i)}`);
  }

  if (portCount === 0) {
    console.warn("[MIDI] No MIDI input devices found.");
    return;
  }

  const selectedPort = 0;
  const selectedPortName = input.getPortName(selectedPort);

  input.on("message", (deltaTime, message) => {
    const event = normalizeMidiMessage(message, {
      inputIndex: selectedPort,
      inputName: selectedPortName,
      deltaTime,
    });

    if (!event) return;

    console.log("[MIDI]", event);

    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("midi:message", event);
    }
  });

  input.openPort(selectedPort);

  console.log(`[MIDI] Listening on: ${selectedPortName}`);
}

function normalizeMidiMessage(message, meta = {}) {
  const [status, data1, data2 = 0] = message;

  if (typeof status !== "number") return null;

  const command = status & 0xf0;
  const channel = (status & 0x0f) + 1;

  if (command === 0xb0) {
    return {
      type: "cc",
      channel,
      cc: data1,
      value: data2,
      ...meta,
    };
  }

  if (command === 0xc0) {
    return {
      type: "program-change",
      channel,
      program: data1,
      ...meta,
    };
  }

  if (command === 0x90) {
    return {
      type: data2 === 0 ? "note-off" : "note-on",
      channel,
      note: data1,
      velocity: data2,
      ...meta,
    };
  }

  if (command === 0x80) {
    return {
      type: "note-off",
      channel,
      note: data1,
      velocity: data2,
      ...meta,
    };
  }

  return {
    type: "unknown",
    status,
    data1,
    data2,
    message,
    ...meta,
  };
}

function closeMidiMain() {
  if (input) {
    try {
      input.closePort();
    } catch (error) {
      console.warn("[MIDI] Failed to close input port:", error);
    }

    input = null;
  }
}

module.exports = {
  initMidiMain,
  closeMidiMain,
};