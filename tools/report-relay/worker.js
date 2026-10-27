// dx.bi — Copyright (C) 2026 dx.bi. GNU General Public License, version 3 or later (see LICENSE).
//
// dx.bi's problem-report relay (a Cloudflare Worker). The apps send their "Report a problem" reports
// here; this posts them to a private Discord channel. The Discord webhook stays a secret of this
// Worker (DISCORD_WEBHOOK), so it never appears in dx.bi's open-source code, and can be replaced
// here without updating the apps.
//
// Only well-formed dx.bi reports get through: the Discord message is written here from checked
// fields (nothing pings, no links), the full report is attached as a file, and each address can
// send a few reports a minute at most.

const ALLOWED_ORIGINS = new Set(["https://web.stremio.com"]);
const MAX_BODY = 256 * 1024;
const WHERE = new Set(["dx.bi app", "dx.bi TV", "Stremio Enhanced plugin"]);

function cors(request) {
  const origin = request.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.has(origin) ? origin : "https://web.stremio.com",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function reply(request, status, body) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...cors(request) } });
}

// Text that can't ping anyone, link anywhere or break out of its quote
function plain(text, max) {
  return String(text == null ? "" : text)
    .slice(0, max)
    .replace(/@/g, "@​")
    .replace(/:\/\//g, ":/​/")
    .replace(/<[#@&!:a-z]/gi, (m) => m[0] + "​" + m.slice(1))
    .replace(/`/g, "'")
    .replace(/[\u0000-\u0009\u000b-\u001f]/g, "");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
    if (url.pathname !== "/report") return reply(request, 404, { error: "not found" });
    if (request.method !== "POST") return reply(request, 405, { error: "POST only" });
    if (!env.DISCORD_WEBHOOK) return reply(request, 503, { error: "Reporting isn't set up yet." });

    // A few reports a minute per address
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    if (env.REPORTS_LIMIT) {
      const { success } = await env.REPORTS_LIMIT.limit({ key: ip });
      if (!success) return reply(request, 429, { error: "Too many reports right now: try again in a few minutes." });
    }

    const length = Number(request.headers.get("Content-Length") || 0);
    if (length > MAX_BODY) return reply(request, 413, { error: "That report is too big." });
    let raw;
    try {
      raw = await request.text();
    } catch (_) {
      return reply(request, 400, { error: "Couldn't read the report." });
    }
    if (raw.length > MAX_BODY) return reply(request, 413, { error: "That report is too big." });
    let report;
    try {
      report = JSON.parse(raw);
    } catch (_) {
      return reply(request, 400, { error: "That isn't a dx.bi report." });
    }

    // The shape every dx.bi report has
    const ok = report && typeof report === "object"
      && /^[A-Z0-9]{6}$/.test(report.code || "")
      && /^\d+\.\d+\.\d+$/.test(report.dxbi || "")
      && WHERE.has(report.where)
      && typeof report.route === "string" && report.route.length < 40
      && (report.description == null || typeof report.description === "string")
      && Array.isArray(report.recentErrors);
    if (!ok) return reply(request, 400, { error: "That isn't a dx.bi report." });

    const description = plain(report.description || "", 600).trim();
    const lastError = report.recentErrors.length ? plain(report.recentErrors[report.recentErrors.length - 1], 180) : "";
    const device = report.tv && typeof report.tv === "object" && report.tv.device ? ` · ${plain(report.tv.device, 60)}` : "";
    const content = [
      `**${report.code}** · ${report.where} ${report.dxbi} · ${plain(report.platform || "?", 40)}${device} · on ${plain(report.route, 30)}`,
      description ? "> " + description.replace(/\n/g, "\n> ") : "> (no description)",
      lastError ? `Last error: \`${lastError}\`` : "No errors recorded.",
    ].join("\n").slice(0, 1900);

    const form = new FormData();
    form.append("payload_json", JSON.stringify({ username: "dx.bi reports", content, allowed_mentions: { parse: [] }, flags: 4 }));
    form.append("files[0]", new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }), `dxbi-report-${report.code}.json`);
    const sent = await fetch(env.DISCORD_WEBHOOK, { method: "POST", body: form });
    if (!sent.ok) return reply(request, 502, { error: sent.status === 429 ? "Too many reports right now: try again in a few minutes." : "Couldn't pass the report on." });
    return reply(request, 200, { ok: true, code: report.code });
  },
};
