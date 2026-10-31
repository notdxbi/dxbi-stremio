// Preserve Stremio's appearance choices under dx.bi's preset. Stremio reapplies its colours when
// loading a stream and when its settings change, so writing mpv properties just once isn't enough.
const PROPERTIES = new Set([
    "sub-color", "sub-border-color", "sub-back-color", "sub-border-size",
    "sub-border-style", "sub-shadow-offset", "sub-bold", "sub-blur",
]);

export default class MpvSubtitleStyle {
    private base = new Map<string, unknown>();
    private reading = new Set<string>();
    private preset: Record<string, unknown> = {};

    constructor(
        private read: (name: string, done: (value: unknown) => void) => void,
        private write: (name: string, value: unknown) => void,
    ) {}

    // Only normal player writes come here; our own preset writes go straight to mpv.
    property(name: string, value: unknown): unknown {
        if (!PROPERTIES.has(name)) return value;
        this.base.set(name, value);
        return Object.hasOwn(this.preset, name) ? this.preset[name] : value;
    }

    apply(values: unknown): void {
        const next: Record<string, unknown> = {};
        if (values && typeof values === "object" && !Array.isArray(values)) {
            for (const [name, value] of Object.entries(values)) {
                if (PROPERTIES.has(name) && ["string", "number", "boolean"].includes(typeof value)) next[name] = value;
            }
        }
        const changed = new Set([...Object.keys(this.preset), ...Object.keys(next)]);
        this.preset = next;
        for (const name of changed) {
            if (this.base.has(name)) {
                this.write(name, Object.hasOwn(next, name) ? next[name] : this.base.get(name));
            } else if (!this.reading.has(name)) {
                // Capture mpv's actual startup value before overriding it. If Stremio sends a new
                // preference while this request is in flight, that newer preference wins on reset.
                this.reading.add(name);
                this.read(name, (value) => {
                    this.reading.delete(name);
                    if (!this.base.has(name)) this.base.set(name, value);
                    this.write(name, Object.hasOwn(this.preset, name) ? this.preset[name] : this.base.get(name));
                });
            }
        }
    }
}
