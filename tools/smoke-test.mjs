// Cross-platform smoke test: launches a real Stremio Enhanced, switches dx.bi on and checks that it
// boots, styles the app and survives the main screens without throwing. Used by the CI workflow on
// Windows, macOS and Linux.
//
//   node tools/smoke-test.mjs "<path to the Stremio Enhanced executable>" [screenshot dir]
//
// The plugin must already be installed (run install.sh / install.ps1 first). Needs Node 22+.
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const exe = process.argv[2] && resolve(process.argv[2]);
const outDir = process.argv[3] || "smoke-shots";
if (!exe) {
  console.error("usage: node tools/smoke-test.mjs <stremio-enhanced executable> [screenshot dir]");
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const PORT = 9333;
const PLUGIN = "dxbi.plugin.js";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const failures = [];
const fail = (msg) => { failures.push(msg); console.log(`  ✗ ${msg}`); };
const pass = (msg) => console.log(`  ✓ ${msg}`);

const args = [`--remote-debugging-port=${PORT}`, "--no-stremio-server", "--window-size=1600,900"];
if (process.platform === "linux") args.push("--no-sandbox", "--disable-gpu");
console.log(`launching ${exe}`);
const app = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"] });
let appLog = "";
app.stdout.on("data", (d) => { appLog += d; });
app.stderr.on("data", (d) => { appLog += d; });
app.on("exit", (code) => console.log(`app exited (${code})`));

async function waitFor(what, fn, timeout = 60000, every = 500) {
  const end = Date.now() + timeout;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (_) { /* not ready yet */ }
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(every);
  }
}

