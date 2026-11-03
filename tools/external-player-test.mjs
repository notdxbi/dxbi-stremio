// Opens a stream in an external mpv the way dx.bi's External player setting does, and checks that
// the progress is kept: the progress pop-up, the place saved while watching and when mpv closes,
// Continue Watching, resuming there next time, a skip not counting as watched, watched at 70%, and
// the place saved when dx.bi itself closes while mpv is still open.
//
// It runs in its own fresh profile (nothing touches your dx.bi or Stremio account), and mpv's window
// shows while it runs.
//
// node tools/external-player-test.mjs <dx.bi.exe, or app/dist/main.js for a source build> [mpv.exe] [screenshot.png]
import { spawn, execFileSync } from "node:child_process";
import { createReadStream, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const target = process.argv[2];
const mpvPath = process.argv[3] || "";
const shotPath = process.argv[4] || "";
const PORT = 9334;
const CLIP_PORT = 18767;
const CLIP_SECONDS = 60;
const MOVIE = "tt1727587";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);
const check = (ok, good, bad) => (ok ? pass(good) : fail(bad));

async function waitFor(what, fn, timeout = 60000, every = 500) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (last: ${JSON.stringify(last)})` : ""}`);
}

// ---------------------------------------------------------------------------------------------------
// dx.bi, in a profile of its own

const profile = mkdtempSync(join(tmpdir(), "dxbi-ext-test-"));
let app, appLog = "";

