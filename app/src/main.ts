import { join } from "path";
import { mkdirSync, existsSync } from "fs";
import Updater from "./core/Updater";
import Properties from "./core/Properties";
import logger from "./utils/logger";
import { IPC_CHANNELS, URLS, SERVER_JS_URL } from "./constants";

// Fix GTK 2/3 and GTK 4 conflict on Linux
import { app } from 'electron';
if (process.platform === 'linux') app.commandLine.appendSwitch('gtk-version', '3');

import { BrowserWindow, shell } from "electron";
import StreamingServer from "./utils/StreamingServer";
import Helpers from "./utils/Helpers";
import StremioService from "./utils/StremioService";
import { setupPluginSettingsAPI } from "./controllers/api/SettingsApiController";
import { setupPluginAlertAPI } from "./controllers/api/AlertApiController";
import { setupWindowControls } from "./controllers/windowController";
import { setupUpdater } from "./controllers/updaterController";
import { setupWindowTransparency } from "./controllers/transparencyController";
import { gpuController } from "./controllers/gpuController";
import { externalPlayerController } from "./controllers/externalPlayerController";
import { offerEnhancedImport, seedBuiltInPlugin } from "./core/BuiltIn";
import MpvShell from "./core/MpvShell";
import MiniPlayer from "./core/MiniPlayer";
import { ipcMain } from "electron";
import { restoreWindowState } from "./core/WindowState";
import { isFullScreen, maximize, setFullScreen, useManualMaximize } from "./core/Maximize";
import { setupAutoUpdate } from "./core/AutoUpdate";

app.setName("dxbi");
const userDataPath = app.getPath('userData');

export let mainWindow: BrowserWindow | null;
const gotLock = app.requestSingleInstanceLock();
const transparencyFlagPath = join(app.getPath("userData"), "transparency");
const useStremioServiceFlagPath = join(app.getPath("userData"), "use_stremio_service_for_streaming");
// Videos play in mpv behind a transparent window (core/MpvShell.ts), like the official Stremio app
const mpvEnabled = MpvShell.isEnabled();
const transparencyEnabled = existsSync(transparencyFlagPath) || mpvEnabled;
ipcMain.on(IPC_CHANNELS.MPV_ENABLED, (event) => { event.returnValue = mpvEnabled; });
MpvShell.setupSetting();
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3;

app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests,PrivateNetworkAccessSendPreflights');
app.commandLine.appendSwitch('ignore-connections-limit', 'localhost,127.0.0.1');
app.commandLine.appendSwitch('proxy-bypass-list', '127.0.0.1,localhost,::1');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('enable-quic');
app.commandLine.appendSwitch('enable-async-dns');
app.commandLine.appendSwitch('disable-rtc-smoothness-algorithm');

gpuController.setup(userDataPath);

if (!gotLock) {
    app.quit();
} else {
    app.on('second-instance', (_, argv) => {
        // Windows/Linux: protocol URL comes as a command line argument
        const url = argv.find(arg => arg.startsWith('stremio://'));
        if (url) handleStremioURL(url);
        
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });
}

