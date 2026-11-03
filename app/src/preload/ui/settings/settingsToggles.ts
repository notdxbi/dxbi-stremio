import { ipcRenderer, webFrame } from "electron";
import Helpers from "../../../utils/Helpers";
import Updater from "../../../core/Updater";
import logger from "../../../utils/logger";
import DiscordPresence from "../../../core/DiscordPresence";
import { discordTracker } from "../discordTracker";
import { STORAGE_KEYS, IPC_CHANNELS, CLASSES, PLAYER_PATH_STORAGE_KEY } from "../../../constants";
import { gpuRendererAPI } from "../../api/gpuRenderer";
import { externalPlayerAPI } from "../../api/externalPlayer";
import { alertAPI } from "../../api/alert";

export function setupCheckUpdatesButton(): void {
    Helpers.waitForElm('#checkforupdatesBtn').then(() => {
        const btn = document.getElementById("checkforupdatesBtn");
        btn?.addEventListener("click", async () => {
            if (btn) btn.style.pointerEvents = "none";
            // Checked here, in the page: the main process has no page to show the update popup on,
            // so a check there failed with "check your internet connection" whenever an update existed
            if (ipcRenderer.sendSync(IPC_CHANNELS.AUTO_UPDATE_AVAILABLE)) ipcRenderer.send(IPC_CHANNELS.AUTO_UPDATE_CHECK, true);
            else await Updater.checkForUpdates(true).catch(() => false);
            if (btn) btn.style.pointerEvents = "all";
        });
    }).catch(() => {});
}

export function setupCheckUpdatesOnStartupToggle(): void {
    Helpers.waitForElm('#checkForUpdatesOnStartup').then(() => {
        const toggle = document.getElementById("checkForUpdatesOnStartup");
        toggle?.addEventListener("click", () => {
            toggle.classList.toggle(CLASSES.CHECKED);
            const isChecked = toggle.classList.contains(CLASSES.CHECKED);
            logger.info(`Check for updates on startup toggled ${isChecked ? "ON" : "OFF"}`);
            localStorage.setItem(STORAGE_KEYS.CHECK_UPDATES_ON_STARTUP, isChecked ? "true" : "false");
        });
    }).catch(() => {});
}

export function setupDiscordRpcToggle(): void {
    Helpers.waitForElm('#discordrichpresence').then(() => {
        const toggle = document.getElementById("discordrichpresence");
        toggle?.addEventListener("click", async () => {
            toggle.classList.toggle(CLASSES.CHECKED);
            const isChecked = toggle.classList.contains(CLASSES.CHECKED);
            logger.info(`Discord Rich Presence toggled ${isChecked ? "ON" : "OFF"}`);
            
            if (isChecked) {
                localStorage.setItem(STORAGE_KEYS.DISCORD_RPC, "true");
                DiscordPresence.start();
                discordTracker.init();
            } else {
                localStorage.setItem(STORAGE_KEYS.DISCORD_RPC, "false");
                DiscordPresence.stop();
            }
        });
    }).catch(() => {});
}

export function setupTransparencyToggle(): void {
    Helpers.waitForElm('#enableTransparentThemes').then(() => {
        const toggle = document.getElementById("enableTransparentThemes");
        toggle?.addEventListener("click", () => {
            toggle.classList.toggle(CLASSES.CHECKED);
            const isChecked = toggle.classList.contains(CLASSES.CHECKED);
            logger.info(`Enable transparency toggled ${isChecked ? "ON" : "OFF"}`);
            ipcRenderer.send(IPC_CHANNELS.SET_TRANSPARENCY, isChecked);
        });
    }).catch(() => {});
}

export function setupGpuDropdown() {
    Helpers.waitForElm('#gpu-renderer-dropdown').then(() => {
        const gpuDropdown = document.getElementById('gpu-renderer-dropdown') as HTMLSelectElement;
        if (!gpuDropdown) return;

        gpuDropdown.addEventListener('change', async (e) => {
            const selectedValue = (e.target as HTMLSelectElement).value;
            
            await gpuRendererAPI.setGpuRenderer(selectedValue);
            await alertAPI.showAlert(
                "info",
                "Restart Required",
                "Your hardware acceleration settings have been saved. Please restart dx.bi to apply the changes.",
                ["OK"]
            );
        });
    }).catch(() => {});
}

