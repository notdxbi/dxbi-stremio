// node tools/engine-contract-test.mjs: what the phone app's native screens rely on in the plugin, dxbi-tv.js
// and the Android bridge is still there. A change upstream that renames or reshapes one of these fails here,
// in the fork's sync pull request, before it reaches a phone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const plugin = read("dxbi.plugin.js");
const tv = read("tv/app/src/main/assets/dxbi-tv.js");
const engine = read("tv/app/src/mobile/assets/dxbi-engine.js");
const bridge = read("tv/app/src/main/java/com/notdxbi/dxbi/tv/Bridge.kt");
const main = read("tv/app/src/main/java/com/notdxbi/dxbi/tv/MainActivity.kt");

// The text between `opening` and the bracket that closes it (the first `opening` that ends its line, when `multiline`)
function block(text, opening, multiline = false) {
  const start = multiline ? text.search(new RegExp(opening.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\r?\\n")) : text.indexOf(opening);
  assert.ok(start >= 0, `found ${opening}`);
  let depth = 0;
  for (let i = start + opening.length - 1; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "(" || text[i] === "[") depth++;
    else if (text[i] === "}" || text[i] === ")" || text[i] === "]") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  assert.fail(`${opening} never closes`);
}

// 1. dx.bi's features the native screens call through window.__dxbi (the engine's "dx" op)
const api = block(plugin, "  const api = {");
for (const name of ["settings", "viewers", "whoIsWatching", "homeLayout", "episodes", "calendarFill", "skipSegments",
  "openTrailer", "partyInfo", "partyLeave", "quickPlayNext", "streamHints", "titleColourOf"]) {
  assert.match(api, new RegExp(`\\n\\s+(async\\s+)?${name}\\b`), `plugin api still has ${name}`);
}
assert.match(plugin, /window\.__dxbi = api/, "the api is window.__dxbi");
// the phone app's own entry (Home's billboard and rows as data), and what it builds on
const phone = block(api, "    phone: {");
for (const name of ["billboard", "myList", "forYou", "airing", "layout", "viewers", "reviews", "streams", "play"]) {
  assert.match(phone, new RegExp(`\\n\\s+(async\\s+)?${name}\\(`), `api.phone.${name}`);
}
assert.match(phone, /async streams\(field = "meta_details"\)/, "phone streams can read a separate Stremio detail model");
assert.match(phone, /this\.libraryStreams\(state, items\)/, "regular detail streams include matched library files");
assert.match(phone, /\n\s+async libraryLink\(/, "a library file plays through a player link");
for (const [owner, method] of [["hero", "load"], ["hero", "background"], ["myList", "groups"], ["forYou", "seed"], ["forYou", "saved"], ["forYou", "load"],
  ["episodes", "refresh"], ["homeLayout", "data"], ["homeLayout", "save"], ["viewers", "current"], ["viewers", "list"], ["viewers", "select"],
  ["reviews", "load"], ["reviews", "wikipedia"], ["reviews", "tmdb"], ["quickPlay", "memory"], ["quickPlay", "play"], ["streamChoice", "choose"], ["streamChoice", "spares"]]) {
  assert.match(block(plugin, `  const ${owner} = {`), new RegExp(`\\n    (async )?${method}\\(`), `${owner}.${method} (used by api.phone or the phone app)`);
}
console.log("PASS the plugin's api has what the phone app calls");

// Library-addon packs have their own `other` IDs. Match a catalog episode to its season-pack file
// and retain the whole pack so the native player can expose its episode list.
const libraryAddon = {
  transportUrl: "https://store.test/manifest.json",
  manifest: {
    name: "Library Store",
    types: ["other"],
    resources: ["meta", "stream"],
    catalogs: [
      { id: "store", type: "other", extra: [{ name: "search" }] },
      { id: "store-alt", type: "other", extra: [{ name: "search" }] },
    ],
  },
};
const secondLibraryAddon = {
  transportUrl: "https://second-store.test/manifest.json",
  manifest: {
    name: "Second Library Store",
    types: ["other"],
    resources: ["meta", "stream"],
    catalogs: [{ id: "second-store", type: "other", extra: [{ name: "search" }] }],
  },
};
const metadataSource = {
  generation: 1,
  addons: [libraryAddon, secondLibraryAddon],
  refresh: async () => {},
  url: (addon, resource, type, id) => `${new URL(addon.transportUrl).origin}/${resource}/${type}/${encodeURIComponent(id)}.json`,
};
const requested = [];
const storage = new Map();
const localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
};
const libraryPacks = {
  "cached-pack": {
    id: "cached-pack", name: "Example Show", videos: [
      { id: "pack:Season 1/S01E01.mkv", title: "Season 1/S01E01.mkv" },
      { id: "pack:Season 1/S01E02.mkv", title: "Season 1/S01E02.mkv" },
    ],
  },
  "romaji-pack": {
    id: "romaji-pack", name: "[Judas] Example Romaji", videos: [
      { id: "pack:Season 1/S01E01.mkv", title: "Season 1/S01E01.mkv" },
    ],
  },
  "imdb-pack": {
    id: "imdb-pack", name: "Unrelated Pack", links: [{ name: "tt123", url: "https://www.imdb.com/title/tt123/" }],
    videos: [{ id: "pack:Season 1/S01E01.mkv", title: "Season 1/S01E01.mkv" }],
  },
  "kitsu-pack": {
    id: "kitsu-pack", name: "Unrelated Anime Store Pack", links: [{ name: "Kitsu", url: "https://kitsu.io/anime/42" }],
    videos: [{ id: "pack:Season 1/S01E01.mkv", title: "Season 1/S01E01.mkv" }],
  },
  "absolute-pack": {
    id: "absolute-pack", name: "Example Show", videos: [
      { id: "pack:03.mkv", title: "03.mkv" },
    ],
  },
};
const libraryPhone = vm.runInNewContext(`({${phone}})`, {
  AbortSignal: { timeout: () => undefined },
  Date,
  Map,
  Promise,
  URL,
  console: { warn() {} },
  localStorage,
  metadataSource,
  watchParty: { phone: {} },
  downloads: { encode: async (stream) => `ENC(${stream.url})` },
  log() {},
  fetch: async (address) => {
    const url = new URL(address);
    requested.push(url.pathname);
    if (url.pathname.includes("/catalog/")) {
      const isPrimaryCatalog = url.host === "store.test" && url.pathname.includes("/store/");
      return {
        ok: true, json: async () => ({ metas: isPrimaryCatalog ? [
        { id: "cached-pack", type: "other", name: "Example Show" },
        { id: "romaji-pack", type: "other", name: "[Judas] Example Romaji" },
        { id: "imdb-pack", type: "other", name: "Unrelated Pack", links: libraryPacks["imdb-pack"].links },
        { id: "kitsu-pack", type: "other", name: "Unrelated Anime Store Pack", links: libraryPacks["kitsu-pack"].links },
        { id: "absolute-pack", type: "other", name: "Example Show" },
        ] : [] }),
      };
    }
    if (url.pathname.includes("/stream/")) {
      return { ok: true, json: async () => ({ streams: [{ url: "https://store.test/file.mkv", name: "Store" }] }) };
    }
    if (url.pathname.includes("/meta/")) {
      const packId = decodeURIComponent(url.pathname.split("/").pop().replace(/\.json$/, ""));
      return { ok: true, json: async () => ({ meta: libraryPacks[packId] }) };
    }
    return { ok: false, status: 404 };
  },
}).phone;
const libraryMatches = await libraryPhone.libraryStreams({
  selected: { streamPath: { id: "tt123:1:1" } },
  metaItem: { content: { type: "Ready", content: {
    id: "tt123", type: "series", name: "Example Show", aliases: { romaji: "Example Romaji" }, imdbId: "tt123", kitsuId: "42",
    videos: [
      { id: "tt123:1:1", title: "Pilot", season: 1, episode: 1 },
      { id: "tt123:1:2", title: "Episode 2", season: 1, episode: 2 },
      { id: "tt123:2:1", title: "Season 2 opener", season: 2, episode: 1 },
    ],
  } } },
}, []);
assert.equal(libraryMatches.length, 4, "finds every matching pack across library addons and aliases");
const primaryMatch = libraryMatches.find((match) => match.library.metaId === "cached-pack");
assert.equal(primaryMatch.library.fileId, "pack:Season 1/S01E01.mkv");
assert.deepEqual(JSON.parse(JSON.stringify(primaryMatch.library.files.map(({ season, episode }) => [season, episode]))), [[1, 1], [1, 2]]);
assert.ok(requested.some((path) => path.includes("/search=Example%20Show.json")), "searches the catalog title");
assert.ok(requested.some((path) => path.includes("/search=Example%20Romaji.json")), "searches title aliases");
assert.ok(requested.some((path) => path.includes("/search=tt123.json")), "searches IMDb identifiers");
assert.ok(requested.some((path) => path.includes("/search=kitsu%3A42.json")), "searches Kitsu identifiers");
assert.ok(requested.some((path) => path.includes("/catalog/other/store-alt/")), "queries every searchable catalog");
assert.ok(requested.some((path) => path.includes("/catalog/other/second-store/")), "queries every library addon");
const absoluteMatches = await libraryPhone.libraryStreams({
  selected: { streamPath: { id: "tt123:2:1" } },
  metaItem: { content: { type: "Ready", content: {
    id: "tt123", type: "series", name: "Example Show", aliases: { romaji: "Example Romaji" }, imdbId: "tt123", kitsuId: "42",
    videos: [
      { id: "tt123:1:1", title: "Pilot", season: 1, episode: 1 },
      { id: "tt123:1:2", title: "Episode 2", season: 1, episode: 2 },
      { id: "tt123:2:1", title: "Season 2 opener", season: 2, episode: 1 },
    ],
  } } },
}, []);
assert.deepEqual(JSON.parse(JSON.stringify(absoluteMatches.map((match) => match.library.metaId))), ["absolute-pack"], "matches season-two episodes stored by absolute number");
// A library file plays as the episode open in details (its progress is the show's)
const libraryState = {
  selected: { metaPath: { type: "series", id: "tt123" }, streamPath: { id: "tt123:1:1" } },
  metaItem: { addon: { transportUrl: "https://cinemeta.test/manifest.json" }, content: { type: "Ready", content: {} } },
};
const link = await libraryPhone.libraryLink(primaryMatch, libraryState);
assert.equal(link, `#/player/${["ENC(https://store.test/file.mkv)", libraryAddon.transportUrl, "https://cinemeta.test/manifest.json", "series", "tt123", "tt123:1:1"].map(encodeURIComponent).join("/")}`);
assert.ok(requested.some((path) => path === `/stream/other/${encodeURIComponent("pack:Season 1/S01E01.mkv")}.json`), "asks the library addon for that file's stream");
console.log("PASS a library file plays as the episode");
for (const marker of ["NCED", "NCOP", "OVA", "OAD", "SP", "PV", "MENU", "PREVIEW", "EXTRAS", "SPECIALS"]) {
  const parsed = libraryPhone.fileDetails({ id: `pack:Season 1/JoJo - S01 ${marker} 01.mkv`, title: `Season 1/JoJo - S01 ${marker} 01.mkv`, season: 1, episode: 0 });
  assert.equal(parsed.season, 0, `${marker} is routed to Specials`);
  assert.equal(parsed.episode, null, `${marker} is not episode zero`);
}
const parenthesizedExtra = libraryPhone.fileDetails({
  id: "pack:Season 1/JoJo (NCOP 01).mkv",
  title: "Season 1/JoJo (NCOP 01).mkv",
});
assert.deepEqual([parenthesizedExtra.season, parenthesizedExtra.episode], [0, null], "parenthesized extras are Specials");
for (const [title, season, episode] of [
  ["Season 1/JoJo - OP 01.mkv", 0, null],
  ["Season 1/JoJo - ED 01.mkv", 0, null],
  ["Season 1/One Piece S01E02 - Crusaders Limited Edition.mkv", 1, 2],
  ["Season 1/02 - The Joestar Family.mkv", 1, 2],
  ["Season 1/1x03 - The Evil Spirit.mkv", 1, 3],
  ["Season 1/unmarked sample clip.mkv", 1, null],
  ["Diamond is Unbreakable - 01.mkv", null, 1],
]) {
  const parsed = libraryPhone.fileDetails({ id: `pack:${title}`, title });
  assert.deepEqual([parsed.season, parsed.episode], [season, episode], title);
}
console.log("PASS catalog episodes match files in library-addon season packs");
console.log("PASS addon file parsing routes extras safely and protects canon episodes");

// 2. dx.bi's settings, drawn natively from their description
assert.match(plugin, /\n  const SCHEMA = \[/, "SCHEMA");
assert.match(plugin, /\n  const SETTING_GROUPS = /, "SETTING_GROUPS");
const schema = block(plugin, "  const SCHEMA = [");
for (const field of ["key:", "type:", "label:"]) assert.ok(schema.includes(field), `settings entries have ${field}`);
for (const type of ["toggle", "select"]) assert.ok(schema.includes(`"${type}"`), `settings use ${type}`);
console.log("PASS settings keep their shape");

// 3. What the native player is given (dxbi-tv.js → PlayerActivity), and how it reports back
// (the stream handoff: the one written out over many lines, not the short ones for trailers and the like)
const payload = block(tv, "native.play(JSON.stringify({", true);
for (const key of ["hash", "videoId", "skips", "url", "title", "subtitle", "startMs", "headers", "subtitles", "next", "upNext", "audioLanguage", "subtitleLanguage", "subtitleStyle", "background"]) {
  assert.match(payload, new RegExp(`\\n\\s+${key}\\b`), `play payload has ${key}`);
}
// dx.bi settings, which the phone app draws natively from dxbi-tv.js's list
for (const name of ["settings", "saveSetting"]) assert.match(tv, new RegExp(`tv\\.${name} = `), `dxbi-tv.js offers __dxbiTv.${name}`);
for (const callback of ["onProgress", "playerClosed", "onPartyTick", "back"]) {
  assert.match(tv, new RegExp(`tv\\.${callback} = `), `dxbi-tv.js still offers __dxbiTv.${callback}`);
  assert.ok(main.includes(`__dxbiTv.${callback}`), `MainActivity still calls __dxbiTv.${callback}`);
}
assert.match(tv, /\/\^#\\\/player\\\/\//, "dxbi-tv.js takes over Stremio's #/player/ route (the engine plays through it)");
console.log("PASS the play handoff keeps its fields and callbacks");

// 4. Every bridge call the page makes exists in Bridge.kt
const used = new Set([...tv.matchAll(/bridge\.(\w+)\(/g), ...engine.matchAll(/bridge\.(\w+)\(/g)].map((m) => m[1]));
const offered = new Set([...bridge.matchAll(/@JavascriptInterface\s+fun (\w+)/g)].map((m) => m[1]));
// (the iPhone page's own: it can't reach an http:// streaming server itself, Android's page can)
const iphonePage = read("ios/Dxbi/Engine/Page.swift");
const iphoneOnly = new Set(["serverUp"]);
for (const name of used) assert.ok(offered.has(name) || iphoneOnly.has(name), `Bridge.kt offers ${name}`);
for (const name of iphoneOnly) assert.ok(iphonePage.includes(`${name}: (t,`), `the iPhone page offers ${name}`);
assert.ok(offered.has("engine"), "Bridge.kt offers engine");
console.log(`PASS the bridge has all ${used.size} methods the page calls`);

// 5. The engine hears Stremio through window.core and window.onCoreEvent: nothing else may take them over
for (const [name, text] of [["dxbi.plugin.js", plugin], ["dxbi-tv.js", tv]]) {
  assert.doesNotMatch(text, /window\.onCoreEvent\s*=/, `${name} leaves window.onCoreEvent to Stremio and the engine`);
  assert.doesNotMatch(text, /defineProperty\(window,\s*["']core["']/, `${name} doesn't redefine window.core`);
}
console.log("PASS Stremio's core events reach the engine");
