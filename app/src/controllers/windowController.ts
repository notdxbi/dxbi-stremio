import { ipcMain, screen, type Rectangle } from 'electron';
import { IPC_CHANNELS } from "../constants";
import { mainWindow } from '../main';
import { isFullScreen, isMaximized, maximize, unmaximize } from '../core/Maximize';

const isWindows = process.platform === 'win32';

// the smallest the edges can make the window
const MIN_WIDTH = 760;
const MIN_HEIGHT = 480;

export function setupWindowControls() {
    ipcMain.on(IPC_CHANNELS.MINIMIZE_WINDOW, () => {
        mainWindow?.minimize();
    });
    
    ipcMain.on(IPC_CHANNELS.MAXIMIZE_WINDOW, () => {
        if (mainWindow) {
            if (isMaximized(mainWindow)) {
                unmaximize(mainWindow);
            } else {
                maximize(mainWindow);
            }
        }
    });

    ipcMain.handle(IPC_CHANNELS.IS_MAXIMIZED, () => {
        return mainWindow ? isMaximized(mainWindow) : false;
    });
    
    ipcMain.on(IPC_CHANNELS.CLOSE_WINDOW, () => {
        mainWindow?.close();
    });

    mainWindow?.on('maximize', () => {
        if (isWindows) mainWindow?.setResizable(false);
        mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED, true);
    });

    mainWindow?.on('unmaximize', () => {
        if (isWindows) mainWindow?.setResizable(true);
        mainWindow?.webContents.send(IPC_CHANNELS.WINDOW_MAXIMIZED, false);
    });

    mainWindow?.on('enter-full-screen', () => {
        if (isWindows) mainWindow?.setResizable(false); 
        mainWindow?.webContents.send(IPC_CHANNELS.FULLSCREEN_CHANGED, true);
    });

    mainWindow?.on('leave-full-screen', () => {
        if (isWindows && mainWindow && !isMaximized(mainWindow)) {
            mainWindow?.setResizable(true); 
        }
        
        mainWindow?.webContents.send(IPC_CHANNELS.FULLSCREEN_CHANGED, false);
    });

    // Moving the window by an empty part of a top bar (preload/ui/titleBar.ts). Positions are
    // worked out from where the drag started, with the size held: moving step by step grew the
    // window a little each time on Windows with display scaling
    let drag: { x: number; y: number; bounds: Rectangle; restoring: boolean } | null = null;
    ipcMain.on(IPC_CHANNELS.WINDOW_DRAG, (_, phase: string, x: number, y: number) => {
        if (!mainWindow || isFullScreen(mainWindow)) return;
        if (phase === "start") {
            drag = { x, y, bounds: mainWindow.getBounds(), restoring: isMaximized(mainWindow) };
            return;
        }
        if (phase === "end" || !drag) { drag = null; return; }
        if (drag.restoring) {
            // like Windows: a maximized window pulled down comes back to its normal size, under the pointer
            if (Math.abs(x - drag.x) + Math.abs(y - drag.y) < 8) return;
            const across = (drag.x - drag.bounds.x) / drag.bounds.width;
            unmaximize(mainWindow);
            const normal = mainWindow.getBounds();
            drag.bounds = { ...normal, x: Math.round(x - normal.width * across), y: drag.bounds.y };
            drag.x = x;
            drag.y = y;
            drag.restoring = false;
        }
        mainWindow.setBounds({ ...drag.bounds, x: Math.round(drag.bounds.x + x - drag.x), y: Math.round(drag.bounds.y + y - drag.y) });
    });

    // Resizing from the edges and corners. The window follows the cursor itself (polled here), so a
    // fast pull that leaves the window before the page hears of it still resizes all the way
    let resize: { x: number; y: number; bounds: Rectangle; edge: string; timer: NodeJS.Timeout } | null = null;
    const stopResize = () => { if (resize) clearInterval(resize.timer); resize = null; };
    const follow = () => {
        if (!resize || !mainWindow || mainWindow.isDestroyed()) return stopResize();
        const { x, y } = screen.getCursorScreenPoint();
        const b = resize.bounds, edge = resize.edge;
        const [minW, minH] = mainWindow.getMinimumSize().map((v) => v || 0);
        const dx = x - resize.x;
        const dy = y - resize.y;
        let { x: left, y: top, width, height } = b;
        if (edge.includes("e")) width = Math.max(minW, MIN_WIDTH, b.width + dx);
        if (edge.includes("s")) height = Math.max(minH, MIN_HEIGHT, b.height + dy);
        if (edge.includes("w")) { width = Math.max(minW, MIN_WIDTH, b.width - dx); left = b.x + b.width - width; }
        if (edge.includes("n")) { height = Math.max(minH, MIN_HEIGHT, b.height - dy); top = b.y + b.height - height; }
        const next = { x: Math.round(left), y: Math.round(top), width: Math.round(width), height: Math.round(height) };
        const now = mainWindow.getBounds();
        if (now.x !== next.x || now.y !== next.y || now.width !== next.width || now.height !== next.height) mainWindow.setBounds(next);
    };
    ipcMain.on(IPC_CHANNELS.WINDOW_RESIZE, (_, phase: string, edge: string) => {
        if (!mainWindow || isMaximized(mainWindow) || isFullScreen(mainWindow)) return stopResize();
        if (phase === "start") {
            stopResize();
            const { x, y } = screen.getCursorScreenPoint();
            resize = { x, y, bounds: mainWindow.getBounds(), edge, timer: setInterval(follow, 16) };
            return;
        }
        if (phase === "end") { follow(); stopResize(); }
    });
}