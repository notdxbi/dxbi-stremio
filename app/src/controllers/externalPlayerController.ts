import * as net from 'net';
import { existsSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { getLogger } from '../utils/logger';
import { IPC_CHANNELS } from '../constants';
import { ipcMain, BrowserWindow, shell } from 'electron';
import { homedir } from 'os';
import { join } from 'path';
import { VALID_EXTERNAL_PLAYERS, type ExternalPlayer } from '../interfaces/ExternalPlayerTypes';

const logger = getLogger("ExternalPlayerController");

// Common socket paths per platform
const MPV_SOCKET = process.platform === 'win32' ? '\\\\.\\pipe\\mpvsocket' : '/tmp/mpvsocket';
const VLC_HTTP_PORT = 9090;
// VLC's web remote can browse files: a fresh password each launch, and only reachable from this computer
const VLC_HTTP_HOST = '127.0.0.1';
const VLC_HTTP_PASSWORD = randomBytes(18).toString('base64url');

// Common install paths per platform
const PLAYER_PATHS: Record<string, Record<string, string[]>> = {
    win32: {
        vlc: ['C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'],
        mpv: ['C:\\Program Files\\mpv\\mpv.exe', 'C:\\Program Files (x86)\\mpv\\mpv.exe'],
    },
    darwin: {
        vlc: ['/Applications/VLC.app/Contents/MacOS/VLC'],
        mpv: ['/usr/local/bin/mpv', '/opt/homebrew/bin/mpv'],
        iina: ['/Applications/IINA.app', join(homedir(), 'Applications/IINA.app')],
    },
    linux: {
        vlc: ['/usr/bin/vlc'],
        mpv: ['/usr/bin/mpv'],
    },
};

let pollInterval: ReturnType<typeof setInterval> | null = null;
let activeChild: ChildProcess | null = null;

// Stream links come from addons: only real web or file links, so one can't pass itself off as a player option
function isPlayableUrl(streamUrl: unknown): streamUrl is string {
    if (typeof streamUrl !== 'string') return false;
    try {
        return ['http:', 'https:', 'file:'].includes(new URL(streamUrl).protocol);
    } catch {
        return false;
    }
}

function findPlayerPath(player: 'vlc' | 'mpv' | 'iina'): string | null {
    const paths = PLAYER_PATHS[process.platform]?.[player] ?? [];
    return paths.find(p => existsSync(p)) ?? null;
}

async function getMpvStatus(): Promise<{ position: number; state: 'playing' | 'paused' } | null> {
    return new Promise((resolve) => {
        const socket = net.createConnection(MPV_SOCKET);
        const requests = [
            JSON.stringify({ command: ['get_property', 'time-pos'], request_id: 1 }),
            JSON.stringify({ command: ['get_property', 'pause'], request_id: 2 }),
        ];
        let resolved = false;
        let position: number | null = null;
        let paused: boolean | null = null;
        let buffer = '';

        const done = (val: { position: number; state: 'playing' | 'paused' } | null) => {
            if (!resolved) { resolved = true; resolve(val); socket.destroy(); }
        };

        const tryResolve = () => {
            if (position !== null && paused !== null)
                done({ position, state: paused ? 'paused' : 'playing' });
        };

        socket.on('connect', () => requests.forEach(r => socket.write(r + '\n')));
        socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const res = JSON.parse(line);
                    if (res.request_id === 1) position = res.data ?? null;
                    if (res.request_id === 2) paused = res.data ?? null;
                    tryResolve();
                } catch { /* ignore */ }
            }
        });
        socket.on('error', () => done(null));
        setTimeout(() => done(null), 1000);
    });
}

