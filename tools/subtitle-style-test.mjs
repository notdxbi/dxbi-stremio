// Build app/ first. Optional real mpv checks: node tools/subtitle-style-test.mjs path/to/mpv
// Also render a supplied test clip: append test-clip.mp4 screenshot-folder (no personal media).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const settings = { subtitleStyle: "stremio", subtitleFont: "default" };
const styles = new Map();
let preset = {};
const window = { __dxbiMpv: { set() {}, subtitleStyle: value => { preset = value; } } };
const document = {
    getElementById: id => styles.get(id),
    createElement: () => ({ remove() { styles.delete(this.id); } }),
    head: { append: el => styles.set(el.id, el) },
};
const section = source.slice(source.indexOf("  const SUB_PRESETS ="), source.indexOf("  // Stremio turns subtitles on whenever"));
const { applySubtitleStyle } = vm.runInNewContext(section + "\n({applySubtitleStyle})", { window, document, settings });
const choose = name => { settings.subtitleStyle = name; applySubtitleStyle(); return JSON.parse(JSON.stringify(preset)); };
const names = ["netflix", "outline", "boxed", "yellow", "soft"];
for (const name of names) {
    const values = choose(name);
    assert.ok(Object.keys(values).length >= 7, `${name} must reach mpv`);
    assert.match(styles.get("dx-sub-style").textContent, /text-shadow:/);
    for (const prop of ["sub-font", "sub-font-size", "sub-scale", "sub-pos", "sub-delay", "sub-ass-override"]) assert.equal(values[prop], undefined);
}
assert.equal(choose("yellow")["sub-color"], "#FFFFD84D");
assert.equal(choose("boxed")["sub-border-style"], "background-box");
assert.equal(choose("outline")["sub-border-size"], 2);
for (const name of ["stremio", "unknown", "__proto__", "constructor"]) {
    assert.deepEqual(choose(name), {});
    assert.equal(styles.size, 0);
}
delete window.__dxbiMpv;
choose("boxed");
assert.match(styles.get("dx-sub-style").textContent, /rgba\(0,0,0,.78\)/);
window.__dxbiMpv = { set() {}, subtitleStyle: value => { preset = value; } };
console.log("PASS every style reaches native and browser players; default and browser-only fallback work");

const require = createRequire(join(root, "app/dist/core/MpvShell.js"));
const Controller = require("./MpvSubtitleStyle.js").default;
const initial = { "sub-color": "#FFFFFFFF", "sub-border-color": "#FF000000", "sub-back-color": "#FF000000", "sub-border-size": 1.65, "sub-border-style": "outline-and-shadow", "sub-shadow-offset": 0, "sub-bold": false, "sub-blur": 0 };
const state = { ...initial };
const reads = new Map();
const controller = new Controller((name, done) => reads.set(name, done), (name, value) => { state[name] = value; });
controller.apply(choose("yellow"));
const staleColour = initial["sub-color"];
state["sub-color"] = controller.property("sub-color", "#FF123456");
for (const [name, done] of reads) done(name === "sub-color" ? staleColour : initial[name]);
assert.equal(state["sub-color"], "#FFFFD84D");
state["sub-color"] = controller.property("sub-color", "#FF654321");
assert.equal(state["sub-color"], "#FFFFD84D", "stream/settings writes must retain preset");
controller.apply(choose("boxed"));
controller.apply(choose("soft"));
assert.equal(state["sub-border-style"], "outline-and-shadow", "boxed must not leak into another style");
controller.apply({});
assert.deepEqual(state, { ...initial, "sub-color": "#FF654321" }, "reset restores latest Stremio preference");
for (const [name, value] of [["sub-scale", 1.7], ["sub-pos", 85], ["sub-font", "Tahoma"], ["sub-ass-override", "no"]]) assert.equal(controller.property(name, value), value);
const delayed = new Map(), restored = {};
const racing = new Controller((name, done) => delayed.set(name, done), (name, value) => { restored[name] = value; });
racing.apply(choose("boxed"));
racing.apply(choose("yellow"));
racing.apply({});
for (const [name, done] of delayed) done(initial[name]);
assert.deepEqual(restored, initial, "reset before initial reads complete must restore startup appearance");
console.log("PASS stream changes, latest Stremio preferences, preset switching, and asynchronous reset are preserved");