export function setupExternalPlayerDropdown() {
    Helpers.waitForElm('#external-player-dropdown').then(() => {
        const dropdown = document.getElementById('external-player-dropdown') as HTMLSelectElement;
        if (!dropdown) return;

        dropdown.addEventListener('change', async (e) => {
            const selectedValue = (e.target as HTMLSelectElement).value;
            localStorage.setItem(STORAGE_KEYS.EXTERNAL_PLAYER, selectedValue);
            logger.info(`External player set to: ${selectedValue}`);

            const vlcPathOption = document.getElementById('vlc-path-option');
            const mpvPathOption = document.getElementById('mpv-path-option');
            if (vlcPathOption) vlcPathOption.style.display = selectedValue === 'vlc' ? '' : 'none';
            if (mpvPathOption) mpvPathOption.style.display = selectedValue === 'mpv' ? '' : 'none';

            if (selectedValue !== 'disabled') {
                const customPath = localStorage.getItem(PLAYER_PATH_STORAGE_KEY[selectedValue]);

                if (!customPath) {
                    const paths = await externalPlayerAPI.getExternalPlayerPaths();
                    const playerPath = paths[selectedValue as keyof typeof paths];
                    if (!playerPath) {
                        await alertAPI.showAlert(
                            "warning",
                            "Player Not Found",
                            `${selectedValue.toUpperCase()} was not found on your system. You can set a custom path to the player executable below.`,
                            ["OK"]
                        );
                    }
                }
            }
        });
    }).catch(() => {});
}

export function setupExternalPlayerPathInputs() {
    setupPathInput('external-player-vlc-path', STORAGE_KEYS.EXTERNAL_PLAYER_VLC_PATH, 'VLC');
    setupPathInput('external-player-mpv-path', STORAGE_KEYS.EXTERNAL_PLAYER_MPV_PATH, 'MPV');
}

function setupPathInput(elementId: string, storageKey: string, playerName: string) {
    Helpers.waitForElm(`#${elementId}`).then((el) => {
        const input = el as HTMLInputElement;

        input.addEventListener('change', () => {
            const value = input.value.trim();
            if (value) {
                localStorage.setItem(storageKey, value);
                logger.info(`Custom ${playerName} path set to: ${value}`);
            } else {
                localStorage.removeItem(storageKey);
                logger.info(`Custom ${playerName} path cleared, using auto-detect`);
            }
        });
    }).catch(() => {});
}
// "Play videos with mpv": dx.bi's own player (mpv behind the page), or the browser's. Only shown
// where dx.bi has mpv; the change applies after a restart.
export function setupMpvPlayerToggle(): void {
    Helpers.waitForElm('#enableTransparentThemes').then(() => {
        let status: { available: boolean; enabled: boolean };
        try { status = ipcRenderer.sendSync(IPC_CHANNELS.MPV_STATUS); } catch { return; }
        if (!status?.available || document.getElementById("dxbiMpvPlayer")) return;
        const option = document.getElementById("enableTransparentThemes")?.closest('[class*="option-"]');
        if (!option) return;
        const html = `
<div class="option-vFOAS">
    <div class="heading-dYMDt">
        <div class="label-qI6Vh">Play videos with mpv (recommended)</div>
    </div>
    <div class="content-P2T0i">
        <div tabindex="-1" class="toggle-container-lZfHP button-container-zVLH6 ${status.enabled ? CLASSES.CHECKED : ""}" id="dxbiMpvPlayer" style="outline: none;">
            <div class="toggle-toOWM"></div>
        </div>
    </div>
</div>
<p style="color:rgb(204, 204, 204);">mpv plays every format as it is (HEVC, Dolby Vision, AV1, DTS, TrueHD, embedded subtitles) with hardware decoding, like Stremio's own app. Switch it off to use the browser's player instead. Opening streams in VLC or mpv as separate apps is the External player setting below. Applies after restarting dx.bi.</p>`;
        option.insertAdjacentHTML("beforebegin", html);
        const toggle = document.getElementById("dxbiMpvPlayer");
        toggle?.addEventListener("click", () => {
            toggle.classList.toggle(CLASSES.CHECKED);
            const on = toggle.classList.contains(CLASSES.CHECKED);
            ipcRenderer.send(IPC_CHANNELS.MPV_SET_ENABLED, on);
            alertAPI.showAlert("info", "Video player changed", "Restart dx.bi to use the new player.", ["OK"]);
        });
    }).catch(() => {});
}

