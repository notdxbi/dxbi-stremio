// node tools/viewer-progress-test.mjs: each viewer keeps their own place in a title they share
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  const viewerProgress = {");
const end = source.indexOf("  coreHook = (live) => {");
const mStart = source.indexOf("  const syncMerge = {");
const mEnd = source.indexOf("  const cloudSync = {");
assert.ok(start > 0 && end > start && mStart > 0 && mEnd > mStart, "code found");

function device(list, current, owners = {}) {
  const data = new Map([["libraryOwners", owners]]);
  const local = new Map();
  const store = { get: (k, f) => (data.has(k) ? data.get(k) : f), set: (k, v) => data.set(k, v) };
  const viewers = { list: () => ({ list: list.map((id) => ({ id })) }), current: () => ({ id: current }), key: (s) => `${s}:${current}` };
  const localStorage = { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)) };
  const ctx = { store, viewers, localStorage, JSON, Object, Map, Set, Array, Date, String, Number, Math, Promise, setTimeout, log() {}, core: () => ({}), window: {}, preview: { library: {} }, libraryWatched: {}, episodes: { index: new Map() }, scheduleSync() {} };
  const [progress] = vm.runInNewContext(`${source.slice(start, end)}\n[viewerProgress, viewerLibrary]`, ctx);
  return { progress, store, set: (id) => { current = id; } };
}
const item = (id, t, extra = {}) => ({ _id: id, state: { timeOffset: t, duration: 3000, video_id: id, lastWatched: "2026-11-01T00:00:00.000Z", ...extra } });
const play = (p, id, t, d = 3000) => {
  p.observe({ action: "Load", args: { model: "Player", args: { metaRequest: { path: { id } }, streamRequest: { path: { id: `${id}:1:2` } } } } });
  p.observe({ action: "Player", args: { action: "TimeChanged", args: { time: t, duration: d } } });
  p.observe({ action: "Player", args: { action: "PausedChanged", args: { paused: true } } });
};

// Mum and Dad share a show. Dad watched to 20 minutes before this started; Mum then watches to 40.
const home = device(["main", "vmum"], "vmum", { tt1: ["main", "vmum"] });
home.progress.seed([item("tt1", 1200)]);
assert.equal(home.progress.all("main").tt1.t, 1200, "seed: Dad keeps the place the account had");
assert.equal(home.progress.all("vmum").tt1.t, 1200, "seed: so does Mum");
play(home.progress, "tt1", 2400);
assert.equal(home.progress.all("vmum").tt1.t, 2400);
assert.equal(home.progress.all("vmum").tt1.v, "tt1:1:2", "the episode is kept");
assert.equal(home.progress.all("main").tt1.t, 1200, "Mum watching doesn't move Dad's place");
console.log("PASS playing a shared title moves only that viewer's place");

// Stremio's shared state now says 40 minutes (Mum's): Dad sees his own 20
home.set("main");
const forDad = item("tt1", 2400);
assert.equal(home.progress.apply(forDad), true);
assert.equal(forDad.state.timeOffset, 1200, "Dad resumes at his own place");
home.set("vmum");
const forMum = item("tt1", 2400);
home.progress.apply(forMum);
assert.equal(forMum.state.timeOffset, 2400);
console.log("PASS each viewer resumes where they left off");

// A shared title one viewer hasn't watched stays out of their Continue Watching
const fresh = device(["main", "vmum"], "vmum", { tt2: ["main", "vmum"] });
assert.equal(fresh.progress.apply(item("tt2", 900)), false);
// ...and a title only one viewer has is left as Stremio keeps it
const solo = device(["main", "vmum"], "vmum", { tt3: ["vmum"] });
const own = item("tt3", 500);
assert.equal(solo.progress.apply(own), true);
assert.equal(own.state.timeOffset, 500);
console.log("PASS unwatched shared titles stay hidden, unshared ones untouched");