async function createWindow() {
    mainWindow = new BrowserWindow({
        webPreferences: {
            preload: join(__dirname, "//preload/index.js"),
            // Security Note: These settings are required for the plugin/theme system
            // to work properly. The app loads web.stremio.com and needs to:
            // 1. Make cross-origin requests to local streaming server (webSecurity: false)
            // 2. Access Node.js APIs for file operations (nodeIntegration: true)
            webSecurity: false,
            nodeIntegration: true,
            contextIsolation: true,
            // Additional security hardening/performance settings
            allowRunningInsecureContent: false,
            experimentalFeatures: false,
            spellcheck: false,
            backgroundThrottling: false
        },
        width: 1500,
        height: 850,
        show: false, // shown once its saved size and state are applied
        resizable: true,
        maximizable: true,
        fullscreenable: true,
        useContentSize: true,
        icon: join(__dirname, "..", "images", process.platform === "win32" ? "icon.ico" : "icon.png"),
        frame: transparencyEnabled ? false : true,
        transparent: transparencyEnabled,
        hasShadow: false,
        visualEffectState: transparencyEnabled ? "active" : "followWindow",
        backgroundColor: "#00000000",
    });
    
    mainWindow.setMenu(null);
    MiniPlayer.attach(mainWindow);
    useManualMaximize(mainWindow, transparencyEnabled);
    const openMaximized = restoreWindowState(mainWindow);
    // Shown once dx.bi has dressed the page: plugins load when the page has fully loaded, and until
    // then plain Stremio was on screen for a moment. Never kept hidden for long if that's slow.
    const win = mainWindow;
    const reveal = () => {
        if (win.isDestroyed() || win.isVisible()) return;
        if (openMaximized) maximize(win);
        win.show();
    };
    ipcMain.once(IPC_CHANNELS.UI_READY, reveal);
    win.webContents.once("did-fail-load", reveal);
    setTimeout(reveal, 6000);
    mainWindow.loadURL(URLS.STREMIO_WEB);
        
    if (transparencyEnabled) {
        mainWindow.on('enter-full-screen', () => {
            mainWindow?.webContents.send(IPC_CHANNELS.FULLSCREEN_CHANGED, true);
        });
        
        mainWindow.on('leave-full-screen', () => {
            mainWindow?.webContents.send(IPC_CHANNELS.FULLSCREEN_CHANGED, false);
        });
    }
    
    // Opens links in external browser instead of opening them in the Electron app.
    mainWindow.webContents.setWindowOpenHandler((edata:any) => {
        shell.openExternal(edata.url);
        return { action: "deny" };
    });
    
    // Devtools flag
    if(process.argv.includes("--devtools")) { 
        logger.info("Developer tools flag detected. Opening DevTools in detached mode...");
        mainWindow.webContents.openDevTools({ mode: "detach" }); 
    }
    
    // mainWindow.on('closed', () => {
    //     if(!process.argv.includes("--no-stremio-service") && StremioService.isProcessRunning()) StremioService.terminate();
    // });
}

// Use Stremio Service for streaming
async function useStremioService() {
    if(await StremioService.isServiceInstalled()) {
        logger.info("Found installation of Stremio Service.");
        await StremioService.start();
    } else {
        const result = await Helpers.showAlert(
            "warning",
            "Stremio Service not found",
            `Stremio Service is required for streaming features. Do you want to download it now? ${process.platform == "linux" ? "This will install the service via Flatpak (if available)." : ""}`,
            ["YES", "NO"]
        );
        if (result === 0) {
            await StremioService.downloadAndInstallService();
        } else {
            logger.info("User declined to download Stremio Service.");
        }
    }
}

