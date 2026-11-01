import { screen, type BrowserWindow, type Rectangle } from "electron";

// Electron can't maximize a transparent window on Windows (the mpv player needs one): maximize()
// stretches it over the screen, but it still says it isn't maximized, Restore does nothing, and the
// title bar went on dragging it, growing it as it went. Full screen didn't take either. Those windows
// are maximized (and made full screen) by hand here: filled to the screen's work area (or the whole
// screen), with the size they had kept to go back to.

interface Manual { maximized: boolean; fullScreen: boolean; normal: Rectangle | null; beforeFull: Rectangle | null }
const manual = new WeakMap<BrowserWindow, Manual>();

export function useManualMaximize(win: BrowserWindow, transparent: boolean): void {
    if (process.platform !== "win32" || !transparent) return;
    const state: Manual = { maximized: false, fullScreen: false, normal: null, beforeFull: null };
    manual.set(win, state);
    // Moved or resized by something else while maximized (Windows snapping, Win+arrow keys): it
    // isn't maximized any more, and its next Maximize must fill the screen again
    const check = () => {
        if (!state.maximized || state.fullScreen || win.isDestroyed()) return;
        const b = win.getBounds();
        const a = screen.getDisplayMatching(b).workArea;
        if (Math.abs(b.x - a.x) + Math.abs(b.y - a.y) + Math.abs(b.width - a.width) + Math.abs(b.height - a.height) <= 4) return;
        state.maximized = false;
        win.emit("unmaximize");
    };
    win.on("resized", check);
    win.on("moved", check);
}

// Hyprland draws nothing behind a full screen window, so the mpv picture would vanish: there MpvShell
// does full screen its own way (see hyprFullScreen there)
const custom = new WeakMap<BrowserWindow, { on: boolean; set: (on: boolean) => void }>();
export function useCustomFullScreen(win: BrowserWindow, set: (on: boolean) => void): void {
    custom.set(win, { on: false, set });
}

export function isFullScreen(win: BrowserWindow): boolean {
    const c = custom.get(win);
    if (c) return c.on;
    const state = manual.get(win);
    return state ? state.fullScreen : win.isFullScreen();
}

export function setFullScreen(win: BrowserWindow, on: boolean): void {
    const c = custom.get(win);
    if (c) {
        if (c.on === on) return;
        c.on = on;
        c.set(on);
        win.emit(on ? "enter-full-screen" : "leave-full-screen");
        return;
    }
    const state = manual.get(win);
    if (!state) return win.setFullScreen(on);
    if (state.fullScreen === on) return;
    if (on) {
        state.beforeFull = win.getBounds();
        state.fullScreen = true;
        win.setBounds(screen.getDisplayMatching(state.beforeFull).bounds);
        win.emit("enter-full-screen");
    } else {
        state.fullScreen = false;
        if (state.beforeFull) win.setBounds(state.beforeFull);
        win.emit("leave-full-screen");
    }
}

export function isMaximized(win: BrowserWindow): boolean {
    const state = manual.get(win);
    return state ? state.maximized : win.isMaximized();
}

// The size and place it goes back to when it's no longer maximized
export function normalBounds(win: BrowserWindow): Rectangle {
    const state = manual.get(win);
    if (!state) return win.getNormalBounds();
    if (state.maximized && state.normal) return state.normal;
    return (state.fullScreen && state.beforeFull) || win.getBounds();
}

export function maximize(win: BrowserWindow): void {
    const state = manual.get(win);
    if (!state) return win.maximize();
    if (state.maximized) return;
    state.normal = win.getBounds();
    state.maximized = true;
    win.setBounds(screen.getDisplayMatching(state.normal).workArea);
    win.emit("maximize");
}

export function unmaximize(win: BrowserWindow): void {
    const state = manual.get(win);
    if (!state) return win.unmaximize();
    if (!state.maximized) return;
    state.maximized = false;
    if (state.normal) win.setBounds(state.normal);
    win.emit("unmaximize");
}