// Nearly finished or ended: Stremio's own state (it moves on to the next episode)
const end2 = device(["main", "vmum"], "vmum", { tt4: ["main", "vmum"] });
play(end2.progress, "tt4", 2900);
const near = item("tt4", 100, { video_id: "tt4:1:3" });
end2.progress.apply(near);
assert.equal(near.state.video_id, "tt4:1:3", "92% watched: Stremio's next episode is shown");
end2.progress.observe({ action: "Player", args: { action: "Ended", args: {} } });
assert.equal(end2.progress.all().tt4.done, true);
console.log("PASS a finished title follows Stremio's next episode");

// Seeding happens once per device, and only for viewers who own the title
const once = device(["main", "vmum"], "vmum", { tt5: ["main"] });
once.progress.seed([item("tt5", 700)]);
assert.equal(once.progress.all("main").tt5.t, 700);
assert.equal(once.progress.all("vmum").tt5, undefined, "Mum doesn't get Dad's title");
once.progress.seed([item("tt6", 50)]);
assert.equal(once.progress.all("main").tt6, undefined, "second seed does nothing");
const single = device(["main"], "main");
single.progress.seed([item("tt7", 50)]);
assert.equal(single.progress.all("main").tt7, undefined, "one viewer: nothing to keep apart");
console.log("PASS seeding runs once, for the right viewers");

// Throttle: time updates save at most every 15 s, a pause saves at once
const thr = device(["main", "vmum"], "main", { tt8: ["main", "vmum"] });
const p = thr.progress;
p.observe({ action: "Load", args: { model: "Player", args: { metaRequest: { path: { id: "tt8" } } } } });
p.observe({ action: "Player", args: { action: "TimeChanged", args: { time: 10, duration: 3000 } } });
p.observe({ action: "Player", args: { action: "TimeChanged", args: { time: 20, duration: 3000 } } });
assert.equal(p.all().tt8.t, 10, "second update within 15 s waits");
assert.equal(p.all().tt8.v, "tt8", "no stream id: the title's own id");
p.observe({ action: "Unload", args: {} });
assert.equal(p.all().tt8.t, 20, "closing the player saves");
console.log("PASS saves are throttled, closing the player saves");

// Keeps the newest 300
const many = device(["main", "vmum"], "main");
const big = {};
for (let i = 0; i < 300; i++) big[`old${i}`] = { v: "x", t: 1, d: 2, at: i + 1 };
many.store.set("progress:main", big);
play(many.progress, "newest", 30);
const kept = many.progress.all();
assert.equal(Object.keys(kept).length, 300);
assert.ok(kept.newest && !kept.old0, "the oldest place goes");
console.log("PASS only the newest 300 places are kept");

// Two devices: the newer place per title wins
const syncMerge = vm.runInNewContext(`${source.slice(mStart, mEnd)}\nsyncMerge`, { JSON, Object, Array, Map, Set, Number, String });
const merged = syncMerge.progress({ a: { t: 5, at: 10 }, b: { t: 1, at: 1 } }, { a: { t: 9, at: 5 }, b: { t: 7, at: 7 }, c: { t: 3, at: 3 } });
assert.deepEqual(JSON.parse(JSON.stringify(merged)), { a: { t: 5, at: 10 }, b: { t: 7, at: 7 }, c: { t: 3, at: 3 } });
console.log("PASS devices merge to the newest place per title");

// The card's progress bar and links follow this viewer's own episode
const cards = device(["main", "vmum"], "main", { tt9: ["main", "vmum"] });
cards.store.set("progress:main", { tt9: { v: "tt9:1:2", t: 600, d: 3000, at: 5 } });
const card = { _id: "tt9", progress: 0.9, state: { timeOffset: 2700, duration: 3000, video_id: "tt9:1:5" }, deepLinks: { player: "#/player/abc", metaDetailsStreams: "#/detail/series/tt9/tt9%3A1%3A5", metaDetailsVideos: "#/detail/series/tt9" } };
cards.progress.apply(card);
assert.equal(card.progress, 0.2, "the bar shows this viewer's place");
assert.equal(card.deepLinks.player, null, "no jumping into the other viewer's episode");
assert.equal(card.deepLinks.metaDetailsStreams, "#/detail/series/tt9/tt9%3A1%3A2", "opens this viewer's episode");
console.log("PASS the card's bar and links are this viewer's");
