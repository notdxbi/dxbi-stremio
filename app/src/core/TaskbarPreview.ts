import type { BrowserWindow, NativeImage } from "electron";
import { getLogger } from "../utils/logger";

const logger = getLogger("TaskbarPreview");
const THUMBNAIL = 0x0323, LIVE_PREVIEW = 0x0326;
const FORCE_ICONIC = 7, HAS_BITMAP = 10;
const INTERVAL = 1000;

// mpv draws in a different HWND behind the transparent controls window. DWM's automatic
// taskbar/Alt+Tab snapshot of the controls therefore has no video. Supply the current mpv
// frame through Windows' iconic bitmap API, only while native playback is active.
export default class TaskbarPreview {
    private active = false;
    private enabled = false;
    private generation = 0;
    private timer: NodeJS.Timeout | null = null;
    private frame: NativeImage | null = null;
    private pending: Promise<void> | null = null;
    private capturedAt = 0;

    private constructor(
        private readonly win: BrowserWindow,
        private readonly capture: () => Promise<NativeImage | null>,
        private readonly native: ReturnType<typeof loadNative>,
    ) {
        win.hookWindowMessage(THUMBNAIL, (_, size) => {
            const packed = size.readUInt32LE(0);
            this.reply(packed >>> 16, packed & 0xffff, false);
        });
        win.hookWindowMessage(LIVE_PREVIEW, () => {
            const [width, height] = this.native.clientSize();
            this.reply(width, height, true);
        });
        win.once("closed", () => this.dispose());
    }

    public static attach(win: BrowserWindow, capture: () => Promise<NativeImage | null>): TaskbarPreview | null {
        if (process.platform !== "win32") return null;
        try { return new TaskbarPreview(win, capture, loadNative(win)); }
        catch (err) { logger.warn(`Couldn't set up video previews: ${err}`); return null; }
    }

    public setPlaying(on: boolean): void {
        if (on === this.active) return;
        this.active = on;
        this.generation++;
        this.frame = null;
        this.capturedAt = 0;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        if (!on) {
            this.enable(false);
            return;
        }
        // Have a frame ready before opting into iconic bitmaps: DWM expects an immediate reply.
        void this.refresh();
        this.timer = setInterval(() => {
            if (this.enabled) this.native.invalidate();
            else void this.refresh();
        }, INTERVAL);
        this.timer.unref();
    }

    private enable(on: boolean): void {
        if (this.enabled === on || this.win.isDestroyed()) return;
        try {
            this.native.attributes(on);
            this.enabled = on;
            this.native.invalidate();
        } catch (err) {
            this.enabled = false;
            try { this.native.attributes(false); } catch { /* leave DWM's default preview */ }
            this.setPlaying(false);
            logger.warn(`Couldn't enable video previews: ${err}`);
        }
    }

    private refresh(): Promise<void> {
        if (this.pending) return this.pending;
        if (!this.active || Date.now() - this.capturedAt < INTERVAL) return Promise.resolve();
        const generation = this.generation;
        this.capturedAt = Date.now();
        this.pending = (async () => {
            try {
                const image = await Promise.resolve().then(() => this.capture());
                if (!this.active || generation !== this.generation || this.win.isDestroyed()) return;
                if (image && !image.isEmpty()) {
                    this.frame = fit(image, 1280, 720);
                    this.enable(true);
                }
            } catch (err) {
                logger.warn(`Couldn't update the video preview: ${err}`);
            } finally {
                this.pending = null;
            }
        })();
        return this.pending;
    }

    private reply(width: number, height: number, live: boolean): void {
        if (!this.active || width <= 0 || height <= 0) return;
        const generation = this.generation;
        const send = () => {
            if (!this.frame || !this.active || generation !== this.generation || this.win.isDestroyed()) return;
            try { this.native.show(fit(this.frame, width, height, live), live, width, height); }
            catch (err) { logger.warn(`Couldn't display the video preview: ${err}`); }
        };
        const cached = this.frame;
        send();
        // No screenshots are taken by the timer: only DWM requests refresh the cached frame.
        void this.refresh().then(() => { if (this.frame !== cached) send(); });
    }

