import { Client as DiscordClient } from '@xhayper/discord-rpc';
import { getLogger } from '../utils/logger';
import { ActivityType } from 'discord-api-types/v10';
import type { SetActivity } from '@xhayper/discord-rpc/dist/structures/ClientUser';
import { DISCORD } from '../constants';

class DiscordPresence {
    private static logger = getLogger("DiscordPresence");
    private static rpc: DiscordClient | null = null;
    private static enabled = false;

    private static ready = false;

    // Only ever one connection to Discord and one pending retry: each live connection shows as its
    // own activity, so a stale one (left by a retry, or by switching off and on quickly) appeared as
    // a second, identical dx.bi in Discord
    private static retryTimer: ReturnType<typeof setTimeout> | null = null;
    private static generation = 0;

    public static start(): void {
        if (this.enabled) return;
        this.enabled = true;
        this.ready = false;
        this.connect();
    }

    private static connect(): void {
        if (!this.enabled) return;
        this.clearRetry();
        this.dropClient();
        const generation = ++this.generation;
        const current = () => this.enabled && generation === this.generation;

        try {
            const rpc = new DiscordClient({ clientId: DISCORD.CLIENT_ID });
            this.rpc = rpc;

            rpc.on('ready', () => {
                if (!current()) return;
                this.ready = true;
                this.logger.info('Connected to DiscordRPC.');

                // show what's on screen now (not a fake hashchange: that also re-ran the page's
                // own navigation handlers)
                window.dispatchEvent(new Event('dxbi-discord-ready'));
            });

            rpc.on('disconnected', () => {
                if (!current()) return;
                this.ready = false;
                this.logger.warn(`DiscordRPC Disconnected! Attempting to reconnect...`);
                this.handleReconnect();
            });

            rpc.login().catch(() => {
                if (!current()) return;
                this.logger.error("Failed to connect to DiscordRPC.");
                this.handleReconnect();
            });
        } catch (error) {
            this.logger.error(`An unexpected error occurred: ${(error as Error).message}`);
            this.handleReconnect();
        }
    }

    private static handleReconnect(): void {
        if (!this.enabled || this.retryTimer) return;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, DISCORD.RECONNECT_INTERVAL);
    }

    private static clearRetry(): void {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private static dropClient(): void {
        const rpc = this.rpc;
        this.rpc = null;
        // a new connection starts with no activity: send the next one whatever it is
        this.lastSent = null;
        this.lastSentAt = 0;
        this.pending = null;
        if (this.pendingTimer) { clearTimeout(this.pendingTimer); this.pendingTimer = null; }
        if (!rpc) return;
        try { rpc.user?.clearActivity()?.catch?.(() => {}); } catch { /* not connected */ }
        rpc.destroy().catch(() => {});
    }

    public static stop(): void {
        if (!this.enabled) return;
        this.enabled = false;
        this.ready = false;
        this.generation++;
        this.clearRetry();
        if (this.rpc) this.logger.info('Clearing DiscordRPC.');
        this.dropClient();
    }

    public static setPlaying(
        details: string,
        state: string,
        startTimestamp: number,
        endTimestamp: number | undefined,
        imageKey: string | undefined
    ): void {
        this._updateActivity({
            details,
            state,
            startTimestamp,
            endTimestamp,
            largeImageKey: imageKey || DISCORD.DEFAULT_IMAGE,
            largeImageText: "dx.bi",
            smallImageKey: DISCORD.PLAY_IMAGE,
            smallImageText: "Playing",
            instance: false,
            type: ActivityType.Watching
        });
    }

    public static setPaused(details: string, state: string, imageKey: string | undefined): void {
        this._updateActivity({
            details,
            state,
            largeImageKey: imageKey || DISCORD.DEFAULT_IMAGE,
            largeImageText: "dx.bi",
            smallImageKey: DISCORD.PAUSE_IMAGE,
            smallImageText: "Paused",
            instance: false,
            type: ActivityType.Watching
        });
    }

    public static setExploring(details: string, imageKey: string | undefined): void {
        this._updateActivity({
            details,
            state: 'Exploring',
            largeImageKey: imageKey || DISCORD.DEFAULT_IMAGE,
            largeImageText: "dx.bi",
            smallImageKey: DISCORD.BROWSE_IMAGE,
            smallImageText: "Browsing",
            instance: false,
            type: ActivityType.Playing
        });
    }

    public static setMainMenu(menuName: string): void {
        this._updateActivity({
            details: menuName,
            largeImageKey: DISCORD.DEFAULT_IMAGE,
            largeImageText: "dx.bi",
            smallImageKey: DISCORD.BROWSE_IMAGE,
            smallImageText: "Browsing",
            instance: false,
            type: ActivityType.Playing
        });
    }

    // Discord takes about one activity update every 4 s (5 per 20 s) and queues or drops the rest.
    // External players report their position every second, so updates are held back: one that only
    // moves the playing timestamps by a few seconds is skipped, and anything else sent too soon waits
    // and goes out as the latest one.
    private static readonly MIN_GAP_MS = 4000;
    private static lastSent: SetActivity | null = null;
    private static lastSentAt = 0;
    private static pending: SetActivity | null = null;
    private static pendingTimer: ReturnType<typeof setTimeout> | null = null;

    private static sameAsLast(next: SetActivity): boolean {
        const last = this.lastSent;
        if (!last) return false;
        const { startTimestamp: s1, endTimestamp: e1, ...a } = last;
        const { startTimestamp: s2, endTimestamp: e2, ...b } = next;
        const near = (x: unknown, y: unknown) => (x == null && y == null) || (typeof x === 'number' && typeof y === 'number' && Math.abs(x - y) <= 3);
        return JSON.stringify(a) === JSON.stringify(b) && near(s1, s2) && near(e1, e2);
    }

    private static _updateActivity(newActivity: SetActivity): void {
        if (!this.rpc || !this.enabled) return;
        if (!this.ready) return;
        if (this.sameAsLast(newActivity)) {
            // (a newer, different one waiting is outdated by this)
            this.pending = null;
            return;
        }
        const wait = this.lastSentAt + this.MIN_GAP_MS - Date.now();
        if (wait > 0) {
            this.pending = newActivity;
            if (!this.pendingTimer) {
                this.pendingTimer = setTimeout(() => {
                    this.pendingTimer = null;
                    const next = this.pending;
                    this.pending = null;
                    if (next) this._updateActivity(next);
                }, wait);
            }
            return;
        }
        this.lastSent = newActivity;
        this.lastSentAt = Date.now();
        this._sendActivity(newActivity);
    }

    private static _sendActivity(newActivity: SetActivity): void {
        if (!this.rpc) return;
        // every status carries a link to dx.bi for whoever sees it
        this.rpc.user?.setActivity({ ...newActivity, buttons: DISCORD.BUTTONS.map((b) => ({ ...b })) }).catch((error) => {
            this.logger.error(`Failed to set Discord activity: ${(error as Error).message}`);
        });
    }
}

export default DiscordPresence;
