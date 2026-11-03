import Helpers from '../../utils/Helpers';
import { getLogger } from '../../utils/logger';
import { type ExternalPlayerOptions, type ExternalPlayerStatus } from '../../interfaces/ExternalPlayerTypes';
import { externalPlayerProgress } from './externalPlayerProgress';

const logger = getLogger("ExternalPlayerTracker");

// Stremio's core keeps progress (Continue Watching, the resume point, watched at 70%, syncing) for
// whatever its Player model has loaded, from the times the player reports. An external player never
// reported any. So while one is open, the Player model is loaded again in the background with the
// same stream, and mpv's or VLC's position is reported to it the way Stremio's own player does.

// What the page found about the stream being opened
interface Found {
    videoId: string;
    name: string;
    poster: string | null;
    episode: string | null;
    startSeconds: number;
}

interface Session extends Found {
    last: (ExternalPlayerStatus & { at: number }) | null;
    // seconds played this time (skips don't count), the way the core counts toward watched
    played: number;
    watched: boolean;
    ticks: number;
}

let session: Session | null = null;

// Runs in the page, where Stremio's core is: finds the stream in the player (Play, Continue Watching)
// or in the title's stream list (a stream picked there), and keeps what's needed to load it again.
// No backslashes or backticks: Helpers._eval passes this through a template string.
const FIND_STREAM = (encodedUrl: string) => `(async () => {
    const want = decodeURIComponent("${encodedUrl}");
    const ready = (l) => (l && l.type === "Ready" ? l.content : null);
    const matches = (s) => !!s && (s.url === want || (!!s.infoHash && want.toLowerCase().includes(String(s.infoHash).toLowerCase())));
    let selected = null, meta = null, libraryItem = null, season = null, episode = null;

    const player = await core.getState("player");
    const playing = player && player.stream && player.stream.content && player.stream.content.url;
    if (player && player.selected && player.selected.streamRequest && (playing === want || matches(player.selected.stream))) {
        selected = player.selected;
        meta = player.metaItem && player.metaItem.content;
        libraryItem = player.libraryItem;
        if (player.seriesInfo) { season = player.seriesInfo.season; episode = player.seriesInfo.episode; }
    } else {
        const md = await core.getState("meta_details");
        const group = md && (md.streams || []).find((g) => (ready(g.content) || []).some(matches));
        const metaItem = md && (md.metaItems || []).find((m) => ready(m.content));
        if (group && metaItem) {
            selected = { stream: ready(group.content).find(matches), streamRequest: group.request, metaRequest: metaItem.request, subtitlesPath: null };
            meta = ready(metaItem.content);
            libraryItem = md.libraryItem;
        }
    }
    if (!selected || !meta) return null;

    const videoId = selected.streamRequest.path.id;
    const video = (meta.videos || []).find((v) => v.id === videoId);
    if (season == null && video && video.season != null) { season = video.season; episode = video.episode; }
    // Stremio's web build names it video_id
    const state = libraryItem && libraryItem.state;
    const lastVideo = state && (state.video_id || state.videoId);
    let start = state && lastVideo === videoId && state.timeOffset > 0 ? state.timeOffset / 1000 : 0;
    if (start && state.duration > 0 && state.timeOffset > state.duration * 0.95) start = 0;

    window.__dxbiExternal = { selected: selected, videoId: videoId, active: false };
    return {
        videoId: videoId,
        name: meta.name || "",
        poster: meta.poster || null,
        episode: season != null && episode != null ? "S" + season + " E" + episode : null,
        startSeconds: start,
    };
})()`;

// Loads the stream into the Player model again once Stremio's player page has let it go
const LOAD_PLAYER = `(async () => {
    const ext = window.__dxbiExternal;
    if (!ext) return false;
    for (let i = 0; i < 25; i++) {
        const p = await core.getState("player");
        if (!p || !p.selected) break;
        await new Promise((r) => setTimeout(r, 200));
    }
    if (window.__dxbiExternal !== ext) return false;
    core.dispatch({ action: "Load", args: { model: "Player", args: ext.selected } }, "player");
    ext.active = true;
    return true;
})()`;

const REPORT = (action: string, timeMs: number, durationMs: number) => `(() => {
    const ext = window.__dxbiExternal;
    if (!ext || !ext.active) return false;
    core.dispatch({ action: "Player", args: { action: "${action}", args: { time: ${timeMs}, duration: ${durationMs}, device: "dxbi" } } }, "player");
    return true;
})()`;

const PAUSED = (paused: boolean) => `(() => {
    const ext = window.__dxbiExternal;
    if (ext && ext.active) core.dispatch({ action: "Player", args: { action: "PausedChanged", args: { paused: ${paused} } } }, "player");
})()`;

// Whether Stremio's Player model still has this stream
const STILL_OURS = `(async () => {
    const ext = window.__dxbiExternal;
    if (!ext || !ext.active) return null;
    const p = await core.getState("player");
    return !!(p && p.selected && p.selected.streamRequest && p.selected.streamRequest.path.id === ext.videoId);
})()`;

