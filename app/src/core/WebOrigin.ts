import { BrowserWindow } from "electron";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import Properties from "./Properties";
import { getLogger } from "../utils/logger";

/**
 * Where Stremio's web app comes from. dx.bi builds its own copy of Stremio's open-source web app
 * (github.com/notdxbi/dxbi-web, unchanged and pinned to a tested release) instead of loading
 * web.stremio.com, where any change Stremio made could break dx.bi before it was tested.
 *
 * A web page keeps its data (the Stremio login, library, dx.bi's settings) per address, so the first
 * start on the new address copies everything over from web.stremio.com, and nobody is signed out.
 * Until that copy has worked (no connection, say), dx.bi stays on web.stremio.com and tries again at
 * the next start.
 */
export const OLD_WEB = "https://web.stremio.com/";
export const DXBI_WEB = "https://notdxbi.github.io/dxbi-web/";

const logger = getLogger("WebOrigin");
const stateFile = () => join(Properties.enhancedPath, "web-origin.json");

let chosen = OLD_WEB;

/** The address Stremio's web app is loaded from this run (after choose()) */
export function webAddress(): string {
    return chosen;
}

function readState(): { moved?: boolean } {
    try {
        return existsSync(stateFile()) ? JSON.parse(readFileSync(stateFile(), "utf8")) : {};
    } catch {
        return {};
    }
}

function writeState(state: { moved: boolean; at: string }) {
    try {
        writeFileSync(stateFile(), JSON.stringify(state, null, 2));
    } catch (err) {
        logger.warn(`Couldn't save the web address state: ${err}`);
    }
}

/** Loads [url] in [win] and resolves once it has, or rejects when it can't */
function load(win: BrowserWindow, url: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`timed out loading ${url}`)), 30000);
        win.webContents.once("did-finish-load", () => { clearTimeout(timer); resolve(); });
        win.webContents.once("did-fail-load", (_e, code, desc) => { clearTimeout(timer); reject(new Error(`${desc} (${code}) loading ${url}`)); });
        win.loadURL(url).catch(() => { /* reported by did-fail-load */ });
    });
}

/**
 * Copies web.stremio.com's stored data to dx.bi's own address, in a hidden window: a small file from
 * each site is loaded only to reach that site's storage. Keys already on the new address are kept.
 */
async function moveStorage(): Promise<void> {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true, javascript: true } });
    try {
        await load(win, OLD_WEB + "manifest.json");
        const data: Record<string, string> = JSON.parse(await win.webContents.executeJavaScript(
            "JSON.stringify(Object.fromEntries(Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).map((k) => [k, localStorage.getItem(k)])))",
            true,
        ));
        await load(win, DXBI_WEB + "dxbi-web-version.txt");
        const copied: number = await win.webContents.executeJavaScript(
            `(() => { const data = ${JSON.stringify(data)}; let n = 0;
              for (const [k, v] of Object.entries(data)) if (localStorage.getItem(k) === null) { localStorage.setItem(k, v); n++; }
              return n; })()`,
            true,
        );
        logger.info(`Moved ${copied} of ${Object.keys(data).length} stored items to dx.bi's own web app.`);
    } finally {
        if (!win.isDestroyed()) win.destroy();
    }
}

/**
 * Decides the address for this run: dx.bi's own once the move has happened (doing it now if it
 * hasn't), web.stremio.com when the move can't be done yet or DXBI_WEB=stremio is set.
 */
export async function choose(): Promise<string> {
    if (process.env.DXBI_WEB === "stremio") return (chosen = OLD_WEB);
    if (readState().moved) return (chosen = DXBI_WEB);
    try {
        await moveStorage();
        writeState({ moved: true, at: new Date().toISOString() });
        return (chosen = DXBI_WEB);
    } catch (err) {
        logger.warn(`Staying on web.stremio.com for now (will try again next start): ${err}`);
        return (chosen = OLD_WEB);
    }
}

/** dx.bi's own address didn't load: back to web.stremio.com for this run (the data was copied, not moved) */
export function fallBack(): string {
    chosen = OLD_WEB;
    return chosen;
}
