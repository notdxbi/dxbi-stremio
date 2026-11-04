import { app, BrowserWindow, dialog, ipcMain, net, powerSaveBlocker, shell } from "electron";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { AddressInfo } from "net";
import { randomBytes } from "crypto";
import { createReadStream, existsSync, promises as fsp, readFileSync, statSync, writeFileSync } from "fs";
import { basename, dirname, extname, join } from "path";
import { homedir } from "os";
import { IPC_CHANNELS } from "../constants";
import { getLogger } from "../utils/logger";

const logger = getLogger("Downloads");

/**
 * Films and episodes saved to watch offline, like Netflix's downloads. The page (dx.bi's plugin)
 * picks the stream; this downloads it into the chosen folder (resuming after a dropped connection
 * or a restart), saves its subtitles and artwork beside it, and serves the files back to Stremio's
 * player from 127.0.0.1 so they play with no internet at all.
 *
 * Debrid and direct links are plain HTTP files. A torrent is read in full through the local
 * streaming server (server.js), which fetches its pieces as they're asked for.
 */

type State = "queued" | "downloading" | "paused" | "done" | "failed";

interface Subtitle { lang: string; url?: string; file?: string }

interface Entry {
    id: string;
    type: string;
    metaId: string;
    videoId: string;
    name: string;
    /** "S1 E3 · The Title" for an episode, "" for a film */
    episode: string;
    season: number | null;
    number: number | null;
    year: string;
    poster: string;
    background: string;
    /** what was picked, for the list: "1080p · Blu-ray", the provider, the release's file name */
    quality: string;
    provider: string;
    filename: string;
    url: string;
    headers: Record<string, string>;
    torrent: { infoHash: string; fileIdx: number | null; sources: string[]; server: string } | null;
    /** where the player's progress and library entry go (Stremio's own player route) */
    link: { streamTransportUrl: string; metaTransportUrl: string };
    file: string;
    size: number;
    received: number;
    state: State;
    error: string;
    subtitles: Subtitle[];
    art: { poster?: string; background?: string };
    addedAt: number;
    doneAt: number;
    watchedAt: number;
}

interface Settings {
    folder: string;
    /** what an episode, season or film button downloads: "ask" each time, or a quality */
    quality: string;
    /** "off", "finished" (straight after), "day" (a day after) */
    autoDelete: string;
    parallel: number;
}

const VIDEO_TYPES: Record<string, string> = {
    ".mkv": "video/x-matroska", ".mp4": "video/mp4", ".m4v": "video/mp4", ".webm": "video/webm",
    ".avi": "video/x-msvideo", ".ts": "video/mp2t", ".mov": "video/quicktime",
};

function defaultFolder(): string {
    let videos = "";
    try { videos = app.getPath("videos"); } catch { /* not on every Linux desktop */ }
    return join(videos || join(homedir(), "Videos"), "dx.bi");
}