// Where the streaming server keeps torrent data. The server reads "cacheRoot" from its own settings
// (server-settings.json, also through POST /settings) and puts the cache in <cacheRoot>/stremio-cache;
// it looks the folder up for every new torrent, so a change applies without a restart. Stremio's
// own settings only offer the cache size.
const SERVER = "http://127.0.0.1:11470";

async function serverValues(): Promise<{ cacheRoot?: string; appPath?: string } | null> {
    try {
        const r = await fetch(`${SERVER}/settings`, { signal: AbortSignal.timeout(4000) });
        return r.ok ? ((await r.json()).values || {}) : null;
    } catch { return null; }
}

export function setupCacheFolder(): void {
    Helpers.waitForElm('#enableTransparentThemes').then(async () => {
        if (document.getElementById("dxbiCacheFolder")) return;
        const heading = [...document.querySelectorAll("h5")].find((h) => h.textContent?.trim() === "Window");
        if (!heading) return;
        const sep = process.platform === "win32" ? "\\" : "/";
        const html = `
<h5 style="margin: 1.6rem 0 0.9rem; font-size: 0.8em; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #8d8d96;">Streaming</h5>
<div class="option-vFOAS" id="dxbiCacheFolder">
    <div class="heading-dYMDt">
        <div class="label-qI6Vh">Cache folder</div>
    </div>
    <div class="content-P2T0i" style="display:flex; gap:0.6rem;">
        <div tabindex="0" title="Choose where the cache goes" class="button-DNmYL button-container-zVLH6 button" style="flex:1; min-width:0;" id="dxbiCacheChange">Choose</div>
        <div tabindex="0" title="Put the cache back in its usual place" class="button-DNmYL button-container-zVLH6 button" style="flex:1; min-width:0;" id="dxbiCacheReset">Default</div>
    </div>
</div>
<p style="color:rgb(204, 204, 204);">Videos you stream are cached in <b id="dxbiCachePath" style="word-break: break-all;">…</b>. Pick another folder, such as one on a bigger drive, and new streams are cached there (in a <i>stremio-cache</i> folder inside it). The cache size is in Settings → Streaming. Anything already cached stays in the old folder until you delete it.</p>
<br/>`;
        heading.insertAdjacentHTML("beforebegin", html);
        const label = document.getElementById("dxbiCachePath");
        const show = async () => {
            const v = await serverValues();
            if (!label) return;
            label.textContent = v && v.cacheRoot ? `${v.cacheRoot}${sep}stremio-cache` : "the streaming server's folder (it isn't running right now)";
            return v;
        };
        const save = async (cacheRoot: string) => {
            try {
                const r = await fetch(`${SERVER}/settings`, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ cacheRoot }),
                    signal: AbortSignal.timeout(5000),
                });
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                logger.info(`Streaming cache folder set to ${cacheRoot}`);
                // Stremio keeps its own copy of the server's settings and sends all of it back when
                // you change one (the cache size, say): have it read them again, or it'd undo this
                await webFrame.executeJavaScript(`(() => {
                    const core = window.core || (window.services && window.services.core);
                    if (core && core.dispatch) core.dispatch({ action: "StreamingServer", args: { action: "Reload" } });
                })()`).catch(() => { /* Stremio picks it up next time it loads them */ });
            } catch (err) {
                logger.warn(`Couldn't change the cache folder: ${err}`);
                await alertAPI.showAlert("warning", "Cache folder not changed", "The streaming server didn't answer. Make sure it's running (Settings → Streaming), then try again.", ["OK"]);
            }
            await show();
        };
        void show();
        document.getElementById("dxbiCacheChange")?.addEventListener("click", async () => {
            const v = await serverValues();
            const picked: string | null = await ipcRenderer.invoke(IPC_CHANNELS.PICK_FOLDER, "Choose a folder for the streaming cache", v?.cacheRoot || "");
            if (picked) await save(picked);
        });
        document.getElementById("dxbiCacheReset")?.addEventListener("click", async () => {
            const v = await serverValues();
            if (v && v.appPath) await save(v.appPath);
            else await alertAPI.showAlert("warning", "Cache folder not changed", "The streaming server didn't answer. Make sure it's running (Settings → Streaming), then try again.", ["OK"]);
        });
    }).catch(() => {});
}