app.on("ready", async () => {
    logger.info("dx.bi version: v" + Updater.getCurrentVersion());
    logger.info("Running on NodeJS version: " + process.version);
    logger.info("Running on Electron version: v" + process.versions.electron);
    logger.info("Running on Chromium version: v" + process.versions.chrome);
    
    logger.info("User data path: " + app.getPath("userData"));
    logger.info("Themes path: " + Properties.themesPath);
    logger.info("Plugins path: " + Properties.pluginsPath);
    
    try {
        const basePath = Properties.enhancedPath;
        
        if (!existsSync(basePath)) {
            mkdirSync(basePath, { recursive: true });
        }
        if (!existsSync(Properties.themesPath)) {
            mkdirSync(Properties.themesPath, { recursive: true });
        }
        if (!existsSync(Properties.pluginsPath)) {
            mkdirSync(Properties.pluginsPath, { recursive: true });
        }
    } catch (err) {
        logger.error("Failed to create necessary directories: " + err);
    }

    // First launch: bring Stremio Enhanced's setup over if wanted, then put the built-in dx.bi in place
    await offerEnhancedImport();
    seedBuiltInPlugin();
    
    if(!process.argv.includes("--no-stremio-server")) {
        if(!await StremioService.isProcessRunning()) {
            let platform = process.platform;
            
            // Windows used to ask "Stremio Service or server.js?" on first launch, and the
            // recommended answer left people with "Streaming server is not available" when the
            // Service installed somewhere dx.bi didn't look. Now every system runs server.js by
            // itself; someone who chose the Service before keeps it while it's installed.
            if(platform === "win32" && existsSync(useStremioServiceFlagPath) && await StremioService.isServiceInstalled()) {
                await useStremioService();
            } else if (platform === "win32" || platform === "darwin" || platform === "linux") {
                useServerJS();
                tellStremioWhenServerIsUp();
            }
        } else {
            logger.info("Stremio Service is already running.");
            StremioService.repairFFmpeg();
        }
    } else logger.info("Launching without Stremio streaming server.");
    
    // setup IPC and create window
    setupPluginSettingsAPI();
    setupPluginAlertAPI();
    createWindow();
    MiniPlayer.setup(() => mainWindow);
    if(transparencyEnabled) setupWindowControls();
    if(mpvEnabled && mainWindow) MpvShell.setup(mainWindow);
    setupUpdater();
    setupAutoUpdate(() => mainWindow);
    setupWindowTransparency(transparencyFlagPath, transparencyEnabled);
    gpuController.initIPC(userDataPath);
    externalPlayerController.initIPC();

    // macOS: protocol URLs are sent via 'open-url'
    app.on('open-url', (event, url) => {
        event.preventDefault();
        handleStremioURL(url);
    });
    
    if (!app.isDefaultProtocolClient('stremio')) {
        app.setAsDefaultProtocolClient('stremio');
    }
    
    // Handle any URL passed on first launch (Windows/Linux)
    const launchUrl = process.argv.find(arg => arg.startsWith('stremio://'));
    if (launchUrl) handleStremioURL(launchUrl);
    
    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// server.js starts in the background (the first time it also downloads, with ffmpeg), so the page
// is often up first. Stremio checks for the server once when it loads and would keep showing
// "Streaming server is not available", so it's told to check again as soon as the server answers.
async function tellStremioWhenServerIsUp() {
    const end = Date.now() + 10 * 60 * 1000;
    while (Date.now() < end) {
        try {
            if ((await fetch("http://127.0.0.1:11470/settings")).ok) break;
        } catch { /* not up yet */ }
        await new Promise((r) => setTimeout(r, 1500));
    }
    if (Date.now() >= end) return;
    const reload = () => mainWindow?.webContents.executeJavaScript(`(() => {
        const action = { action: "StreamingServer", args: { action: "Reload" } };
        const core = window.core || window.__permanentCore;
        if (core && typeof core.dispatch === "function") { core.dispatch(action); return true; }
        const transport = window.services && window.services.core && window.services.core.transport;
        if (transport && typeof transport.dispatch === "function") { transport.dispatch(action); return true; }
        return false;
    })()`).catch(() => false);
    // the page may still be loading its core: try for a little while
    for (let i = 0; i < 20; i++) {
        if (await reload()) { logger.info("Streaming server is up; Stremio told to reload it."); return; }
        await new Promise((r) => setTimeout(r, 1000));
    }
}

async function useServerJS() {
    // Check for server.js updates from Cargo.toml first
    await StreamingServer.checkServerJsUpdate();

    // First, try to ensure streaming server files are available
    logger.info("Checking for streaming server files...");
    const filesStatus = await StreamingServer.ensureStreamingServerFiles();
    
    if(filesStatus === "ready") {
        logger.info("Running server.js directly...");
        StreamingServer.start();
    } else if(filesStatus === "missing_server_js") {
        // server.js is missing - show instructions to the user in a loop
        logger.info("server.js not found. Showing download instructions to user...");
        const serverDir = StreamingServer.getStreamingServerDir();
        const downloadUrl = StreamingServer.latestServerJsUrl || SERVER_JS_URL;
        
        let serverJsFound = false;
        while (!serverJsFound) {
            const result = await Helpers.showAlert(
                "info",
                "Streaming Server Setup Required",
                `To enable video playback, you need to download the Stremio streaming server file (server.js).\n\n` +
                `1. Download server.js from:\n${downloadUrl}\n\n` +
                `2. Right click the page and select "Save As" and save it as "server.js".\n\n` +
                `3. Place it in:\n${serverDir}\n\n` +
                `Click "Open Folder" to open the destination folder, or "Download" to open the download link in your browser. Click "Close" when you have placed the file in the correct location and FFmpeg will be downloaded automatically if needed.`,
                ["Open Folder", "Download", "Close"]
            );
            
            if (result === 0) {
                // Open the folder
                StreamingServer.openStreamingServerDir();
            } else if (result === 1) {
                // Open the download URL in browser
                shell.openExternal(downloadUrl);
            } else {
                // User clicked Close - check if file exists now
                if (StreamingServer.serverJsExists()) {
                    serverJsFound = true;
                    logger.info("server.js found after user action. Proceeding with streaming server setup...");
                    // Re-run the setup to also check/download ffmpeg
                    const retryStatus = await StreamingServer.ensureStreamingServerFiles();
                    if (retryStatus === "ready") {
                        logger.info("Launching local streaming server.");
                        await Helpers.showAlert("info", "Streaming Server Setup Complete", "The streaming server has been set up successfully and will now start. You may need to reload the streaming server from the settings.", ["OK"]);
                        StreamingServer.start();
                    } else {
                        // FFmpeg issue - fall back to Stremio Service
                        logger.info("FFmpeg not available after server.js setup. Falling back to Stremio Service...");
                        await Helpers.showAlert("error", "Failed to download FFmpeg", "Failed to automatically download FFmpeg. FFmpeg is required for the streaming server to function properly. The app will now use Stremio Service for streaming instead for this instance.", ["OK"]);
                        await useStremioService();
                    }
                } else {
                    // File still not there - warn and show dialog again
                    const warnResult = await Helpers.showAlert(
                        "warning",
                        "File Not Found",
                        `server.js was not found in:\n${serverDir}\n\nPlease download the file and place it in the correct location. Do you want to try again or fallback to Stremio Service?`,
                        ["Try Again", "Use Stremio Service"]
                    );
                    
                    if (warnResult === 1) {
                        serverJsFound = true; // exit loop
                        logger.info("User abandoned server.js setup. Falling back to Stremio Service...");
                        await useStremioService();
                    }
                }
            }
        }
    } else {
        // FFmpeg download failed - fall back to Stremio Service
        logger.info("FFmpeg not available. Falling back to Stremio Service...");
        await useStremioService();
    }
}

app.on("window-all-closed", () => {
    logger.info("Closing app...");
    
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event:any, input:any) => {
        switch (true) {
            // Opens Devtools on Ctrl + Shift + I
            case input.control && input.shift && input.key === 'I':
            window.webContents.toggleDevTools();
            event.preventDefault();
            break;
            
            // Toggles fullscreen on F11
            case input.key === 'F11':
            setFullScreen(window, !isFullScreen(window));
            event.preventDefault();
            break;
            
            // Implements zooming in/out using shortcuts (Ctrl + =, Ctrl + -)
            // (Electron throws for a zoom factor of 0 or less)
            case input.control && input.key === '=':
            if (mainWindow) mainWindow.webContents.zoomFactor = Math.min(MAX_ZOOM, mainWindow.webContents.zoomFactor + 0.1);
            event.preventDefault();
            break;
            case input.control && input.key === '-':
            if (mainWindow) mainWindow.webContents.zoomFactor = Math.max(MIN_ZOOM, mainWindow.webContents.zoomFactor - 0.1);
            event.preventDefault();
            break;
            
            // Implements reload on Ctrl + R
            case input.control && input.key === 'r':
            mainWindow?.reload();
            event.preventDefault();
            break;
        }
    });
});

function handleStremioURL(url: string) {
    try {
        console.log('Received stremio:// URL:', url);
        
        if (mainWindow && url.endsWith("/manifest.json")) {
            mainWindow.loadURL(URLS.STREMIO_WEB_ADD_ADDON + encodeURIComponent(url));
        }
    } catch (err) {
        console.error('Invalid stremio:// URL', err);
    }
}