// Stremio marks a video watched past this much of it watched (WATCHED_THRESHOLD_COEF in stremio-core)
const WATCHED_AT = 0.7;

// Unloading saves the library item and syncs it to the Stremio account
const UNLOAD = `(() => {
    const ext = window.__dxbiExternal;
    delete window.__dxbiExternal;
    if (ext && ext.active) core.dispatch({ action: "Unload" }, "player");
    return !!(ext && ext.active);
})()`;

const ms = (seconds: number) => Math.max(0, Math.round(seconds * 1000));

export const externalPlayerTracker = {
    // Before launching: what to open the player with (resume point, window title), if the stream is found
    async prepare(streamUrl: string): Promise<{ found: Found | null; options: ExternalPlayerOptions }> {
        externalPlayerTracker.finish(false);
        let found: Found | null = null;
        try {
            const result = await Helpers._eval(FIND_STREAM(encodeURIComponent(streamUrl))) as Found | { error: string } | null;
            if (result && !('error' in result)) found = result;
            else if (result) logger.warn(`Couldn't find the stream in Stremio: ${result.error}`);
        } catch (err) {
            logger.warn(`Couldn't find the stream in Stremio: ${err}`);
        }
        if (!found) return { found: null, options: {} };
        const title = found.episode ? `${found.name}: ${found.episode}` : found.name;
        return { found, options: { startSeconds: found.startSeconds || undefined, title: title || undefined, track: true } };
    },

    // The player opened: keep its progress
    async start(found: Found): Promise<void> {
        session = { ...found, last: null, played: 0, watched: false, ticks: 0 };
        const mine = session;
        externalPlayerProgress.show(found);
        const loaded = await Helpers._eval(LOAD_PLAYER).catch(() => false);
        if (session !== mine) return;
        if (loaded !== true) {
            logger.warn("Couldn't load the stream into Stremio's player model: progress won't be kept.");
            session = null;
            externalPlayerProgress.hide();
            return;
        }
        logger.info(`Keeping progress for ${found.name}${found.episode ? ` ${found.episode}` : ''}`);
    },

    // The player's position, every second
    onStatus(status: ExternalPlayerStatus): void {
        const s = session;
        if (!s) return;
        const now = Date.now();
        const prev = s.last;
        s.last = { ...status, at: now };
        s.ticks++;
        const time = ms(status.position), duration = ms(status.duration);

        if (!prev) {
            // The first report sets the video and the place it starts from
            Helpers._eval(REPORT('TimeChanged', time, duration));
            Helpers._eval(REPORT('Seek', time, duration));
            Helpers._eval(PAUSED(status.state === 'paused'));
        } else {
            // A jump further than playing (even at 2×) could explain is a seek: it moves the place
            // without counting as watched time
            const elapsed = (now - prev.at) / 1000;
            const expected = prev.position + (prev.state === 'playing' ? elapsed : 0);
            const jumped = Math.abs(status.position - expected) > Math.max(3, elapsed * 1.5);
            Helpers._eval(REPORT(jumped ? 'Seek' : 'TimeChanged', time, duration));
            if (status.state !== prev.state) Helpers._eval(PAUSED(status.state === 'paused'));
            if (!jumped) s.played += Math.max(0, status.position - prev.position);
        }
        // Stremio's web build doesn't share its watched mark, so the pop-up follows the same rule
        if (!s.watched && status.duration > 0 && s.played > status.duration * WATCHED_AT) s.watched = true;

        if (s.ticks % 5 === 1) {
            Helpers._eval(STILL_OURS).then((ours) => {
                if (session !== s || ours !== false) return;
                // Stremio's player took over (another stream started): stop reporting to it
                logger.info("Stremio's player has another stream now: stopped keeping progress.");
                session = null;
                externalPlayerProgress.hide();
            }).catch(() => { /* next time */ });
        }
        externalPlayerProgress.update(s.last, s.watched);
    },

    // Another title's player is opening: save this one first, before Stremio loads the new one
    onNavigate(): void {
        if (session && location.hash.startsWith('#/player')) externalPlayerTracker.finish(false);
    },

    // The player closed (or dx.bi is closing): save the place
    finish(announce = true): void {
        const s = session;
        session = null;
        if (s?.last) {
            Helpers._eval(REPORT('TimeChanged', ms(s.last.position), ms(s.last.duration)));
            Helpers._eval(PAUSED(true));
        }
        Helpers._eval(UNLOAD).then((saved) => {
            if (saved && s) logger.info(`Saved progress for ${s.name} at ${Math.round(s.last?.position ?? 0)}s`);
        }).catch(() => { /* nothing loaded */ });
        externalPlayerProgress.hide();
        if (announce && s?.last) externalPlayerProgress.saved(s, s.last.position, s.watched);
    },
};
