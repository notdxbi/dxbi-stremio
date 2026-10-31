import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "../constants";

// The page's half of dx.bi's mpv player (see core/MpvShell.ts).
//
// 1. A WebView2-style `chrome.webview` transport, so Stremio's web app uses its desktop-shell player
//    (mpv) instead of the browser's <video>. It must exist before Stremio's scripts run.
// 2. A stand-in <video> in the player screen that mirrors mpv (time, pause, volume, speed, size) and
//    forwards play / pause / seek / volume to it, so plugins written for the browser player
//    (dx.bi's skip intro, up next, watch party, remembered volume…) keep working unchanged.

export function mpvShellEnabled(): boolean {
    try { return ipcRenderer.sendSync(IPC_CHANNELS.MPV_ENABLED) === true; } catch { return false; }
}

/**
 * mpv's playback as this script's own world sees it (the stand-in <video> only works in the page's
 * world): for dx.bi's Discord status, which runs here. Same shape as a <video> for what it reads.
 */
class NativePlayback extends EventTarget {
    currentTime = 0;
    duration = NaN;
    paused = true;
    ended = false;
    currentSrc = "";
    get src() { return this.currentSrc; }
    set onplaying(fn: (() => void) | null) { this.handler("playing", fn); }
    set onpause(fn: (() => void) | null) { this.handler("pause", fn); }
    private handlers: Record<string, (() => void) | null> = {};
    private handler(type: string, fn: (() => void) | null) {
        const old = this.handlers[type];
        if (old) this.removeEventListener(type, old);
        this.handlers[type] = fn;
        if (fn) this.addEventListener(type, fn);
    }
}
export const nativePlayback = new NativePlayback();

function followPlayback(message: string): void {
    let msg: any;
    try { msg = JSON.parse(message); } catch { return; }
    if (msg.type !== 1 || !Array.isArray(msg.args)) return;
    const [name, data] = msg.args;
    const p = nativePlayback;
    if (name === "mpv-event-ended") {
        p.ended = data?.reason === "eof";
        return;
    }
    if (name !== "mpv-prop-change" || !data) return;
    const value = data.data;
    switch (data.name) {
        case "time-pos": p.currentTime = typeof value === "number" ? value : 0; break;
        case "duration": p.duration = typeof value === "number" && value > 0 ? value : NaN; break;
        case "path": p.currentSrc = typeof value === "string" ? value : ""; p.ended = false; break;
        case "pause":
            if (value === p.paused) break;
            p.paused = value === true;
            p.dispatchEvent(new Event(p.paused ? "pause" : "playing"));
            break;
        case "seeking":
            // a jump moves the timer: tell it again once playback picks up
            if (value === false && !p.paused) p.dispatchEvent(new Event("playing"));
            break;
    }
}

export let nativePlayerActive = false;

export function installMpvShell(): void {
    nativePlayerActive = true;
    ipcRenderer.on(IPC_CHANNELS.MPV_SHELL_EVENT, (_, message: string) => followPlayback(message));
    contextBridge.exposeInMainWorld("__dxbiShellBridge", {
        post: (message: string) => ipcRenderer.send(IPC_CHANNELS.MPV_SHELL_SEND, message),
        listen: (callback: (message: string) => void) => {
            ipcRenderer.on(IPC_CHANNELS.MPV_SHELL_EVENT, (_, message: string) => callback(message));
        },
    });
    contextBridge.executeInMainWorld({ func: mainWorld });
}

