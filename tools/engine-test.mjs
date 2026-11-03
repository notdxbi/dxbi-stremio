// node tools/engine-test.mjs: the phone app's engine (tv/app/src/mobile/assets/dxbi-engine.js), against a
// stand-in for Stremio's core: what native asks for reaches the core, and what comes back is trimmed right
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "tv/app/src/mobile/assets/dxbi-engine.js"), "utf8").replace("__DXBI_TV_TOKEN__", "t0ken");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const sent = [];
const dispatched = [];
const states = {
  ctx: {
    profile: {
      auth: { key: "k", user: { _id: "u", email: "me@example.com", avatar: "a.png" } },
      addons: [{ manifest: { id: "com.linvo.cinemeta", name: "Cinemeta" }, transportUrl: "https://v3-cinemeta.strem.io/manifest.json" }],
      settings: { audioLanguage: "eng" },
    },
  },
  board: {
    catalogs: [
      {
        id: "top", name: "Popular", type: "movie", addon: { manifest: { name: "Cinemeta" } },
        content: { type: "Ready", content: [{
          id: "tt1", type: "movie", name: "Film", poster: "p.jpg", posterShape: "poster", releaseInfo: "2026",
          links: [{ name: "7.5", category: "imdb" }, { name: "Drama", category: "Genres" }, { name: "Someone", category: "Cast" }],
          trailerStreams: [{ ytId: "yt1" }], inLibrary: true,
        }] },
      },
      { id: "x", name: "Later", type: "series", addon: { manifest: { name: "Other" } }, content: null },
      { id: "y", name: "Broken", type: "movie", addon: { manifest: { name: "Bad" } }, content: { type: "Err", content: "nope" } },
    ],
  },
  continue_watching_preview: {
    items: [{ _id: "tt2", type: "series", name: "Show", poster: "s.jpg", posterShape: "poster", progress: 42.5, state: { videoId: "tt2:1:3" }, deepLinks: { player: null } }],
  },
  meta_details: {
    selected: { metaPath: { id: "tt2" }, streamPath: { id: "tt2:1:3" } },
    metaItem: { content: { type: "Ready", content: {
      id: "tt2", type: "series", name: "Show", links: [{ name: "Lead", category: "Cast" }],
      videos: [{ id: "tt2:1:3", title: "Third", season: 1, episode: 3, thumbnail: "e.jpg", watched: false, progress: 12 }],
    } } },
    libraryItem: { state: { video_id: "tt2:1:3", timeOffset: 61000, duration: 1300000 } },
    streams: [
      { addon: { manifest: { name: "Torrentio" } }, content: { type: "Ready", content: [{
        name: "[TB+] Torrentio\n1080p", description: "Show.S01E03.1080p", url: "https://x/y.mp4",
        behaviorHints: { filename: "y.mp4", bingeGroup: "g", proxyHeaders: { request: { Referer: "r" } } },
        deepLinks: { player: "#/player/abc/def" },
      }] } },
      { addon: { manifest: { name: "Slow" } }, content: { type: "Loading" } },
    ],
  },
};

const window = {
  DxbiTV: { engine: (token, json) => { assert.equal(token, "t0ken"); sent.push(JSON.parse(json)); } },
  location: { hash: "#/" },
  console,
  setTimeout,
  clearTimeout,
};
window.window = window;
vm.runInNewContext(source, window);
assert.ok(window.__dxbiEngine, "engine installed");
assert.equal(typeof window.onCoreEvent, "function", "listens to the core before the page does");

// Stremio's page sets its own handler after the engine: it keeps receiving every event
const pageEvents = [];
window.onCoreEvent = (e) => pageEvents.push(e);

