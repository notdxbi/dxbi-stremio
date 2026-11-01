// dx.bi — Copyright (C) 2026 dx.bi. From dx.bi, Copyright (C) 2026 lavagnou. GNU General Public License, version 3 or later (see LICENSE).
//
// Checks the profile-sync Worker without Cloudflare: Node's SQLite stands in for D1, and Stremio's
// getUser is answered here (session "key-u1" is account u1, "key-u2" is u2, anything else isn't valid).
//   node tools/profile-sync/test.mjs
import worker from "./worker.js";
import { d1 } from "./d1-sqlite.mjs";

const realFetch = globalThis.fetch;
let stremioCalls = 0;
globalThis.fetch = async (url, init) => {
  if (String(url) !== "https://api.strem.io/api/getUser") return realFetch(url, init);
  stremioCalls++;
  const body = JSON.parse(init.body);
  if (body.type !== "GetUser") return new Response(JSON.stringify({ error: { message: "bad request", code: 1 } }));
  const m = /^key-(u\d)$/.exec(body.authKey);
  return new Response(JSON.stringify(m ? { result: { _id: m[1], email: `${m[1]}@example.com` } } : { error: { message: "Session does not exist", code: 1 } }));
};

const env = { DB: d1() };
const failures = [];
const check = (ok, what) => { console.log(`${ok ? "  ✓" : "  ✗"} ${what}`); if (!ok) failures.push(what); };
const sync = async (key, body, origin = "https://web.stremio.com") => {
  const headers = { "Content-Type": "application/json", Origin: origin };
  if (key) headers.Authorization = `Stremio ${key}`;
  const r = await worker.fetch(new Request("https://sync.example/sync", { method: "POST", headers, body: JSON.stringify(body) }), env);
  return { status: r.status, cors: r.headers.get("Access-Control-Allow-Origin"), json: await r.json() };
};

const pre = await worker.fetch(new Request("https://sync.example/sync", { method: "OPTIONS", headers: { Origin: "https://web.stremio.com" } }), env);
check(pre.status === 204 && pre.headers.get("Access-Control-Allow-Origin") === "https://web.stremio.com" && /Authorization/.test(pre.headers.get("Access-Control-Allow-Headers")), "CORS preflight for web.stremio.com");
check((await sync(null, {})).status === 401, "no session key: 401");
check((await sync("key-nobody", {})).status === 401, "a key Stremio doesn't know: 401");

const t0 = Date.now() - 1000;
const viewers = { list: [{ id: "main", name: "Nath", colour: "#e50914" }, { id: "v2", name: "Léo", colour: "#2f80ff", avatar: "rocket", pin: "ab".repeat(32) }], current: "main" };
let r = await sync("key-u1", { since: 0, entries: [{ k: "viewers", t: t0, v: viewers }, { k: "hidden:v2", t: t0, v: [{ key: "movie:tt1", id: "tt1" }] }, { k: "kidsAllow", t: t0, v: null }] });
check(r.status === 200 && r.cors === "https://web.stremio.com" && Array.isArray(r.json.entries) && r.json.entries.length === 0, "first device sends: stored, nothing new for it");
const firstNow = r.json.now;

r = await sync("key-u1", { since: 0, entries: [] });
const got = Object.fromEntries(r.json.entries.map((e) => [e.k, e]));
check(got.viewers && got.viewers.v.list[1].avatar === "rocket" && got.viewers.t === t0 && got["hidden:v2"] && "kidsAllow" in got && got.kidsAllow.v === null, "another device gets everything (values, times, deletions)");

r = await sync("key-u2", { since: 0, entries: [] });
check(r.status === 200 && r.json.entries.length === 0, "another account sees none of it");

r = await sync("key-u1", { since: 0, entries: [{ k: "viewers", t: t0 - 5000, v: { list: [], current: "x" } }] });
r = await sync("key-u1", { since: 0, entries: [] });
check(r.json.entries.find((e) => e.k === "viewers").v.list.length === 2, "an older change doesn't replace a newer one");

await new Promise((res) => setTimeout(res, 5));
r = await sync("key-u1", { since: 0, entries: [{ k: "homeLayout:v2", t: Date.now(), v: { order: ["a|movie|top"], hidden: [] } }] });
const since = r.json.now + 61000; // past the overlap: only what's newer than this comes back
r = await sync("key-u1", { since, entries: [] });
check(r.json.entries.length === 0, "since: nothing new means nothing sent");
r = await sync("key-u1", { since: firstNow, entries: [] });
check(r.json.entries.some((e) => e.k === "homeLayout:v2"), "since: later changes come back");

r = await sync("key-u1", { since: 0, entries: [{ k: "libraryOwners", t: Date.now(), v: { tt1: ["v2"] } }] });
check(r.status === 200, "who owns a title is kept (libraryOwners)");
r = await sync("key-u1", { since: 0, entries: [{ k: "parentPin", t: Date.now(), v: "hash" }] });
check(r.status === 400, "the parental PIN is refused: it stays on each device");
r = await sync("key-u1", { since: 0, entries: [{ k: "dxbi.meta.tt1", t: Date.now(), v: {} }] });
check(r.status === 400, "keys dx.bi doesn't sync are refused");
r = await sync("key-u1", { since: 0, entries: [{ k: "hidden:v2", t: Date.now(), v: "x".repeat(110 * 1024) }] });
check(r.status === 413, "a value over 100 KB is refused");
const big = Array.from({ length: 12 }, (_, i) => ({ k: `hidden:p${i}`, t: Date.now(), v: "x".repeat(95 * 1024) }));
r = await sync("key-u1", { since: 0, entries: big });
check(r.status === 413, "an account over 1 MB is refused");
r = await sync("key-u1", { since: 0, entries: [{ k: "kidsAllow", t: Date.now() + 3 * 86400000, v: [] }] });
check(r.status === 400, "a time far in the future is refused");

const callsBefore = stremioCalls;
await sync("key-u1", { since: 0, entries: [] });
check(stremioCalls === callsBefore, "Stremio isn't asked again for a key it just answered");

const stored = JSON.stringify(env.DB.dump());
check(!stored.includes("key-u1") && !stored.includes("key-u2"), "the session key is never stored");
check(env.DB.dump().every((row) => row.account === "u1"), "rows are filed under the Stremio account id");

console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
process.exit(failures.length ? 1 : 0);
