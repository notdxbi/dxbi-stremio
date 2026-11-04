import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../constants';

// Downloads to watch offline (core/Downloads.ts), for the plugin: it picks the streams and draws
// the buttons and the Downloads page; the app saves the files and plays them back

const listeners = new Set<(list: unknown[]) => void>();
ipcRenderer.on(IPC_CHANNELS.DL_CHANGED, (_, list: unknown[]) => {
    for (const fn of listeners) {
        try { fn(list); } catch { /* one listener's mistake isn't the others' */ }
    }
});

export const downloadsAPI = {
    downloads: {
        list: (): Promise<unknown[]> => ipcRenderer.invoke(IPC_CHANNELS.DL_LIST),
        /** { type, metaId, videoId, name, episode, season, number, year, poster, background, quality, provider,
         *  filename, url, headers, torrent: { infoHash, fileIdx, sources, server }, subtitles: [{ lang, url }],
         *  link: { streamTransportUrl, metaTransportUrl }, size } → { ok, id, error } */
        add: (spec: unknown): Promise<{ ok: boolean; id?: string; error?: string }> => ipcRenderer.invoke(IPC_CHANNELS.DL_ADD, spec),
        /** pause, resume, retry, remove, finished, unwatched, openFolder, removeWatched */
        action: (action: string, id?: string): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.DL_ACTION, action, id || ""),
        /** { folder, quality, autoDelete, parallel } (any of them) → the settings now, with free space */
        settings: (changes?: unknown): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.DL_SETTINGS, changes || {}),
        pickFolder: (): Promise<unknown> => ipcRenderer.invoke(IPC_CHANNELS.DL_PICK_FOLDER),
        onChange: (fn: (list: unknown[]) => void) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    },
};
