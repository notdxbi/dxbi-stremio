// Build app/ first, then: node tools/taskbar-preview-test.mjs
// Lifecycle and race checks; no Windows desktop or native DLLs needed.
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const filename = join(root, "app/dist/core/TaskbarPreview.js");
const source = readFileSync(filename, "utf8");
const require = createRequire(filename);
let now = 10000;
const timers = new Set();
const exports = {};
vm.runInNewContext(source, {
    exports, Buffer, process: { platform: "win32" },
    Date: { now: () => now },
    setInterval(fn) { const timer = { fn, unref() {} }; timers.add(timer); return timer; },
    clearInterval: timer => timers.delete(timer),
    require: name => name.includes("utils/logger") ? { getLogger: () => ({ warn() {} }) } : require(name),
}, { filename });
const Preview = exports.default;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const frame = (width = 1920, height = 1080, id = 1) => ({
    id, isEmpty: () => false, getSize: () => ({ width, height }),
    resize: size => frame(size.width, size.height, id),
});

function setup(capture = async () => frame()) {
    const win = new EventEmitter();
    const hooks = new Map();
    let destroyed = false;
    win.hookWindowMessage = (id, fn) => hooks.set(id, fn);
    win.unhookWindowMessage = id => hooks.delete(id);
    win.isDestroyed = () => destroyed;
    const attributes = [], shown = [];
    let invalidations = 0, captures = 0;
    const native = {
        attributes: on => attributes.push(on),
        invalidate: () => invalidations++,
        clientSize: () => [1920, 1080],
        show: (image, live, width, height) => shown.push({ image, live, width, height }),
    };
    const preview = new Preview(win, () => { captures++; return capture(); }, native);
    return { preview, win, hooks, attributes, shown, native,
        get invalidations() { return invalidations; }, get captures() { return captures; },
        destroy() { destroyed = true; win.emit("closed"); },
        request(width = 213, height = 120) {
            const size = Buffer.alloc(8);
            size.writeUInt32LE((width << 16) | height);
            hooks.get(0x0323)(Buffer.alloc(8), size);
        },
        peek() { hooks.get(0x0326)(); },
    };
}

const state = setup();
assert.equal(state.captures, 0);
state.preview.setPlaying(true);
await flush();
assert.deepEqual(state.attributes, [true], "enable custom previews only after a frame is ready");
assert.equal(state.captures, 1);
for (const timer of timers) timer.fn();
await flush();
assert.equal(state.captures, 1, "no periodic screenshots when the taskbar is not asking for one");
state.request();
await flush();
assert.equal(state.captures, 1, "reuse the cached frame within the refresh interval");
for (const { image } of state.shown) {
    assert.ok(image.getSize().width <= 213 && image.getSize().height <= 120);
}
assert.ok(state.shown.every(({ width, height }) => width === 213 && height === 120));
state.preview.frame = frame(64, 64);
state.request();
assert.equal(state.shown.at(-1).width, 213, "a small cached frame must not change the DWM canvas");
assert.equal(state.shown.at(-1).height, 120);
state.preview.frame = frame();
state.peek();
assert.equal(state.shown.at(-1).live, true);
assert.deepEqual(state.shown.at(-1).image.getSize(), { width: 1920, height: 1080 });
state.preview.setPlaying(false);
assert.deepEqual(state.attributes, [true, false]);
assert.equal(timers.size, 0);
state.preview.dispose();
assert.equal(state.hooks.size, 0);
console.log("PASS bounded thumbnails, full-sized Peek, on-demand capture, default-preview restoration, and cleanup");

let nextFrame = deferred();
const racing = setup(() => nextFrame.promise);
racing.preview.setPlaying(true);
racing.preview.setPlaying(false);
nextFrame.resolve(frame());
await flush();
assert.deepEqual(racing.attributes, [], "a frame from stopped playback must not reactivate the preview");
now += 2000;
nextFrame = deferred();
racing.preview.setPlaying(true);
nextFrame.resolve(frame(640, 360, 2));
await flush();
now += 2000;
nextFrame = deferred();
racing.request();
racing.peek();
await flush();
assert.equal(racing.captures, 3, "simultaneous thumbnail/Peek requests share one capture");
racing.preview.setPlaying(false);
const before = racing.shown.length;
nextFrame.resolve(frame(640, 360, 3));
await flush();
assert.equal(racing.shown.length, before, "do not publish an in-flight frame after stop");
racing.preview.dispose();
console.log("PASS stop/restart races, single in-flight capture, and stale-frame suppression");

const closing = setup();
closing.preview.setPlaying(true);
closing.destroy();
await flush();
assert.deepEqual(closing.attributes, []);
assert.equal(timers.size, 0);
const missing = setup(async () => null);
missing.preview.setPlaying(true);
await flush();
assert.deepEqual(missing.attributes, [], "missing frames leave the ordinary Windows preview in place");
missing.preview.dispose();
const failure = setup();
failure.native.attributes = () => { throw new Error("DWM unavailable"); };
failure.preview.setPlaying(true);
await flush();
assert.equal(timers.size, 0, "native API failure must stop the preview without breaking playback");
failure.preview.dispose();
console.log("PASS window-close, capture-unavailable, and native-API failure fallbacks");

for (const platform of ["linux", "darwin"]) {
    const result = {};
    vm.runInNewContext(source, {
        exports: result, process: { platform },
        require: () => ({ getLogger: () => ({ warn() {} }) }),
    });
    assert.equal(result.default.attach({}, () => { throw Error("must not capture"); }), null);
}
console.log("PASS non-Windows platforms never load native preview APIs");
