export const VALID_EXTERNAL_PLAYERS = ["disabled", "vlc", "mpv"] as const;
export type ExternalPlayer = typeof VALID_EXTERNAL_PLAYERS[number];

export interface ExternalPlayerOptions {
    /** where to start, for resuming */
    startSeconds?: number;
    /** shown as the player window's title */
    title?: string;
    /** the page keeps the progress of this launch */
    track?: boolean;
}

/** Where the external player is, in seconds (duration 0 when it doesn't know yet) */
export interface ExternalPlayerStatus {
    position: number;
    duration: number;
    state: 'playing' | 'paused';
}
