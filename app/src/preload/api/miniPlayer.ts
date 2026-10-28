import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../constants';

// dx.bi's picture-in-picture window (core/MiniPlayer.ts), for the plugin

/** This page is the mini player: from which second it starts. null in the main window. */
export const miniPlayerInfo: { at: number } | null = (() => {
    try { return ipcRenderer.sendSync(IPC_CHANNELS.MINI_INFO) ?? null; } catch { return null; }
})();

let isOpen = false;
let onState: ((open: boolean) => void) | null = null;
let onResume: ((hash: string, at: number) => void) | null = null;
// a resume that arrived before the plugin was listening
let pendingResume: [string, number] | null = null;

ipcRenderer.on(IPC_CHANNELS.MINI_STATE, (_, open: boolean) => {
    isOpen = open;
    onState?.(open);
});
ipcRenderer.on(IPC_CHANNELS.MINI_RESUME, (_, hash: string, at: number) => {
    if (onResume) onResume(hash, at);
    else pendingResume = [hash, at];
});

export const miniPlayerAPI = {
    miniPlayer: {
        info: () => miniPlayerInfo,
        isOpen: () => isOpen,
        /** From the main window's player: carry on in the mini player */
        open: (hash: string, at: number): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.MINI_OPEN, hash, at),
        /** From the mini player: back to the main window */
        expand: (hash: string, at: number): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.MINI_EXPAND, hash, at),
        close: (): Promise<void> => ipcRenderer.invoke(IPC_CHANNELS.MINI_CLOSE),
        /** The mini window: move its top-left corner to (x, y) on screen; resize to a width (16:9) */
        moveTo: (x: number, y: number) => ipcRenderer.send(IPC_CHANNELS.MINI_MOVE, x, y),
        resizeTo: (width: number) => ipcRenderer.send(IPC_CHANNELS.MINI_SIZE, width),
        onState: (fn: (open: boolean) => void) => { onState = fn; },
        onResume: (fn: (hash: string, at: number) => void) => {
            onResume = fn;
            if (pendingResume) {
                const [hash, at] = pendingResume;
                pendingResume = null;
                fn(hash, at);
            }
        },
    },
};
