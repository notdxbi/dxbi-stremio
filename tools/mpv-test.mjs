// Plays a video through the dx.bi app's mpv player on Windows and checks it end to end: Stremio uses
// its mpv player, the stand-in <video> mirrors mpv, and the picture really shows behind the page on
// the desktop (screenshots of the screen, not of the page). The clip is 10-bit HEVC with AC3 sound in
// MKV, which Chromium's own player can't play.
//
// node tools/mpv-test.mjs <path to dx.bi.exe> [screenshot folder]
import { spawn, execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import http from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import zlib from "node:zlib";

const exe = process.argv[2];
const outDir = process.argv[3] || "mpv-shots";
const PORT = 9333;
const CLIP_PORT = 18766;
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

async function waitFor(what, fn, timeout = 60000, every = 500) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try { last = await fn(); if (last) return last; } catch (e) { last = e.message; }
    await sleep(every);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (last: ${last})` : ""}`);
}

// A fresh setup with no saved choices: dx.bi must start its streaming server by itself
const userData = join(process.env.APPDATA, "dxbi");
mkdirSync(userData, { recursive: true });

console.log(`launching ${exe}`);
const app = spawn(exe, [`--remote-debugging-port=${PORT}`], { env: { ...process.env, DXBI_IMPORT: "fresh", DXBI_MPV_DEBUG: "1" }, stdio: ["ignore", "pipe", "pipe"] });
let appLog = "";
app.stdout.on("data", (d) => { appLog += d; });
app.stderr.on("data", (d) => { appLog += d; });

