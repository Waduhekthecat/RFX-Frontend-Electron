export class MidiInputService {
    constructor() {
        this.subscribers = new Set();
        this.unsubscribeFromPreload = null;
    }

    initialize() {
        if (!window.rfx?.transport?.onMidiMessage) {
            console.warn("[MIDI INPUT SERVICE] window.rfx.transport.onMidiMessage is not available.");
            return;
        }

        this.unsubscribeFromPreload = window.rfx.transport.onMidiMessage((rawMidiEvent) => {
            this.notify(rawMidiEvent);
        });

        console.log("[MIDI INPUT SERVICE] Initialized.");
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            throw new Error("MidiInputService.subscribe requires a callback function.");
        }

        this.subscribers.add(callback);

        return () => {
            this.subscribers.delete(callback);
        };
    }

    notify(rawMidiEvent) {
        for (const callback of this.subscribers) {
            callback(rawMidiEvent);
        }
    }

    dispose() {
        if (typeof this.unsubscribeFromPreload === "function") {
            this.unsubscribeFromPreload();
        }

        this.unsubscribeFromPreload = null;
        this.subscribers.clear();

        console.log("[MIDI INPUT SERVICE] Disposed.");
    }
}