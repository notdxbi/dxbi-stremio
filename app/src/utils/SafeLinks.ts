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

// Embedded anime players whose pages open ad pop-ups and redirects when the picture is clicked
const AD_EMBED_HOSTS = ["megaplay.buzz"];

function isAdEmbed(url: string): boolean {
    let host = "";
    try { host = new URL(url).hostname; } catch { return false; }
    return AD_EMBED_HOSTS.some((h) => host === h || host.endsWith("." + h));
}

/** One of those players is on the page: nothing it opens is a link anyone asked for. */
function adEmbedShowing(win: BrowserWindow): boolean {
    try {
        return win.webContents.mainFrame.framesInSubtree.some((f) => isAdEmbed(f.url));
    } catch {
        return false;
    }
}

/**
 * The window stays on Stremio's web app: dx.bi's APIs are only for that page, so a link that would
 * take the whole window somewhere else opens in the browser instead. New windows always do.
 */
export function keepOnStremio(win: BrowserWindow): void {
    const home = new URL(URLS.STREMIO_WEB).origin;
    win.webContents.setWindowOpenHandler(({ url }) => {
        // the anime player covers the whole window, so a new window while it's up is its ad
        if (!adEmbedShowing(win)) openOutside(url);
        return { action: "deny" };
    });
    win.webContents.on("will-navigate", (event, url) => {
        let origin = "";
        try { origin = new URL(url).origin; } catch { /* not a URL: blocked */ }
        if (origin === home) return;
        event.preventDefault();
        if (!adEmbedShowing(win)) openOutside(url);
    });
    // ...and the player's own frame can't be sent off to an ad page either
    win.webContents.on("will-frame-navigate", (event) => {
        if (event.isMainFrame || !event.frame || !isAdEmbed(event.frame.url) || isAdEmbed(event.url)) return;
        event.preventDefault();
    });
}
