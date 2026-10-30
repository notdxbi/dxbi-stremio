import { BrowserWindow, dialog } from "electron";

const WAIT_MS = 45000;
const POLL_MS = 2000;
// Stremio's own screens are up (its top bar, or a route such as the player)
const LOADED = `!!document.querySelector('#app nav, #app [class*="route-"]')`;

/**
 * Stremio's web app comes from web.stremio.com every time. When that download crawls or stalls the
 * screen just stays black, for minutes, with no hint why: after a while say so, and offer to retry.
 * It's never reloaded unasked, since on a slow connection that would throw away a download in progress.
 */
export function watchLoad(win: BrowserWindow): void {
    const loaded = () => Promise.race([
        win.webContents.executeJavaScript(LOADED, true).catch(() => false),
        new Promise((resolve) => setTimeout(() => resolve(false), POLL_MS)),
    ]);

    const check = async () => {
        if (win.isDestroyed() || await loaded()) return;
        const asked = new AbortController();
        const poll = setInterval(async () => {
            if (win.isDestroyed() || await loaded()) asked.abort();
        }, POLL_MS);
        const { response } = await dialog.showMessageBox(win, {
            type: "warning",
            title: "dx.bi",
            message: "Stremio is taking a long time to load",
            detail: "It's downloaded from web.stremio.com, which is slow or not answering on this connection. A VPN, a firewall or antivirus, or your network can cause this.\n\nIt may still finish if you keep waiting.",
            buttons: ["Keep waiting", "Try again"],
            defaultId: 0,
            cancelId: 0,
            signal: asked.signal,
        }).catch(() => ({ response: 0 }));
        clearInterval(poll);
        if (response !== 1 || asked.signal.aborted || win.isDestroyed()) return;
        win.webContents.reloadIgnoringCache();
        setTimeout(check, WAIT_MS);
    };

    setTimeout(check, WAIT_MS);
}
