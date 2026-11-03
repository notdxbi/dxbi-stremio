// dx.bi — Copyright (C) 2026 dx.bi. GNU General Public License, version 3 or later (see LICENSE).
// dx.bi phone app: the page as an engine. Runs next to dxbi-tv.js in web.stremio.com, which keeps
// doing Stremio's work (account, addons, library, finding streams) while the app's native screens
// show it. Native asks through __dxbiEngine.handle({id, op, args}); the answers, and the models it
// watches as they change, go back through DxbiTV.engine as compact JSON (only what the screens use).
(function () {
  "use strict";
  if (window.__dxbiEngine) return;
  const TOKEN = "__DXBI_TV_TOKEN__";
  const bridge = window.DxbiTV;
  if (!bridge || !bridge.engine) return;
  const send = (message) => {
    try { bridge.engine(TOKEN, JSON.stringify(message)); } catch (err) { console.warn("[dx.bi engine] send failed", err); }
  };

  // Stremio's core runs in a worker: window.core appears once it has started, and every call is a Promise
  const core = () => window.core;
  const coreReady = new Promise((resolve) => {
    const look = () => (core() && core().getState ? resolve() : setTimeout(look, 100));
    look();
  });

  // ---------------------------------------------------------------------------
  // Views: what each model looks like to the native screens
  // ---------------------------------------------------------------------------
  const loadable = (l) => (!l ? "None" : l.type);
  const linksOf = (links, category) => (links || []).filter((l) => l.category === category).map((l) => l.name);
  const imdbOf = (links) => {
    const l = (links || []).find((x) => x.category === "imdb");
    return l ? l.name : null;
  };

  function preview(m) {
    return {
      id: m.id,
      type: m.type,
      name: m.name,
      poster: m.poster || null,
      background: m.background || null,
      logo: m.logo || null,
      shape: m.posterShape || "poster",
      year: m.releaseInfo || null,
      runtime: m.runtime || null,
      imdb: imdbOf(m.links),
      genres: linksOf(m.links, "Genres"),
      description: m.description || null,
      inLibrary: !!m.inLibrary,
      watched: !!m.watched,
      trailer: (m.trailerStreams && m.trailerStreams[0] && m.trailerStreams[0].ytId) || null,
    };
  }

  function catalogs(state) {
    return {
      catalogs: (state.catalogs || []).map((c, index) => ({
        index,
        // the key Customise Home saves rows under
        key: `${(c.addon && c.addon.manifest && c.addon.manifest.id) || ""}/${c.type}/${c.id}`,
        id: c.id,
        name: c.name,
        type: c.type,
        addon: (c.addon && c.addon.manifest && c.addon.manifest.name) || "",
        // Discover for this row (See All)
        discover: (c.deepLinks && c.deepLinks.discover) || null,
        state: loadable(c.content),
        items: c.content && c.content.type === "Ready" ? c.content.content.map(preview) : [],
      })),
    };
  }

  function stream(s) {
    const hints = s.behaviorHints || {};
    return {
      name: s.name || "",
      description: s.description || s.title || "",
      url: s.url || null,
      infoHash: s.infoHash || null,
      ytId: s.ytId || null,
      externalUrl: s.externalUrl || null,
      filename: hints.filename || null,
      bingeGroup: hints.bingeGroup || null,
      headers: (hints.proxyHeaders && hints.proxyHeaders.request) || null,
      progress: s.progress || null,
      play: (s.deepLinks && s.deepLinks.player) || null,
    };
  }

  function addon(a) {
    const m = a.manifest || {};
    const hints = m.behaviorHints || {};
    return {
      transportUrl: a.transportUrl,
      id: m.id,
      name: m.name || m.id || "",
      version: m.version || "",
      description: m.description || "",
      logo: m.logo || null,
      types: m.types || [],
      official: !!(a.flags && a.flags.official),
      protected: !!(a.flags && a.flags.protected),
      configurable: !!hints.configurable,
      configurationRequired: !!hints.configurationRequired,
      installed: !!a.installed,
    };
  }

  const views = {
    ctx(c) {
      const auth = c.profile && c.profile.auth;
      const user = auth && auth.user;
      return {
        signedIn: !!user,
        user: user ? { email: user.email, avatar: user.avatar || null } : null,
        addons: ((c.profile && c.profile.addons) || []).map((a) => ({ id: a.manifest.id, name: a.manifest.name, logo: a.manifest.logo || null, transportUrl: a.transportUrl })),
        settings: (c.profile && c.profile.settings) || {},
      };
    },
    board: catalogs,
    search: catalogs,
    continue_watching_preview(s) {
      return {
        items: (s.items || []).map((i) => ({
          id: i._id,
          type: i.type,
          name: i.name,
          poster: i.poster || null,
          shape: i.posterShape || "poster",
          progress: i.progress || 0,
          videoId: (i.state && i.state.videoId) || null,
          notifications: i.notifications || 0,
          play: (i.deepLinks && i.deepLinks.player) || null,
        })),
      };
    },
    meta_details(s) {
      const meta = s.metaItem && s.metaItem.content;
      const m = meta && meta.type === "Ready" ? meta.content : null;
      const lib = s.libraryItem && s.libraryItem.state;
      return {
        selected: s.selected || null,
        state: loadable(meta),
        meta: m && Object.assign(preview(m), {
          cast: linksOf(m.links, "Cast"),
          directors: linksOf(m.links, "Directors"),
          videos: (m.videos || []).map((v) => ({
            id: v.id,
            title: v.title || v.name || "",
            season: v.season == null ? null : v.season,
            episode: v.episode == null ? null : v.episode,
            thumbnail: v.thumbnail || null,
            released: v.released || null,
            overview: v.overview || v.description || null,
            watched: !!v.watched,
            progress: v.progress || null,
            upcoming: !!v.upcoming,
          })),
        }),
        resume: lib ? { videoId: lib.video_id || null, timeOffset: lib.timeOffset || 0, duration: lib.duration || 0 } : null,
        streams: (s.streams || []).map((g) => ({
          addon: (g.addon && g.addon.manifest && g.addon.manifest.name) || "",
          state: loadable(g.content),
          items: g.content && g.content.type === "Ready" ? g.content.content.map(stream) : [],
        })),
      };
    },
    // See All / Categories: one catalog, its genres and its pages
    discover(s) {
      const content = s.catalog && s.catalog.content;
      const selectable = s.selectable || {};
      const genre = (selectable.extra || []).find((e) => e.name === "genre");
      return {
        request: (s.selected && s.selected.request) || null,
        // what can be chosen instead, each with the Discover link that loads it
        types: (selectable.types || []).map((t) => ({ type: t.type, selected: !!t.selected, link: (t.deepLinks && t.deepLinks.discover) || null })),
        catalogs: (selectable.catalogs || []).map((c) => ({ name: c.name, addon: (c.addon && c.addon.manifest && c.addon.manifest.name) || "", selected: !!c.selected, link: (c.deepLinks && c.deepLinks.discover) || null })),
        genres: genre ? genre.options.map((o) => o.value).filter((v) => v) : [],
        state: loadable(content),
        items: content && content.type === "Ready" ? content.content.map(preview) : [],
        nextPage: !!selectable.nextPage,
      };
    },
    // Whether the streaming server (for torrents) answers, and where it is
    streaming_server(s) {
      return { url: (s.selected && s.selected.transportUrl) || null, state: loadable(s.settings) };
    },
    // Addons: the ones installed, and Stremio's Official and Community lists
    installed_addons(s) {
      return { items: (s.catalog || []).map(addon) };
    },
    remote_addons(s) {
      const content = s.catalog && s.catalog.content;
      return {
        catalogs: ((s.selectable && s.selectable.catalogs) || []).map((c) => ({ name: c.name, selected: !!c.selected, id: (c.deepLinks && c.deepLinks.addons || "").split("/").pop() })),
        state: loadable(content),
        items: content && content.type === "Ready" ? content.content.map(addon) : [],
      };
    },
    library(s) {
      return {
        selected: s.selected || null,
        items: (s.catalog || []).map((i) => ({ id: i._id, type: i.type, name: i.name, poster: i.poster || null, shape: i.posterShape || "poster", progress: i.progress || 0, watched: !!i.watched })),
        nextPage: !!(s.selectable && s.selectable.nextPage),
      };
    },
  };
  const view = (field, state) => (views[field] ? views[field](state || {}) : state);

  // ---------------------------------------------------------------------------
  // Watching models: Stremio's worker says which fields changed (NewState); each watched one is read
  // and sent, at most every 150 ms
  // ---------------------------------------------------------------------------
  const watched = new Set();
  const due = new Map();
  function push(field) {
    if (!watched.has(field) || due.has(field)) return;
    due.set(field, setTimeout(async () => {
      due.delete(field);
      try {
        send({ type: "state", field, data: view(field, await core().getState(field)) });
      } catch (err) {
        console.warn("[dx.bi engine] state failed", field, err);
      }
    }, 150));
  }

  // Stremio's own page sets window.onCoreEvent after this runs: keep its handler and hear the events too
  let pageHandler = null;
  const onCoreEvent = (event) => {
    if (pageHandler) {
      try { pageHandler(event); } catch (err) { console.warn("[dx.bi engine] page handler", err); }
    }
    if (!event) return;
    if (event.name === "NewState" && Array.isArray(event.args)) event.args.forEach(push);
    else if (event.name === "CoreEvent" && event.args) send({ type: "event", event: event.args.event, args: event.args.args || null });
  };
  try {
    Object.defineProperty(window, "onCoreEvent", {
      configurable: true,
      get() { return onCoreEvent; },
      set(handler) { if (handler !== onCoreEvent) pageHandler = handler; },
    });
  } catch (err) {
    console.warn("[dx.bi engine] can't hear Stremio's events", err);
  }

  // ---------------------------------------------------------------------------
  // What native can ask for
  // ---------------------------------------------------------------------------
  const ops = {
    watch({ fields }) {
      for (const f of fields || []) {
        if (!watched.has(f)) { watched.add(f); push(f); }
      }
    },
    async get({ field }) { return view(field, await core().getState(field)); },
    // A model loaded straight into the core: the page itself doesn't move
    async load({ field, model, args }) {
      await core().dispatch({ action: "Load", args: args === undefined ? { model } : { model, args } }, field);
      push(field);
    },
    async unload({ field }) { await core().dispatch({ action: "Unload" }, field); },
    async dispatch({ action, field }) { await core().dispatch(action, field); },
    // Home's and Search's rows are only fetched once asked for
    async loadRange({ field, start, end }) {
      await core().dispatch({ action: "CatalogsWithExtra", args: { action: "LoadRange", args: { start, end } } }, field);
    },
    // My List: the title open in details, added or removed (Stremio wants the whole item to add it)
    async library({ add }) {
      const s = await core().getState("meta_details");
      const meta = s && s.metaItem && s.metaItem.content;
      if (!meta || meta.type !== "Ready") throw new Error("no title open");
      const item = meta.content;
      await core().dispatch({ action: "Ctx", args: add ? { action: "AddToLibrary", args: item } : { action: "RemoveFromLibrary", args: item.id } });
      push("meta_details");
    },
    // Mark as watched / unwatched: the title open in details (a series: every episode), as Stremio's button does
    async watched({ value }) {
      await core().dispatch({ action: "MetaDetails", args: { action: "MarkAsWatched", args: !!value } }, "meta_details");
      push("meta_details");
    },
    // One video of the title open in details, watched or not (a film: the film itself). [upTo]: and
    // every episode before it in its season too ("mark up to here as watched")
    async videoWatched({ id, value, upTo }) {
      const s = await core().getState("meta_details");
      const meta = s && s.metaItem && s.metaItem.content;
      if (!meta || meta.type !== "Ready") throw new Error("no title open");
      const videos = meta.content.videos || [];
      const video = videos.find((v) => v.id === id);
      if (!video) {
        if (id !== meta.content.id) throw new Error("that isn't this title's");
        await core().dispatch({ action: "MetaDetails", args: { action: "MarkAsWatched", args: !!value } }, "meta_details");
      } else {
        const list = upTo ? videos.filter((v) => v.season === video.season && v.episode != null && v.episode <= video.episode) : [video];
        for (const v of list) {
          await core().dispatch({ action: "MetaDetails", args: { action: "MarkVideoAsWatched", args: [v, !!value] } }, "meta_details");
        }
      }
      push("meta_details");
    },
    // Continue watching: "Remove from row", as Stremio does it
    async dismiss({ id }) {
      await core().dispatch({ action: "Ctx", args: { action: "RewindLibraryItem", args: id } });
      await core().dispatch({ action: "Ctx", args: { action: "DismissNotificationItem", args: id } });
    },
    // Addons: installed from a list (the whole descriptor, as Stremio wants it) or from a link
    async addonInstall({ transportUrl }) {
      const remote = await core().getState("remote_addons");
      const content = remote && remote.catalog && remote.catalog.content;
      const found = content && content.type === "Ready" ? content.content.find((a) => a.transportUrl === transportUrl) : null;
      if (!found) throw new Error("that addon isn't in the list any more");
      await core().dispatch({ action: "Ctx", args: { action: "InstallAddon", args: { manifest: found.manifest, transportUrl: found.transportUrl, flags: found.flags } } });
      push("installed_addons");
      push("remote_addons");
    },
    async addonUninstall({ transportUrl }) {
      const ctx = await core().getState("ctx");
      const found = ((ctx && ctx.profile && ctx.profile.addons) || []).find((a) => a.transportUrl === transportUrl);
      if (!found) throw new Error("that addon isn't installed");
      if (found.flags && found.flags.protected) throw new Error("Stremio needs this addon");
      await core().dispatch({ action: "Ctx", args: { action: "UninstallAddon", args: found } });
      push("installed_addons");
      push("remote_addons");
    },
    // A link to an addon's manifest: Stremio fetches it, then it's installed (returns its name)
    async addonFromUrl({ url }) {
      const transportUrl = String(url || "").trim().replace(/^stremio:\/\//, "https://");
      if (!/^https?:\/\/.+/.test(transportUrl)) throw new Error("That isn't an addon link");
      await core().dispatch({ action: "Load", args: { model: "AddonDetails", args: { transportUrl } } }, "addon_details");
      for (let i = 0; i < 60; i++) {
        const s = await core().getState("addon_details");
        const remote = s && s.remoteAddon && s.remoteAddon.content;
        if (remote && remote.type === "Ready") {
          await core().dispatch({ action: "Ctx", args: { action: "InstallAddon", args: remote.content } });
          push("installed_addons");
          return remote.content.manifest && remote.content.manifest.name;
        }
        if (remote && remote.type === "Err") throw new Error("Couldn't load an addon from that link");
        await new Promise((r) => setTimeout(r, 250));
      }
      throw new Error("The addon didn't answer");
    },
    // Stremio's own settings (Settings → Player, Subtitles, Streaming server…), changed a few at a time
    async updateSettings({ changes }) {
      const ctx = await core().getState("ctx");
      const settings = (ctx && ctx.profile && ctx.profile.settings) || {};
      await core().dispatch({ action: "Ctx", args: { action: "UpdateSettings", args: Object.assign({}, settings, changes) } });
      push("ctx");
    },
    async signIn({ email, password }) {
      await core().dispatch({ action: "Ctx", args: { action: "Authenticate", args: { type: "Login", email, password } } });
    },
    async signOut() {
      await core().dispatch({ action: "Ctx", args: { action: "Logout" } });
    },
    // Playing: Stremio's own player route, which dxbi-tv.js hands to the native player
    play({ link }) {
      if (!/^#\/player\//.test(link || "")) throw new Error("not a player link");
      location.hash = link;
    },
    // dx.bi's own features (window.__dxbi)
    // ("phone.billboard", "viewers.select"…: called on the object it belongs to)
    async dx({ method, args }) {
      const path = String(method || "").split(".");
      let owner = window.__dxbi;
      for (const part of path.slice(0, -1)) owner = owner && owner[part];
      const fn = owner && owner[path[path.length - 1]];
      if (typeof fn !== "function") throw new Error(`dx.bi has no ${method}`);
      return await fn.apply(owner, args || []);
    },
    route() { return location.hash; },
    // The page itself, for what has no native screen yet (Stremio's settings, addons…)
    go({ hash }) {
      if (!/^#\//.test(hash || "")) throw new Error("not a page address");
      location.hash = hash;
    },
    // dx.bi settings (dxbi-tv.js keeps the list the TV shows)
    settings() { return window.__dxbiTv && window.__dxbiTv.settings ? window.__dxbiTv.settings() : []; },
    async saveSetting({ key, value }) { await window.__dxbiTv.saveSetting(key, value); },
  };

  window.__dxbiEngine = {
    async handle({ id, op, args }) {
      try {
        await coreReady;
        if (!ops[op]) throw new Error(`unknown op ${op}`);
        const data = await ops[op](args || {});
        if (id) send({ type: "reply", id, ok: true, data: data === undefined ? null : data });
      } catch (err) {
        if (id) send({ type: "reply", id, ok: false, error: String((err && err.message) || err) });
      }
    },
    views,
  };

  coreReady.then(() => send({ type: "ready" }));
})();