    public dispose(): void {
        this.setPlaying(false);
        if (!this.win.isDestroyed()) {
            this.win.unhookWindowMessage(THUMBNAIL);
            this.win.unhookWindowMessage(LIVE_PREVIEW);
        }
    }
}

function fit(image: NativeImage, width: number, height: number, upscale = false): NativeImage {
    const size = image.getSize();
    const scale = Math.min(upscale ? Infinity : 1, width / size.width, height / size.height);
    return scale === 1 ? image : image.resize({
        width: Math.max(1, Math.floor(size.width * scale)),
        height: Math.max(1, Math.floor(size.height * scale)),
        quality: "good",
    });
}

function loadNative(win: BrowserWindow) {
    // Reuse the app's existing FFI dependency; no extra native addon or platform dependency.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require("koffi");
    const dwm = koffi.load("dwmapi.dll"), gdi = koffi.load("gdi32.dll"), user = koffi.load("user32.dll");
    const clientRect = user.func("int __stdcall GetClientRect(intptr_t hwnd, _Out_ void *rect)");
    const attribute = dwm.func("long __stdcall DwmSetWindowAttribute(intptr_t hwnd, uint32_t attribute, const void *value, uint32_t size)");
    const invalidate = dwm.func("long __stdcall DwmInvalidateIconicBitmaps(intptr_t hwnd)");
    const thumbnail = dwm.func("long __stdcall DwmSetIconicThumbnail(intptr_t hwnd, void *bitmap, uint32_t flags)");
    const livePreview = dwm.func("long __stdcall DwmSetIconicLivePreviewBitmap(intptr_t hwnd, void *bitmap, const void *offset, uint32_t flags)");
    const create = gdi.func("void * __stdcall CreateDIBSection(void *dc, const void *info, uint32_t usage, _Out_ void **bits, void *section, uint32_t offset)");
    const release = gdi.func("int __stdcall DeleteObject(void *object)");
    const handle = win.getNativeWindowHandle();
    const hwnd = handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0));
    const check = (result: number) => { if (result < 0) throw new Error(`DWM returned ${result}`); };
    return {
        clientSize(): [number, number] {
            const rect = Buffer.alloc(16);
            if (!clientRect(hwnd, rect)) return [0, 0];
            return [rect.readInt32LE(8), rect.readInt32LE(12)]; // physical pixels, including display scaling
        },
        attributes(on: boolean) {
            const value = Buffer.alloc(4);
            value.writeInt32LE(on ? 1 : 0);
            for (const key of [FORCE_ICONIC, HAS_BITMAP]) check(attribute(hwnd, key, value, value.length));
        },
        invalidate() { invalidate(hwnd); },
        show(image: NativeImage, live: boolean, width = image.getSize().width, height = image.getSize().height) {
            const size = image.getSize();
            const source = image.toBitmap(); // Windows NativeImage pixels are top-down BGRA.
            // Keep the requested canvas size stable across cached/fresh frames, window changes
            // and PiP. A smaller bitmap can make Windows resize its preview on the first hover.
            const pixels = Buffer.alloc(width * height * 4);
            for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
            const x = Math.floor((width - size.width) / 2), y = Math.floor((height - size.height) / 2);
            for (let row = 0; row < size.height; row++) {
                source.copy(pixels, ((y + row) * width + x) * 4, row * size.width * 4, (row + 1) * size.width * 4);
            }
            const info = Buffer.alloc(40); // BITMAPINFOHEADER, 32-bit BI_RGB, top-down DIB.
            info.writeUInt32LE(40, 0);
            info.writeInt32LE(width, 4);
            info.writeInt32LE(-height, 8);
            info.writeUInt16LE(1, 12);
            info.writeUInt16LE(32, 14);
            const bits = [null];
            const bitmap = create(null, info, 0, bits, null, 0);
            if (!bitmap) throw new Error("Couldn't allocate a preview bitmap");
            try {
                // Electron forbids external ArrayBuffers, so copy through FFI rather than koffi.view.
                koffi.encode(bits[0], "uint8_t", pixels, pixels.length);
                check(live ? livePreview(hwnd, bitmap, null, 0) : thumbnail(hwnd, bitmap, 0));
            } finally {
                release(bitmap); // DWM keeps its own copy; never retain GDI objects between requests.
            }
        },
    };
}
