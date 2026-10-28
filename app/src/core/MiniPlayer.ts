import { BrowserWindow, ipcMain, screen, shell } from "electron";
import { join } from "path";
import { IPC_CHANNELS, URLS } from "../constants";
import { getLogger } from "../utils/logger";

const logger = getLogger("MiniPlayer");

// Picture-in-picture that survives browsing. Stremio drops its player screen (and stops the video)
// as soon as you go anywhere else, so the browser's own PiP closed with it. Instead the stream moves
// to a small always-on-top window running its own Stremio player, from the same second, while the
// main window is free to browse. Expand brings it back to the main window; closing it stops it.

const WIDTH = 480;
const HEIGHT = 270;
const MARGIN = 24;

let mini: BrowserWindow | null = null;
// where the mini player should pick up (its page asks once it loads)
let startAt = 0;

const isPlayerHash = (hash: unknown): hash is string => typeof hash === "string" && hash.startsWith("#/player/");
const seconds = (t: unknown) => (typeof t === "number" && isFinite(t) && t > 0 ? t : 0);

function open(main: BrowserWindow, hash: string, at: number) {
    close();
    startAt = at;
    // the corner of the screen dx.bi is on
    const area = screen.getDisplayMatching(main.getBounds()).workArea;
    mini = new BrowserWindow({
        x: area.x + area.width - WIDTH - MARGIN,
        y: area.y + area.height - HEIGHT - MARGIN,
        width: WIDTH,
        height: HEIGHT,
        minWidth: 320,
        minHeight: 180,
        frame: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        fullscreenable: false,
        maximizable: false,
        minimizable: false,
        hasShadow: true,
        backgroundColor: "#000000",
        title: "dx.bi",
        icon: join(__dirname, "..", "..", "images", process.platform === "win32" ? "icon.ico" : "icon.png"),
        webPreferences: {
            // the same page setup as the main window (main.ts), so dx.bi runs in it too
            preload: join(__dirname, "..", "preload", "index.js"),
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: true,
            spellcheck: false,
            backgroundThrottling: false,
        },
    });
    const win = mini;
    win.setMenu(null);
    win.setAspectRatio(16 / 9);
    // above full-screen apps too, like the system's own picture-in-picture
    win.setAlwaysOnTop(true, "floating");
    if (process.platform === "darwin") win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: "deny" };
    });
    win.on("closed", () => {
        if (mini === win) mini = null;
        tellMain(main);
    });
    win.loadURL(URLS.STREMIO_WEB + hash);
    tellMain(main);
    logger.info("Mini player opened");
}

function close() {
    if (mini && !mini.isDestroyed()) mini.destroy();
    mini = null;
}

// the main window's PiP button shows whether the mini player is up
function tellMain(main: BrowserWindow) {
    if (!main.isDestroyed()) main.webContents.send(IPC_CHANNELS.MINI_STATE, !!mini);
}

export default {
    // Once: macOS makes a new main window when the dock icon is clicked with none open
    setup(getMain: () => BrowserWindow | null) {
        const live = () => { const w = getMain(); return w && !w.isDestroyed() ? w : null; };
        const fromMini = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => !!mini && !mini.isDestroyed() && e.sender === mini.webContents;
        const fromMain = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => e.sender === live()?.webContents;

        ipcMain.handle(IPC_CHANNELS.MINI_OPEN, (e, hash: unknown, at: unknown) => {
            const main = live();
            if (!main || !fromMain(e) || !isPlayerHash(hash)) return false;
            open(main, hash, seconds(at));
            return true;
        });

        // Back to the main window, where it was
        ipcMain.handle(IPC_CHANNELS.MINI_EXPAND, (e, hash: unknown, at: unknown) => {
            if (!fromMini(e) || !isPlayerHash(hash)) return false;
            close();
            const main = live();
            if (!main) return false;
            if (main.isMinimized()) main.restore();
            main.show();
            main.focus();
            main.webContents.send(IPC_CHANNELS.MINI_RESUME, hash, seconds(at));
            tellMain(main);
            return true;
        });

        ipcMain.handle(IPC_CHANNELS.MINI_CLOSE, (e) => {
            if (!fromMain(e) && !fromMini(e)) return;
            close();
            const main = live();
            if (main) tellMain(main);
        });

        // Asked by every page as it starts: is it the mini player, and from which second
        ipcMain.on(IPC_CHANNELS.MINI_INFO, (e) => {
            e.returnValue = fromMini(e) ? { at: startAt } : null;
        });
    },

    // the mini player goes with the window it came from
    attach(main: BrowserWindow) {
        main.on("closed", close);
    },
};