let ws;
const pending = new Map();
let nextId = 0;
const send = (method, params = {}) => new Promise((resolve) => { const id = ++nextId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluation failed");
  return r.result?.result?.value;
}

// Two screenshots of the whole screen a moment apart: how many sampled points inside `box` changed.
// The clip's pattern moves, so a playing video changes; Stremio's still background art doesn't.
function screen(name, box) {
  const png = join(outDir, `${name}.png`);
  const ps = `
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
function Shot { $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height; $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp }
$one = Shot; Start-Sleep -Milliseconds 700; $two = Shot
$two.Save('${png.replace(/'/g, "''")}', [System.Drawing.Imaging.ImageFormat]::Png)
$changed = 0; $total = 0
for ($i = 1; $i -le 24; $i++) { for ($j = 1; $j -le 16; $j++) {
  $x = [int](${box.x} + ${box.width} * $i / 25); $y = [int](${box.y} + ${box.height} * $j / 17)
  if ($x -lt $b.Width -and $y -lt $b.Height) { $total++; $p = $one.GetPixel($x, $y); $q = $two.GetPixel($x, $y); if ([math]::Abs($p.R - $q.R) + [math]::Abs($p.G - $q.G) + [math]::Abs($p.B - $q.B) -gt 40) { $changed++ } }
} }
"$changed/$total"`;
  const [changed, total] = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim().split("/").map(Number);
  console.log(`  (${name}: ${changed} of ${total} sampled points changed)`);
  return changed;
}

async function main() {
  const target = await waitFor("the window", async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
    return list.find((t) => t.type === "page" && /stremio\.com/.test(t.url));
  }, 90000);
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  await send("Runtime.enable");
  await waitFor("Stremio", () => evaluate("document.readyState === 'complete' && !!document.querySelector('#app')"));
  await evaluate(`localStorage.setItem("dxbi.packOffered","1"); localStorage.setItem("checkForUpdatesOnStartup","false"); true`);

  // First launch opens maximized, and the state is remembered
  try {
    const state = JSON.parse(readFileSync(join(userData, "window-state.json"), "utf8"));
    if (state.maximized === true) pass("first launch opens maximized (window-state.json saved)");
    else fail(`first launch isn't maximized: ${JSON.stringify(state)}`);
  } catch (e) { fail(`no window-state.json: ${e.message}`); }

  if (await evaluate("window.__dxbiNativePlayer === 'mpv' && typeof window.chrome?.webview?.postMessage === 'function'")) pass("mpv player switched on (Stremio's desktop-shell transport is present)");
  else fail("mpv player not switched on");

  // The streaming server (server.js) and the ffmpeg it downloads
  await waitFor("the streaming server", () => fetch("http://127.0.0.1:11470/settings").then((r) => r.ok), 240000, 2000);
  pass("streaming server running");
  // and Stremio itself sees it (no "Streaming server is not available"), even though the page
  // loaded before server.js had finished downloading
  try {
    await waitFor("Stremio to see the streaming server", () => evaluate(`window.core.getState("streaming_server").then((s) => s && s.settings && s.settings.type === "Ready")`), 60000, 1000);
    pass("Stremio sees the streaming server");
  } catch (e) { fail(e.message); }
  const ffmpeg = join(userData, "streamingserver", "ffmpeg.exe");
  await waitFor("ffmpeg", () => existsSync(ffmpeg), 240000, 2000);

  const srt = join(tmpdir(), "dxbi-test.srt");
  writeFileSync(srt, Array.from({ length: 60 }, (_, i) => `${i + 1}\n00:${String(Math.floor(i * 3 / 60)).padStart(2, "0")}:${String(i * 3 % 60).padStart(2, "0")},000 --> 00:${String(Math.floor((i * 3 + 3) / 60)).padStart(2, "0")}:${String((i * 3 + 3) % 60).padStart(2, "0")},000\nEmbedded subtitle line ${i + 1}\n`).join("\n"));
  const clip = join(tmpdir(), "dxbi-hevc10.mkv");
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24", "-f", "lavfi", "-i", "sine=f=440:sample_rate=48000", "-i", srt,
    "-t", "180", "-c:v", "libx265", "-preset", "ultrafast", "-pix_fmt", "yuv420p10le", "-x265-params", "log-level=error",
    "-c:a", "ac3", "-b:a", "192k", "-c:s", "srt", "-map", "0:v", "-map", "1:a", "-map", "2:s", clip]);
  const size = statSync(clip).size;
  http.createServer((req, res) => {
    const m = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
    const head = { "Content-Type": "video/x-matroska", "Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*" };
    if (m) {
      const s = +m[1], e = m[2] ? +m[2] : size - 1;
      res.writeHead(206, { ...head, "Content-Range": `bytes ${s}-${e}/${size}`, "Content-Length": e - s + 1 });
      createReadStream(clip, { start: s, end: e }).pipe(res);
    } else {
      res.writeHead(200, { ...head, "Content-Length": size });
      createReadStream(clip).pipe(res);
    }
  }).listen(CLIP_PORT, "127.0.0.1");
  pass(`test clip ready (10-bit HEVC + AC3 + SRT subtitles in MKV, ${(size / 1e6).toFixed(1)} MB)`);

  // Lay the window out on whatever screen the machine has; sample the middle of the video area
  const { width: sw, height: sh } = await evaluate("({ width: screen.width, height: screen.height })");
  // Move and size the dx.bi window with Windows' own calls (as dragging does), found by its title
  const title = await evaluate("document.title");
  const place = async (left, top, width, height) => {
    const ps = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class W {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int hh, bool r);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int c);
}
"@
$script:target = [IntPtr]::Zero
[W]::EnumWindows({ param($h, $l) $sb = New-Object Text.StringBuilder 512; [W]::GetWindowText($h, $sb, 512) | Out-Null; if ([W]::IsWindowVisible($h) -and $sb.ToString() -eq '${title.replace(/'/g, "''")}') { $script:target = $h }; $true }, [IntPtr]::Zero) | Out-Null
if ($script:target -eq [IntPtr]::Zero) { 'not found'; exit }
[W]::ShowWindow($script:target, 9) | Out-Null
[W]::MoveWindow($script:target, ${left}, ${top}, ${width}, ${height}, $true) | Out-Null
'moved'`;
    const r = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim();
    if (r !== "moved") throw new Error(`couldn't find the window "${title}" to move it`);
    await sleep(2000);
    return { x: left + width * 0.3, y: top + height * 0.3, width: width * 0.4, height: height * 0.4 };
  };
  // The dx.bi window must have a taskbar button and show in Alt+Tab. It's owned by the video window,
  // and Windows leaves owned windows out of both unless they carry WS_EX_APPWINDOW.
  const switcher = (when) => {
    const ps = `
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public class S {
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetWindow(IntPtr h, uint c);
  [DllImport("user32.dll")] public static extern IntPtr GetWindowLongPtr(IntPtr h, int i);
}
"@
$script:target = [IntPtr]::Zero
[S]::EnumWindows({ param($h, $l) $sb = New-Object Text.StringBuilder 512; [S]::GetWindowText($h, $sb, 512) | Out-Null; if ([S]::IsWindowVisible($h) -and $sb.ToString() -eq '${title.replace(/'/g, "''")}') { $script:target = $h }; $true }, [IntPtr]::Zero) | Out-Null
if ($script:target -eq [IntPtr]::Zero) { 'not found'; exit }
$owner = [S]::GetWindow($script:target, 4)
$ex = [S]::GetWindowLongPtr($script:target, -20).ToInt64()
"$($owner -ne [IntPtr]::Zero) $(($ex -band 0x40000) -ne 0) $(($ex -band 0x80) -ne 0)"`;
    const [owned, appWindow, toolWindow] = execFileSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim().split(" ").map((v) => v === "True");
    if ((!owned || appWindow) && !toolWindow) pass(`dx.bi is in the taskbar and Alt+Tab ${when}`);
    else fail(`dx.bi is missing from the taskbar and Alt+Tab ${when} (owned: ${owned}, WS_EX_APPWINDOW: ${appWindow}, tool window: ${toolWindow})`);
  };

  let area = await place(Math.round(sw * 0.05), Math.round(sh * 0.05), Math.round(sw * 0.8), Math.round(sh * 0.8));
  switcher("on start");
  const home = screen("1-home", area);

  const stream = { url: `http://127.0.0.1:${CLIP_PORT}/clip.mkv`, name: "dx.bi test", title: "10-bit HEVC + AC3" };
  const encoded = encodeURIComponent(zlib.deflateSync(Buffer.from(JSON.stringify(stream))).toString("base64"));
  const hash = `#/player/${encoded}/${encodeURIComponent(`http://127.0.0.1:${CLIP_PORT}/manifest.json`)}/${encodeURIComponent("https://v3-cinemeta.strem.io/manifest.json")}/movie/tt1727587/tt1727587`;
  await evaluate(`location.hash = ${JSON.stringify(hash)}; true`);

  const V = `document.querySelector('[class*="player-container"] video')`;
  // What the page sees while it starts, every 3 s
  const watch = setInterval(async () => {
    try {
      console.log("    … " + JSON.stringify(await evaluate(`({ hash: location.hash.slice(0, 10), t: window.__dxbiMpvState?.["time-pos"], d: window.__dxbiMpvState?.duration, vp: !!window.__dxbiMpvState?.["video-params"], pfc: window.__dxbiMpvState?.["paused-for-cache"], proxy: !!${V}, rs: ${V}?.readyState, body: document.body.getAttribute("style"), spinner: !!document.querySelector('[class*="buffering"]'), err: document.querySelector('[class*="error-layer"]')?.textContent?.slice(0, 60) })`)));
    } catch (e) { console.log("    … " + e.message); }
  }, 3000);
  setTimeout(() => screen("1b-starting", { x: 0, y: 0, width: 400, height: 300 }), 12000);
  try {
    const state = await waitFor("mpv to play", () => evaluate(`(() => { const v = ${V}; return v && v.readyState === 4 && v.currentTime > 2 ? { t: v.currentTime, w: v.videoWidth, h: v.videoHeight, cls: v.className } : null })()`), 60000);
    pass(`playing in mpv: ${state.w}×${state.h}, ${state.t.toFixed(1)} s in (${state.cls})`);
  } catch (e) {
    fail(e.message);
    console.log("  page's view of mpv: " + JSON.stringify(await evaluate(`({ mpv: window.__dxbiMpvState, debug: window.__dxbiMpvDebug, proxy: !!${V}, body: document.body.getAttribute("style"), hash: location.hash.slice(0, 12), container: !!document.querySelector('[class*="player-container"]') })`)).slice(0, 1500));
  }
  clearInterval(watch);
  const error = await evaluate(`document.querySelector('[class*="error-layer"]')?.textContent || ""`);
  if (error) fail(`player error: ${error.slice(0, 160)}`);
  if (await evaluate("document.documentElement.hasAttribute('data-dx-mpv-showing')")) pass("page is see-through over the video");
  else fail("page didn't turn see-through");

  // dx.bi's picture enhancement runs as mpv shaders: Anime4K, then Sharpen, then off
  await evaluate(`window.__dxbiMpv.observe("glsl-shaders"); true`);
  for (const mode of ["anime", "sharpen", "off"]) {
    await evaluate(`window.__dxbi.settings.enhance = ${JSON.stringify(mode)}; window.__dxbi.sync(); true`);
    await sleep(2500);
    const shaders = await evaluate(`JSON.stringify(window.__dxbiMpv.get("glsl-shaders") || [])`);
    const count = JSON.parse(shaders).length;
    const expected = { anime: 2, sharpen: 1, off: 0 }[mode];
    if (count === expected) pass(`picture enhancement "${mode}" loaded in mpv (${count} shader${count === 1 ? "" : "s"})`);
    else fail(`picture enhancement "${mode}": mpv has ${shaders}`);
  }
  try {
    const shaderErrors = readFileSync(join(userData, "mpv.log"), "utf8").split("\n").filter((l) => /\]\[(e|f)\]\[vo/.test(l) && /shader|glsl|hook|compile/i.test(l));
    if (shaderErrors.length) fail(`mpv shader errors:\n${shaderErrors.slice(0, 8).join("\n")}`);
    else pass("no shader errors in mpv's log");
  } catch (_) { /* no log */ }

  // Hide Stremio's controls so the sample area is only video
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  await sleep(4000);
  const playing = screen("2-playing", area);
  if (playing >= 10 && home < 10) pass("the video shows on screen behind the page (moving picture)");
  else fail(`the video doesn't show on screen (${playing} points changed while playing, ${home} on Home)`);

  // Moving and resizing the window: the video window follows
  area = await place(Math.round(sw * 0.25), Math.round(sh * 0.2), Math.round(sw * 0.7), Math.round(sh * 0.75));
  const moved = screen("3-moved", area);
  if (moved >= 10) pass("the video follows the window when it moves and resizes");
  else fail(`the video didn't follow the window (${moved} points changed)`);

  // Stremio's controls draw over the video when the mouse moves
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 400, y: 300 });
  await sleep(600);
  screen("3b-controls", area);
  if (await evaluate(`!!document.querySelector('[class*="control-bar-container"]') && getComputedStyle(document.querySelector('[class*="control-bar-container"]')).opacity !== "0"`)) pass("Stremio's controls show over the video");
  else fail("Stremio's controls aren't showing");

  // The file's own subtitle track, drawn by mpv
  // picked like a viewer does: Subtitles button (in "More" on a small window) → the file's "Track 1"
  await evaluate(`window.__dxbiMpv.observe("sub-text"); true`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 420, y: 320 });
  await sleep(400);
  const opened = await evaluate(`(() => {
    const b = document.querySelector('[class*="control-bar-buttons-container"] [data-dx-label="Subtitles"], [class*="control-bar-buttons-menu-container"] [data-dx-label="Subtitles"]');
    if (!b) return "no Subtitles button";
    b.click();
    return "opened";
  })()`);
  await sleep(800);
  const picked = await evaluate(`(() => {
    const m = document.querySelector('[class*="subtitles-menu"]');
    if (!m) return "no subtitles menu";
    const el = [...m.querySelectorAll("*")].find((e) => e.childElementCount <= 1 && (e.textContent || "").trim() === "Track 1");
    if (!el) return "no embedded track listed: " + m.innerText.slice(0, 120);
    (el.closest('[class*="option"],[class*="language"],[role]') || el).click();
    return "picked";
  })()`);
  console.log(`  (subtitles menu: ${opened}, ${picked})`);
  await sleep(3500);
  const subText = await evaluate(`window.__dxbiMpv.get("sub-text") || ""`);
  if (/Embedded subtitle line/.test(subText)) pass(`embedded subtitles play in mpv ("${subText}")`);
  else fail(`embedded subtitles: mpv shows "${subText}"`);
  screen("3c-subtitles", area);
  // close the menu with its button (Escape would leave the player)
  await evaluate(`document.querySelector('[data-dx-label="Subtitles"]')?.click(); true`);

  // Black bars are measured from mpv's frame (the test picture has none)
  const bars = await evaluate(`window.__dxbiMpv.measureBars().then((b) => JSON.stringify(b))`);
  if (bars && bars !== "null" && JSON.parse(bars).t < 0.02) pass(`black bars measured from mpv's frame (${bars})`);
  else fail(`black bar measuring: ${bars}`);

  // Picture-in-picture: the video in a corner, dx.bi minimized; then back
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
  await evaluate(`window.__dxbiMpv.pip(); true`);
  await sleep(2500);
  const corner = screen("3d-pip", { x: sw * 0.72, y: sh * 0.62, width: sw * 0.25, height: sh * 0.25 });
  if (corner >= 10) pass("picture-in-picture shows the video in the corner");
  else fail(`picture-in-picture: ${corner} points changed in the corner`);
  await evaluate(`window.__dxbiMpv.pip(); true`);
  await sleep(2500);
  area = await place(Math.round(sw * 0.25), Math.round(sh * 0.2), Math.round(sw * 0.7), Math.round(sh * 0.75));
  switcher("after picture-in-picture");

  // Fullscreen through Stremio's own button path
  await evaluate(`window.chrome.webview.postMessage(JSON.stringify({ id: 0, type: 6, args: ["win-set-visibility", { fullscreen: true }] })); true`);
  await sleep(2500);
  const full = screen("4-fullscreen", { x: sw * 0.2, y: sh * 0.2, width: sw * 0.6, height: sh * 0.6 });
  if (full >= 10) pass("fullscreen shows the video");
  else fail(`fullscreen doesn't show the video (${full} points changed)`);
  const cover = await evaluate(`[outerWidth, outerHeight, screen.width, screen.height]`);
  if (Math.abs(cover[0] - cover[2]) <= 2 && Math.abs(cover[1] - cover[3]) <= 2) pass(`fullscreen covers the screen (${cover[0]}×${cover[1]})`);
  else fail(`fullscreen doesn't cover the screen: window ${cover[0]}×${cover[1]}, screen ${cover[2]}×${cover[3]}`);
  // Escape leaves full screen and stays in the player when Stremio's "Esc exits full screen" is on (issue #13)
  const escExits = await evaluate(`window.core.getState("ctx").then((c) => c.profile.settings.escExitFullscreen)`);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await sleep(1500);
  const afterEsc = await evaluate(`[location.hash.startsWith("#/player"), outerWidth < screen.width - 2 || outerHeight < screen.height - 2]`);
  if (escExits !== false) {
    if (afterEsc[0] && afterEsc[1]) pass("Escape leaves full screen and keeps playing");
    else fail(`Escape with "Esc exits full screen" on: still in player ${afterEsc[0]}, left full screen ${afterEsc[1]}`);
  } else console.log("  (Esc exits full screen is off in this profile: Escape check skipped)");
  if (afterEsc[0]) await evaluate(`window.chrome.webview.postMessage(JSON.stringify({ id: 0, type: 6, args: ["win-set-visibility", { fullscreen: false }] })); true`);
  await sleep(1500);
  switcher("after fullscreen");

  // Maximize and restore from the title bar (a transparent window can't use Windows' own, issue #6):
  // pressed twice, one press fills the work area and the other gives back a smaller window
  const sizes = [];
  for (let i = 0; i < 2; i++) {
    await evaluate(`document.querySelector("#maximizeApp-btn").click(); true`);
    await sleep(1500);
    sizes.push(await evaluate(`[outerWidth, outerHeight, screen.availWidth, screen.availHeight]`));
  }
  const fills = (s) => Math.abs(s[0] - s[2]) <= 2 && Math.abs(s[1] - s[3]) <= 2;
  const smaller = (s) => s[0] < s[2] - 20 && s[1] < s[3] - 20;
  if ((fills(sizes[0]) && smaller(sizes[1])) || (smaller(sizes[0]) && fills(sizes[1]))) pass(`maximize and restore: ${sizes.map((s) => `${s[0]}×${s[1]}`).join(" ↔ ")} (work area ${sizes[0][2]}×${sizes[0][3]})`);
  else fail(`maximize and restore: ${sizes.map((s) => `${s[0]}×${s[1]}`).join(", ")}, work area ${sizes[0][2]}×${sizes[0][3]}`);

  // Leaving the player puts the page back
  await evaluate("history.back(); true");
  await sleep(2500);
  if (!(await evaluate("document.documentElement.hasAttribute('data-dx-mpv-showing')"))) pass("the page is solid again after leaving the player");
  else fail("the page stayed see-through after leaving the player");
  screen("5-back", area);
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
  console.log("--- app output (mpv lines) ---\n" + appLog.split("\n").filter((l) => /MpvShell/.test(l) && !/"request_id"/.test(l)).slice(0, 160).join("\n"));
  try {
    const log = readFileSync(join(userData, "mpv.log"), "utf8").split("\n");
    console.log("--- mpv.log (errors, warnings and video output) ---\n" + log.filter((l) => /\]\[(e|w|f)\]|\]\[[vi]\]\[(cplayer|vo\/gpu-next)\]/.test(l) && !/libplacebo/.test(l)).slice(-120).join("\n"));
  } catch (e) { console.log(`no mpv.log: ${e.message}`); }
} else {
  console.log("\nAll mpv checks passed.");
}
try { ws?.close(); } catch (_) { /* closed */ }
app.kill();
await sleep(1000);
process.exit(exitCode);
