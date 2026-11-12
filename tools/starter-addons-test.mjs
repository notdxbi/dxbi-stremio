// node tools/starter-addons-test.mjs: signed out, dx.bi adds its starter addons once (in order, no
// keys); removed ones stay removed; signing in hands over to the account; signing out starts over
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const cut = (from, to) => {
  const a = source.indexOf(from);
  const b = source.indexOf(to, a);
  assert.ok(a > 0 && b > a, `found ${from}`);
  return source.slice(a, b);
};
const homePack = cut("  const HOME_PACK = [", "  const addonTools = {");
const starter = cut("  const STARTER_ADDONS = [", "  // Saved data.");

// A stand-in for Stremio's core: a profile, and InstallAddon appending to it
const storage = new Map();
const state = { profile: { auth: null, addons: [] }, fail: new Set() };
const sandbox = {
  URL, AbortSignal, Promise, JSON, Set,
  setTimeout: () => 0, setInterval: () => 0,
  log: () => {},
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  },
  fetch: async (url) => {
    if ([...state.fail].some((h) => url.includes(h))) return { ok: false, json: async () => null };
    return { ok: true, json: async () => ({ id: `id.${new URL(url).host}`, name: new URL(url).host }) };
  },
  core: () => ({
    getState: async (what) => (what === "ctx" ? { profile: state.profile } : null),
    dispatch: (msg) => {
      assert.equal(msg.args.action, "InstallAddon");
      state.profile.addons.push({ transportUrl: msg.args.args.transportUrl, manifest: msg.args.args.manifest });
    },
  }),
};
const { starterAddons, STARTER_ADDONS } = vm.runInNewContext(`${homePack}${starter}({ starterAddons, STARTER_ADDONS })`, sandbox);
const hosts = () => state.profile.addons.map((a) => new URL(a.transportUrl).host);
const defaults = () => [
  { transportUrl: "https://v3-cinemeta.strem.io/manifest.json" },
  { transportUrl: "https://opensubtitles-v3.strem.io/manifest.json" },
  { transportUrl: "http://127.0.0.1:11470/local-addon/manifest.json" },
];

// No keys or debrid settings in anything handed to every visitor
for (const u of STARTER_ADDONS) assert.ok(!/realdebrid|alldebrid|premiumize|debridlink|torbox|apikey|api_key|token/i.test(decodeURIComponent(u)), `no keys in ${u}`);
assert.ok(STARTER_ADDONS.includes("https://torrentio.strem.fun/manifest.json"));
console.log("PASS starter addons carry no keys; Torrentio is the plain one");

// Fresh, signed out: all of them, in order, after Stremio's defaults
state.profile = { auth: null, addons: defaults() };
assert.equal(await starterAddons.apply(), true);
assert.equal(JSON.stringify(hosts().slice(3)), JSON.stringify(STARTER_ADDONS.map((u) => new URL(u).host)));
const once = state.profile.addons.length;
await starterAddons.apply();
assert.equal(state.profile.addons.length, once, "not added twice");
console.log("PASS signed out: added once, in order");

// Removed by the visitor: stays removed
state.profile.addons = state.profile.addons.filter((a) => !a.transportUrl.includes("torrentio"));
await starterAddons.apply();
assert.ok(!hosts().includes("torrentio.strem.fun"));
console.log("PASS a removed starter addon stays removed");

// Signed in: nothing is added to the account, and the record is cleared
state.profile = { auth: { key: "k", user: { _id: "u" } }, addons: defaults() };
await starterAddons.apply();
assert.equal(state.profile.addons.length, 3);
assert.equal(storage.has(starterAddons.KEY), false);
console.log("PASS signed in: the account's addons are left alone");

// Signed out again: set up again; an addon that can't be reached is tried next time
state.profile = { auth: null, addons: defaults() };
state.fail.add("anime-catalogs");
await starterAddons.apply();
assert.ok(!hosts().includes("1fe84bc728af-stremio-anime-catalogs.baby-beamup.club"));
assert.equal(hosts().length, 3 + STARTER_ADDONS.length - 1);
state.fail.clear();
await starterAddons.apply();
assert.ok(hosts().includes("1fe84bc728af-stremio-anime-catalogs.baby-beamup.club"));
console.log("PASS signed out again: set up again, and an unreachable addon is retried");

// Core not ready yet
const ready = state.profile;
state.profile = null;
assert.equal(await starterAddons.apply(), false);
state.profile = ready;
console.log("PASS waits for Stremio's core");