function launch() {
  const source = target.endsWith(".js");
  const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "app");
  const exe = source ? join(appDir, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron") : target;
  const args = [...(source ? [resolve(target)] : []), `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(profile, "dxbi")}`];
  appLog = "";
  app = spawn(exe, args, {
    env: { ...process.env, APPDATA: profile, DXBI_DATA_DIR: join(profile, "dxbi"), DXBI_IMPORT: "fresh", DXBI_MPV: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  app.stdout.on("data", (d) => { appLog += d; });
  app.stderr.on("data", (d) => { appLog += d; });
}

let ws;
const pending = new Map();
let nextId = 0;
const send = (method, params = {}) => new Promise((res) => { const id = ++nextId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluation failed");
  return r.result?.result?.value;
}

async function connect() {
  const page = await waitFor("the window", async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    return list.find((t) => t.type === "page" && /stremio\.com/.test(t.url));
  }, 90000);
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  await send("Runtime.enable");
  await waitFor("Stremio", () => evaluate("document.readyState === 'complete' && !!document.querySelector('#app') && !!(window.core || window.__permanentCore?.getState)"));
}

async function quitApp() {
  try { ws?.close(); } catch (_) { /* closed */ }
  if (app.exitCode === null) {
    const exited = new Promise((r) => app.once("exit", r));
    app.kill();
    await Promise.race([exited, sleep(5000)]);
  }
}

// Stremio's core, from the page. Its web build shares only the place (timeOffset, video_id) from the
// player, and the whole library entry from a title's page.
const coreState = (model) => evaluate(`(window.core || window.__permanentCore).getState(${JSON.stringify(model)})`);
const playerItem = async () => (await coreState("player"))?.libraryItem?.state ?? null;
async function continueWatching() {
  const cw = await coreState("continue_watching_preview");
  return (cw?.items || []).map((i) => i.libraryItem || i).find((li) => li && li._id === MOVIE) ?? null;
}
// The movie's library entry, from its page (dx.bi goes back home afterwards)
async function libraryEntry() {
  await evaluate(`location.hash = "#/detail/movie/${MOVIE}"; true`);
  const state = await waitFor("the title's page", async () => (await coreState("meta_details"))?.libraryItem?.state, 15000).catch(() => null);
  await evaluate(`location.hash = "#/"; true`);
  return state;
}

// ---------------------------------------------------------------------------------------------------
// mpv, through the pipe or socket dx.bi opened it with

function mpvSockets() {
  const dir = process.platform === "win32" ? "\\\\.\\pipe\\" : tmpdir();
  return readdirSync(dir).filter((f) => /^dxbi-mpv-/.test(f)).map((f) => dir + (process.platform === "win32" ? "" : "/") + f);
}

function mpv(socket, command) {
  return new Promise((res, rej) => {
    const c = net.createConnection(socket);
    let buf = "";
    const timer = setTimeout(() => { c.destroy(); rej(new Error("mpv didn't answer")); }, 2000);
    c.on("connect", () => c.write(JSON.stringify({ command, request_id: 7 }) + "\n"));
    c.on("data", (d) => {
      buf += d;
      for (const line of buf.split("\n")) {
        try {
          const msg = JSON.parse(line);
          if (msg.request_id === 7) { clearTimeout(timer); c.destroy(); return msg.error === "success" ? res(msg.data) : rej(new Error(msg.error)); }
        } catch (_) { /* partial */ }
      }
    });
    c.on("error", (e) => { clearTimeout(timer); rej(e); });
  });
}

// ---------------------------------------------------------------------------------------------------

function serveClip() {
  const clip = join(profile, "clip.mp4");
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=640x360:rate=24", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
    "-t", String(CLIP_SECONDS), "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", "-movflags", "+faststart", "-shortest", clip]);
  const size = statSync(clip).size;
  http.createServer((req, res) => {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    const head = { "Content-Type": "video/mp4", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    if (m) {
      const s = +m[1], e = m[2] ? +m[2] : size - 1;
      res.writeHead(206, { ...head, "Content-Range": `bytes ${s}-${e}/${size}`, "Content-Length": e - s + 1 });
      createReadStream(clip, { start: s, end: e }).pipe(res);
    } else {
      res.writeHead(200, { ...head, "Content-Length": size });
      createReadStream(clip).pipe(res);
    }
  }).listen(CLIP_PORT, "127.0.0.1");
}

const stream = { url: `http://127.0.0.1:${CLIP_PORT}/clip.mp4`, name: "dx.bi test", title: "external player" };
const playerHashFor = (type, metaId, videoId) => `#/player/${encodeURIComponent(zlib.deflateSync(Buffer.from(JSON.stringify(stream))).toString("base64"))}/${encodeURIComponent(`http://127.0.0.1:${CLIP_PORT}/manifest.json`)}/${encodeURIComponent("https://v3-cinemeta.strem.io/manifest.json")}/${type}/${metaId}/${encodeURIComponent(videoId)}`;
const playerHash = playerHashFor("movie", MOVIE, MOVIE);
// A series episode (Breaking Bad S1 E1), and the one after it
const SERIES = "tt0903747";
const EPISODE = `${SERIES}:1:1`;
const NEXT_EPISODE = `${SERIES}:1:2`;

// Press Play: dx.bi hands the stream to mpv. Returns mpv's socket
async function play(before, hash = playerHash) {
  await evaluate(`location.hash = "#/"; true`);
  await sleep(500);
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);
  const socket = await waitFor("mpv to open", () => mpvSockets().find((s) => !before.includes(s)), 30000);
  await waitFor("mpv to play", async () => (await mpv(socket, ["get_property", "time-pos"]).catch(() => null)) > 0.5, 30000);
  return socket;
}

async function main() {
  serveClip();
  pass("test clip ready (60 s, H.264 MP4)");

  launch();
  // Stops before touching anything unless dx.bi really is in the test profile
  const dataDir = await waitFor("dx.bi's user data path", () => appLog.match(/User data path: (.*)/)?.[1]?.trim(), 30000);
  if (!dataDir.startsWith(profile)) throw new Error(`dx.bi is using ${dataDir}, not the test profile: stopping`);
  await connect();
  pass(`dx.bi running in a test profile (${dataDir})`);

  await evaluate(`localStorage.setItem("checkForUpdatesOnStartup","false"); localStorage.setItem("externalPlayer","mpv"); ${mpvPath ? `localStorage.setItem("externalPlayerMpvPath", ${JSON.stringify(mpvPath)});` : ""} true`);

  // 1. Watch a little, skip ahead, close mpv
  console.log("\nFirst watch");
  let socket = await play([]);
  pass("Play opened the stream in mpv");
  check(!(await evaluate("location.hash")).startsWith("#/player"), "dx.bi went back from its own player", "dx.bi stayed on its own player page");
  check(await evaluate(`!!document.getElementById("dxbi-ext-progress")`), "the progress pop-up shows", "no progress pop-up");
  const title = await mpv(socket, ["get_property", "media-title"]).catch(() => "");
  check(title && title !== "clip.mp4", `mpv's window is named after the title ("${title}")`, `mpv's title is "${title}"`);

  const early = await waitFor("progress to reach Stremio", async () => {
    const s = await playerItem();
    return s && s.video_id === MOVIE && s.timeOffset >= 3000 ? s : null;
  }, 20000).catch((e) => { fail(e.message); return null; });
  if (early) pass(`Stremio has the place while mpv plays (${(early.timeOffset / 1000).toFixed(1)} s)`);
  if (shotPath) {
    const shot = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(shotPath, Buffer.from(shot.result.data, "base64"));
    pass(`screenshot of the pop-up: ${shotPath}`);
  }
  const shown = await evaluate(`document.querySelector("#dxbi-ext-progress .time")?.textContent`);
  check(/\d+:\d\d \/ 1:00/.test(shown || ""), `the pop-up shows the time ("${shown}")`, `the pop-up's time: "${shown}"`);

  await mpv(socket, ["set_property", "time-pos", 40]);
  await sleep(3000);
  const afterSkip = await playerItem();
  check(afterSkip && afterSkip.timeOffset >= 40000, `a skip moves the place (${(afterSkip?.timeOffset / 1000).toFixed(1)} s)`, `after skipping to 40 s the place is ${afterSkip?.timeOffset}`);
  await mpv(socket, ["set_property", "time-pos", 20]);
  await sleep(2500);
  const closedAt = await mpv(socket, ["get_property", "time-pos"]);
  await mpv(socket, ["quit"]).catch(() => { /* it quits before answering */ });

  await waitFor("the pop-up to go", () => evaluate(`!document.getElementById("dxbi-ext-progress")`), 10000).catch((e) => fail(e.message));
  const toast = await waitFor("the saved toast", () => evaluate(`[...document.querySelectorAll('[id="extPlayerSaved"]')].map((t) => t.textContent.replace(/\\s+/g, " ").trim())[0] || ""`), 5000).catch(() => "");
  check(/saved at 0:2\d/.test(toast), `closing mpv says where it was saved ("${toast}")`, `the toast: "${toast}"`);
  const cw = await waitFor("Continue Watching", continueWatching, 10000).catch(() => null);
  const cwAt = cw ? (cw.progress / 100) * CLIP_SECONDS : NaN;
  check(Math.abs(cwAt - closedAt) < 2.5, `Continue Watching has it at ${cwAt.toFixed(1)} s (mpv closed at ${closedAt.toFixed(1)} s)`, `Continue Watching: ${JSON.stringify(cw)}, mpv closed at ${closedAt}`);
  const entry = await libraryEntry();
  check(entry && !entry.flaggedWatched && entry.timeWatched < 20000, `the skip didn't count as watched (${(entry?.timeWatched / 1000).toFixed(1)} s watched, not marked watched)`, `after a skip: ${JSON.stringify(entry)}`);

  // 2. Play again: resumes there, and watching to 70% marks it watched
  console.log("\nSecond watch");
  socket = await play([]);
  const startedAt = await mpv(socket, ["get_property", "time-pos"]);
  check(Math.abs(startedAt - closedAt) < 4, `mpv resumed at ${startedAt.toFixed(1)} s`, `mpv started at ${startedAt.toFixed(1)} s, not ${closedAt.toFixed(1)} s`);
  await mpv(socket, ["set_property", "time-pos", 2]);
  await mpv(socket, ["set_property", "speed", 2]);
  const note = await waitFor("the pop-up to say watched", async () => {
    const t = await evaluate(`document.querySelector("#dxbi-ext-progress .note")?.textContent`);
    return t === "Marked as watched" ? t : null;
  }, 45000).catch((e) => { fail(e.message); return null; });
  if (note) pass(`the pop-up says it's watched (at ${(await mpv(socket, ["get_property", "time-pos"])).toFixed(1)} s, 2× speed)`);
  await mpv(socket, ["quit"]).catch(() => { /* quits */ });
  await waitFor("the pop-up to go", () => evaluate(`!document.getElementById("dxbi-ext-progress")`), 10000).catch((e) => fail(e.message));
  const watched = await libraryEntry();
  check(watched && watched.flaggedWatched && watched.timesWatched >= 1, `Stremio marked it watched (${(watched?.timeWatched / 1000).toFixed(0)} s of ${(watched?.duration / 1000).toFixed(0)} s watched)`, `after watching to 70%: ${JSON.stringify(watched)}`);

  // 3. Close dx.bi while mpv plays: the place is saved before the window goes
  console.log("\nClosing dx.bi while mpv plays");
  socket = await play([]);
  await mpv(socket, ["set_property", "speed", 1]);
  await mpv(socket, ["set_property", "time-pos", 15]);
  await sleep(2500);
  const leftAt = await mpv(socket, ["get_property", "time-pos"]);
  await evaluate(`window.close(); true`).catch(() => { /* the page goes */ });
  await waitFor("dx.bi to close", () => app.exitCode !== null, 15000).catch((e) => fail(e.message));
  await mpv(socket, ["quit"]).catch(() => { /* quits */ });
  launch();
  await connect();
  const kept = await waitFor("Continue Watching after restarting", continueWatching, 20000).catch(() => null);
  const keptAt = kept ? (kept.progress / 100) * CLIP_SECONDS : NaN;
  check(Math.abs(keptAt - leftAt) < 2.5, `after restarting, Continue Watching has it at ${keptAt.toFixed(1)} s (dx.bi closed at ${leftAt.toFixed(1)} s)`, `after restarting: ${JSON.stringify(kept)}, dx.bi closed at ${leftAt}`);

  // 4. Stremio's own Settings → Player → "Play in external player" (the plugin opens it): the same
  console.log("\nStremio's \"Play in external player\" setting");
  await evaluate(`(async () => {
    localStorage.setItem("externalPlayer", "disabled");
    const core = window.core || window.__permanentCore;
    const ctx = await core.getState("ctx");
    core.dispatch({ action: "Ctx", args: { action: "UpdateSettings", args: { ...ctx.profile.settings, playerType: "mpv" } } });
    return true;
  })()`);
  await sleep(1000);
  socket = await play([]);
  pass("Play opened the stream in mpv");
  check(await evaluate(`!!document.getElementById("dxbi-ext-progress")`), "the progress pop-up shows", "no progress pop-up");
  const resumed = await mpv(socket, ["get_property", "time-pos"]);
  check(Math.abs(resumed - leftAt) < 4, `mpv resumed at ${resumed.toFixed(1)} s`, `mpv started at ${resumed.toFixed(1)} s, not ${leftAt.toFixed(1)} s`);
  await mpv(socket, ["set_property", "time-pos", 30]);
  await sleep(3000);
  const closedAt2 = await mpv(socket, ["get_property", "time-pos"]);
  await mpv(socket, ["quit"]).catch(() => { /* quits */ });
  const cw2 = await waitFor("Continue Watching to move", async () => {
    const c = await continueWatching();
    return c && Math.abs((c.progress / 100) * CLIP_SECONDS - closedAt2) < 2.5 ? c : null;
  }, 10000).catch(() => null);
  check(cw2, `Continue Watching has it at ${closedAt2.toFixed(1)} s`, `Continue Watching didn't move to ${closedAt2.toFixed(1)} s`);

  // 5. A series episode played to the end after skipping most of it (the opening, a recap…): Stremio
  // moves Continue Watching on, and the episode gets its watched tag too
  console.log("\nA series episode, skipped through to the end");
  socket = await play([], playerHashFor("series", SERIES, EPISODE));
  await sleep(2000);
  await mpv(socket, ["set_property", "time-pos", 48]);
  await waitFor("the episode to end", () => !mpvSockets().includes(socket), 60000).catch((e) => fail(e.message));
  await waitFor("the pop-up to go", () => evaluate(`!document.getElementById("dxbi-ext-progress")`), 10000).catch((e) => fail(e.message));
  await evaluate(`location.hash = "#/detail/series/${SERIES}/${encodeURIComponent(EPISODE)}"; true`);
  const details = await waitFor("the series page", async () => {
    const md = await coreState("meta_details");
    const meta = md?.metaItem?.content?.type === "Ready" && md.metaItem.content.content;
    return meta && md.libraryItem ? { md, meta } : null;
  }, 20000).catch(async (e) => {
    fail(e.message);
    const md = await coreState("meta_details").catch(() => null);
    console.log("  meta_details: " + JSON.stringify(md, (k, v) => (k === "videos" ? `[${v.length} videos]` : v)).slice(0, 1500));
    return null;
  });
  if (details) {
    const state = details.md.libraryItem.state;
    const video = (details.meta.videos || []).find((v) => v.id === EPISODE);
    check(video?.watched === true, "the episode has its watched tag", `the episode isn't tagged watched (library: ${JSON.stringify({ ...state, watched: state.watched ? "…" : state.watched })})`);
    check(state.video_id === NEXT_EPISODE, "Continue Watching moved to the next episode", `Continue Watching is on ${state.video_id}`);
  }
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  fail(e.message);
}
if (failures.length) {
  exitCode = 1;
  console.log(`\n${failures.length} check(s) failed.`);
  console.log("--- app output (external player lines) ---\n" + appLog.split("\n").filter((l) => /External|Tracker/.test(l)).slice(-60).join("\n"));
} else {
  console.log("\nAll external player checks passed.");
}
for (const s of mpvSockets()) await mpv(s, ["quit"]).catch(() => { /* gone */ });
await quitApp();
process.exit(exitCode);
