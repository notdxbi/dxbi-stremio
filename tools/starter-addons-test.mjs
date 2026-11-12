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
      const { action, args } = msg.args;
      if (action === "UninstallAddon") {
        assert.ok(!(args.flags && args.flags.protected), "never removes a protected addon");
        state.profile.addons = state.profile.addons.filter((a) => a.transportUrl !== args.transportUrl);
        return;
      }
      assert.equal(action, "InstallAddon");
      state.profile.addons.push({ transportUrl: args.transportUrl, manifest: args.manifest, flags: args.flags });
    },
  }),
};
const { starterAddons, STARTER_ADDONS } = vm.runInNewContext(`${homePack}${starter}({ starterAddons, STARTER_ADDONS })`, sandbox);
const hosts = () => state.profile.addons.map((a) => new URL(a.transportUrl).host);
// Stremio's own addons for a visitor, as a fresh web page has them
const official = (url, prot) => ({ transportUrl: url, manifest: { id: url }, flags: { official: true, protected: prot } });
const defaults = () => [
  official("https://v3-cinemeta.strem.io/manifest.json", true),
  official("https://v3-channels.strem.io/manifest.json", false),
  official("https://watchhub.strem.io/manifest.json", false),
  official("https://caching.stremio.net/publicdomainmovies.now.sh/manifest.json", false),
  official("https://opensubtitles-v3.strem.io/manifest.json", false),
  official("http://127.0.0.1:11470/local-addon/manifest.json", true),
];
const dxbiOrder = ["v3-cinemeta.strem.io", "127.0.0.1:11470", "61ab9c85a149-tmdb-collections.baby-beamup.club", "1fe84bc728af-stremio-anime-catalogs.baby-beamup.club", "torrentio.strem.fun", "opensubtitles-v3.strem.io", "7a82163c306e-stremio-netflix-catalog-addon.baby-beamup.club"];

// No keys or debrid settings in anything handed to every visitor
for (const u of STARTER_ADDONS) assert.ok(!/realdebrid|alldebrid|premiumize|debridlink|torbox|apikey|api_key|token/i.test(decodeURIComponent(u)), `no keys in ${u}`);
assert.ok(STARTER_ADDONS.includes("https://torrentio.strem.fun/manifest.json"));
console.log("PASS starter addons carry no keys; Torrentio is the plain one");

// Fresh, signed out: Stremio's extras gone, dx.bi's addons in dx.bi's order (Cinemeta and Local
// Files can't move, so they stay first)
state.profile = { auth: null, addons: defaults() };
assert.equal(await starterAddons.apply(), true);
assert.equal(JSON.stringify(hosts()), JSON.stringify(dxbiOrder));
await starterAddons.apply();
assert.equal(JSON.stringify(hosts()), JSON.stringify(dxbiOrder), "nothing changes the second time");
console.log("PASS signed out: YouTube, WatchHub and Public Domain out; dx.bi's addons in order, once");

// A visitor from 2.37.0 (starter addons appended after Stremio's defaults): arranged the same way
storage.clear();
state.profile = { auth: null, addons: defaults() };
storage.set(starterAddons.SETUP, "1");
await starterAddons.apply();
storage.delete(starterAddons.SETUP);
await starterAddons.apply();
assert.equal(JSON.stringify(hosts()), JSON.stringify(dxbiOrder));
console.log("PASS a 2.37.0 visitor's addons get put in order too");

// Removed by the visitor: stays removed
state.profile.addons = state.profile.addons.filter((a) => !a.transportUrl.includes("torrentio"));
await starterAddons.apply();
assert.ok(!hosts().includes("torrentio.strem.fun"));
console.log("PASS a removed starter addon stays removed");

// Signed in: nothing is added to the account, and the record is cleared
state.profile = { auth: { key: "k", user: { _id: "u" } }, addons: defaults() };
await starterAddons.apply();
assert.equal(state.profile.addons.length, 6);
assert.equal(storage.has(starterAddons.KEY), false);
assert.equal(storage.has(starterAddons.SETUP), false);
console.log("PASS signed in: the account's addons are left alone");

// Signed out again: set up again; an addon that can't be reached is tried next time
state.profile = { auth: null, addons: defaults() };
state.fail.add("anime-catalogs");
await starterAddons.apply();
assert.ok(!hosts().includes("1fe84bc728af-stremio-anime-catalogs.baby-beamup.club"));
assert.equal(hosts().length, dxbiOrder.length - 1);
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
