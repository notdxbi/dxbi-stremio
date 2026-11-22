import { connect } from "net";
import { join } from "path";
import { tmpdir } from "os";
import DiscordPresence from "../../core/DiscordPresence";
import { discordTracker } from "./discordTracker";
import { STORAGE_KEYS } from "../../constants";
import logger from "../../utils/logger";

/**
 * Showing what you watch on Discord is off until someone turns it on (it's public to everyone who can
 * see you there), and the switch is deep in Settings, so people saw Discord's own "Playing dx.bi" and
 * took it for dx.bi's status (issue #121). When Discord is running and the choice was never made, a small
 * bar on the page offers it, once.
 */

/** Discord's local socket answers: the desktop app (or Vesktop/arRPC) is running */
function discordRunning(): Promise<boolean> {
    const places: string[] = [];
    if (process.platform === "win32") {
        for (let i = 0; i < 10; i++) places.push(`\\\\?\\pipe\\discord-ipc-${i}`);
    } else {
        const base = process.env.XDG_RUNTIME_DIR || process.env.TMPDIR || process.env.TMP || process.env.TEMP || tmpdir();
        // (Flatpak and Snap Discord put theirs in their own folder)
        for (const dir of [base, join(base, "app", "com.discordapp.Discord"), join(base, "snap.discord"), join(base, ".flatpak", "dev.vencord.Vesktop", "xdg-run")]) {
            for (let i = 0; i < 10; i++) places.push(join(dir, `discord-ipc-${i}`));
        }
    }
    const one = (path: string) => new Promise<boolean>((resolve) => {
        const socket = connect(path);
        const done = (ok: boolean) => { socket.destroy(); resolve(ok); };
        socket.once("connect", () => done(true));
        socket.once("error", () => done(false));
        setTimeout(() => done(false), 1500);
    });
    return Promise.all(places.map(one)).then((r) => r.some(Boolean));
}

function turnOn(): void {
    localStorage.setItem(STORAGE_KEYS.DISCORD_RPC, "true");
    DiscordPresence.start();
    discordTracker.init();
    // the Settings switch, when it's on screen, shows the new state
    document.getElementById("discordrichpresence")?.classList.add("checked");
}

function showBar(): void {
    const bar = document.createElement("div");
    bar.id = "dx-discord-offer";
    bar.setAttribute("role", "dialog");
    bar.setAttribute("aria-label", "Discord status");
    bar.style.cssText = "position:fixed;left:50%;top:76px;transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:14px;" +
        "max-width:min(640px,calc(100vw - 32px));padding:14px 16px 14px 20px;border-radius:12px;background:rgba(24,24,28,0.97);color:#fff;" +
        "font:500 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.08)";
    const text = document.createElement("div");
    text.style.cssText = "flex:1";
    text.textContent = "Show what you're watching on Discord? Your status would say the title and episode. You can change this in Settings → dx.bi → App.";
    const button = (label: string, primary: boolean) => {
        const b = document.createElement("button");
        b.textContent = label;
        b.style.cssText = `flex:none;cursor:pointer;border:none;border-radius:8px;padding:9px 14px;font:600 13px Inter,system-ui,sans-serif;` +
            (primary ? "background:#fff;color:#000" : "background:rgba(255,255,255,0.12);color:#fff");
        return b;
    };
    const yes = button("Show it", true);
    const no = button("No thanks", false);
    const close = () => bar.remove();
    yes.addEventListener("click", () => { localStorage.setItem(STORAGE_KEYS.DISCORD_RPC_OFFERED, "1"); turnOn(); close(); });
    no.addEventListener("click", () => { localStorage.setItem(STORAGE_KEYS.DISCORD_RPC_OFFERED, "1"); close(); });
    bar.append(text, yes, no);
    document.body.append(bar);
}

export function offerDiscordPresence(): void {
    if (localStorage.getItem(STORAGE_KEYS.DISCORD_RPC) === "true" || localStorage.getItem(STORAGE_KEYS.DISCORD_RPC_OFFERED)) return;
    // after the intro and the first screen, not over them
    setTimeout(() => {
        discordRunning().then((running) => {
            if (!running || localStorage.getItem(STORAGE_KEYS.DISCORD_RPC) === "true" || document.getElementById("dx-discord-offer")) return;
            logger.info("Discord is running and its status was never chosen: offering it");
            showBar();
        }).catch(() => {});
    }, 20000);
}
