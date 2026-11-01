// dx.bi — Copyright (C) 2026 dx.bi. From dx.bi, Copyright (C) 2026 lavagnou. GNU General Public License, version 3 or later (see LICENSE).
//
// dx.bi's viewer sync (a Cloudflare Worker with a D1 database). Each person's dx.bi viewers
// (names, who owns which library title, Home rows, hidden titles) follow them on every device, filed
// under their Stremio account: no other account to make.
//
// The apps send their Stremio session key; this asks Stremio's API who it belongs to (getUser, as
// Stremio's own apps do) and files the data under that account's id. The key itself is never stored
// or logged: only a short-lived in-memory note of which account a key's hash belongs to, so Stremio
// isn't asked on every request.
//
// One route, POST /sync: { since, entries: [{ k, t, v }] } → { now, entries }. Entries are the
// plugin's store entries ({ t: time, v: value }); the most recent one of each key wins.

const ALLOWED_ORIGINS = new Set(["https://web.stremio.com"]);
const STREMIO_API = "https://api.strem.io/api/getUser";

// What can be kept: the profiles and their choices, and dx.bi's settings, nothing else
const KEY = /^(viewers|libraryOwners|kidsAllow|(homeLayout|hidden|cwDismissed):[\w-]{1,40})$/;
const MAX_BODY = 1536 * 1024;
const MAX_ENTRIES = 200;
const MAX_VALUE = 100 * 1024;
const MAX_ACCOUNT = 1024 * 1024;
// a little overlap on "since": a write that started just before the last answer is still seen
const OVERLAP = 60 * 1000;

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://web.stremio.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(request, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(request) } });
}

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Which account a session key belongs to, by its hash, for a few minutes (this Worker's memory only)
const known = new Map();

// The Stremio account id of a session key: null when Stremio says it's not a valid key, throws when
// Stremio can't be reached
async function accountOf(key) {
  const hash = await sha256(key);
  const hit = known.get(hash);
  if (hit && hit.until > Date.now()) return hit.id;
  const r = await fetch(STREMIO_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "GetUser", authKey: key }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Stremio ${r.status}`);
  const answer = await r.json();
  const id = answer && answer.result && typeof answer.result._id === "string" ? answer.result._id : null;
  if (!id) return null;
  if (known.size > 5000) known.clear();
  known.set(hash, { id, until: Date.now() + 10 * 60 * 1000 });
  return id;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    if (url.pathname !== "/sync") return reply(request, 404, { error: "not found" });
    if (request.method !== "POST") return reply(request, 405, { error: "POST only" });
    if (!env.DB) return reply(request, 503, { error: "Profile sync isn't set up yet." });

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.IP_LIMIT && !(await env.IP_LIMIT.limit({ key: ip })).success) return reply(request, 429, { error: "Too many requests: try again in a few minutes." });

    const auth = request.headers.get("Authorization") || "";
    const key = auth.startsWith("Stremio ") ? auth.slice(8).trim() : "";
    if (!key || key.length > 200) return reply(request, 401, { error: "Sign in to Stremio to sync profiles." });
    let account;
    try {
      account = await accountOf(key);
    } catch (_) {
      return reply(request, 503, { error: "Stremio can't be reached right now." });
    }
    if (!account) return reply(request, 401, { error: "Stremio doesn't know this session: sign in again." });
    if (env.ACCOUNT_LIMIT && !(await env.ACCOUNT_LIMIT.limit({ key: account })).success) return reply(request, 429, { error: "Too many requests: try again in a few minutes." });

    if (Number(request.headers.get("Content-Length") || 0) > MAX_BODY) return reply(request, 413, { error: "Too much at once." });
    let body;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY) return reply(request, 413, { error: "Too much at once." });
      body = JSON.parse(raw || "{}");
    } catch (_) {
      return reply(request, 400, { error: "That isn't a dx.bi sync." });
    }
    const since = Number(body && body.since) || 0;
    const incoming = Array.isArray(body && body.entries) ? body.entries : [];
    if (incoming.length > MAX_ENTRIES) return reply(request, 413, { error: "Too much at once." });

    const now = Date.now();
    const entries = [];
    for (const e of incoming) {
      if (!e || typeof e.k !== "string" || !KEY.test(e.k)) return reply(request, 400, { error: `Not something dx.bi syncs: ${String(e && e.k).slice(0, 40)}` });
      const t = Number(e.t);
      if (!Number.isFinite(t) || t <= 0 || t > now + 86400000) return reply(request, 400, { error: "That isn't a dx.bi sync." });
      const v = JSON.stringify(e.v === undefined ? null : e.v);
      if (v.length > MAX_VALUE) return reply(request, 413, { error: `Too big to sync: ${e.k}` });
      entries.push({ k: e.k, t: Math.floor(t), v });
    }

    // What the account has: the most recent of each key wins, and it all has to fit in its share
    const stored = await env.DB.prepare("SELECT k, t, LENGTH(v) AS l FROM entries WHERE account = ?").bind(account).all();
    const have = new Map((stored.results || []).map((r) => [r.k, r]));
    let size = (stored.results || []).reduce((n, r) => n + r.l, 0);
    const writes = [];
    const written = new Set();
    for (const e of entries) {
      const old = have.get(e.k);
      if (old && old.t >= e.t) continue;
      size += e.v.length - (old ? old.l : 0);
      writes.push(e);
      written.add(e.k);
    }
    if (size > MAX_ACCOUNT) return reply(request, 413, { error: "These profiles are too big to sync." });
    if (writes.length) {
      const upsert = env.DB.prepare(
        "INSERT INTO entries (account, k, t, v, s) VALUES (?, ?, ?, ?, ?) ON CONFLICT (account, k) DO UPDATE SET t = excluded.t, v = excluded.v, s = excluded.s WHERE excluded.t > entries.t"
      );
      await env.DB.batch(writes.map((e) => upsert.bind(account, e.k, e.t, e.v, now)));
    }

    // What changed since this device last looked (but not what it just sent)
    const changed = await env.DB.prepare("SELECT k, t, v FROM entries WHERE account = ? AND s > ?").bind(account, Math.max(0, since - OVERLAP)).all();
    const out = [];
    for (const r of changed.results || []) {
      if (written.has(r.k)) continue;
      let v = null;
      try { v = JSON.parse(r.v); } catch (_) { /* skipped below */ }
      out.push({ k: r.k, t: r.t, v });
    }
    return reply(request, 200, { now, entries: out });
  },
};
