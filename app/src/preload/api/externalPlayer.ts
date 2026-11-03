import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../../constants';
import { type ExternalPlayer } from '../../interfaces/ExternalPlayerTypes';
import { externalPlayerTracker } from '../ui/externalPlayerTracker';

export const externalPlayerAPI = {
    // dx.bi's own External player setting and Stremio's "Play in external player" (in the plugin) both
    // open streams here, so both keep their progress
    launchExternalPlayer: async (player: ExternalPlayer | 'iina', streamUrl: string, customPath?: string): Promise<{ success: boolean; error?: string }> => {
        const { found, options } = player === 'iina'
            ? { found: null, options: {} }
            : await externalPlayerTracker.prepare(streamUrl);
        const result = await ipcRenderer.invoke(IPC_CHANNELS.LAUNCH_EXTERNAL_PLAYER, player, streamUrl, customPath, options) as { success: boolean; error?: string; tracked?: boolean };
        if (result.success && result.tracked && found) externalPlayerTracker.start(found);
        return { success: result.success, error: result.error };
    },
    getExternalPlayerPaths: (): Promise<{ vlc: string | null; mpv: string | null; iina: string | null }> => {
        return ipcRenderer.invoke(IPC_CHANNELS.GET_EXTERNAL_PLAYER_PATHS);
    },
};
