import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getLogger } from "../utils/logger";
import { isFullScreen, isMaximized, normalBounds } from "./Maximize";

// The window opens the way it was left (main.ts shows it once dx.bi is up): maximized, or at its last size and place. The first time
// it opens maximized.

const logger = getLogger("WindowState");
const statePath = () => join(app.getPath("userData"), "window-state.json");

interface SavedState {
    bounds?: Rectangle;
    maximized?: boolean;
}

function read(): SavedState | null {
    try { return JSON.parse(readFileSync(statePath(), "utf8")); } catch { return null; }
}

// Only a place that's still on one of the screens (a monitor may have been unplugged since)
function onScreen(bounds: Rectangle): boolean {
    return screen.getAllDisplays().some(({ workArea: a }) =>
        bounds.x < a.x + a.width - 100 && bounds.x + bounds.width > a.x + 100 &&
        bounds.y >= a.y - 20 && bounds.y < a.y + a.height - 100);
}

// Returns whether it should open maximized: done as it's shown (maximize() would show it now)
export function restoreWindowState(win: BrowserWindow): boolean {
    const saved = read();
    if (saved?.bounds && onScreen(saved.bounds)) win.setBounds(saved.bounds);
    const maximized = !saved || saved.maximized !== false;

    // Saved whenever it changes (a quick exit or a crash skips the close event)
    let timer: NodeJS.Timeout | null = null;
    const save = () => {
        if (win.isDestroyed() || win.isMinimized()) return;
        // the size it goes back to when un-maximized
        const state: SavedState = { bounds: normalBounds(win), maximized: isMaximized(win) || isFullScreen(win) };
        try { writeFileSync(statePath(), JSON.stringify(state)); } catch (err) { logger.warn(`Couldn't save the window state: ${err}`); }
    };
    const later = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(save, 600);
    };
    for (const event of ["resize", "move", "maximize", "unmaximize", "enter-full-screen", "leave-full-screen"] as const) win.on(event as any, later);
    win.on("close", save);
    win.once("show", save);
    return maximized;
}
