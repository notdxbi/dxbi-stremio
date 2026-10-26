import { ipcMain } from 'electron';
import { IPC_CHANNELS } from "../constants";
import { mainWindow } from '../main';
import { isFullScreen, isMaximized, maximize, unmaximize } from '../core/Maximize';

const isWindows = process.platform === 'win32';

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

    // Moved with its size held: setPosition alone grew the window a little at each step on
    // Windows with display scaling, so a long drag kept enlarging it
    let dragSize: { width: number; height: number } | null = null;
    let dragEnd: NodeJS.Timeout | null = null;
    ipcMain.on(IPC_CHANNELS.DRAG_WINDOW, (_, x: number, y: number) => {
        if (!mainWindow || isMaximized(mainWindow) || isFullScreen(mainWindow)) return;
        if (!dragSize) {
            const [width, height] = mainWindow.getSize();
            dragSize = { width, height };
        }
        mainWindow.setBounds({ x, y, ...dragSize });
        if (dragEnd) clearTimeout(dragEnd);
        dragEnd = setTimeout(() => { dragSize = null; }, 400);
    });
}