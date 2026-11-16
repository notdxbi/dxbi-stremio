import Helpers from "../../utils/Helpers";
import PlaybackState from "../../utils/PlaybackState";
import DiscordPresence from "../../core/DiscordPresence";
import { nativePlayback, nativePlayerActive } from "../mpvShell";

// What's playing: mpv's state when dx.bi plays through mpv, otherwise the page's <video>
function currentVideo(): HTMLVideoElement | null {
    if (nativePlayerActive) {
        return nativePlayback as unknown as HTMLVideoElement;
    }
    return document.querySelector("video");
}

export let lastPlayerState: any = null;

export const discordTracker = {
    _externalPlayerActive: false,
    lastPlayerState: null as any,

    init: () => {
        // switching presence off and on calls this again: one listener, not one per switch
        window.removeEventListener('hashchange', discordTracker.handleNavigation);
        window.addEventListener('hashchange', discordTracker.handleNavigation);
        window.removeEventListener('dxbi-discord-ready', discordTracker.handleNavigation);
        window.addEventListener('dxbi-discord-ready', discordTracker.handleNavigation);
        window.removeEventListener('dxbi-anime-presence', discordTracker.onAnime);
        window.addEventListener('dxbi-anime-presence', discordTracker.onAnime);
        discordTracker.handleNavigation();
    },

    stop: () => {
        window.removeEventListener('dxbi-anime-presence', discordTracker.onAnime);
        discordTracker._animeActive = false;
        window.removeEventListener('hashchange', discordTracker.handleNavigation);
        window.removeEventListener('dxbi-discord-ready', discordTracker.handleNavigation);
    },

    // the plugin's anime player (it isn't Stremio's player): it says what's on, the page doesn't
    _animeActive: false,
    // detail is a JSON string: objects don't cross from the page's world into this one
    onAnime: (e: Event) => {
        let d: { state?: string; name?: string; ep?: number | null; poster?: string; time?: number; duration?: number } = {};
        try { d = JSON.parse(String((e as CustomEvent).detail || "{}")); } catch { return; }
        if (d.state === "closed") {
            discordTracker._animeActive = false;
            discordTracker.handleNavigation();
            return;
        }
        if (!d.name) return;
        discordTracker._animeActive = true;
        const name = String(d.name).slice(0, 120);
        const ep = d.ep ? `E${d.ep}` : "";
        const poster = typeof d.poster === "string" && /^https:\/\//.test(d.poster) ? d.poster : undefined;
        const time = Math.max(0, Number(d.time) || 0);
        if (d.state === "playing") {
            const start = Math.floor(Date.now() / 1000) - Math.floor(time);
            const end = Number(d.duration) > 0 ? start + Math.floor(Number(d.duration)) : undefined;
            DiscordPresence.setPlaying(name, ep ? `Watching ${ep}` : "Watching", start, end, poster);
        } else if (d.state === "paused") {
            const at = Helpers.formatTime(time);
            DiscordPresence.setPaused(name, ep ? `Paused at ${at} in ${ep}` : `Paused at ${at}`, poster);
        }
    },
    handleNavigation: () => {
        if (discordTracker._externalPlayerActive || discordTracker._animeActive) return;
        discordTracker._checkWatching();
        discordTracker._checkExploring();
        discordTracker._checkMainMenu();
    },

    _checkWatching: async () => {
        if (!location.href.includes('#/player')) return;
        discordTracker._externalPlayerActive = false; // new stream started in built-in player

        try {
            await Helpers.waitForElm('video');
            const video = currentVideo();
            if (!video) return;

            const playerState = await PlaybackState.getPlayerState();
            if (!playerState) return;
            const { metaDetails } = playerState;

            const episodeKey =
                metaDetails.id +
                (playerState.seriesInfoDetails
                    ? `${playerState.seriesInfoDetails.season}-${playerState.seriesInfoDetails.episode}`
                    : '');

            const sourceKey = video.currentSrc || video.src;

            const handlePlaying = () => {
                const startTimestamp =
                    Math.floor(Date.now() / 1000) -
                    Math.floor(video.currentTime);

                // no length yet (still loading): no end time rather than a broken one
                const endTimestamp = isFinite(video.duration) && video.duration > 0
                    ? startTimestamp + Math.floor(video.duration)
                    : undefined;

                if (metaDetails.type === "series") {
                    const { episode, season } = playerState.seriesInfoDetails!;
                    const isKitsu = metaDetails.id.startsWith("kitsu:");
                    const stateStr = `Watching ${!isKitsu ? `S${season} E${episode}` : `E${episode}`}`;

                    DiscordPresence.setPlaying(
                        metaDetails.name,
                        stateStr,
                        startTimestamp,
                        endTimestamp,
                        metaDetails.poster
                    );
                } else {
                    DiscordPresence.setPlaying(
                        metaDetails.name,
                        "Watching",
                        startTimestamp,
                        endTimestamp,
                        metaDetails.poster
                    );
                }
            };

            const handlePausing = async () => {
                const currentState = await PlaybackState.getPlayerState();
                if (!currentState) return;

                const pausedMeta = currentState.metaDetails;
                const formattedTime = Helpers.formatTime(video.currentTime);

                if (pausedMeta.type === "series") {
                    const { episode, season } = currentState.seriesInfoDetails!;
                    const isKitsu = pausedMeta.id.startsWith("kitsu:");
                    const stateStr = `Paused at ${formattedTime} in ${!isKitsu ? `S${season} E${episode}` : `E${episode}`}`;

                    DiscordPresence.setPaused(
                        pausedMeta.name,
                        stateStr,
                        pausedMeta.poster
                    );
                } else {
                    DiscordPresence.setPaused(
                        pausedMeta.name,
                        `Paused at ${formattedTime}`,
                        pausedMeta.poster
                    );
                }
            };

            video.onplaying = handlePlaying;
            video.onpause = handlePausing;

            const prev = (window as any).__rpc_state || {};

            (window as any).__rpc_state = {
                episodeKey,
                sourceKey
            };

            if (
                prev.episodeKey !== episodeKey ||
                prev.sourceKey !== sourceKey
            ) {
                handlePlaying();
            }

            if (!(window as any).__rpc_watcher) {
                (window as any).__rpc_watcher = setInterval(() => {
                    if (!location.href.includes('#/player')) return;

                    const v = currentVideo();
                    if (!v) return;

                    const currentSource = v.currentSrc || v.src;
                    const state = (window as any).__rpc_state || {};

                    if (state.sourceKey && state.sourceKey !== currentSource) {
                        discordTracker._checkWatching();
                    }

                    (window as any).__rpc_state = {
                        ...state,
                        sourceKey: currentSource
                    };
                }, 2000);
            }

            if (!video.paused && !video.ended) {
                handlePlaying();
            } else {
                handlePausing();
            }

        } catch (error) {
            console.error(error);
        }
    },

    _checkExploring: async () => {
        if (!location.href.includes("#/detail")) return;

        try {
            await Helpers.waitForElm('.metadetails-container-K_Dqa');
            const metaDetails = await PlaybackState.getMetaDetails();
            if (!metaDetails) return;

            await Helpers.waitForElm('.description-container-yi8iU');
            DiscordPresence.setExploring(metaDetails.name, metaDetails.poster);
        } catch (error) {
            console.error(error);
        }
    },

    _checkMainMenu: () => {
        const hashToActivity: Record<string, string> = {
            '': "Home",
            "#/": "Home",
            "#/discover": "Discover",
            "#/library": "Library",
            "#/calendar": "Calendar",
            "#/addons": "Addons",
            "#/settings": "Settings",
        };

        const activity = hashToActivity[location.hash];
        if (activity) {
            DiscordPresence.setMainMenu(activity);
        }
    }
};