// Exercise the actual shell message routing and reply IDs, including its ordinary colour writes.
const shellExports = {};
vm.runInNewContext(readFileSync(join(root, "app/dist/core/MpvShell.js"), "utf8"), {
    exports: shellExports, process,
    require: name => name === "electron" ? {} : name.includes("utils/logger") ? { getLogger: () => ({ info() {}, warn() {} }) } : name === "./Maximize" ? {} : require(name),
});
const Shell = shellExports.default;
const routed = { ...initial };
Shell.socket = { write(line) {
    const { command: [op, name, value], request_id } = JSON.parse(line);
    if (op === "set_property") routed[name] = value;
    Shell.onMpvLine(JSON.stringify({ request_id, error: "success", data: routed[name] }));
} };
const message = (method, data) => Shell.onPageMessage({ type: 6, args: [method, data] });
message("dxbi-subtitle-style", choose("yellow"));
message("mpv-set-prop", ["sub-color", "#FF123456"]);
assert.equal(routed["sub-color"], "#FFFFD84D");
message("dxbi-subtitle-style", {});
assert.equal(routed["sub-color"], "#FF123456");
assert.equal(Shell.answers.size, 0);
console.log("PASS actual mpv shell transport applies styles and restores ordinary player writes");

if (process.argv[2]) {
    const dir = mkdtempSync(join(tmpdir(), "dxbi-subtitle-style-"));
    const pipe = process.platform === "win32" ? `\\\\.\\pipe\\dxbi-style-test-${process.pid}` : join(dir, "mpv.sock");
    const rendering = !!process.argv[3];
    const args = ["--no-config", "--idle=yes", "--no-terminal", "--ao=null", "--pause=yes", "--keep-open=yes", "--sub-ass-override=strip", `--input-ipc-server=${pipe}`];
    if (rendering) {
        writeFileSync(join(dir, "sample.srt"), "1\n00:00:00,000 --> 00:00:30,000\nSubtitle style sample\nمرحبا بالعالم — اختبار الترجمة\n");
        args.push("--vo=gpu-next", "--window-minimized=yes", "--sub-auto=no", `--sub-file=${join(dir, "sample.srt")}`, resolve(process.argv[3]));
    } else args.push("--vo=null", "--force-window=no");
    const child = spawn(process.argv[2], args, { windowsHide: true, stdio: "ignore" });
    let socket, spawnError;
    child.on("error", error => { spawnError = error; });
    try {
        for (let n = 0; n < 100 && !socket; n++) {
            if (spawnError) throw spawnError;
            socket = await new Promise(done => { const s = connect(pipe); s.once("connect", () => done(s)); s.once("error", () => { s.destroy(); done(null); }); });
            if (!socket) await new Promise(r => setTimeout(r, 50));
        }
        assert.ok(socket, "real mpv must start");
        let id = 0, buffer = "";
        const pending = new Map();
        socket.on("data", chunk => {
            buffer += chunk;
            let nl;
            while ((nl = buffer.indexOf("\n")) >= 0) {
                const message = JSON.parse(buffer.slice(0, nl)); buffer = buffer.slice(nl + 1);
                pending.get(message.request_id)?.(message); pending.delete(message.request_id);
            }
        });
        const command = command => new Promise((done, reject) => {
            const request_id = ++id;
            const timer = setTimeout(() => { pending.delete(request_id); reject(Error("mpv timed out")); }, 5000);
            pending.set(request_id, reply => { clearTimeout(timer); done(reply); });
            socket.write(JSON.stringify({ command, request_id }) + "\n");
        });
        const waiting = [];
        const native = new Controller(
            (name, done) => waiting.push(command(["get_property", name]).then(reply => { assert.equal(reply.error, "success"); done(reply.data); })),
            (name, value) => waiting.push(command(["set_property", name, value]).then(reply => assert.equal(reply.error, "success", name))),
        );
        const flush = async () => { while (waiting.length) await Promise.all(waiting.splice(0)); };
        const originals = {};
        for (const name of Object.keys(initial)) originals[name] = (await command(["get_property", name])).data;
        await command(["set_property", "sub-scale", 1.25]);
        await command(["set_property", "sub-pos", 85]);
        await command(["set_property", "sub-font", "Tahoma"]);
        if (rendering) {
            for (let n = 0; n < 100; n++) {
                if ((await command(["get_property", "video-params"])).data) break;
                await new Promise(r => setTimeout(r, 50));
            }
            await command(["seek", 0.5, "absolute+exact"]);
        }
        const shots = new Map();
        for (const name of ["stremio", ...names, "stremio-reset"]) {
            const values = choose(name);
            native.apply(values); await flush();
            for (const [prop, value] of Object.entries(values)) {
                const actual = (await command(["get_property", prop])).data;
                assert.equal(typeof value === "string" ? actual.toLowerCase() : actual, typeof value === "string" ? value.toLowerCase() : value, `${name}: ${prop}`);
            }
            if (rendering) {
                await new Promise(r => setTimeout(r, 150));
                const out = resolve(process.argv[4] || "subtitle-style-shots"); mkdirSync(out, { recursive: true });
                const filename = join(out, `${name}.png`);
                assert.equal((await command(["screenshot-to-file", filename, "subtitles"])).error, "success");
                shots.set(name, createHash("sha256").update(readFileSync(filename)).digest("hex"));
            }
        }
        for (const [prop, value] of Object.entries(originals)) assert.equal((await command(["get_property", prop])).data, value, `restore ${prop}`);
        for (const [prop, value] of [["sub-scale", 1.25], ["sub-pos", 85], ["sub-font", "Tahoma"], ["sub-ass-override", "strip"]]) assert.equal((await command(["get_property", prop])).data, value);
        if (rendering) {
            assert.equal(new Set([...shots.values()]).size, 6, "default plus five presets must render differently");
            assert.equal(shots.get("stremio"), shots.get("stremio-reset"), "default picture must restore exactly");
            console.log("PASS real screenshots show all five presets and exact default restoration");
            const ass = join(dir, "authored.ass");
            writeFileSync(ass, `[Script Info]\nScriptType: v4.00+\nPlayResX: 960\nPlayResY: 540\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,42,&H0000FF00,&H0000FF00,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,20,20,40,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:30.00,Default,,0,0,0,,Authored ASS subtitle\n`);
            await command(["set_property", "sub-ass-override", "no"]);
            assert.equal((await command(["sub-add", ass, "select"])).error, "success");
            const authored = [];
            for (const name of ["stremio", "yellow", "boxed"]) {
                native.apply(choose(name)); await flush();
                await new Promise(r => setTimeout(r, 200));
                const file = resolve(process.argv[4] || "subtitle-style-shots", `ass-${name}.png`);
                assert.equal((await command(["screenshot-to-file", file, "subtitles"])).error, "success");
                authored.push(createHash("sha256").update(readFileSync(file)).digest("hex"));
            }
            assert.equal(new Set(authored).size, 1, "original ASS appearance must remain unchanged");
            native.apply({}); await flush();
            console.log("PASS original ASS styling renders identically with preset overrides enabled");
        }
        console.log("PASS real mpv accepts every preset and reset; font, size, position and ASS preference remain intact");
    } finally { socket?.destroy(); child.kill(); await new Promise(r => child.exitCode !== null ? r() : child.once("exit", r)); rmSync(dir, { recursive: true, force: true }); }
}