/** A name that's safe as a file or folder name on Windows, macOS and Linux */
function safeName(s: string): string {
    const clean = String(s || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
    return clean.slice(0, 120) || "Untitled";
}

function str(v: unknown, max = 2000): string {
    return typeof v === "string" ? v.slice(0, max) : "";
}

class DownloadsImpl {
    private entries: Entry[] = [];
    private settings: Settings = { folder: defaultFolder(), quality: "ask", autoDelete: "off", parallel: 2 };
    private running = new Map<string, AbortController>();
    private speeds = new Map<string, { bytes: number; at: number; rate: number }>();
    private indexPath = "";
    private settingsPath = "";
    private artDir = "";
    private server: Server | null = null;
    private port = 0;
    private token = randomBytes(12).toString("hex");
    private saveTimer: NodeJS.Timeout | null = null;
    private sendTimer: NodeJS.Timeout | null = null;
    private blocker = -1;

    setup(): void {
        const data = app.getPath("userData");
        this.indexPath = join(data, "downloads.json");
        this.settingsPath = join(data, "downloads-settings.json");
        this.artDir = join(data, "download-art");
        try { Object.assign(this.settings, JSON.parse(readFileSync(this.settingsPath, "utf8"))); } catch { /* first time */ }
        try {
            const saved = JSON.parse(readFileSync(this.indexPath, "utf8"));
            if (Array.isArray(saved)) this.entries = saved.filter((e) => e && typeof e.id === "string");
        } catch { /* nothing yet */ }
        // whatever was running when dx.bi closed carries on where its file got to
        for (const e of this.entries) {
            if (e.state === "downloading") e.state = "queued";
            if (e.state !== "done" && e.file && existsSync(e.file)) e.received = statSync(e.file).size;
            // a finished file someone deleted by hand is gone from the list too
            if (e.state === "done" && e.file && !existsSync(e.file)) {
                e.state = "failed";
                e.error = "The file is gone from the downloads folder.";
            }
        }
        this.startServer();
        this.initIPC();
        this.sweep();
        setInterval(() => this.sweep(), 30 * 60 * 1000);
        setTimeout(() => this.pump(), 4000);
    }

    // ---------------------------------------------------------------------------------------------
    // The page's side

    private initIPC(): void {
        ipcMain.handle(IPC_CHANNELS.DL_LIST, () => this.list());
        ipcMain.handle(IPC_CHANNELS.DL_ADD, (_e, spec: unknown) => this.add(spec));
        ipcMain.handle(IPC_CHANNELS.DL_ACTION, (_e, action: unknown, id: unknown) => this.action(str(action), str(id)));
        ipcMain.handle(IPC_CHANNELS.DL_SETTINGS, (_e, changes: unknown) => this.updateSettings(changes));
        ipcMain.handle(IPC_CHANNELS.DL_PICK_FOLDER, async (event) => {
            const win = BrowserWindow.fromWebContents(event.sender);
            const options: Electron.OpenDialogOptions = { title: "Choose where downloads go", defaultPath: this.settings.folder, properties: ["openDirectory", "createDirectory"] };
            const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
            if (result.canceled || !result.filePaths[0]) return this.publicSettings();
            return this.updateSettings({ folder: result.filePaths[0] });
        });
    }

    private async publicSettings() {
        return { ...this.settings, defaultFolder: defaultFolder(), free: await this.freeSpace(this.settings.folder) };
    }

    private async updateSettings(changes: unknown) {
        const c = (changes && typeof changes === "object" ? changes : {}) as Record<string, unknown>;
        if (typeof c.folder === "string" && c.folder.trim()) this.settings.folder = c.folder.trim();
        if (typeof c.quality === "string" && /^(ask|best|2160|1080|720|small)$/.test(c.quality)) this.settings.quality = c.quality;
        if (typeof c.autoDelete === "string" && /^(off|finished|day)$/.test(c.autoDelete)) this.settings.autoDelete = c.autoDelete;
        if (typeof c.parallel === "number" && c.parallel >= 1 && c.parallel <= 4) this.settings.parallel = Math.round(c.parallel);
        await fsp.writeFile(this.settingsPath, JSON.stringify(this.settings, null, 2)).catch(() => { /* read-only? kept in memory */ });
        this.sweep();
        this.pump();
        return this.publicSettings();
    }

    /** Free bytes where downloads go (the nearest folder that exists) */
    private async freeSpace(folder: string): Promise<number> {
        let dir = folder;
        while (dir && !existsSync(dir) && dirname(dir) !== dir) dir = dirname(dir);
        try {
            const s = await fsp.statfs(dir);
            return s.bavail * s.bsize;
        } catch {
            return -1;
        }
    }

    /** What the page shows: everything but the links themselves (a debrid link carries its key) */
    list() {
        const base = `http://127.0.0.1:${this.port}/${this.token}`;
        return this.entries.map((e) => ({
            id: e.id, type: e.type, metaId: e.metaId, videoId: e.videoId, name: e.name, episode: e.episode,
            season: e.season, number: e.number, year: e.year, quality: e.quality, provider: e.provider, filename: e.filename,
            torrent: !!e.torrent, size: e.size, received: e.received, state: e.state, error: e.error,
            speed: this.speeds.get(e.id)?.rate || 0,
            file: e.file, addedAt: e.addedAt, doneAt: e.doneAt, watchedAt: e.watchedAt,
            poster: e.art.poster ? `${base}/${encodeURIComponent(e.id)}/art/poster` : e.poster,
            background: e.art.background ? `${base}/${encodeURIComponent(e.id)}/art/background` : e.background,
            link: e.link,
            play: e.state === "done" ? {
                url: `${base}/${encodeURIComponent(e.id)}/video${extname(e.file) || ".mkv"}`,
                subtitles: e.subtitles.map((s, i) => s.file ? { lang: s.lang, url: `${base}/${encodeURIComponent(e.id)}/sub/${i}` } : null).filter(Boolean),
            } : null,
        }));
    }

    private add(spec: unknown) {
        const s = (spec && typeof spec === "object" ? spec : {}) as Record<string, any>;
        const metaId = str(s.metaId, 300);
        const videoId = str(s.videoId, 300) || metaId;
        const url = str(s.url, 4000);
        const t = s.torrent && typeof s.torrent === "object" ? s.torrent : null;
        if (!metaId || (!/^https?:\/\//.test(url) && !(t && /^[a-f0-9]{40}$/i.test(str(t.infoHash))))) {
            return { ok: false, error: "That stream can't be downloaded." };
        }
        const id = `${metaId}:${videoId}`.replace(/[^\w:.-]/g, "_");
        const old = this.entries.find((e) => e.id === id);
        if (old && old.state !== "failed") return { ok: false, id, error: old.state === "done" ? "Already downloaded." : "Already downloading." };
        if (old) this.remove(id, false);
        const headers: Record<string, string> = {};
        if (s.headers && typeof s.headers === "object") for (const [k, v] of Object.entries(s.headers)) if (typeof v === "string") headers[k] = v;
        const entry: Entry = {
            id, type: str(s.type, 40) || "movie", metaId, videoId,
            name: str(s.name, 300) || "Untitled", episode: str(s.episode, 300),
            season: Number.isFinite(s.season) ? s.season : null, number: Number.isFinite(s.number) ? s.number : null,
            year: str(s.year, 20), poster: str(s.poster), background: str(s.background),
            quality: str(s.quality, 200), provider: str(s.provider, 200), filename: str(s.filename, 400),
            url, headers,
            torrent: t ? {
                infoHash: str(t.infoHash).toLowerCase(),
                fileIdx: Number.isInteger(t.fileIdx) && t.fileIdx >= 0 ? t.fileIdx : null,
                sources: Array.isArray(t.sources) ? t.sources.filter((x: unknown) => typeof x === "string").slice(0, 60) : [],
                server: (str(t.server) || "http://127.0.0.1:11470").replace(/\/+$/, ""),
            } : null,
            link: { streamTransportUrl: str(s.link?.streamTransportUrl), metaTransportUrl: str(s.link?.metaTransportUrl) },
            file: "", size: Number(s.size) > 0 ? Number(s.size) : 0, received: 0, state: "queued", error: "",
            subtitles: (Array.isArray(s.subtitles) ? s.subtitles : []).filter((x: any) => x && /^https?:\/\//.test(str(x.url))).slice(0, 4).map((x: any) => ({ lang: str(x.lang, 20) || "und", url: str(x.url) })),
            art: {}, addedAt: Date.now(), doneAt: 0, watchedAt: 0,
        };
        this.entries.push(entry);
        this.changed();
        this.pump();
        this.saveArt(entry).catch(() => { /* art is a nicety */ });
        return { ok: true, id };
    }

    private action(action: string, id: string) {
        const e = this.entries.find((x) => x.id === id);
        if (action === "openFolder") {
            if (e && e.file && existsSync(e.file)) shell.showItemInFolder(e.file);
            else fsp.mkdir(this.settings.folder, { recursive: true }).then(() => shell.openPath(this.settings.folder)).catch(() => { /* nothing to open */ });
            return true;
        }
        if (action === "removeWatched") {
            for (const x of [...this.entries]) if (x.watchedAt && x.state === "done") this.remove(x.id);
            return true;
        }
        if (!e) return false;
        switch (action) {
            case "pause":
                if (e.state === "queued" || e.state === "downloading") {
                    e.state = "paused";
                    this.running.get(id)?.abort();
                }
                break;
            case "resume":
            case "retry":
                if (e.state === "paused" || e.state === "failed") {
                    e.state = "queued";
                    e.error = "";
                }
                break;
            case "remove":
                this.remove(id);
                return true;
            // the player got to the end of it (the page says so)
            case "finished":
                if (!e.watchedAt) e.watchedAt = Date.now();
                this.sweep();
                break;
            case "unwatched":
                e.watchedAt = 0;
                break;
            default:
                return false;
        }
        this.changed();
        this.pump();
        return true;
    }

    private remove(id: string, announce = true): void {
        const e = this.entries.find((x) => x.id === id);
        if (!e) return;
        this.running.get(id)?.abort();
        this.entries = this.entries.filter((x) => x !== e);
        const files = [e.file, ...e.subtitles.map((s) => s.file || ""), e.art.poster || "", e.art.background || ""].filter(Boolean);
        (async () => {
            // (a running download lets go of its file first)
            await new Promise((r) => setTimeout(r, 300));
            for (const f of files) await fsp.rm(f, { force: true }).catch(() => { /* already gone */ });
            // the title's own folder goes with its last file (never the downloads folder itself)
            if (e.file && dirname(e.file) !== this.settings.folder) await fsp.rmdir(dirname(e.file)).catch(() => { /* not empty */ });
        })();
        if (announce) this.changed();
    }

    /** Deletes watched downloads the way the settings say */
    private sweep(): void {
        const mode = this.settings.autoDelete;
        if (mode === "off") return;
        const wait = mode === "day" ? 24 * 3600 * 1000 : 0;
        for (const e of [...this.entries]) if (e.state === "done" && e.watchedAt && Date.now() - e.watchedAt >= wait) {
            logger.info(`Deleting watched download ${e.id}`);
            this.remove(e.id);
        }
    }

    // ---------------------------------------------------------------------------------------------
    // Downloading

    private pump(): void {
        const busy = this.entries.filter((e) => e.state === "downloading").length;
        let free = Math.max(0, this.settings.parallel - busy);
        for (const e of this.entries) {
            if (free <= 0) break;
            if (e.state !== "queued" || this.running.has(e.id)) continue;
            free--;
            this.run(e);
        }
        const active = this.entries.some((e) => e.state === "downloading" || e.state === "queued");
        // a download keeps the computer from sleeping, the way a film playing does
        if (active && this.blocker < 0) this.blocker = powerSaveBlocker.start("prevent-app-suspension");
        if (!active && this.blocker >= 0) {
            powerSaveBlocker.stop(this.blocker);
            this.blocker = -1;
        }
    }

    private async run(e: Entry): Promise<void> {
        const control = new AbortController();
        this.running.set(e.id, control);
        e.state = "downloading";
        e.error = "";
        this.changed();
        let tries = 0;
        try {
            while (!control.signal.aborted) {
                try {
                    await this.fetchOnce(e, control);
                    break;
                } catch (err: any) {
                    if (control.signal.aborted) break;
                    if (err && err.fatal) throw err;
                    // a dropped connection or a busy server: try again, waiting a little longer each time
                    tries++;
                    if (tries > 6) throw err;
                    logger.warn(`${e.id}: ${err?.message || err}; trying again (${tries})`);
                    e.error = "Connection dropped, trying again…";
                    this.changed();
                    await new Promise((r) => setTimeout(r, Math.min(30000, 2000 * 2 ** (tries - 1))));
                }
            }
            if (!control.signal.aborted) {
                await this.saveSubtitles(e);
                e.state = "done";
                e.error = "";
                e.doneAt = Date.now();
                logger.info(`Downloaded ${e.id} (${e.received} bytes)`);
            }
        } catch (err: any) {
            if (!control.signal.aborted) {
                e.state = "failed";
                e.error = err?.message || String(err);
                logger.warn(`${e.id} failed: ${e.error}`);
            }
        } finally {
            this.running.delete(e.id);
            this.speeds.delete(e.id);
            if (e.state === "downloading") e.state = "paused";
            this.changed();
            this.pump();
        }
    }

    /** One go at the file, from where it got to. Throws to retry, or an error marked fatal to stop. */
    private async fetchOnce(e: Entry, control: AbortController): Promise<void> {
        const fatal = (message: string) => Object.assign(new Error(message), { fatal: true });
        let url = e.url;
        if (e.torrent) url = await this.torrentUrl(e, control.signal);
        if (e.file && existsSync(e.file)) e.received = (await fsp.stat(e.file)).size;
        else e.received = 0;
        const headers: Record<string, string> = { ...e.headers };
        if (e.received > 0) headers.Range = `bytes=${e.received}-`;

        // no data for a minute: start the request again
        let stall: NodeJS.Timeout | null = null;
        const local = new AbortController();
        const kick = () => {
            if (stall) clearTimeout(stall);
            stall = setTimeout(() => local.abort(), e.torrent ? 180000 : 60000);
        };
        const onAbort = () => local.abort();
        control.signal.addEventListener("abort", onAbort);
        kick();
        try {
            const res = await net.fetch(url, { headers, signal: local.signal, redirect: "follow", bypassCustomProtocolHandlers: true } as RequestInit);
            if (res.status === 416 && e.received > 0 && e.size > 0 && e.received >= e.size) return; // already whole
            if (!res.ok) {
                const message = res.status === 401 || res.status === 403 || res.status === 404 || res.status === 410
                    ? "The link stopped working (it may have expired). Download it again, or pick another stream."
                    : `The server answered ${res.status}.`;
                if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) throw fatal(message);
                throw new Error(message);
            }
            // Torrentio's "being downloaded to your debrid" and "limit reached" clips aren't the film
            if (/\/videos\/[a-z_]+_v\d+\.mp4(\?|$)/i.test(res.url) || /torrentio\.strem\.fun\/videos\//.test(res.url)) {
                throw fatal("Your debrid service doesn't have this one ready yet (it's fetching it). Try again in a few minutes, or pick a stream marked Ready.");
            }
            const length = Number(res.headers.get("content-length")) || 0;
            const partial = res.status === 206;
            if (e.received > 0 && !partial) e.received = 0; // the server can't resume: start over
            const total = partial ? (Number((/\/(\d+)\s*$/.exec(res.headers.get("content-range") || "") || [])[1]) || e.received + length) : length;
            if (total > 0) e.size = total;
            if (e.size > 0 && e.size < 20e6 && !e.torrent) throw fatal("That link gave a short clip instead of the video: usually your debrid service doesn't have it ready yet (it's fetching it now). Try again in a few minutes, or pick another stream.");
            if (!e.file) e.file = await this.pathFor(e, res.headers.get("content-type") || "");
            await fsp.mkdir(dirname(e.file), { recursive: true });
            const needed = (e.size || 0) - e.received;
            const free = await this.freeSpace(dirname(e.file));
            if (needed > 0 && free >= 0 && free < needed + 200e6) throw fatal(`Not enough space: it needs ${(needed / 1e9).toFixed(1)} GB and ${(free / 1e9).toFixed(1)} GB is free. Free some up or choose another folder in Downloads → Settings.`);

            const out = await fsp.open(e.file, e.received > 0 ? "a" : "w");
            try {
                if (!res.body) throw new Error("No data came back.");
                const reader = res.body.getReader();
                for (;;) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    kick();
                    await out.write(value);
                    e.received += value.byteLength;
                    this.measure(e);
                    this.changed();
                }
            } finally {
                await out.close();
            }
            if (e.size > 0 && e.received < e.size) throw new Error("The connection closed early.");
            if (e.size <= 0) e.size = e.received;
        } catch (err: any) {
            if (local.signal.aborted && !control.signal.aborted) throw new Error("The download stalled.");
            throw err;
        } finally {
            if (stall) clearTimeout(stall);
            control.signal.removeEventListener("abort", onAbort);
        }
    }

    /** A torrent's file from the streaming server, which joins the swarm first */
    private async torrentUrl(e: Entry, signal: AbortSignal): Promise<string> {
        const t = e.torrent!;
        const sources = t.sources.length ? t.sources : [`dht:${t.infoHash}`];
        let info: any = null;
        try {
            const res = await net.fetch(`${t.server}/${t.infoHash}/create`, {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ torrent: { infoHash: t.infoHash }, peerSearch: { sources, min: 40, max: 200 }, guessFileIdx: {} }),
                signal,
            });
            info = res.ok ? await res.json().catch(() => null) : null;
        } catch (err: any) {
            if (signal.aborted) throw err;
            throw Object.assign(new Error("dx.bi's streaming server isn't running, so torrents can't download. Restart dx.bi, or pick a debrid stream."), { fatal: false });
        }
        if (t.fileIdx === null && info && Array.isArray(info.files) && info.files.length) {
            // (no file named: the largest video in it)
            let best = 0;
            info.files.forEach((f: any, i: number) => { if ((f.length || 0) > (info.files[best].length || 0)) best = i; });
            t.fileIdx = best;
            if (!e.filename && info.files[best].name) e.filename = String(info.files[best].name);
        }
        return `${t.server}/${t.infoHash}/${t.fileIdx ?? 0}`;
    }

    private measure(e: Entry): void {
        const now = Date.now();
        const s = this.speeds.get(e.id);
        if (!s) { this.speeds.set(e.id, { bytes: e.received, at: now, rate: 0 }); return; }
        if (now - s.at < 1000) return;
        const rate = ((e.received - s.bytes) * 1000) / (now - s.at);
        this.speeds.set(e.id, { bytes: e.received, at: now, rate: s.rate ? s.rate * 0.6 + rate * 0.4 : rate });
    }

    /** <folder>/<Title (year)>/<S01E03 - Episode>.mkv, or <folder>/<Title (year)>/<Title (year)>.mkv */
    private async pathFor(e: Entry, contentType: string): Promise<string> {
        let ext = extname(e.filename || "").toLowerCase();
        if (!VIDEO_TYPES[ext]) ext = /mp4/.test(contentType) ? ".mp4" : /webm/.test(contentType) ? ".webm" : ".mkv";
        const show = safeName(e.year && !e.name.includes(e.year) ? `${e.name} (${e.year})` : e.name);
        let base = show;
        if (e.season !== null && e.number !== null) {
            const title = e.episode.replace(/^S\d+ E\d+\s*·?\s*/, "");
            base = safeName(`S${String(e.season).padStart(2, "0")}E${String(e.number).padStart(2, "0")}${title ? ` - ${title}` : ""}`);
        } else if (e.episode) base = safeName(e.episode);
        const dir = join(this.settings.folder, show);
        let file = join(dir, base + ext);
        for (let n = 2; existsSync(file) && this.entries.every((x) => x.file !== file); n++) file = join(dir, `${base} (${n})${ext}`);
        return file;
    }

    /** Subtitles beside the video, the way players find them: Film.en.srt */
    private async saveSubtitles(e: Entry): Promise<void> {
        const stem = e.file.slice(0, e.file.length - extname(e.file).length);
        const used = new Set<string>();
        for (const s of e.subtitles) {
            if (s.file && existsSync(s.file)) continue;
            if (!s.url) continue;
            try {
                const res = await net.fetch(s.url, { signal: AbortSignal.timeout(20000) });
                if (!res.ok) continue;
                const text = await res.text();
                if (!text.trim()) continue;
                const ext = /^﻿?WEBVTT/.test(text) ? ".vtt" : /^\s*\[Script Info\]/i.test(text) ? ".ass" : ".srt";
                let name = `${stem}.${safeName(s.lang).toLowerCase()}`;
                for (let n = 2; used.has(name); n++) name = `${stem}.${safeName(s.lang).toLowerCase()}.${n}`;
                used.add(name);
                await fsp.writeFile(name + ext, text);
                s.file = name + ext;
            } catch { /* a subtitle that won't load isn't worth failing the video for */ }
        }
    }

    private async saveArt(e: Entry): Promise<void> {
        await fsp.mkdir(this.artDir, { recursive: true });
        for (const kind of ["poster", "background"] as const) {
            const url = e[kind];
            if (!/^https?:\/\//.test(url)) continue;
            try {
                const res = await net.fetch(url, { signal: AbortSignal.timeout(20000) });
                if (!res.ok) continue;
                const file = join(this.artDir, `${e.id.replace(/[^\w.-]/g, "_")}-${kind}.jpg`);
                await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
                if (this.entries.includes(e)) e.art[kind] = file;
                else await fsp.rm(file, { force: true });
            } catch { /* offline: the link stays */ }
        }
        this.changed();
    }

    // ---------------------------------------------------------------------------------------------
    // Telling the page, and remembering

    private changed(): void {
        if (!this.saveTimer) this.saveTimer = setTimeout(() => {
            this.saveTimer = null;
            fsp.writeFile(this.indexPath, JSON.stringify(this.entries)).catch((err) => logger.warn(`Couldn't save the downloads list: ${err}`));
        }, 1500);
        if (!this.sendTimer) this.sendTimer = setTimeout(() => {
            this.sendTimer = null;
            const list = this.list();
            for (const w of BrowserWindow.getAllWindows()) if (!w.isDestroyed()) w.webContents.send(IPC_CHANNELS.DL_CHANGED, list);
        }, 700);
    }

    flush(): void {
        try { writeFileSync(this.indexPath, JSON.stringify(this.entries)); } catch { /* closing anyway */ }
    }

    // ---------------------------------------------------------------------------------------------
    // Serving the files to the player (127.0.0.1 only, behind a random path)

    private startServer(): void {
        this.server = createServer((req, res) => this.serve(req, res).catch(() => { try { res.writeHead(500).end(); } catch { /* gone */ } }));
        this.server.listen(0, "127.0.0.1", () => {
            this.port = (this.server!.address() as AddressInfo).port;
            logger.info(`Serving downloads on 127.0.0.1:${this.port}`);
        });
    }

    private async serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
        res.setHeader("Access-Control-Allow-Origin", "*");
        if (req.method === "OPTIONS") { res.writeHead(204, { "Access-Control-Allow-Headers": "range", "Access-Control-Allow-Methods": "GET, HEAD" }).end(); return; }
        const parts = (req.url || "").split("?")[0].split("/").map((p) => { try { return decodeURIComponent(p); } catch { return ""; } });
        // ["", token, id, kind, extra]
        if (parts[1] !== this.token) { res.writeHead(404).end(); return; }
        const e = this.entries.find((x) => x.id === parts[2]);
        if (!e) { res.writeHead(404).end(); return; }
        let file = "";
        let type = "application/octet-stream";
        if (/^video/.test(parts[3] || "") && e.state === "done") {
            file = e.file;
            type = VIDEO_TYPES[extname(e.file).toLowerCase()] || "video/x-matroska";
        } else if (parts[3] === "sub") {
            file = e.subtitles[Number(parts[4])]?.file || "";
            type = file.endsWith(".vtt") ? "text/vtt; charset=utf-8" : "text/plain; charset=utf-8";
        } else if (parts[3] === "art") {
            file = (parts[4] === "poster" ? e.art.poster : e.art.background) || "";
            type = "image/jpeg";
        }
        if (!file || !existsSync(file)) { res.writeHead(404).end(); return; }
        const size = (await fsp.stat(file)).size;
        const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
        const headers: Record<string, string | number> = { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Disposition": `inline; filename="${encodeURIComponent(basename(file))}"` };
        if (range && (range[1] || range[2])) {
            let start = range[1] ? Number(range[1]) : size - Number(range[2]);
            let end = range[1] && range[2] ? Number(range[2]) : size - 1;
            start = Math.max(0, start);
            end = Math.min(size - 1, end);
            if (start > end || start >= size) { res.writeHead(416, { "Content-Range": `bytes */${size}` }).end(); return; }
            res.writeHead(206, { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": end - start + 1 });
            if (req.method === "HEAD") { res.end(); return; }
            createReadStream(file, { start, end }).pipe(res);
        } else {
            res.writeHead(200, { ...headers, "Content-Length": size });
            if (req.method === "HEAD") { res.end(); return; }
            createReadStream(file).pipe(res);
        }
    }
}

const Downloads = new DownloadsImpl();
export default Downloads;