// The core starts later (in a worker): nothing is answered until then
const pending = window.__dxbiEngine.handle({ id: 1, op: "get", args: { field: "ctx" } });
await wait(50);
assert.equal(sent.length, 0, "waits for the core");
window.core = {
  getState: async (field) => states[field] || {},
  dispatch: async (action, field) => { dispatched.push(JSON.parse(JSON.stringify({ action, field }))); },
};
await pending;
await wait(150);
assert.deepEqual(sent.find((m) => m.type === "ready"), { type: "ready" });
const ctx = sent.find((m) => m.id === 1);
assert.equal(ctx.ok, true);
assert.deepEqual(ctx.data.user, { email: "me@example.com", avatar: "a.png" });
assert.equal(ctx.data.signedIn, true);
assert.equal(ctx.data.addons[0].name, "Cinemeta");
console.log("PASS waits for Stremio's core, then answers");

const ask = async (id, op, args) => {
  await window.__dxbiEngine.handle({ id, op, args });
  return sent.find((m) => m.id === id);
};
const board = (await ask(2, "get", { field: "board" })).data;
assert.equal(board.catalogs.length, 3);
assert.deepEqual(board.catalogs.map((c) => c.state), ["Ready", "None", "Err"]);
const film = board.catalogs[0].items[0];
assert.equal(film.imdb, "7.5");
assert.deepEqual(film.genres, ["Drama"]);
assert.equal(film.trailer, "yt1");
assert.equal(film.inLibrary, true);
assert.equal(film.year, "2026");
console.log("PASS Home rows: loading, failed and ready rows, with IMDb, genres and trailer");

const cw = (await ask(3, "get", { field: "continue_watching_preview" })).data.items[0];
assert.deepEqual([cw.id, cw.progress, cw.videoId], ["tt2", 42.5, "tt2:1:3"]);
const meta = (await ask(4, "get", { field: "meta_details" })).data;
assert.equal(meta.state, "Ready");
assert.deepEqual(meta.meta.cast, ["Lead"]);
assert.deepEqual(meta.meta.videos[0], { id: "tt2:1:3", title: "Third", season: 1, episode: 3, thumbnail: "e.jpg", released: null, overview: null, watched: false, progress: 12, upcoming: false });
assert.deepEqual(meta.resume, { videoId: "tt2:1:3", timeOffset: 61000, duration: 1300000 });
assert.deepEqual(meta.streams.map((g) => [g.addon, g.state, g.items.length]), [["Torrentio", "Ready", 1], ["Slow", "Loading", 0]]);
assert.deepEqual(meta.streams[0].items[0].headers, { Referer: "r" });
assert.equal(meta.streams[0].items[0].play, "#/player/abc/def");
console.log("PASS Continue watching, details, episodes and streams");

await ask(5, "load", { field: "meta_details", model: "MetaDetails", args: { metaPath: { id: "tt2" } } });
assert.deepEqual(dispatched.at(-1), { action: { action: "Load", args: { model: "MetaDetails", args: { metaPath: { id: "tt2" } } } }, field: "meta_details" });
await ask(6, "loadRange", { field: "search", start: 0, end: 10 });
assert.deepEqual(dispatched.at(-1), { action: { action: "CatalogsWithExtra", args: { action: "LoadRange", args: { start: 0, end: 10 } } }, field: "search" });
console.log("PASS loads go to the right model, without moving the page");

assert.equal((await ask(7, "play", { link: "https://elsewhere" })).ok, false, "only player links");
assert.equal(window.location.hash, "#/");
assert.equal((await ask(8, "play", { link: "#/player/abc/def" })).ok, true);
assert.equal(window.location.hash, "#/player/abc/def", "Stremio's player route, which dxbi-tv.js hands to the native player");
assert.match((await ask(9, "nope", {})).error, /unknown op/);
console.log("PASS playing, and refusing what it can't do");

