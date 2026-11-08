// node tools/sync-older-service-test.mjs: a newer dx.bi syncing with an older sync service. A key the
// service doesn't know yet is left out, and everything else still syncs.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8").replace(/\r\n/g, "\n");
const pick = (from, to) => { const a = source.indexOf(from); const b = source.indexOf(to, a); assert.ok(a > 0 && b > a, from); return source.slice(a, b); };
const consts = pick("  const SYNC_ENDPOINT", "  const syncMerge = {");
const merge = pick("  const syncMerge = {", "  const cloudSync = {");
const sync = pick("  const cloudSync = {", "\n  // ---------------------------------------------------------------------------\n  // Viewers");

// The service as it was before it knew "progress:" keys
const dir = mkdtempSync(join(tmpdir(), "dxbi-sync-"));
const worker = readFileSync(join(root, "tools/profile-sync/worker.js"), "utf8").replace(/\r\n/g, "\n").replace("|progress):", "):");
assert.ok(!/cwDismissed\|progress/.test(worker), "older service made");
writeFileSync(join(dir, "worker.js"), worker);

const { default: old } = await import(pathToFileURL(join(dir, "worker.js")));
const { d1 } = await import(pathToFileURL(join(root, "tools/profile-sync/d1-sqlite.mjs")));
const env = { DB: d1() };

const calls = [];
const fetch = async (url, init) => {
  if (String(url) === "https://api.strem.io/api/getUser") return new Response(JSON.stringify({ result: { _id: "u1", email: "u1@example.com" } }));
  calls.push(JSON.parse(init.body).entries.map((e) => e.k));
  return old.fetch(new Request("https://sync.example/sync", { method: "POST", headers: { ...init.headers, Origin: "https://web.stremio.com" }, body: init.body }), env);
};
globalThis.fetch = fetch;

const t = Date.now();
const data = {
  viewers: { t, v: { list: [{ id: "main", name: "A" }, { id: "v2", name: "B" }], current: "main" } },
  "progress:main": { t, v: { tt1: { v: "tt1", t: 5, d: 10, at: t } } },
  "hidden:main": { t, v: [{ key: "movie:tt2", id: "tt2" }] },
};
const local = new Map([["profile", JSON.stringify({ auth: { key: "key-u1", user: { _id: "u1" } } })], ["dxbi.syncAccount", "u1"], ["dxbi.syncSince:u1", "1"]]);
const ctx = {
  store: { data, put: (k, e) => { data[k] = e; }, saveLocal() {}, get: (k, f) => (data[k] ? data[k].v : f) },
  settings: { profileSync: true },
  viewers: { list: () => data.viewers.v, current: () => ({ id: "main" }) },
  viewerLibrary: { switched() {} }, whoIsWatching: { el: null, render() {} },
  localStorage: { getItem: (k) => (local.has(k) ? local.get(k) : null), setItem: (k, v) => local.set(k, String(v)), removeItem: (k) => local.delete(k) },
  fetch, AbortSignal, JSON, Object, Array, Map, Set, Date, Number, String, Math, Promise, RegExp, setTimeout: () => 0, clearTimeout() {}, log() {}, scheduleSync() {},
};
const cloudSync = vm.runInNewContext(`${consts}\n${merge}\n${sync}\ncloudSync`, ctx);
for (const k of Object.keys(data)) cloudSync.dirty.add(k);

await cloudSync.run();
assert.equal(calls.length, 1);
assert.ok(cloudSync.unknownKeys.has("progress:main"), "the key the service refused is set aside");
assert.equal(cloudSync.failures, 0, "not counted as the service being down");
await cloudSync.run();
assert.deepEqual([...calls[1]].sort(), ["hidden:main", "viewers"], "everything else goes on the next try");
assert.equal(cloudSync.dirty.size, 0);
console.log("PASS an older sync service still syncs everything it knows");

// once set aside, the key stays out (until dx.bi restarts, by when the service may know it)
data["progress:main"] = { t: t + 1, v: {} };
cloudSync.changed("progress:main");
await cloudSync.run();
assert.ok(!calls[2].includes("progress:main"));
console.log("PASS a refused key isn't sent again this session");
rmSync(dir, { recursive: true, force: true });