async function getVlcStatus(): Promise<{ position: number; state: 'playing' | 'paused' | 'stopped' } | null> {
    try {
        const auth = Buffer.from(`:${VLC_HTTP_PASSWORD}`).toString('base64');
        const res = await fetch(`http://${VLC_HTTP_HOST}:${VLC_HTTP_PORT}/requests/status.json`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (data.time == null || data.state == null) return null;
        return { position: data.time, state: data.state };
    } catch {
        return null;
    }
}

function startPolling(player: ExternalPlayer, child: ChildProcess) {
    if (pollInterval) clearInterval(pollInterval);

    pollInterval = setInterval(async () => {
        if (activeChild !== child) {
            clearInterval(pollInterval!);
            pollInterval = null;
            return;
        }

        const win = BrowserWindow.getAllWindows()[0];
        if (!win) return;

        const status = player === 'mpv'
            ? await getMpvStatus()
            : await getVlcStatus();

        if (!status) return; // player not ready yet or temporarily unavailable, keep polling

        win.webContents.send(IPC_CHANNELS.EXTERNAL_PLAYER_POSITION, status);
    }, 5000);
}

export const externalPlayerController = {
    initIPC: () => {
        ipcMain.handle(IPC_CHANNELS.LAUNCH_EXTERNAL_PLAYER, async (_, player: string, streamUrl: string, customPath?: string) => {
            // IINA on a Mac: its own link, the way Stremio's app opens it
            if (player === 'iina') {
                if (!isPlayableUrl(streamUrl)) return { success: false, error: "This stream link can't be opened in an external player." };
                if (!findPlayerPath('iina')) return { success: false, error: 'IINA not found. Please install it.' };
                await shell.openExternal(`iina://weblink?url=${encodeURIComponent(streamUrl)}`);
                return { success: true };
            }

            if (!VALID_EXTERNAL_PLAYERS.includes(player as ExternalPlayer) || player === 'disabled') {
                logger.error(`Invalid external player: ${player}`);
                return { success: false, error: `Invalid player: ${player}` };
            }

            if (!isPlayableUrl(streamUrl)) {
                logger.error(`Refusing to open a stream that isn't a web or file link in ${player}.`);
                return { success: false, error: "This stream link can't be opened in an external player." };
            }

            const playerPath = customPath || findPlayerPath(player as 'vlc' | 'mpv');
            if (!playerPath) {
                logger.error(`${player} not found at any known path.`);
                return { success: false, error: `${player} not found. Please install it or set a custom path in settings.` };
            }

            // kill previous player if still running
            if (activeChild) {
                activeChild.kill();
            }
            if (pollInterval) {
                clearInterval(pollInterval);
                pollInterval = null;
            }

            const args = player === 'mpv'
                ? [`--input-ipc-server=${MPV_SOCKET}`, streamUrl]
                : ['--extraintf=http', `--http-host=${VLC_HTTP_HOST}`, `--http-password=${VLC_HTTP_PASSWORD}`, `--http-port=${VLC_HTTP_PORT}`, streamUrl];

            logger.info(`Launching ${player} at ${playerPath} with URL: ${streamUrl}`);

            // spawn, not execFile: execFile buffers the player's output and kills it past 1 MB
            const child = spawn(playerPath, args, { stdio: 'ignore' });
            child.on('error', (err) => logger.error(`Failed to launch ${player}: ${err.message}`));

            activeChild = child;

            child.on('exit', () => {
                // only handle exit if this is still the active child
                if (activeChild !== child) return;
                activeChild = null;
                if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
                const win = BrowserWindow.getAllWindows()[0];
                if (win) win.webContents.send(IPC_CHANNELS.EXTERNAL_PLAYER_CLOSED);
            });

            setTimeout(() => startPolling(player as ExternalPlayer, child), 2000);

            return { success: true };
        });

        ipcMain.handle(IPC_CHANNELS.GET_EXTERNAL_PLAYER_PATHS, () => ({
            vlc: findPlayerPath('vlc'),
            mpv: findPlayerPath('mpv'),
            iina: findPlayerPath('iina'),
        }));
    }
};
