// node tools/viewer-merge-test.mjs: what happens when two devices' viewers meet
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const code = source.slice(source.indexOf("  const SYNCED ="), source.indexOf("  // ---------------------------------------------------------------------------\n  // Viewers (\"Who's watching?\")"));
const calls = [];
function setup(data, viewerCount = 2) {
  const store = {
    data, saved: 0,
    put(k, e) { this.data[k] = e; },
    saveLocal() { this.saved++; },
    get(k, f) { return this.data[k]?.v ?? f; },
  };
  const noop = { apply() {}, load() {}, reset() {}, switched() { calls.push("switched"); } };
  const local = new Map([["profile", JSON.stringify({ auth: { key: "k", user: { _id: "u1" } } })]]);
  return vm.runInNewContext(code + "\n({ SYNCED, syncMerge, cloudSync })", {
    store, settings: { profileSync: true }, stats: noop, restrict: noop, viewerLibrary: noop, hero: noop,
    whoIsWatching: {}, scheduleSync() {}, log() {}, Date, JSON, Object, Number, Math, Set, Array, String, setTimeout, clearTimeout,
    viewers: { list: () => ({ list: Array.from({ length: viewerCount }, (_, i) => ({ id: "v" + i })) }) },
    localStorage: { getItem: (k) => local.get(k) ?? null, setItem: (k, v) => local.set(k, v), removeItem: (k) => local.delete(k) },
  });
}
const { syncMerge, SYNCED } = setup({});
const plain = (x) => JSON.parse(JSON.stringify(x));

// The reported case: both devices made "Mum" on their own
let r = plain(syncMerge.viewers(
  { list: [{ id: "main", name: "Dad" }, { id: "vb", name: "Mum" }], current: "main" },
  { list: [{ id: "main", name: "Dad" }, { id: "va", name: "mum " }], current: "va" }, true));
assert.deepEqual(r.aliases, { vb: "va" });
assert.deepEqual(r.value.list.map((v) => v.id), ["main", "va"]);
assert.equal(r.value.current, "main", "each device keeps its own current viewer");
console.log("PASS one person made on two devices becomes one viewer");

const pc = plain(syncMerge.viewers({ list: [{ id: "main", name: "Dad" }, { id: "va", name: "Mum" }], current: "main" }, { list: [{ id: "main", name: "Dad" }, { id: "vb", name: "Mum" }], current: "vb" }, false));
assert.deepEqual(pc.aliases, { vb: "va" }, "the other device settles on the same id");
console.log("PASS both devices settle on the same id");

r = plain(syncMerge.viewers({ list: [{ id: "main", name: "Dad" }, { id: "a", name: "Mum" }], current: "a" }, { list: [{ id: "main", name: "Dad" }, { id: "b", name: "Sam" }], removed: ["a"], current: "b" }, true));
assert.deepEqual(r.value.list.map((v) => v.id), ["main", "b"], "removed stays removed");
assert.equal(r.value.current, "main", "a removed current viewer falls back to the first");
r = plain(syncMerge.viewers({ list: [{ id: "main", name: "Dad" }, { id: "a", name: "Mum" }] }, { list: [{ id: "main", name: "Dad" }, { id: "b", name: "Sam" }] }, true));
assert.deepEqual(r.value.list.map((v) => v.id), ["main", "b", "a"], "new viewers from both devices stay, first viewer stays first");
console.log("PASS removals stick, additions from both sides stay, first viewer stays first");

assert.deepEqual(plain(syncMerge.owners({ tt1: ["main"], tt2: ["vb"] }, { tt1: ["va"], tt3: ["va"] }, true, { vb: "va" })), { tt1: ["va"], tt2: ["va"], tt3: ["va"] });
assert.deepEqual(plain(syncMerge.owners({ tt1: [] }, { tt1: ["va"] }, false)), { tt1: [] }, "a newer release wins");
assert.deepEqual(plain(syncMerge.latest({ a: 5, b: 1 }, { a: 2, c: 3 })), { a: 5, b: 1, c: 3 });
console.log("PASS owners merge title by title; dismissals keep the latest");

assert.ok(SYNCED.test("viewers") && SYNCED.test("hidden:va") && SYNCED.test("homeLayout:main") && SYNCED.test("cwDismissed:va"));
for (const k of ["parentPin", "stats:va", "playback:va", "tune:va", "meta:tt1"]) assert.ok(!SYNCED.test(k), k);
console.log("PASS only what's meant to leave the device can");

// The bug itself: the PC has never heard of the title; the sync says it's Mum's and moves her data
const data = {
  viewers: { t: 10, v: { list: [{ id: "main", name: "Dad" }, { id: "vb", name: "Mum" }], current: "main" } },
  "hidden:vb": { t: 10, v: [{ id: "tt9" }] },
  "stats:vb": { t: 10, v: { kept: true } },
};
const device = setup(data);
device.cloudSync.merge([
  { k: "viewers", t: 20, v: { list: [{ id: "main", name: "Dad" }, { id: "va", name: "Mum" }], current: "va" } },
  { k: "libraryOwners", t: 21, v: { tt1: ["va"] } },
]);
assert.equal(plain(data.viewers.v).current, "main");
assert.deepEqual(plain(data.libraryOwners.v), { tt1: ["va"] });
assert.deepEqual(plain(data["hidden:va"].v), [{ id: "tt9" }], "what Mum had here moves to the kept id");
assert.deepEqual(plain(data["stats:va"].v), { kept: true }, "local-only data moves too");
assert.equal(data["hidden:vb"], undefined);
assert.ok(calls.includes("switched"), "the library refreshes");
console.log("PASS a title watched on another device goes to its viewer, not the first one");

// A device that already has the merged result still has to send it: the server holds the other copy
const holder = {
  viewers: { t: 10, v: { list: [{ id: "main", name: "Dad" }, { id: "va", name: "Mum" }], current: "main" } },
};
const first = setup(holder);
const before = Date.now();
first.cloudSync.merge([{ k: "viewers", t: 20, v: { list: [{ id: "main", name: "Dad" }, { id: "vb", name: "Mum" }], current: "vb" } }]);
assert.deepEqual(plain(holder.viewers.v.list).map((v) => v.id), ["main", "va"]);
assert.ok(first.cloudSync.dirty.has("viewers"), "the merged list goes back out");
assert.ok(holder.viewers.t >= before, "with a time the server will accept");

// Settled: a copy that only differs in who's picked, or in key order, starts no conversation
const settled = {
  viewers: { t: 30, v: { list: [{ id: "main", name: "Dad" }], current: "main", removed: ["a", "b"] } },
  libraryOwners: { t: 30, v: { tt1: ["main"], tt2: ["main"] } },
};
const quiet = setup(settled);
quiet.cloudSync.merge([
  { k: "viewers", t: 31, v: { list: [{ id: "main", name: "Dad" }], current: "other", removed: ["b", "a"] } },
  { k: "libraryOwners", t: 31, v: { tt2: ["main"], tt1: ["main"] } },
]);
assert.equal(quiet.cloudSync.dirty.size, 0, "nothing goes back");
assert.equal(settled.viewers.t, 30);
console.log("PASS a merged result is sent back once; a settled one starts nothing");

const single = setup({}, 1);
single.cloudSync.changed("viewers");
assert.equal(single.cloudSync.on(), false);
assert.equal(single.cloudSync.dirty.size, 0, "one viewer: nothing leaves the device");
console.log("PASS a device with one viewer sends nothing");
process.exit(0);
