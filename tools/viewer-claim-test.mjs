// node tools/viewer-claim-test.mjs: whose title is it, when two devices list their viewers differently
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const start = source.indexOf("  const viewerLibrary = {");
const end = source.indexOf("  coreHook = (live) => {");
assert.ok(start > 0 && end > start, "viewerLibrary found");

function device(list, current, library = {}) {
  const data = new Map();
  const store = { get: (k, f) => (data.has(k) ? data.get(k) : f), set: (k, v) => data.set(k, v) };
  const viewers = { list: () => ({ list: list.map((id) => ({ id })) }), current: () => ({ id: current }), key: (s) => `${s}:${current}` };
  const localStorage = { getItem: (k) => (k === "library" ? JSON.stringify({ items: library }) : null) };
  const lib = vm.runInNewContext(`${source.slice(start, end)}\nviewerLibrary`, { store, viewers, localStorage, JSON, Object, Map, Set, Array, Date, String, Promise, setTimeout, log() {}, core: () => ({}), window: {}, preview: { library: {} }, libraryWatched: {}, episodes: { index: new Map() }, scheduleSync() {} });
  return { lib, store, set: (id) => { current = id; } };
}

// The reported case: Mum is first on the TV's list, Dad is first on the PC's. Her film must reach her
// list, and the PC must not hand it to Dad.
const tv = device(["main", "vmum"], "vmum");
const pc = device(["vmum", "main"], "main");
assert.equal(tv.lib.base(), pc.lib.base(), "both devices agree who gets unclaimed titles");
tv.lib.claim("tt1");
pc.store.set("libraryOwners", tv.store.get("libraryOwners"));
assert.equal(pc.lib.mine("tt1"), false, "Mum's film stays out of Dad's Continue Watching");
console.log("PASS a title played on one device stays that viewer's on another");

// The viewer who gets unclaimed titles still leaves a note
const dad = device(["main", "vmum"], "main");
dad.lib.claim("tt2");
assert.deepEqual(JSON.parse(JSON.stringify(dad.store.get("libraryOwners"))), { tt2: ["main"] });
console.log("PASS the first viewer's titles are written down too");

// A title already in the first viewer's library stays there when someone else plays it
const shared = device(["main", "vmum"], "vmum", { tt3: { _id: "tt3" } });
shared.lib.claim("tt3");
assert.deepEqual(JSON.parse(JSON.stringify(shared.store.get("libraryOwners"))).tt3, ["main", "vmum"]);
shared.lib.claim("tt3");
assert.deepEqual(JSON.parse(JSON.stringify(shared.store.get("libraryOwners"))).tt3, ["main", "vmum"], "playing it again changes nothing");
console.log("PASS a shared title keeps both viewers");

// Watched but never saved: it's whoever plays it, and it leaves the first viewer's Continue Watching
const leaked = device(["main", "vmum"], "vmum", { tt5: { _id: "tt5", removed: true, temp: true } });
assert.equal(leaked.lib.mine("tt5"), false);
leaked.lib.claim("tt5");
leaked.set("main");
assert.equal(leaked.lib.mine("tt5"), false, "gone from the first viewer");
console.log("PASS a title that isn't saved anywhere goes to the viewer playing it");

// Removing from Continue Watching never reaches Stremio: that would wipe the other viewer's place
const dismiss = device(["main", "vmum"], "main", { tt6: { _id: "tt6", removed: true, temp: true, state: { lastWatched: "2026-01-01T00:00:00Z" } } });
const cut = dismiss.lib.intercept({ action: "Ctx", args: { action: "RewindLibraryItem", args: "tt6" } });
assert.equal(cut, false, "swallowed");
assert.equal(dismiss.lib.dismissed("tt6"), true);
console.log("PASS removing from Continue Watching only affects this viewer");

// One viewer: nothing is written, there's nothing to keep apart
const alone = device(["main"], "main");
alone.lib.claim("tt4");
assert.equal(alone.store.get("libraryOwners", null), null);
console.log("PASS a single viewer writes nothing");