// --- CDP plumbing ---------------------------------------------------------------------------
let ws;
let nextId = 1;
const pending = new Map();
const listeners = [];
function send(method, params = {}) {
  const id = nextId++;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out`));
    }, 30000);
  });
}
async function evaluate(expression) {
  const r = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}
async function screenshot(name) {
  try {
    const { data } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(join(outDir, `${process.platform}-${name}.png`), Buffer.from(data, "base64"));
  } catch (e) {
    console.log(`  (screenshot ${name} failed: ${e.message})`);
  }
}

async function main() {
  const target = await waitFor("the Stremio window", async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.find((t) => t.type === "page" && t.url.startsWith("https://web.stremio.com"));
  }, 120000);
  pass(`window opened (${target.url})`);

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners) fn(msg);
    }
  };

  // Enhanced injects plugins as inline scripts, so find dx.bi's by its source
  const pluginScripts = new Set();
  const scriptChecks = [];
  const errors = [];
  listeners.push((msg) => {
    if (msg.method === "Debugger.scriptParsed" && msg.params.length > 200000 && !msg.params.url.startsWith("http")) {
      scriptChecks.push(send("Debugger.getScriptSource", { scriptId: msg.params.scriptId })
        .then(({ scriptSource }) => { if (scriptSource.includes("@name dx.bi")) pluginScripts.add(msg.params.scriptId); })
        .catch(() => {}));
    }
    // Anything that would freeze the page for the remaining checks: report it and carry on
    if (msg.method === "Debugger.paused") {
      const top = msg.params.callFrames?.[0];
      console.log(`    debugger paused (${msg.params.reason})${top ? ` in ${top.functionName || "(anonymous)"} at line ${top.location.lineNumber + 1}` : ""}`);
      send("Debugger.resume").catch(() => {});
    }
    if (msg.method === "Page.javascriptDialogOpening") {
      console.log(`    ${msg.params.type} dialog: ${msg.params.message.slice(0, 200)}`);
      send("Page.handleJavaScriptDialog", { accept: true }).catch(() => {});
    }
    if (msg.method === "Inspector.targetCrashed") fail("the page crashed");
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails);
    if (msg.method === "Runtime.consoleAPICalled") {
      const text = msg.params.args.map((a) => a.value ?? a.description ?? "").join(" ");
      if (text.startsWith("[dx.bi]")) console.log(`    console: ${text.slice(0, 200)}`);
      if (msg.params.type === "error" && text.includes("dx.bi")) errors.push({ text, console: true });
    }
  });
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Debugger.enable");
  await send("Inspector.enable");

  // Switch the plugin on the same way Enhanced's toggle does, then reload so it loads at startup
  await waitFor("Stremio to finish loading", () => evaluate("document.readyState === 'complete'"));
  // Retried: on a first launch Enhanced can still be swapping the page out under us
  await waitFor("the plugin to be switched on", () => evaluate(`localStorage.setItem("enabledPlugins", ${JSON.stringify(JSON.stringify([PLUGIN]))});
    localStorage.setItem("checkForUpdatesOnStartup", "false");
    localStorage.setItem("dxbi.packOffered", "1"); // the one-time Home rows offer is a native dialog on macOS and blocks the page
    localStorage.getItem("enabledPlugins").includes(${JSON.stringify(PLUGIN)})`), 30000);
  await send("Page.reload", { ignoreCache: true });
  await sleep(2000);

  try {
    await waitFor("dx.bi to start", () => evaluate("typeof window.__dxbi === 'object' && !!window.__dxbi.settings"), 60000);
    pass("dx.bi loaded (window.__dxbi present)");
  } catch (e) {
    fail(`dx.bi never started: ${e.message}`);
  }
  try {
    await waitFor("the built-in theme", () => evaluate("!!document.getElementById('dx-builtin-theme') && !!document.getElementById('dx-extras-style')"), 20000);
    pass("built-in theme and extra styles applied");
  } catch (e) {
    fail(`theme not applied: ${e.message}`);
  }

  // Home: the intro plays first, then the billboard fills from Cinemeta
  try {
    await waitFor("the billboard", () => evaluate("!!document.querySelector('.dx-hero')"), 90000);
    pass("home billboard rendered");
  } catch (e) {
    fail(`home billboard missing: ${e.message}`);
  }
  await sleep(4000);
  await screenshot("home");

  // A title page (Sintel, an open movie) and search, to exercise the page-specific modules
  await evaluate("location.hash = '#/detail/movie/tt1727587'; true");
  try {
    await waitFor("the title page", () => evaluate("location.hash.startsWith('#/detail') && !!document.querySelector('[class*=\"meta-details-container\"], [class*=\"metadetails-container\"], [class*=\"meta-preview-container\"]')"), 45000);
    pass("title page rendered");
  } catch (e) {
    fail(`title page missing: ${e.message}`);
  }
  await sleep(6000);
  await screenshot("detail");

  await evaluate("location.hash = '#/search?search=sintel'; true");
  await sleep(8000);
  await screenshot("search");
  await evaluate("location.hash = '#/settings'; true");
  // One option of a kind the app doesn't know makes it refuse them all, and Settings is left empty
  const options = await evaluate("window.StremioEnhancedAPI.getRegisteredSettings('dxbi').then((s) => (s || []).length)");
  if (options) console.log(`  ok: ${options} settings registered`);
  else fail("dx.bi's settings were not registered");
  await sleep(4000);
  await screenshot("settings");

  // macOS CI runs a real streaming server: dx.bi should switch on the hardware converter it tested
  const hwProfile = process.env.DXBI_EXPECT_HW_PROFILE;
  if (hwProfile) {
    const profile = () => fetch("http://127.0.0.1:11470/settings").then((r) => r.json()).then((j) => j.values.transcodeProfile, () => null);
    try {
      await waitFor(`transcode profile ${hwProfile}`, async () => (await profile()) === hwProfile, 150000, 3000);
      pass(`hardware conversion switched on (${hwProfile})`);
    } catch (_) {
      fail(`hardware conversion not switched on (transcodeProfile = ${await profile()})`);
    }
  }

  await Promise.all(scriptChecks);
  if (!pluginScripts.size) fail("couldn't find the dx.bi script among the page's scripts");
  const fromPlugin = (d) => d.console
    || pluginScripts.has(d.scriptId)
    || (d.stackTrace?.callFrames || []).some((f) => pluginScripts.has(f.scriptId));
  const pluginErrors = errors.filter(fromPlugin);
  const otherErrors = errors.length - pluginErrors.length;
  if (otherErrors) console.log(`  (${otherErrors} error(s) from Stremio itself ignored)`);
  for (const d of pluginErrors) {
    const where = d.lineNumber != null ? ` at line ${d.lineNumber + 1}` : "";
    fail(`dx.bi threw${where}: ${(d.exception?.description || d.text || "").split("\n").slice(0, 3).join(" | ")}`);
  }
  if (!pluginErrors.length) pass("no errors from dx.bi");
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  fail(e.message);
}
if (failures.length) {
  exitCode = 1;
  console.log(`\n${failures.length} check(s) failed on ${process.platform}.`);
  console.log("--- app output (last 4000 chars) ---\n" + appLog.slice(-4000));
  // What was really on screen (the page's own screenshot can hang along with it)
  if (process.platform === "darwin") {
    try { execFileSync("screencapture", ["-x", join(outDir, "darwin-screen-on-failure.png")], { timeout: 10000 }); } catch (_) { /* no screen access */ }
  }
} else {
  console.log(`\nAll checks passed on ${process.platform}.`);
}
try { ws?.close(); } catch (_) { /* already closed */ }
// Quit through the browser target too: launchers such as an AppImage exit while the app keeps running
try {
  const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(3000) })).json();
  const browser = new WebSocket(webSocketDebuggerUrl);
  await new Promise((done) => {
    browser.onopen = () => browser.send(JSON.stringify({ id: 1, method: "Browser.close" }));
    browser.onclose = browser.onerror = done;
    setTimeout(done, 3000);
  });
} catch (_) { /* already gone */ }
app.kill();
await sleep(1000);
process.exit(exitCode);
