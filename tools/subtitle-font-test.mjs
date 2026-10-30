// Build app/ first, then: node tools/subtitle-font-test.mjs [path/to/mpv]
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const schema = vm.runInNewContext(source.slice(source.indexOf("  const DEFAULTS ="), source.indexOf("  const settings =")) + "\n({DEFAULTS, SCHEMA})", { IN_TV: false, SETTINGS_SECTION: "dx.bi" });
assert.ok(schema.SCHEMA.find(s => s.key === "subtitleFont").options.some(o => o.value === "custom"));
assert.equal(schema.SCHEMA.find(s => s.key === "subtitleCustomFont").group, "Subtitles");
assert.equal(schema.DEFAULTS.subtitleCustomFont, "");

const settings = { subtitleFont: "default", subtitleCustomFont: "", subtitleStyle: "stremio" };
const styles = new Map();
const sent = [];
const window = { __dxbiMpv: { set: (...args) => sent.push(args) } };
const document = {
  getElementById: (id) => styles.get(id),
  createElement: () => ({ id: "", textContent: "", remove() { styles.delete(this.id); } }),
  head: { append: (el) => styles.set(el.id, el) },
};
const section = source.slice(source.indexOf("  const SUB_PRESETS ="), source.indexOf("  // Stremio turns subtitles on whenever"));
const { applySubtitleStyle, selectedSubtitleFont } = vm.runInNewContext(section + "\n({applySubtitleStyle, selectedSubtitleFont})", { window, document, settings });
for (const [choice, family] of [["inter", "Inter"], ["arial", "Arial"], ["tahoma", "Tahoma"], ["verdana", "Verdana"], ["georgia", "Georgia"], ["mono", "monospace"]]) {
  settings.subtitleFont = choice;
  applySubtitleStyle();
  assert.deepEqual(sent.at(-1), ["sub-font", family]);
  assert.match(styles.get("dx-sub-style").textContent, /font-family:/);
}
settings.subtitleFont = "custom";
settings.subtitleCustomFont = "  Noto Naskh Arabic  ";
applySubtitleStyle();
assert.deepEqual(sent.at(-1), ["sub-font", "Noto Naskh Arabic"]);
assert.match(styles.get("dx-sub-style").textContent, /"Noto Naskh Arabic", sans-serif !important/);
assert.match(styles.get("dx-sub-style").textContent, /\.dx-sub2 span/);
settings.subtitleCustomFont = "خط عربي";
applySubtitleStyle();
assert.deepEqual(sent.at(-1), ["sub-font", "خط عربي"]);
console.log("PASS presets and custom Unicode font families reach native and browser subtitle rendering");

settings.subtitleCustomFont = 'Font"; } body { color: red; } /*';
const escaped = selectedSubtitleFont().css;
assert.equal(escaped, `${JSON.stringify(settings.subtitleCustomFont)}, sans-serif`);
applySubtitleStyle();
assert.ok(styles.get("dx-sub-style").textContent.includes(`font-family: ${escaped} !important;`));
settings.subtitleCustomFont = "\r\n Tahoma\u0000 ";
assert.equal(selectedSubtitleFont().family, "Tahoma");
settings.subtitleCustomFont = "x".repeat(300);
assert.equal(selectedSubtitleFont().family.length, 128);
for (const invalid of ["default", "missing-font-option", "__proto__", "constructor"]) {
  settings.subtitleFont = invalid;
  applySubtitleStyle();
  assert.deepEqual(sent.at(-1), ["sub-font", "sans-serif"]);
  assert.equal(styles.has("dx-sub-style"), false);
}
settings.subtitleFont = "custom";
settings.subtitleCustomFont = "   ";
applySubtitleStyle();
assert.deepEqual(sent.at(-1), ["sub-font", "sans-serif"]);
assert.equal(styles.has("dx-sub-style"), false);
delete window.__dxbiMpv;
settings.subtitleFont = "tahoma";
settings.subtitleStyle = "outline";
applySubtitleStyle();
assert.match(styles.get("dx-sub-style").textContent, /font-family: Tahoma, sans-serif !important/);
assert.match(styles.get("dx-sub-style").textContent, /font-weight: 700 !important/);
console.log("PASS custom names are bounded and quoted; default reset and browser-only playback work");

const filename = join(root, "app/dist/components/plugin-settings-modal/pluginSettingsModal.js");
const require = createRequire(filename);
const exports = {};
vm.runInNewContext(readFileSync(filename, "utf8"), {
  exports, require: (name) => name.includes("templateCache") ? { load() {} } : require(name),
});
const input = exports.pluginOptionsModal._buildInput({ key: "subtitleCustomFont", label: "Custom subtitle font" }, 'My "Font" & <Name>');
assert.ok(input.includes('value="My &quot;Font&quot; &amp; &lt;Name&gt;"'));
console.log("PASS saved font names are escaped in the settings input");

if (process.argv[2]) {
  const pipe = process.platform === "win32" ? `\\\\.\\pipe\\dxbi-font-test-${process.pid}` : `/tmp/dxbi-font-test-${process.pid}.sock`;
  const child = spawn(process.argv[2], ["--no-config", "--idle=yes", "--no-terminal", "--vo=null", "--ao=null", "--force-window=no", `--input-ipc-server=${pipe}`], { windowsHide: true, stdio: "ignore" });
  let socket, spawnError;
  child.on("error", (err) => { spawnError = err; });
  try {
    for (let i = 0; i < 100 && !socket; i++) {
      if (spawnError) throw spawnError;
      socket = await new Promise(done => {
        const s = connect(pipe);
        s.once("connect", () => done(s));
        s.once("error", () => { s.destroy(); done(null); });
      });
      if (!socket) await new Promise(r => setTimeout(r, 50));
    }
    assert.ok(socket, "mpv IPC must connect");
    let id = 0, buffer = "";
    const pending = new Map();
    socket.on("data", chunk => {
      buffer += chunk;
      let nl;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const message = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        const done = pending.get(message.request_id);
        if (done) { pending.delete(message.request_id); done(message); }
      }
    });
    const command = command => new Promise((done, reject) => {
      const request_id = ++id;
      const timeout = setTimeout(() => { pending.delete(request_id); reject(new Error("mpv font command timed out")); }, 5000);
      pending.set(request_id, message => { clearTimeout(timeout); done(message); });
      socket.write(JSON.stringify({ command, request_id }) + "\n");
    });
    const assMode = (await command(["get_property", "sub-ass-override"])).data;
    for (const family of ["Tahoma", "Noto Naskh Arabic", "خط عربي", "sans-serif"]) {
      settings.subtitleFont = "custom";
      settings.subtitleCustomFont = family;
      window.__dxbiMpv = { set: (...args) => sent.push(args) };
      applySubtitleStyle();
      const [name, value] = sent.at(-1);
      assert.equal((await command(["set_property", name, value])).error, "success");
      assert.equal((await command(["get_property", "sub-font"])).data, family);
    }
    assert.equal((await command(["get_property", "sub-ass-override"])).data, assMode);
    console.log("PASS real mpv accepts custom font names, restores its default, and preserves ASS styling mode");
  } finally { socket?.destroy(); child.kill(); }
}
