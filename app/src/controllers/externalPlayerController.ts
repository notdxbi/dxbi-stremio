import * as net from 'net';
import { existsSync, rmSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import { getLogger } from '../utils/logger';
import { IPC_CHANNELS } from '../constants';
import { ipcMain, BrowserWindow, shell } from 'electron';
import { homedir, tmpdir } from 'os';
import { join } from 'path';
import { VALID_EXTERNAL_PLAYERS, type ExternalPlayer, type ExternalPlayerOptions, type ExternalPlayerStatus } from '../interfaces/ExternalPlayerTypes';

const logger = getLogger("ExternalPlayerController");

// A fresh pipe (Windows) or socket (Linux, Mac) for each mpv launch, so dx.bi never talks to another mpv window
function newMpvSocket(): string {
    const name = `dxbi-mpv-${randomBytes(6).toString('hex')}`;
    return process.platform === 'win32' ? `\\\\.\\pipe\\${name}` : join(tmpdir(), `${name}.sock`);
}
const VLC_HTTP_PORT = 9090;
// VLC's web remote can browse files: a fresh password each launch, and only reachable from this computer
const VLC_HTTP_HOST = '127.0.0.1';
const VLC_HTTP_PASSWORD = randomBytes(18).toString('base64url');
// Where the player is gets asked this often: closing the player loses at most this much
const POLL_EVERY_MS = 1000;
// When dx.bi closes while a player is open, the page gets this long to save the place first
const SAVE_ON_CLOSE_MS = 1500;

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

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let activeChild: ChildProcess | null = null;
// The page keeps the progress of this launch (it asked to), and the window it's in
let trackedWindow: BrowserWindow | null = null;
const closeWatched = new WeakSet<BrowserWindow>();

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

// Only a start time and a title come from the page: anything else is dropped
function cleanOptions(options: unknown): ExternalPlayerOptions {
    const o = (options && typeof options === 'object' ? options : {}) as Record<string, unknown>;
    const start = typeof o.startSeconds === 'number' && Number.isFinite(o.startSeconds) && o.startSeconds > 0 ? Math.floor(o.startSeconds) : undefined;
    const title = typeof o.title === 'string' ? o.title.replace(/[\r\n]+/g, ' ').trim().slice(0, 200) || undefined : undefined;
    return { startSeconds: start, title, track: o.track === true };
}

async function getMpvStatus(socketPath: string): Promise<ExternalPlayerStatus | null> {
    return new Promise((resolve) => {
        const socket = net.createConnection(socketPath);
        const props = ['time-pos', 'pause', 'duration'];
        const values: Record<number, unknown> = {};
        let answered = 0;
        let resolved = false;
        let buffer = '';

        const done = (val: ExternalPlayerStatus | null) => {
            if (!resolved) { resolved = true; resolve(val); socket.destroy(); }
        };

        socket.on('connect', () => props.forEach((p, i) => socket.write(JSON.stringify({ command: ['get_property', p], request_id: i + 1 }) + '\n')));
        socket.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                if (!line.trim()) continue;
                try {
                    const res = JSON.parse(line);
                    if (typeof res.request_id !== 'number' || res.request_id < 1 || res.request_id > props.length) continue;
                    // before the video loads mpv answers "property unavailable"
                    values[res.request_id] = res.error === 'success' ? res.data : null;
                    answered++;
                } catch { /* ignore */ }
            }
            if (answered < props.length) return;
            const position = values[1], paused = values[2], duration = values[3];
            if (typeof position !== 'number') return done(null);
            done({
                position,
                duration: typeof duration === 'number' && duration > 0 ? duration : 0,
                state: paused === true ? 'paused' : 'playing',
            });
        });
        socket.on('error', () => done(null));
        setTimeout(() => done(null), 1000);
    });
}

async function getVlcStatus(): Promise<ExternalPlayerStatus | null> {
    try {
        const auth = Buffer.from(`:${VLC_HTTP_PASSWORD}`).toString('base64');
        const res = await fetch(`http://${VLC_HTTP_HOST}:${VLC_HTTP_PORT}/requests/status.json`, {
            headers: { Authorization: `Basic ${auth}` }
        });
        if (!res.ok) return null;
        const data = await res.json() as any;
        if (data.time == null || data.state == null) return null;
        // VLC says "stopped" between opening the stream and playing it: nothing to report yet
        if (data.state !== 'playing' && data.state !== 'paused') return null;
        return { position: data.time, duration: data.length > 0 ? data.length : 0, state: data.state };
    } catch {
        return null;
    }
}

