// dx.bi — Copyright (C) 2026 dx.bi. GNU General Public License, version 3 or later (see LICENSE).
import { BrowserWindow, shell } from "electron";
import { URLS } from "../constants";

/**
 * Links the page opens leave the app for the browser, but only web and mail links: addons write
 * the links on title pages, and a file:, smb: or other app's link handed to the system can open
 * or run something on the computer.
 */
export function openOutside(url: string): void {
    let protocol = "";
    try { protocol = new URL(url).protocol; } catch { return; }
    if (protocol === "http:" || protocol === "https:" || protocol === "mailto:") shell.openExternal(url);
}

/**
 * The window stays on Stremio's web app: dx.bi's APIs are only for that page, so a link that would
 * take the whole window somewhere else opens in the browser instead. New windows always do.
 */
export function keepOnStremio(win: BrowserWindow): void {
    const home = new URL(URLS.STREMIO_WEB).origin;
    win.webContents.setWindowOpenHandler(({ url }) => {
        openOutside(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
        let origin = "";
        try { origin = new URL(url).origin; } catch { /* not a URL: blocked */ }
        if (origin === home) return;
        event.preventDefault();
        openOutside(url);
    });
}
