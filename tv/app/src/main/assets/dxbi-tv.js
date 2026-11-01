// dx.bi TV — Copyright (C) 2026 dx.bi. GNU General Public License, version 3 or later (see LICENSE).
// dx.bi TV: runs in web.stremio.com before the page's own scripts. It stands in for Stremio Enhanced
// (the plugin API dx.bi expects), loads the built-in dx.bi plugin, fits the page to a TV, and hands
// every stream to the app's native player, keeping Stremio's watch progress in step.
(function () {
  "use strict";
  if (window.__dxbiTv) return;
  // Every call to the app carries this launch's token (the app writes it in here): the app's
  // bridge is visible to every frame, embedded trailers included, but only this page knows it
  const TOKEN = "__DXBI_TV_TOKEN__";
  const bridge = window.DxbiTV;
  if (!bridge) return;
  const native = {
    pluginSource: () => bridge.pluginSource(TOKEN),
    getSettings: (plugin) => bridge.getSettings(TOKEN, plugin),
    saveSetting: (plugin, key, valueJson) => bridge.saveSetting(TOKEN, plugin, key, valueJson),
    play: (json) => bridge.play(TOKEN, json),
    activePlayback: () => bridge.activePlayback(TOKEN),
    takePendingClose: () => bridge.takePendingClose(TOKEN),
    openExternal: (url) => bridge.openExternal(TOKEN, url),
    control: (command) => bridge.control(TOKEN, JSON.stringify(command)),
    findServers: () => bridge.findServers(TOKEN),
    torrentUrl: (json) => (bridge.torrentUrl ? bridge.torrentUrl(TOKEN, json) : ""),
    deviceInfo: () => { try { return JSON.parse(bridge.deviceInfo ? bridge.deviceInfo(TOKEN) : "{}"); } catch (_) { return {}; } },
  };

  const PLUGIN = "dxbi.plugin.js";
  const tv = (window.__dxbiTv = {});
  // problem reports (the plugin's `report`) add these
  tv.deviceInfo = () => native.deviceInfo();
  // the app plays the intro film itself (Intro.kt): the plugin's splash stays out of the way
  tv.nativeIntro = true;

  // ---------------------------------------------------------------------------
  // Fit the page to the TV: lay it out 1280 CSS pixels wide (a 10-foot size on any screen). A phone
  // held upright gets a 600-pixel-wide page instead, which Stremio and dx.bi lay out as a column.
  // ---------------------------------------------------------------------------
  const PHONE = (() => { try { return !!bridge.isPhone(); } catch (_) { return false; } })();
  tv.phone = PHONE;
  // Words written for a TV, as a phone shows them
  const forDevice = (text) => (PHONE && typeof text === "string"
    ? text.replace(/ On a TV, only[^.]*\./, "").replace(/\bthis TV\b/g, "this phone").replace(/\bthis TV's\b/g, "this phone's")
    : text);
  const upright = () => PHONE && window.screen && screen.height > screen.width;
  let VIEWPORT = "width=1280, user-scalable=no";
  function fitViewport() {
    // Upright, a phone is laid out at its own width, so everything is the size Android apps are.
    // Marked from the screen, not the page: the keyboard opening makes the page look sideways.
    // (a phone on its side too: 1280 pixels across made everything tiny there)
    VIEWPORT = PHONE ? "width=device-width, initial-scale=1, user-scalable=no" : "width=1280, user-scalable=no";
    document.documentElement.classList.toggle("dx-phone", PHONE);
    document.documentElement.classList.toggle("dx-upright", upright());
    let meta = document.querySelector('meta[name="viewport"]');
    if (!meta) {
      if (!document.head) return;
      meta = document.createElement("meta");
      meta.name = "viewport";
      document.head.append(meta);
    }
    if (meta.content !== VIEWPORT) meta.content = VIEWPORT;
  }
  // Watched only until <head> exists, then only <head> itself: a whole-page watcher ran on every change
  // the page made, for as long as it was open
  const viewportWatch = new MutationObserver(() => {
    fitViewport();
    if (!document.head) return;
    viewportWatch.disconnect();
    new MutationObserver(fitViewport).observe(document.head, { childList: true });
  });
  if (document.head) new MutationObserver(fitViewport).observe(document.head, { childList: true });
  else viewportWatch.observe(document.documentElement, { childList: true, subtree: true });
  fitViewport();
  // a phone turned between upright and sideways
  if (PHONE) window.addEventListener("resize", () => fitViewport());

  // ---------------------------------------------------------------------------
  // What Stremio Enhanced provides and dx.bi relies on
  // ---------------------------------------------------------------------------

  // Stremio's router changes the address with pushState, which fires no event: dx.bi listens for hashchange
  for (const method of ["pushState", "replaceState"]) {
    const original = history[method];
    history[method] = function (...args) {
      const result = original.apply(this, args);
      window.dispatchEvent(new Event("hashchange"));
      return result;
    };
  }

  // Stremio drops window.core on some screens: keep the first working copy
  const permanent = (window.__permanentCore = { getState: null, dispatch: null });
  let services;
  Object.defineProperty(window, "services", {
    configurable: true,
    get() { return services; },
    set(value) {
      services = value;
      const core = value && value.core;
      if (core && core.getState && !permanent.getState) permanent.getState = core.getState.bind(core);
      if (core && core.dispatch && !permanent.dispatch) permanent.dispatch = core.dispatch.bind(core);
    },
  });
  const core = () => {
    const live = window.core || (services && services.core);
    return {
      getState: (live && live.getState && live.getState.bind(live)) || permanent.getState,
      dispatch: (live && live.dispatch && live.dispatch.bind(live)) || permanent.dispatch,
    };
  };

  const schemas = {};
  const savedListeners = {};

  function readSettings(plugin) {
    try { return JSON.parse(native.getSettings(plugin) || "{}") || {}; } catch (_) { return {}; }
  }

  const api = {
    info: (plugin, message) => console.log(`[${plugin}]`, message),
    warn: (plugin, message) => console.warn(`[${plugin}]`, message),
    error: (plugin, message) => console.error(`[${plugin}]`, message),
    getSetting: async (plugin, key) => {
      const value = readSettings(plugin)[key];
      return value === undefined ? null : value;
    },
    getSettings: async (plugin) => readSettings(plugin),
    saveSetting: async (plugin, key, value) => {
      native.saveSetting(plugin, key, JSON.stringify(value === undefined ? null : value));
      const all = readSettings(plugin);
      for (const callback of savedListeners[plugin] || []) {
        try { callback(all); } catch (err) { console.error(err); }
      }
      return true;
    },
    // a promise, like Stremio Enhanced's (dx.bi chains on it: without one it stopped before loading
    // the TV's saved settings, so changes in dx.bi settings never took effect)
    registerSettings: async (plugin, schema) => { schemas[plugin] = schema; },
    onSettingsSaved: (plugin, callback) => { (savedListeners[plugin] = savedListeners[plugin] || []).push(callback); },
    showAlert: (type, title, message, buttons) => dialog({ title, message, buttons: buttons && buttons.length ? buttons : ["OK"] }),
    showPrompt: (plugin, title, message, defaultValue) => dialog({ title, message, buttons: ["OK", "Cancel"], input: defaultValue == null ? "" : String(defaultValue) })
      .then((r) => (r && r.button === 0 ? r.value : null)),
    // dx.bi's "Open in mpv / VLC" goes to the app's own player here
    launchExternalPlayer: async (player, url) => {
      native.play(JSON.stringify({ url, title: document.title || "dx.bi", hash: location.hash }));
      return { success: true };
    },
    getExternalPlayerPaths: async () => ({ vlc: null, mpv: null }),
    applyTheme: () => {},
    getGpuRenderer: async () => "auto",
    setGpuRenderer: async () => {},
  };
  window.StremioEnhancedAPI = api;

  // ---------------------------------------------------------------------------
  // Dialogs (alerts, prompts, settings): plain page elements, so the remote's arrows and OK work
  // ---------------------------------------------------------------------------
  const STYLE = `
    .dxtv-modal { position: fixed; inset: 0; z-index: 2147483600; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,.72); font-family: Inter, system-ui, sans-serif; }
    .dxtv-sheet { width: min(640px, 86vw); max-height: 84vh; overflow: auto; padding: 28px 30px; border-radius: 14px; background: #1c1c1c; color: #fff; box-shadow: 0 24px 80px rgba(0,0,0,.6); }
    .dxtv-sheet h2 { margin: 0 0 10px; font-size: 24px; font-weight: 700; }
    .dxtv-sheet p { margin: 0 0 18px; color: #c8c8c8; font-size: 16px; line-height: 1.5; white-space: pre-line; }
    .dxtv-sheet input[type=text] { width: 100%; box-sizing: border-box; margin: 0 0 18px; padding: 12px 14px; border: 2px solid #444; border-radius: 8px; background: #111; color: #fff; font-size: 17px; }
    .dxtv-sheet input[type=text]:focus { border-color: #fff; outline: none; }
    .dxtv-buttons { display: flex; flex-wrap: wrap; gap: 12px; justify-content: flex-end; }
    .dxtv-btn { padding: 11px 22px; border: 0; border-radius: 8px; background: rgba(255,255,255,.14); color: #fff; font: 600 16px Inter, system-ui, sans-serif; cursor: pointer; transition: transform .15s, background-color .15s; }
    .dxtv-btn:focus { outline: none; background: #fff; color: #000; transform: scale(1.06); }
    .dxtv-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; width: 100%; margin: 0 0 8px; padding: 14px 16px; border: 0; border-radius: 10px; background: rgba(255,255,255,.06); color: #fff; text-align: left; font: 500 16px Inter, system-ui, sans-serif; cursor: pointer; }
    .dxtv-group { margin: 22px 0 8px; font-size: 13px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #8d8d96; }
    .dxtv-sheet h2 + .dxtv-group { margin-top: 6px; }
    .dxtv-row:focus { outline: none; background: rgba(255,255,255,.18); transform: scale(1.015); }
    .dxtv-row small { display: block; margin-top: 4px; color: #9a9a9a; font-size: 13px; line-height: 1.4; }
    .dxtv-row b { flex: none; color: #e50914; font-weight: 700; }
    .dxtv-settings-entry { margin: 0 0 24px; }
    .dxtv-qr { display: block; width: 220px; height: 220px; margin: 0 auto 18px; border-radius: 8px; background: #fff; }
    /* No streaming server runs on the TV itself (debrid streams don't need one): no nagging bar */
    [class*="board-warning-container"] { display: none !important; }
    .dxtv-toast { position: fixed; left: 50%; bottom: 48px; z-index: 2147483600; transform: translateX(-50%); padding: 14px 22px; border-radius: 10px; background: rgba(20,20,20,.94); color: #fff; font: 500 16px Inter, system-ui, sans-serif; box-shadow: 0 10px 40px rgba(0,0,0,.5); }
  `;
  function ensureStyle() {
    if (document.getElementById("dxtv-style")) return;
    const style = document.createElement("style");
    style.id = "dxtv-style";
    style.textContent = STYLE;
    (document.head || document.documentElement).append(style);
  }

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let openModal = null;

  // Resolves with the button index (or { button, value } when there's an input); -1 when dismissed
  async function dialog({ title, message, buttons, input, qr }) {
    message = forDevice(message);
    ensureStyle();
    closeModal();
    // One dialog at a time: Stremio's own (a promotion, an addon to install) goes first, since it
    // holds on to the remote's focus while it's open
    while (document.querySelector('[class*="modal-container"]')) await new Promise((r) => setTimeout(r, 400));
    return new Promise((resolve) => {
      const el = document.createElement("div");
      el.className = "dxtv-modal";
      el.innerHTML = `<div class="dxtv-sheet" role="dialog">
        <h2>${esc(title)}</h2>${message ? `<p>${esc(String(message).replace(/<[^>]+>/g, ""))}</p>` : ""}
        ${qr ? `<svg class="dxtv-qr" viewBox="-4 -4 37 37" aria-hidden="true"><path d="${qr}"/></svg>` : ""}
        ${input != null ? `<input type="text" value="${esc(input)}">` : ""}
        <div class="dxtv-buttons">${buttons.map((b, i) => `<button class="dxtv-btn" data-i="${i}">${esc(b)}</button>`).join("")}</div>
      </div>`;
      const field = el.querySelector("input");
      const finish = (i) => {
        el.remove();
        if (openModal && openModal.el === el) openModal = null;
        resolve(input != null ? { button: i, value: field ? field.value : "" } : i);
      };
      el.addEventListener("click", (e) => {
        const b = e.target.closest("[data-i]");
        if (b) finish(Number(b.dataset.i));
      });
      document.body.append(el);
      openModal = { el, dismiss: () => finish(-1) };
      const first = field || el.querySelector(".dxtv-btn");
      first.focus();
      // a dialog of Stremio's that just closed hands focus back a moment later: take it again
      for (const ms of [150, 450]) setTimeout(() => { if (el.isConnected && !el.contains(document.activeElement)) first.focus(); }, ms);
    });
  }

  function closeModal() {
    if (openModal) openModal.dismiss();
  }

  function toast(text, ms = 4500) {
    ensureStyle();
    document.querySelectorAll(".dxtv-toast").forEach((n) => n.remove());
    const el = document.createElement("div");
    el.className = "dxtv-toast";
    el.textContent = text;
    document.body.append(el);
    setTimeout(() => el.remove(), ms);
  }

  // ---------------------------------------------------------------------------
  // Streaming server: a TV has none of its own, and torrents need one. dx.bi or Stremio running on
  // a computer on the same network has one (it listens on the network), so the app looks for it.
  // ---------------------------------------------------------------------------
  let serversWaiting = null;
  let playHereOnce = null; // the one stream chosen to play on this TV when no server turned up
  tv.serversFound = (urls) => {
    if (serversWaiting) serversWaiting(Array.isArray(urls) ? urls : []);
    serversWaiting = null;
  };
  const scanForServers = () => new Promise((resolve) => {
    serversWaiting = resolve;
    setTimeout(() => { if (serversWaiting === resolve) tv.serversFound([]); }, 25000);
    native.findServers();
  });

  async function useServer(url) {
    const { getState, dispatch } = core();
    if (!getState || !dispatch) return false;
    const ctx = await getState("ctx");
    const known = ((ctx && ctx.streamingServerUrls) || []).some((s) => (s && s.url ? s.url : s) === url);
    if (!known) dispatch({ action: "Ctx", args: { action: "AddServerUrl", args: url } });
    dispatch({ action: "Ctx", args: { action: "UpdateSettings", args: { ...ctx.profile.settings, streamingServerUrl: url } } });
    return true;
  }

  const serverName = (url) => /\/\/127\.0\.0\.1:/.test(url) ? "This TV (Stremio's app)" : url.replace(/^http:\/\/|\/$/g, "");

  // Resolves true once a server has been picked. `playHere`: a stream is waiting, so if there's no
  // server the choice to let this TV play it is still there
  async function findServer(playHere) {
    for (;;) {
      toast("Looking for dx.bi or Stremio on your network…", 6000);
      const urls = await scanForServers();
      document.querySelectorAll(".dxtv-toast").forEach((n) => n.remove());
      if (!urls.length) {
        const again = await dialog({
          title: "No streaming server found",
          message: "Open dx.bi or Stremio on a computer connected to the same network as this TV, leave it running, then try again. On Windows, it also has to be allowed through the firewall on private networks.\n\nDebrid streams play without a streaming server.",
          buttons: playHere ? ["Try again", "Play it on this TV", "Close"] : ["Try again", "Close"],
        });
        if (again === 0) continue;
        if (playHere && again === 1) playHere();
        return false;
      }
      const pick = await dialog({
        title: urls.length === 1 ? "Streaming server found" : "Streaming servers found",
        message: "Torrents will play through the one you pick. Keep it running while you watch.",
        buttons: [...urls.map(serverName), "Cancel"],
      });
      if (pick < 0 || pick >= urls.length) return false;
      const ok = await useServer(urls[pick]);
      toast(ok ? `Using the streaming server at ${serverName(urls[pick])}` : "Couldn't change the streaming server. Try again from Settings.", 5000);
      return ok;
    }
  }

  // Report a problem: a description typed with the remote, then the plugin's report goes to the developer
  const reportProblem = tv.reportProblem = async () => {
    const dx = window.__dxbi;
    if (!dx || !dx.report) { toast("dx.bi hasn't finished loading yet. Try again in a moment."); return; }
    const r = await dialog({
      title: "Report a problem",
      message: "What went wrong, and what were you doing? dx.bi adds its version, this TV's model, your settings, addon names and recent errors. No passwords, keys or stream links are sent.",
      buttons: ["Send report", "Cancel"],
      input: "",
    });
    if (!r || r.button !== 0) return;
    toast("Sending…", 8000);
    try {
      const code = await dx.report.send(r.value || "");
      document.querySelectorAll(".dxtv-toast").forEach((n) => n.remove());
      await dialog({ title: "Report sent", message: `Thanks! Your report code is ${code}.\nPost it in dx.bi's Discord (#bug-reports) so it can be matched to you.`, buttons: ["OK"] });
    } catch (err) {
      document.querySelectorAll(".dxtv-toast").forEach((n) => n.remove());
      await dialog({ title: "Couldn't send the report", message: (err && err.message) || "Try again in a moment.", buttons: ["OK"] });
    }
  };

  // Support dx.bi: many TVs have no browser, so a TV shows a code for the phone instead of a link
  const DONATE_URL = "https://buymeacoffee.com/notdxbi";
  const DONATE_QR = "M0 0h7v1h-7zM8 0h1v1h-1zM10 0h2v1h-2zM13 0h1v1h-1zM17 0h4v1h-4zM22 0h7v1h-7zM0 1h1v1h-1zM6 1h1v1h-1zM12 1h2v1h-2zM22 1h1v1h-1zM28 1h1v1h-1zM0 2h1v1h-1zM2 2h3v1h-3zM6 2h1v1h-1zM8 2h1v1h-1zM12 2h4v1h-4zM20 2h1v1h-1zM22 2h1v1h-1zM24 2h3v1h-3zM28 2h1v1h-1zM0 3h1v1h-1zM2 3h3v1h-3zM6 3h1v1h-1zM8 3h1v1h-1zM11 3h2v1h-2zM15 3h1v1h-1zM18 3h1v1h-1zM20 3h1v1h-1zM22 3h1v1h-1zM24 3h3v1h-3zM28 3h1v1h-1zM0 4h1v1h-1zM2 4h3v1h-3zM6 4h1v1h-1zM8 4h1v1h-1zM11 4h1v1h-1zM15 4h2v1h-2zM19 4h2v1h-2zM22 4h1v1h-1zM24 4h3v1h-3zM28 4h1v1h-1zM0 5h1v1h-1zM6 5h1v1h-1zM8 5h2v1h-2zM12 5h2v1h-2zM17 5h3v1h-3zM22 5h1v1h-1zM28 5h1v1h-1zM0 6h7v1h-7zM8 6h1v1h-1zM10 6h1v1h-1zM12 6h1v1h-1zM14 6h1v1h-1zM16 6h1v1h-1zM18 6h1v1h-1zM20 6h1v1h-1zM22 6h7v1h-7zM9 7h5v1h-5zM16 7h3v1h-3zM20 7h1v1h-1zM2 8h6v1h-6zM10 8h1v1h-1zM13 8h1v1h-1zM18 8h1v1h-1zM21 8h1v1h-1zM23 8h4v1h-4zM28 8h1v1h-1zM0 9h6v1h-6zM7 9h2v1h-2zM14 9h1v1h-1zM17 9h2v1h-2zM21 9h1v1h-1zM25 9h4v1h-4zM0 10h2v1h-2zM3 10h2v1h-2zM6 10h2v1h-2zM13 10h3v1h-3zM18 10h2v1h-2zM24 10h1v1h-1zM0 11h1v1h-1zM3 11h1v1h-1zM10 11h2v1h-2zM17 11h1v1h-1zM20 11h1v1h-1zM25 11h2v1h-2zM28 11h1v1h-1zM0 12h4v1h-4zM5 12h2v1h-2zM8 12h3v1h-3zM16 12h1v1h-1zM18 12h1v1h-1zM20 12h4v1h-4zM27 12h2v1h-2zM0 13h3v1h-3zM9 13h3v1h-3zM17 13h3v1h-3zM25 13h2v1h-2zM0 14h2v1h-2zM3 14h1v1h-1zM6 14h2v1h-2zM9 14h2v1h-2zM12 14h1v1h-1zM15 14h1v1h-1zM17 14h2v1h-2zM20 14h1v1h-1zM23 14h1v1h-1zM25 14h3v1h-3zM0 15h5v1h-5zM9 15h5v1h-5zM17 15h3v1h-3zM22 15h1v1h-1zM24 15h1v1h-1zM26 15h2v1h-2zM1 16h1v1h-1zM4 16h1v1h-1zM6 16h3v1h-3zM10 16h1v1h-1zM13 16h1v1h-1zM15 16h1v1h-1zM18 16h1v1h-1zM21 16h1v1h-1zM25 16h1v1h-1zM28 16h1v1h-1zM0 17h2v1h-2zM3 17h2v1h-2zM8 17h3v1h-3zM12 17h3v1h-3zM16 17h3v1h-3zM20 17h1v1h-1zM24 17h1v1h-1zM28 17h1v1h-1zM0 18h1v1h-1zM4 18h1v1h-1zM6 18h1v1h-1zM8 18h2v1h-2zM13 18h1v1h-1zM15 18h1v1h-1zM17 18h1v1h-1zM23 18h1v1h-1zM25 18h1v1h-1zM27 18h1v1h-1zM0 19h1v1h-1zM2 19h1v1h-1zM4 19h1v1h-1zM7 19h3v1h-3zM13 19h1v1h-1zM17 19h1v1h-1zM19 19h1v1h-1zM22 19h2v1h-2zM26 19h1v1h-1zM28 19h1v1h-1zM0 20h2v1h-2zM4 20h1v1h-1zM6 20h2v1h-2zM10 20h2v1h-2zM13 20h3v1h-3zM17 20h1v1h-1zM19 20h7v1h-7zM27 20h1v1h-1zM9 21h1v1h-1zM13 21h2v1h-2zM17 21h2v1h-2zM20 21h1v1h-1zM24 21h1v1h-1zM26 21h1v1h-1zM0 22h7v1h-7zM8 22h2v1h-2zM13 22h1v1h-1zM17 22h1v1h-1zM19 22h2v1h-2zM22 22h1v1h-1zM24 22h1v1h-1zM26 22h3v1h-3zM0 23h1v1h-1zM6 23h1v1h-1zM8 23h4v1h-4zM13 23h2v1h-2zM16 23h5v1h-5zM24 23h3v1h-3zM0 24h1v1h-1zM2 24h3v1h-3zM6 24h1v1h-1zM8 24h3v1h-3zM13 24h2v1h-2zM17 24h8v1h-8zM26 24h1v1h-1zM28 24h1v1h-1zM0 25h1v1h-1zM2 25h3v1h-3zM6 25h1v1h-1zM8 25h1v1h-1zM11 25h2v1h-2zM14 25h1v1h-1zM16 25h1v1h-1zM21 25h2v1h-2zM25 25h3v1h-3zM0 26h1v1h-1zM2 26h3v1h-3zM6 26h1v1h-1zM8 26h1v1h-1zM12 26h1v1h-1zM14 26h1v1h-1zM16 26h3v1h-3zM20 26h3v1h-3zM24 26h3v1h-3zM28 26h1v1h-1zM0 27h1v1h-1zM6 27h1v1h-1zM11 27h1v1h-1zM15 27h1v1h-1zM19 27h3v1h-3zM23 27h5v1h-5zM0 28h7v1h-7zM9 28h1v1h-1zM13 28h1v1h-1zM17 28h1v1h-1zM20 28h2v1h-2zM25 28h1v1h-1z";
  const donate = () => {
    if (PHONE) { native.openExternal(DONATE_URL); return; }
    dialog({ title: "Support dx.bi", message: "Scan this with your phone, or go to buymeacoffee.com/notdxbi", qr: DONATE_QR, buttons: ["Done"] });
  };

  // dx.bi's settings: an entry at the top of Stremio's Settings, opening a list made for the remote
  // Options for dx.bi's in-page player, which the TV doesn't use (it has its own player)
  const DESKTOP_ONLY = new Set(["playerExtras", "enhance", "seekPreviews", "subtitleStyle", "subtitleFont", "subtitleCustomFont",
    "convertVideo", "subtitlesStart", "hdrSubtitles", "pictureSound", "streamStats", "preloadNext", "skipFiller",
    "rememberPlayback", "playerKeys", "pip", "externalPlayer", "remainingTime"]);

  function settingsSheet() {
    const plugin = PLUGIN.replace(/\.plugin\.js$/, "");
    // (no remote on a phone, so no highlight for it)
    const schema = (schemas[plugin] || []).filter((o) => !DESKTOP_ONLY.has(o.key) && !(PHONE && o.key === "focusColour"))
      .map((o) => ({ ...o, label: forDevice(o.label), description: forDevice(o.description) }));
    ensureStyle();
    closeModal();
    const el = document.createElement("div");
    el.className = "dxtv-modal";
    const values = () => readSettings(plugin);
    const shown = (o, v) => {
      if (o.type === "toggle") return v ? "On" : "Off";
      if (o.type === "select") return ((o.options || []).find((x) => x.value === v) || {}).label || v;
      return v ? "Set" : "Not set";
    };
    const render = (focusKey) => {
      const current = values();
      el.innerHTML = `<div class="dxtv-sheet" role="dialog"><h2>dx.bi settings</h2>
        ${schema.map((o, i) => {
          const v = current[o.key] === undefined ? o.defaultValue : current[o.key];
          // a heading wherever a new group of settings starts
          const heading = o.group && o.group !== (schema[i - 1] || {}).group ? `<h3 class="dxtv-group">${esc(o.group)}</h3>` : "";
          return `${heading}<button class="dxtv-row" data-key="${esc(o.key)}"><span>${esc(o.label)}${o.description ? `<small>${esc(o.description)}</small>` : ""}</span><b>${esc(shown(o, v))}</b></button>`;
        }).join("")}
        <div class="dxtv-buttons"><button class="dxtv-btn" data-close>Done</button></div></div>`;
      const target = (focusKey && el.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)) || el.querySelector(".dxtv-row, .dxtv-btn");
      if (target) target.focus();
    };
    el.addEventListener("click", async (e) => {
      if (e.target.closest("[data-close]")) { closeModal(); return; }
      const row = e.target.closest("[data-key]");
      if (!row) return;
      const o = schema.find((x) => x.key === row.dataset.key);
      const current = values();
      const v = current[o.key] === undefined ? o.defaultValue : current[o.key];
      if (o.type === "toggle") {
        await api.saveSetting(plugin, o.key, !v);
      } else if (o.type === "select") {
        const options = o.options || [];
        const next = options[(options.findIndex((x) => x.value === v) + 1) % options.length];
        if (next) await api.saveSetting(plugin, o.key, next.value);
      } else {
        el.style.display = "none";
        openModal = null;
        const r = await dialog({ title: o.label, message: o.description || "", buttons: ["Save", "Cancel"], input: v || "" });
        el.style.display = "";
        openModal = { el, dismiss: () => { el.remove(); openModal = null; } };
        if (r && r.button === 0) await api.saveSetting(plugin, o.key, r.value.trim());
      }
      render(o.key);
    });
    document.body.append(el);
    openModal = { el, dismiss: () => { el.remove(); openModal = null; } };
    render();
  }

  function ensureSettingsEntry() {
    if (!/^#\/settings/.test(location.hash)) return;
    // also in Settings' own list (General, Interface… Shortcuts), where people look for it
    const shortcuts = document.querySelector('[class*="settings-container"] [data-section="shortcuts"], [class*="settings-content"] [data-section="shortcuts"]');
    if (shortcuts && !shortcuts.parentElement.querySelector(".dxtv-side")) {
      const side = document.createElement("div");
      side.className = `${shortcuts.className} dxtv-side`;
      side.tabIndex = 0;
      side.title = "dx.bi";
      side.textContent = "dx.bi";
      side.addEventListener("click", settingsSheet);
      side.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); settingsSheet(); } });
      shortcuts.after(side);
    }
    const content = document.querySelector('[class*="settings-content"] [class*="sections-container"]');
    if (!content || content.querySelector(".dxtv-settings-entry")) return;
    ensureStyle();
    const entry = document.createElement("button");
    entry.className = "dxtv-row dxtv-settings-entry";
    entry.innerHTML = `<span>dx.bi settings<small>Look, Home rows, previews, trailers, reviews, sounds and more</small></span><b>Open</b>`;
    entry.addEventListener("click", settingsSheet);
    const problem = document.createElement("button");
    problem.className = "dxtv-row dxtv-settings-entry";
    problem.innerHTML = `<span>Report a problem<small>Sends dx.bi's developer the details that help fix it (no passwords, keys or stream links)</small></span><b>Report</b>`;
    problem.addEventListener("click", reportProblem);
    const server = document.createElement("button");
    server.className = "dxtv-row dxtv-settings-entry";
    server.innerHTML = forDevice(`<span>Streaming server for torrents<small>Torrents play through dx.bi or Stremio running on a computer on your network, or on this TV if you switch on Play torrents on this TV (dx.bi settings). Debrid streams don't need either</small></span><b>Find</b>`);
    server.addEventListener("click", () => findServer());
    const who = document.createElement("button");
    who.className = "dxtv-row dxtv-settings-entry";
    who.innerHTML = `<span>Who's watching?<small>Add viewers and switch between them. Each viewer has their own library and Continue Watching</small></span><b>Open</b>`;
    who.addEventListener("click", () => { if (window.__dxbi && window.__dxbi.whoIsWatching) window.__dxbi.whoIsWatching.open(); });
    const layout = document.createElement("button");
    layout.className = "dxtv-row dxtv-settings-entry";
    layout.innerHTML = `<span>Customise Home<small>Move, hide or rename Home's rows, whichever addon they come from</small></span><b>Open</b>`;
    layout.addEventListener("click", () => { if (window.__dxbi && window.__dxbi.homeLayout) window.__dxbi.homeLayout.open(); });
    const support = document.createElement("button");
    support.className = "dxtv-row dxtv-settings-entry";
    support.innerHTML = `<span>Support dx.bi<small>dx.bi is free. If you enjoy it, you can buy its developer a coffee</small></span><b>Open</b>`;
    support.addEventListener("click", donate);
    content.prepend(entry, who, layout, server, problem, support);
  }

  // ---------------------------------------------------------------------------
  // Playback: every stream plays in the app's native player. Stremio's own player screen stays
  // underneath, silent, so its watch progress (Continue Watching, watched marks) keeps working.
  // ---------------------------------------------------------------------------
  let handoff = null; // { hash, video id } of the stream the native player has

  // Stremio's in-page video never plays while the native player has the stream
  const realPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (handoff && /^#\/player\//.test(location.hash)) {
      this.muted = true;
      try { this.pause(); } catch (_) { /* not ready */ }
      return Promise.resolve();
    }
    return realPlay.apply(this, arguments);
  };

  function silenceWebPlayer() {
    document.querySelectorAll('[class*="player-container"] video').forEach((v) => {
      v.muted = true;
      if (!v.paused) v.pause();
    });
  }

  function dispatch(action) {
    const d = core().dispatch;
    if (!d) return;
    try { d(action, "player"); } catch (err) { console.warn("[dx.bi TV] dispatch failed", err); }
  }

  async function playerState() {
    const get = core().getState;
    if (!get) return null;
    try { return await get("player"); } catch (_) { return null; }
  }

  function subtitleLabel(lang) {
    try { return new Intl.DisplayNames(["en"], { type: "language" }).of(lang) || lang; } catch (_) { return lang; }
  }

  // Stremio's own settings (Settings → Player): the languages to start a video in
  async function profileSettings() {
    try {
      const ctx = await core().getState("ctx");
      return (ctx && ctx.profile && ctx.profile.settings) || {};
    } catch (_) {
      return {};
    }
  }

  // Addons can offer dozens of subtitle files: keep up to three per language, with the Stremio
  // subtitle language (and English) first, so the TV's subtitle menu stays short
  async function pickSubtitles(list) {
    const preferred = (await profileSettings()).subtitlesLanguage || "";
    const rank = (lang) => (lang === preferred ? 0 : /^(eng|en)$/.test(lang) ? 1 : 2);
    const count = {};
    const out = [];
    for (const sub of list.filter((x) => x && x.url).sort((a, b) => rank(a.lang || "") - rank(b.lang || ""))) {
      const lang = sub.lang || "";
      count[lang] = (count[lang] || 0) + 1;
      if (count[lang] > 3) continue;
      // "English", "English 2", "English 3"
      out.push({ url: sub.url, lang, label: subtitleLabel(lang) + (count[lang] > 1 ? ` ${count[lang]}` : "") });
      if (out.length >= 45) break;
    }
    return out;
  }

  // Whether Stremio's streaming server (on this TV, or a computer picked in Settings) is answering
  async function streamingServerUp() {
    try {
      const s = await core().getState("streaming_server");
      return !!(s && s.settings && s.settings.type === "Ready");
    } catch (_) {
      return false;
    }
  }

  async function startHandoff() {
    const hash = location.hash;
    if (!/^#\/player\//.test(hash) || (handoff && handoff.hash === hash)) return;
    handoff = { hash, pending: true };
    let state = null;
    // With no streaming server online, torrents play on the TV itself: nothing to wait for
    const serverUp = await streamingServerUp();
    // The player screen fills in over a moment: wait until the stream is known, and give the
    // title's details (name, episode, saved position) a few seconds more to arrive
    let known = 0;
    for (let i = 0; i < 60 && location.hash === hash; i++) {
      state = await playerState();
      const stream = state && state.selected && state.selected.stream;
      if (stream && stream.ytId) break;
      const streamKnown = stream && (stream.url || (state.stream && state.stream.type === "Ready") || stream.infoHash || stream.externalUrl);
      if (streamKnown) {
        known++;
        const metaReady = state.metaItem && state.metaItem.type !== "Loading";
        // A torrent's address comes from the streaming server, which can take a while to answer:
        // wait for it (up to ~10 s) before saying there's no server
        const waitingForServer = serverUp && !stream.url && stream.infoHash && !(state.stream && /^(Ready|Err)$/.test(state.stream.type));
        if ((metaReady && state.libraryItem !== undefined && !waitingForServer) || known >= (waitingForServer ? 40 : 12)) break;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    if (location.hash !== hash || !state || !state.selected) { handoff = null; return; }
    const stream = state.selected.stream || {};
    // Trailers are YouTube videos, which Stremio plays through a streaming server (none on a TV).
    // dx.bi's trailer player shows them; only one whose owner forbids embedding goes to the YouTube app
    if (stream.ytId) {
      const youtube = () => native.openExternal(`https://www.youtube.com/watch?v=${encodeURIComponent(stream.ytId)}`);
      const dx = window.__dxbi;
      const meta = state.metaItem && state.metaItem.type === "Ready" ? state.metaItem.content : {};
      handoff = null;
      if (dx && dx.openTrailer) dx.openTrailer({ id: stream.ytId, start: 0, title: meta.name || "Trailer", logo: meta.logo, onFail: youtube });
      else youtube();
      history.back();
      return;
    }
    silenceWebPlayer();

    const ready = state.stream && state.stream.type === "Ready" && state.stream.content;
    // (for a torrent, Stremio gives a streaming server address even when none is running)
    let url = (ready && ready.url && (serverUp || !stream.infoHash) ? ready.url : null) || stream.url || null;
    // A torrent and no streaming server. dx.bi TV can download it itself, but only when that's switched
    // on in dx.bi settings (off by default: debrid, or a computer's streaming server, is the usual way);
    // otherwise the choice is offered for this stream
    let torrent = false;
    if (!url && stream.infoHash) {
      let onTv = playHereOnce === hash || readSettings(PLUGIN.replace(/\.plugin\.js$/, "")).tvTorrents === true;
      playHereOnce = null;
      if (!onTv) {
        const choice = await dialog({
          title: "This stream needs a streaming server",
          message: "It's a torrent, and this TV has no streaming server. Use the one in dx.bi or Stremio on a computer on your network, or let this TV download it itself (it connects to other people sharing the file).\n\nDebrid streams play without either. To always play torrents on this TV: dx.bi settings → Play torrents on this TV.",
          buttons: ["Find one on my network", "Play it on this TV", "Cancel"],
        });
        if (choice === 1 && location.hash === hash) onTv = true;
        else {
          handoff = null;
          if (location.hash === hash) history.back();
          if (choice === 0) findServer(() => { playHereOnce = hash; location.hash = hash; });
          return;
        }
      }
      // (an addon's "sources" reach the player as "announce")
      const trackers = [...(stream.announce || []), ...(stream.sources || [])].filter((x) => /^tracker:/.test(x)).map((x) => x.replace(/^tracker:/, ""));
      const name = (stream.behaviorHints && stream.behaviorHints.filename) || "";
      url = native.torrentUrl(JSON.stringify({ infoHash: stream.infoHash, fileIdx: Number.isInteger(stream.fileIdx) ? stream.fileIdx : -1, trackers, name })) || null;
      torrent = !!url;
      if (!url) {
        handoff = null;
        history.back();
        toast("Couldn't start the torrent. Try another stream.", 5000);
        return;
      }
    }
    if (!url && stream.externalUrl) {
      native.openExternal(stream.externalUrl);
      handoff = null;
      history.back();
      return;
    }
    if (!url) { handoff = null; return; }

    const meta = state.metaItem && state.metaItem.type === "Ready" ? state.metaItem.content : (state.metaItem && state.metaItem.content) || {};
    const videoId = state.selected.streamRequest && state.selected.streamRequest.path && state.selected.streamRequest.path.id;
    const video = (meta.videos || []).find((v) => v.id === videoId);
    const lib = state.libraryItem && state.libraryItem.state;
    const resumeMs = lib && lib.video_id === videoId && lib.timeOffset > 0 ? lib.timeOffset : 0;
    const headers = (stream.behaviorHints && stream.behaviorHints.proxyHeaders && stream.behaviorHints.proxyHeaders.request) || {};
    // the stream's own subtitle files first, then the subtitle addons'
    const subtitles = await pickSubtitles([...(stream.subtitles || []), ...(state.subtitles || [])]);
    const episode = video && video.season != null ? `S${video.season} E${video.episode}${video.title || video.name ? ` · ${video.title || video.name}` : ""}` : "";

    const profile = await profileSettings();
    // Skip intro / recap / credits: the times dx.bi has for this episode (looked up while the player
    // gets ready, never holding it up for long)
    const metaPath = state.selected.metaRequest && state.selected.metaRequest.path;
    const dx = window.__dxbi;
    const skips = dx && dx.skipSegments && videoId
      ? await Promise.race([dx.skipSegments(meta.type || (metaPath && metaPath.type), meta.id || (metaPath && metaPath.id), videoId).catch(() => []), new Promise((r) => setTimeout(() => r([]), 4000))])
      : [];
    if (location.hash !== hash) { handoff = null; return; }
    handoff = { hash, videoId, started: Date.now() };
    tv.partyVideo = new NativeVideo();
    partySeen = "";
    native.play(JSON.stringify({
      hash,
      videoId,
      skips,
      torrent,
      autoSkip: (dx && dx.settings && dx.settings.autoSkip) || "off",
      clock: !(dx && dx.settings) || dx.settings.playerClock !== false,
      accent: await accentFor(meta),
      next: nextLink(state) ? { title: nextTitle(state.nextVideo), thumbnail: state.nextVideo.thumbnail || "" } : null,
      upNext: (dx && dx.settings && dx.settings.upNext) || "10",
      audioLanguage: profile.audioLanguage || "",
      // Stremio's subtitle settings (Settings → Player), drawn the same way by the native player
      subtitleStyle: {
        size: profile.subtitlesSize,
        offset: profile.subtitlesOffset,
        bold: profile.subtitlesBold,
        text: profile.subtitlesTextColor,
        background: profile.subtitlesBackgroundColor,
        outline: profile.subtitlesOutlineColor,
        opacity: profile.subtitlesOpacity,
      },
      url,
      title: meta.name || state.title || stream.title || "dx.bi",
      subtitle: episode,
      startMs: resumeMs,
      headers,
      subtitles,
      background: meta.background || meta.poster || "",
    }));
  }

  // Watch party: the party works with a video element, so it gets this stand-in for the native player
  class NativeVideo extends EventTarget {
    constructor() {
      super();
      Object.assign(this, { time: 0, length: NaN, stopped: true, rate: 1, buffering: true, seeking: false, checked: 0 });
    }
    get currentTime() { return this.time; }
    set currentTime(s) {
      this.time = s;
      native.control({ cmd: "seek", ms: Math.round(s * 1000) });
    }
    get duration() { return this.length; }
    get paused() { return this.stopped; }
    get readyState() { return this.buffering ? 2 : 4; }
    get playbackRate() { return this.rate; }
    set playbackRate(r) {
      this.rate = r;
      native.control({ cmd: "rate", rate: r });
    }
    play() {
      native.control({ cmd: "play" });
      return Promise.resolve();
    }
    pause() { native.control({ cmd: "pause" }); }
    // The native player's latest: plays, pauses and jumps show as the events a video would fire
    update(ms, durationMs, paused, buffering, rate) {
      const now = Date.now();
      const expected = this.time + (this.stopped ? 0 : ((now - this.checked) / 1000) * this.rate);
      const jumped = this.checked && Math.abs(ms / 1000 - expected) > 1.5;
      const changed = paused !== this.stopped;
      Object.assign(this, { time: ms / 1000, length: durationMs > 0 ? durationMs / 1000 : NaN, stopped: paused, buffering, checked: now });
      this.rate = rate;
      if (jumped) {
        this.dispatchEvent(new Event("seeking"));
        this.dispatchEvent(new Event("seeked"));
      }
      if (changed) this.dispatchEvent(new Event(paused ? "pause" : "play"));
      this.dispatchEvent(new Event("timeupdate"));
    }
  }

  tv.partyToast = (text) => native.control({ cmd: "toast", text });
  tv.onPartyTick = (ms, durationMs, paused, buffering, rate) => {
    if (tv.partyVideo) tv.partyVideo.update(ms, durationMs, paused, buffering, rate);
  };
  // Who's in the party, for the player's Party button (and a stream changed by the host: the player
  // on screen closes, and the new one opens)
  let partySeen = "";
  setInterval(() => {
    if (!handoff || !handoff.started || !window.__dxbi || !window.__dxbi.partyInfo) return;
    if (handoff.hash !== location.hash) {
      handoff = null;
      native.control({ cmd: "close" });
      return;
    }
    const info = window.__dxbi.partyInfo();
    const now = JSON.stringify(info);
    if (now === partySeen) return;
    partySeen = now;
    native.control({ cmd: "party", on: !!info, code: info ? info.code : "", people: info ? info.people : [] });
  }, 1000);

  // The native player reports where it is every few seconds, and once more when it closes
  tv.onProgress = (timeMs, durationMs, paused) => {
    if (!handoff || !/^#\/player\//.test(location.hash)) return;
    silenceWebPlayer();
    dispatch({ action: "Player", args: { action: "TimeChanged", args: { time: Math.max(0, Math.round(timeMs)), duration: Math.max(0, Math.round(durationMs)), device: "dxbi-tv" } } });
    dispatch({ action: "Player", args: { action: "PausedChanged", args: { paused: !!paused } } });
  };

  // The title's own colour for the player's seek bar when dx.bi has one quickly, else the accent
  async function accentFor(meta) {
    const dx = window.__dxbi;
    const colour = dx && dx.titleColourOf
      ? await Promise.race([dx.titleColourOf(meta.background || meta.poster), new Promise((r) => setTimeout(r, 900))]).catch(() => "")
      : "";
    return colour || getComputedStyle(document.documentElement).getPropertyValue("--dx-accent").trim();
  }

  const nextTitle = (v) => `S${v.season} · E${v.episode}${v.title || v.name ? ` · ${v.title || v.name}` : ""}`;

  // The next episode's list of streams, or its own player screen
  function nextLink(state) {
    const links = state && state.nextVideo && state.nextVideo.deepLinks;
    return links && (links.player || links.metaDetailsStreams);
  }

  // Straight into the next episode with the same release, as on a computer, when one is found quickly
  async function nextLinkFor(state) {
    const dx = window.__dxbi;
    const sel = state && state.selected;
    const mp = sel && sel.metaRequest && sel.metaRequest.path;
    if (dx && dx.findStream && mp && state.nextVideo) {
      const media = { type: mp.type, metaId: mp.id, videoId: state.nextVideo.id, hints: dx.streamHints(sel.stream) };
      const found = await Promise.race([dx.findStream(media, () => true), new Promise((r) => setTimeout(r, 8000))]).catch(() => null);
      if (found && found.link) return found.link.startsWith("#") ? found.link : `#${found.link}`;
    }
    return nextLink(state);
  }

  async function closeHandoff(timeMs, durationMs, ended, error, next) {
    tv.partyVideo = null;
    if (handoff && /^#\/player\//.test(location.hash)) {
      if (timeMs > 0) tv.onProgress(timeMs, durationMs, true);
      if (ended) dispatch({ action: "Player", args: { action: "Ended" } });
      handoff = null;
      const link = next && await nextLinkFor(await playerState());
      if (link) location.replace(link);
      else history.back();
    } else {
      handoff = null;
    }
    // A stream dx.bi picked by itself: on to the next best before asking the viewer to choose
    const dx = window.__dxbi;
    if (error && dx && dx.quickPlayNext) {
      await new Promise((r) => setTimeout(r, 500));
      const label = dx.quickPlayNext();
      if (label) return toast(`That stream didn't play. Trying ${label}.`, 5000);
    }
    if (error) toast(`This stream couldn't play: ${error}. Try another one.`, 7000);
  }

  // The native player closed: the app keeps how (see PlaybackBus) until the page takes it
  let resuming = false;
  tv.playerClosed = () => {
    if (resuming) return; // picked up once the restarted page is back on the player screen
    const raw = native.takePendingClose();
    if (!raw) return;
    try {
      const c = JSON.parse(raw);
      closeHandoff(c.timeMs, c.durationMs, c.ended, c.error, c.next);
    } catch (err) {
      console.warn("[dx.bi TV] couldn't read how the player closed", err);
    }
  };

  // Android restarted the page while a video played (TVs short of memory): go back to that video's
  // player screen, silently, so its watch progress is still recorded, and finish up if it has closed
  async function resumePlayback() {
    let target = null;
    try {
      const active = native.activePlayback();
      const closed = active ? null : native.takePendingClose();
      const info = JSON.parse(active || closed || "null");
      if (info && /^#\/player\//.test(info.hash || "")) target = { info, closed };
    } catch (_) { /* nothing to pick up */ }
    if (!target) return;
    const { info, closed } = target;
    resuming = true;
    handoff = { hash: info.hash, videoId: info.videoId || null, started: Date.now(), resumed: true };
    if (location.hash !== info.hash) location.hash = info.hash;
    // Stremio needs a moment to load the player screen before it takes progress
    for (let i = 0; i < 60 && location.hash === info.hash; i++) {
      const state = await playerState();
      if (state && state.selected) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    silenceWebPlayer();
    resuming = false;
    if (closed) {
      closeHandoff(info.timeMs, info.durationMs, info.ended, info.error, info.next);
    } else {
      tv.playerClosed(); // it may have closed while we waited
    }
  }

  // ---------------------------------------------------------------------------
  // The remote's Back button: closes what's open, otherwise goes back a screen.
  // Returns false on Home, where the app decides (it leaves).
  // ---------------------------------------------------------------------------
  tv.back = () => {
    if (openModal) { closeModal(); return true; }
    const who = window.__dxbi && window.__dxbi.whoIsWatching;
    if (who && who.el) { who.back(); return true; }
    const sheet = document.querySelector(".dxe-modal");
    if (sheet) {
      const close = sheet.querySelector("[data-act=close]");
      if (close) close.click(); else sheet.remove();
      return true;
    }
    if (window.__dxbi && typeof window.__dxbi.closeTrailer === "function" && window.__dxbi.closeTrailer()) return true;
    if (window.__dxbi && typeof window.__dxbi.closeParty === "function" && window.__dxbi.closeParty()) return true;
    if (window.__dxbi && typeof window.__dxbi.closePreview === "function" && window.__dxbi.closePreview()) return true;
    // Stremio's own dialogs (addon install, promotions…) close with their × button
    const stremioModal = document.querySelector('[class*="modal-container"]');
    if (stremioModal) {
      const close = stremioModal.querySelector('[class*="close-button"]');
      if (close) { close.click(); return true; }
    }
    const menu = document.querySelector('[class*="menu-container"][class*="open"], [class*="popup-menu-container"]');
    if (menu) {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      return true;
    }
    const route = (location.hash || "#/").replace(/^#\/?/, "").split(/[/?]/)[0];
    if (!route || route === "board") return false;
    history.back();
    return true;
  };

  // ---------------------------------------------------------------------------
  // Load the built-in dx.bi plugin once the page is up, the way Stremio Enhanced does
  // ---------------------------------------------------------------------------
  function loadPlugin() {
    if (document.getElementById(PLUGIN)) return;
    const source = native.pluginSource();
    if (!source) return;
    const base = PLUGIN.replace(/\.plugin\.js$/, "");
    const script = document.createElement("script");
    script.id = PLUGIN;
    script.textContent = `(function () {
      const StremioEnhancedAPI = {
        logger: {
          info: (m) => window.StremioEnhancedAPI.info(${JSON.stringify(base)}, m),
          warn: (m) => window.StremioEnhancedAPI.warn(${JSON.stringify(base)}, m),
          error: (m) => window.StremioEnhancedAPI.error(${JSON.stringify(base)}, m),
        },
        getSetting: (key) => window.StremioEnhancedAPI.getSetting(${JSON.stringify(base)}, key),
        saveSetting: (key, value) => window.StremioEnhancedAPI.saveSetting(${JSON.stringify(base)}, key, value),
        registerSettings: (schema) => window.StremioEnhancedAPI.registerSettings(${JSON.stringify(base)}, schema),
        onSettingsSaved: (cb) => window.StremioEnhancedAPI.onSettingsSaved(${JSON.stringify(base)}, cb),
        showAlert: window.StremioEnhancedAPI.showAlert,
        showPrompt: (t, m, d) => window.StremioEnhancedAPI.showPrompt(${JSON.stringify(base)}, t, m, d),
      };
      try {
        ${source}
      } catch (err) {
        console.error("[dx.bi TV] plugin crashed", err);
      }
    })();`;
    document.body.append(script);
  }

  // Text boxes (Search, an episode list's search): the TV's keyboard opened the moment the
  // selection reached one and took over the arrows, so the remote seemed stuck. A box is just a
  // stop on the way until OK is pressed on it; then the keyboard opens.
  // (only for the remote: a tap on a phone or tablet has no OK to press, so it types straight away)
  const typable = (t) => t && t.tagName === "INPUT" && !/^(checkbox|radio|button|submit|reset|color|file|range|hidden)$/.test(t.type);
  let lastTouch = 0;
  window.addEventListener("pointerdown", () => { lastTouch = Date.now(); }, true);
  window.addEventListener("focusin", (e) => {
    const t = e.target;
    if (!typable(t) || t.readOnly || t.dataset.dxtvTyping || t.closest(".dxtv-modal")) return;
    if (Date.now() - lastTouch < 1000) return;
    t.readOnly = true;
    t.dataset.dxtvLocked = "1";
  }, true);
  window.addEventListener("focusout", (e) => {
    const t = e.target;
    if (!t || !t.dataset) return;
    if (t.dataset.dxtvLocked) {
      t.readOnly = false;
      delete t.dataset.dxtvLocked;
    }
    delete t.dataset.dxtvTyping;
  }, true);
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (e.key !== "Enter" || !typable(t) || !t.dataset.dxtvLocked) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    t.blur();
    t.dataset.dxtvTyping = "1";
    t.focus();
    t.click(); // what makes Android bring up its keyboard
  }, true);

  // An actor's or director's name on a title opens Search with the name filled in. Stremio then
  // puts the cursor in the search box, and the TV's keyboard covered the results: the results get
  // the remote instead (Up still reaches the box to type)
  let searchWatch = 0;
  function resultsFirst() {
    clearInterval(searchWatch);
    const since = Date.now();
    searchWatch = setInterval(() => {
      if (!/^#\/search\?search=./.test(location.hash) || Date.now() - since > 4000) {
        clearInterval(searchWatch);
        return;
      }
      const field = document.activeElement;
      const first = document.querySelector('#app [class*="search-content"] [class*="meta-item-container"] a[href], #app [class*="search-content"] [class*="meta-item-container"] [tabindex]');
      if (field && field.tagName === "INPUT") field.blur();
      if (first) {
        first.focus({ preventScroll: true });
        clearInterval(searchWatch);
      }
    }, 100);
  }

  function onRoute() {
    ensureSettingsEntry();
    if (/^#\/player\//.test(location.hash)) startHandoff();
    if (/^#\/search\?search=./.test(location.hash) && document.activeElement && document.activeElement.tagName !== "INPUT") resultsFirst();
  }

  window.addEventListener("hashchange", onRoute);
  const start = () => {
    ensureStyle();
    loadPlugin();
    resumePlayback();
    onRoute();
    new MutationObserver(ensureSettingsEntry).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === "complete") start();
  else window.addEventListener("load", start);
})();