// Watching: the current state at once, then again whenever Stremio says it changed (bursts sent once)
const before = sent.length;
await window.__dxbiEngine.handle({ id: 0, op: "watch", args: { fields: ["continue_watching_preview"] } });
await wait(250);
let pushes = sent.slice(before).filter((m) => m.type === "state");
assert.equal(pushes.length, 1);
assert.equal(pushes[0].field, "continue_watching_preview");
states.continue_watching_preview.items[0].progress = 50;
window.onCoreEvent({ name: "NewState", args: ["continue_watching_preview", "board"] });
window.onCoreEvent({ name: "NewState", args: ["continue_watching_preview"] });
await wait(250);
pushes = sent.slice(before).filter((m) => m.type === "state");
assert.equal(pushes.length, 2, "one push for a burst, none for models nobody watches");
assert.equal(pushes[1].data.items[0].progress, 50);
assert.equal(pageEvents.length, 2, "the page still hears every event");
window.onCoreEvent({ name: "CoreEvent", args: { event: "UserAuthenticated", args: null } });
assert.deepEqual(sent.at(-1), { type: "event", event: "UserAuthenticated", args: null });
console.log("PASS watched models follow Stremio's changes; the page keeps its events");

// Home rows carry the key Customise Home saves them under, and See All's link
states.board.catalogs[0].addon.manifest.id = "com.linvo.cinemeta";
states.board.catalogs[0].deepLinks = { discover: "#/discover/x/movie/top" };
const keyed = (await ask(20, "get", { field: "board" })).data.catalogs[0];
assert.equal(keyed.key, "com.linvo.cinemeta/movie/top");
assert.equal(keyed.discover, "#/discover/x/movie/top");
states.discover = {
  selected: { request: { base: "b", path: { resource: "catalog", type: "movie", id: "top", extra: [["genre", "Drama"]] } } },
  selectable: { catalogs: [{ name: "Popular", selected: true }], extra: [{ name: "genre", options: [{ value: null }, { value: "Drama" }, { value: "Action" }] }], nextPage: true },
  catalog: { content: { type: "Ready", content: [states.board.catalogs[0].content.content[0]] } },
};
const discover = (await ask(21, "get", { field: "discover" })).data;
assert.deepEqual(discover.genres, ["Drama", "Action"]);
assert.equal(discover.items[0].name, "Film");
assert.equal(discover.nextPage, true);
console.log("PASS row keys, See All links and Discover");

// My List works on the title open in details; Continue watching's "Remove from row"
await ask(22, "library", { add: true });
assert.equal(dispatched.at(-1).action.args.action, "AddToLibrary");
assert.equal(dispatched.at(-1).action.args.args.id, "tt2", "the whole item, as Stremio wants it");
await ask(23, "library", { add: false });
assert.deepEqual(dispatched.at(-1).action.args, { action: "RemoveFromLibrary", args: "tt2" });
await ask(24, "dismiss", { id: "tt2" });
assert.deepEqual(dispatched.slice(-2).map((d) => d.action.args.action), ["RewindLibraryItem", "DismissNotificationItem"]);
console.log("PASS My List and Remove from row");

// dx.bi's features, by path, called on the object they belong to
window.__dxbi = { phone: { who: "phone", name() { return this.who; } }, viewers: { list: [], select(id) { this.list.push(id); return id; } } };
assert.equal((await ask(25, "dx", { method: "phone.name" })).data, "phone");
assert.equal((await ask(26, "dx", { method: "viewers.select", args: ["v1"] })).data, "v1");
assert.deepEqual([...window.__dxbi.viewers.list], ["v1"]);
assert.equal((await ask(27, "dx", { method: "phone.nope" })).ok, false);
assert.equal((await ask(28, "go", { hash: "javascript:alert(1)" })).ok, false, "only the page's own addresses");
assert.equal((await ask(29, "go", { hash: "#/settings" })).ok, true);
assert.equal(window.location.hash, "#/settings");
console.log("PASS dx.bi's features and the page's own screens");