// Runs in the page itself (serialized: it can't use anything from this file)
function mainWorld(): void {
    const bridge = (window as any).__dxbiShellBridge;
    const listeners = new Set<(e: { data: string }) => void>();
    const send = (method: string, data: unknown) => bridge.post(JSON.stringify({ id: 0, type: 6, args: [method, data] }));

    const webview = {
        postMessage(message: unknown) { bridge.post(typeof message === "string" ? message : JSON.stringify(message)); },
        addEventListener(type: string, fn: (e: { data: string }) => void) { if (type === "message") listeners.add(fn); },
        removeEventListener(type: string, fn: (e: { data: string }) => void) { if (type === "message") listeners.delete(fn); },
    };
    const w = window as any;
    if (!w.chrome) w.chrome = {};
    Object.defineProperty(w.chrome, "webview", { value: webview, configurable: true });
    w.__dxbiNativePlayer = "mpv";
    // Stremio skips its "can the browser play this?" check (which sends anything else through the
    // streaming server's converter) when it runs in its Qt desktop app, which also plays with mpv.
    // mpv plays every format, audio layout and embedded subtitle as it is, so skip it here too.
    // (Stremio only reads window.qt for that and for qt.webChannelTransport, which stays absent.)
    if (w.qt === undefined) w.qt = {};

    // ---- mpv's state, as Stremio's player hears it ----
    const mpv: Record<string, any> = { pause: true, volume: 100, mute: false, speed: 1, "time-pos": 0, duration: NaN };
    const barsWaiting: ((bars: unknown) => void)[] = [];
    w.__dxbiMpvState = mpv; // for problem reports
    // For dx.bi's picture and sound features, which use mpv's own filters and shaders here
    w.__dxbiMpv = Object.freeze({
        get: (name: string) => mpv[name],
        set: (name: string, value: unknown) => send("mpv-set-prop", [name, value]),
        subtitleStyle: (properties: Record<string, unknown>) => send("dxbi-subtitle-style", properties),
        command: (...args: unknown[]) => send("mpv-command", args),
        observe: (name: string) => send("mpv-observe-prop", name),
        // [{ name, source }] of mpv GLSL user shaders; [] removes them
        shaders: (list: { name: string; source: string }[]) => send("dxbi-shaders", list),
        // Picture-in-picture on / off (the video in a small window on top while dx.bi minimizes)
        pip: () => send("dxbi-pip", null),
        // Black bars in the current frame: { t, b, l, r } as fractions, or null
        measureBars: () => new Promise((resolve) => {
            barsWaiting.push(resolve);
            if (barsWaiting.length === 1) send("dxbi-measure-bars", null);
        }),
    });
    let proxy: HTMLVideoElement | null = null;
    let lastTimeEvent = 0;

    const fire = (type: string) => { if (proxy) proxy.dispatchEvent(new Event(type)); };

    const onProp = (name: string, data: any) => {
        const before = mpv[name];
        mpv[name] = data;
        if (!proxy) return;
        switch (name) {
            case "time-pos": {
                const now = performance.now();
                if (now - lastTimeEvent > 240) { lastTimeEvent = now; fire("timeupdate"); }
                break;
            }
            case "duration": if (data !== before) { fire("durationchange"); if (data) { fire("loadedmetadata"); fire("loadeddata"); fire("canplay"); } } break;
            case "pause": if (data !== before) { if (data) fire("pause"); else { fire("play"); fire("playing"); } } break;
            case "paused-for-cache": if (data) fire("waiting"); else if (before) { fire("canplay"); fire("playing"); } break;
            case "seeking": if (data) fire("seeking"); else if (before) { fire("seeked"); fire("timeupdate"); } break;
            case "volume": case "mute": fire("volumechange"); break;
            case "speed": fire("ratechange"); break;
            case "video-params": fire("resize"); break;
            case "path": if (data && data !== before) { fire("loadstart"); fire("emptied"); } break;
        }
    };

    const debug = { received: 0, props: 0, errors: [] as string[], last: "" };
    w.__dxbiMpvDebug = debug; // for problem reports
    bridge.listen((message: string) => {
        debug.received++;
        debug.last = message.slice(0, 120);
        try {
            const msg = JSON.parse(message);
            if (msg.type === 1 && Array.isArray(msg.args)) {
                const [name, data] = msg.args;
                if (name === "mpv-prop-change" && data) { debug.props++; onProp(data.name, data.data); }
                else if (name === "mpv-event-ended" && data && data.reason === "eof") fire("ended");
                else if (name === "dxbi-bars") for (const resolve of barsWaiting.splice(0)) resolve(data);
            }
        } catch (err) { if (debug.errors.length < 5) debug.errors.push(String(err)); }
        for (const fn of listeners) {
            try { fn({ data: message }); } catch (err) { console.error("[dx.bi] shell listener", err); }
        }
    });

    // ---- The stand-in <video> ----
    const timeRanges = (end: () => number | null) => ({
        get length() { return end() ? 1 : 0; },
        start() { return 0; },
        end() { return end() || 0; },
    });

    const makeProxy = (): HTMLVideoElement => {
        const v = document.createElement("video");
        v.className = "dx-mpv-video";
        v.muted = true;
        v.setAttribute("aria-hidden", "true");
        v.style.cssText = "position:absolute;inset:0;width:100%;height:100%;opacity:0;pointer-events:none;z-index:-1";
        const define = (name: string, get: () => unknown, set?: (value: any) => void) =>
            Object.defineProperty(v, name, { configurable: true, get, set: set || (() => { /* read-only */ }) });
        define("currentTime", () => Number(mpv["time-pos"]) || 0, (t) => { if (isFinite(t)) { send("mpv-set-prop", ["time-pos", Math.max(0, +t)]); } });
        define("duration", () => (typeof mpv.duration === "number" && mpv.duration > 0 ? mpv.duration : NaN));
        define("paused", () => mpv.pause !== false);
        define("ended", () => mpv["eof-reached"] === true);
        define("seeking", () => mpv.seeking === true);
        // This is mpv's stand-in, so preserve Stremio's 0–200% range for remembered volume too.
        define("volume", () => Math.max(0, Math.min(2, (Number(mpv.volume) || 0) / 100)), (x) => { if (isFinite(x)) send("mpv-set-prop", ["volume", Math.round(Math.max(0, Math.min(2, +x)) * 100)]); });
        define("muted", () => mpv.mute === true, (m) => send("mpv-set-prop", ["mute", m ? "yes" : "no"]));
        define("playbackRate", () => Number(mpv.speed) || 1, (r) => { if (isFinite(r) && r > 0) send("mpv-set-prop", ["speed", +r]); });
        define("defaultPlaybackRate", () => 1);
        define("readyState", () => (mpv.duration > 0 ? (mpv["paused-for-cache"] ? 2 : 4) : 0));
        define("networkState", () => 2);
        define("videoWidth", () => (mpv["video-params"] && (mpv["video-params"].dw || mpv["video-params"].w)) || 0);
        define("videoHeight", () => (mpv["video-params"] && (mpv["video-params"].dh || mpv["video-params"].h)) || 0);
        define("currentSrc", () => mpv.path || "");
        define("src", () => mpv.path || "");
        define("buffered", () => timeRanges(() => (typeof mpv["demuxer-cache-time"] === "number" ? mpv["demuxer-cache-time"] : null)));
        define("played", () => timeRanges(() => Number(mpv["time-pos"]) || null));
        define("seekable", () => timeRanges(() => (mpv.duration > 0 ? mpv.duration : null)));
        Object.assign(v, {
            play: () => { send("mpv-set-prop", ["pause", false]); return Promise.resolve(); },
            pause: () => { send("mpv-set-prop", ["pause", true]); },
            load: () => { /* mpv loads through Stremio */ },
            fastSeek: (t: number) => { send("mpv-set-prop", ["time-pos", t]); },
            getVideoPlaybackQuality: () => ({ totalVideoFrames: 0, droppedVideoFrames: Number(mpv["frame-drop-count"]) || 0, corruptedVideoFrames: 0, creationTime: performance.now() }),
            requestPictureInPicture: () => Promise.reject(new DOMException("Not available with mpv", "NotSupportedError")),
            captureStream: () => { throw new DOMException("Not available with mpv", "NotSupportedError"); },
        });
        return v;
    };

    // Kept in the player screen while it's open (Stremio's mpv player has no <video> of its own)
    const keepProxy = () => {
        const container = location.hash.startsWith("#/player") ? document.querySelector('[class*="player-container"]') : null;
        if (!container) {
            if (proxy) { proxy.remove(); proxy = null; }
            return;
        }
        if (container.querySelector("video:not(.dx-mpv-video)")) return; // a trailer in the browser player
        if (!proxy) {
            proxy = makeProxy();
            // For dx.bi's stream stats (Stremio's player doesn't watch these)
            send("mpv-observe-prop", "hwdec-current");
            send("mpv-observe-prop", "frame-drop-count");
        }
        if (proxy.parentElement !== container) {
            container.prepend(proxy);
            if (mpv.duration > 0) { fire("loadedmetadata"); fire("loadeddata"); fire("canplay"); if (!mpv.pause) fire("playing"); }
        }
    };
    // Set up in the real page. This script can run while the window still holds its first, empty
    // document (Chromium swaps it for Stremio's, keeping the window), so check until it's there
    let setUpIn: Document | null = null;
    const start = () => {
        if (setUpIn === document || !document.head || !document.body) return;
        setUpIn = document;
        document.documentElement.setAttribute("data-dx-native-player", "mpv");
        // Pixel effects drawn from the browser video can't see mpv's picture: keep them from covering it
        const style = document.createElement("style");
        style.textContent = [
            "html[data-dx-native-player] [class*=\"player-container\"] canvas.dx-enhance { display: none !important; }",
            // Stremio clears the page background once mpv shows a picture; themes paint html/body too
            "html[data-dx-mpv-showing], html[data-dx-mpv-showing] body { background: transparent !important; }",
            // Stremio's own Discord switch appears for its desktop app; dx.bi has its own status
            "html[data-dx-native-player] [class*=\"discord-container\"] { display: none !important; }",
        ].join("\n");
        document.head.appendChild(style);
        // Stremio's mpv player marks that moment by making <body> transparent (and undoes it after)
        const showing = () => {
            const on = document.body.style.background === "transparent" || document.body.style.backgroundColor === "transparent";
            document.documentElement.toggleAttribute("data-dx-mpv-showing", on);
        };
        new MutationObserver(showing).observe(document.body, { attributes: true, attributeFilter: ["style"] });
        new MutationObserver(keepProxy).observe(document.body, { childList: true, subtree: true });
        showing();
        keepProxy();
    };
    addEventListener("hashchange", keepProxy);
    addEventListener("DOMContentLoaded", start);
    const until = setInterval(() => { start(); if (setUpIn === document) clearInterval(until); }, 250);
}