function startPolling(player: ExternalPlayer, child: ChildProcess, win: BrowserWindow, mpvSocket: string) {
    if (pollTimer) clearTimeout(pollTimer);

    // one question at a time: the next is asked a second after the last answer
    const poll = async () => {
        pollTimer = null;
        if (activeChild !== child || win.isDestroyed()) return;

        const status = player === 'mpv'
            ? await getMpvStatus(mpvSocket)
            : await getVlcStatus();

        if (activeChild !== child || win.isDestroyed()) return;
        // no status: player not ready yet or temporarily unavailable, keep polling
        if (status) win.webContents.send(IPC_CHANNELS.EXTERNAL_PLAYER_POSITION, status);
        pollTimer = setTimeout(poll, POLL_EVERY_MS);
    };
    pollTimer = setTimeout(poll, POLL_EVERY_MS);
}

// Closing dx.bi while a tracked player is open: the page saves the place before the window goes
function saveBeforeClose(win: BrowserWindow) {
    if (closeWatched.has(win)) return;
    closeWatched.add(win);
    let saving = false;
    win.on('close', (e) => {
        if (saving || trackedWindow !== win || !activeChild) return;
        e.preventDefault();
        saving = true;
        trackedWindow = null;
        win.webContents.send(IPC_CHANNELS.EXTERNAL_PLAYER_CLOSED);
        setTimeout(() => { if (!win.isDestroyed()) win.close(); }, SAVE_ON_CLOSE_MS);
    });
}

export const externalPlayerController = {
    initIPC: () => {
        ipcMain.handle(IPC_CHANNELS.LAUNCH_EXTERNAL_PLAYER, async (event, player: string, streamUrl: string, customPath?: string, rawOptions?: unknown) => {
            // IINA on a Mac: its own link, the way Stremio's app opens it
            if (player === 'iina') {
                if (!isPlayableUrl(streamUrl)) return { success: false, error: "This stream link can't be opened in an external player." };
                if (!findPlayerPath('iina')) return { success: false, error: 'IINA not found. Please install it.' };
                await shell.openExternal(`iina://weblink?url=${encodeURIComponent(streamUrl)}`);
                return { success: true, tracked: false };
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

            const options = cleanOptions(rawOptions);
            const win = BrowserWindow.fromWebContents(event.sender) ?? BrowserWindow.getAllWindows()[0];

            // kill previous player if still running
            if (activeChild) {
                activeChild.kill();
            }
            if (pollTimer) {
                clearTimeout(pollTimer);
                pollTimer = null;
            }

            const mpvSocket = newMpvSocket();
            const args = player === 'mpv'
                ? [
                    `--input-ipc-server=${mpvSocket}`,
                    ...(options.startSeconds ? [`--start=${options.startSeconds}`] : []),
                    ...(options.title ? [`--force-media-title=${options.title}`] : []),
                    streamUrl,
                ]
                : [
                    '--extraintf=http', `--http-host=${VLC_HTTP_HOST}`, `--http-password=${VLC_HTTP_PASSWORD}`, `--http-port=${VLC_HTTP_PORT}`,
                    // closes at the end like mpv, so the end of the video is the end of watching
                    '--play-and-exit',
                    ...(options.startSeconds ? [`--start-time=${options.startSeconds}`] : []),
                    ...(options.title ? [`--meta-title=${options.title}`] : []),
                    streamUrl,
                ];

            logger.info(`Launching ${player} at ${playerPath} with URL: ${streamUrl}`);

            // spawn, not execFile: execFile buffers the player's output and kills it past 1 MB
            const child = spawn(playerPath, args, { stdio: 'ignore' });
            child.on('error', (err) => logger.error(`Failed to launch ${player}: ${err.message}`));

            activeChild = child;
            trackedWindow = options.track && win ? win : null;
            if (trackedWindow) saveBeforeClose(trackedWindow);

            child.on('exit', () => {
                if (player === 'mpv' && process.platform !== 'win32') rmSync(mpvSocket, { force: true });
                // only handle exit if this is still the active child
                if (activeChild !== child) return;
                activeChild = null;
                trackedWindow = null;
                if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
                if (win && !win.isDestroyed()) win.webContents.send(IPC_CHANNELS.EXTERNAL_PLAYER_CLOSED);
            });

            if (win) startPolling(player as ExternalPlayer, child, win, mpvSocket);

            return { success: true, tracked: !!trackedWindow };
        });

        ipcMain.handle(IPC_CHANNELS.GET_EXTERNAL_PLAYER_PATHS, () => ({
            vlc: findPlayerPath('vlc'),
            mpv: findPlayerPath('mpv'),
            iina: findPlayerPath('iina'),
        }));
    }
};