// Addons: installed from Stremio's lists or a link, uninstalled (never the ones Stremio needs); Stremio's settings
const cinemeta = { manifest: { id: "c", name: "Cinemeta", behaviorHints: { configurable: false } }, transportUrl: "https://c/manifest.json", flags: { official: true, protected: true }, installed: true };
const extra = { manifest: { id: "x", name: "Extra", logo: "x.png", types: ["movie"], behaviorHints: { configurable: true } }, transportUrl: "https://x/manifest.json", flags: { official: false, protected: false }, installed: false };
states.installed_addons = { catalog: [cinemeta] };
states.remote_addons = { selectable: { catalogs: [{ name: "Official", selected: true, deepLinks: { addons: "#/addons/all/b/official" } }] }, catalog: { content: { type: "Ready", content: [cinemeta, extra] } } };
const remoteView = (await ask(30, "get", { field: "remote_addons" })).data;
assert.deepEqual(remoteView.catalogs, [{ name: "Official", selected: true, id: "official" }]);
assert.deepEqual([remoteView.items[1].name, remoteView.items[1].configurable, remoteView.items[1].installed, remoteView.items[0].protected], ["Extra", true, false, true]);
await ask(31, "addonInstall", { transportUrl: "https://x/manifest.json" });
assert.deepEqual(dispatched.at(-1).action.args, { action: "InstallAddon", args: { manifest: extra.manifest, transportUrl: extra.transportUrl, flags: extra.flags } });
states.ctx.profile.addons = [cinemeta, extra];
await ask(32, "addonUninstall", { transportUrl: "https://x/manifest.json" });
assert.equal(dispatched.at(-1).action.args.action, "UninstallAddon");
assert.match((await ask(33, "addonUninstall", { transportUrl: "https://c/manifest.json" })).error, /Stremio needs/);
states.addon_details = { remoteAddon: { content: { type: "Ready", content: extra } } };
const fromLink = await ask(34, "addonFromUrl", { url: "stremio://x/manifest.json" });
assert.equal(fromLink.data, "Extra");
assert.equal(dispatched.find((d) => d.field === "addon_details").action.args.args.transportUrl, "https://x/manifest.json", "stremio:// links fetched over https");
assert.equal((await ask(35, "addonFromUrl", { url: "not a link" })).ok, false);
states.ctx.profile.settings = { audioLanguage: "eng", subtitlesSize: 100 };
await ask(36, "updateSettings", { changes: { subtitlesSize: 150 } });
assert.deepEqual(dispatched.at(-1).action.args, { action: "UpdateSettings", args: { audioLanguage: "eng", subtitlesSize: 150 } }, "the rest of the settings kept");
console.log("PASS addons and Stremio's settings");

// Mark as watched: the title open in details, as Stremio's own button does it
await ask(40, "watched", { value: true });
assert.deepEqual(dispatched.at(-1), { action: { action: "MetaDetails", args: { action: "MarkAsWatched", args: true } }, field: "meta_details" });
console.log("PASS mark as watched");

// One episode (and, up to here, the ones before it in its season); a film's id marks the film
const episodes = states.meta_details.metaItem.content.content.videos;
const savedVideos = episodes.slice();
episodes.unshift({ id: "tt2:1:1", season: 1, episode: 1 }, { id: "tt2:1:2", season: 1, episode: 2 }, { id: "tt2:2:1", season: 2, episode: 1 });
let mark = dispatched.length;
await ask(41, "videoWatched", { id: "tt2:1:3", value: true });
assert.equal(dispatched.length - mark, 1);
assert.deepEqual(dispatched.at(-1).action.args.action, "MarkVideoAsWatched");
assert.deepEqual(dispatched.at(-1).action.args.args[0].id, "tt2:1:3");
assert.equal(dispatched.at(-1).action.args.args[1], true);
mark = dispatched.length;
await ask(42, "videoWatched", { id: "tt2:1:3", value: true, upTo: true });
assert.deepEqual(dispatched.slice(mark).map((d) => d.action.args.args[0].id).sort(), ["tt2:1:1", "tt2:1:2", "tt2:1:3"], "season 1 up to episode 3, not season 2");
await ask(43, "videoWatched", { id: "tt2", value: false });
assert.deepEqual(dispatched.at(-1).action.args, { action: "MarkAsWatched", args: false });
assert.equal((await ask(44, "videoWatched", { id: "tt9:1:1", value: true })).ok, false, "not this title's");
episodes.splice(0, episodes.length, ...savedVideos);
console.log("PASS mark one video, or up to it, as watched");
