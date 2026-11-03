// Build app/ first. On Windows:
// app/node_modules/.bin/electron tools/taskbar-preview-windows.cjs path/to/mpv.exe [output-directory]
// Uses an isolated profile and mpv's generated test pattern; no account, network, or personal media.
// If Windows has no thumbnail on display, open Alt+Tab to trigger its first real DWM request.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, mkdtempSync, writeFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { app, BrowserWindow } = require("electron");

const fromApp = createRequire(join(__dirname, "../app/package.json"));
const koffi = fromApp("koffi");
const args = process.argv.slice(process.argv.findIndex(arg => resolve(arg) === __filename) + 1);
const mpv = args[0] && resolve(args[0]);
assert.equal(process.platform, "win32", "this test needs a Windows desktop");
assert.ok(mpv && existsSync(mpv), "pass the path to mpv.exe");
const dir = mkdtempSync(join(tmpdir(), "dxbi-taskbar-test-"));
app.setPath("userData", dir);
process.env.DXBI_MPV_PATH = mpv;
const output = args[1] && resolve(args[1]);
if (output) mkdirSync(output, { recursive: true });
const sleep = ms => new Promise(done => setTimeout(done, ms));
async function waitFor(label, predicate) {
    for (let n = 0; n < 300; n++) {
        if (predicate()) return;
        await sleep(100);
    }
    throw new Error(`Timed out: ${label}`);
}
let Shell, win;
const deadline = setTimeout(() => { console.error("FAIL test timed out"); app.exit(1); }, 60000);

app.whenReady().then(async () => {
    Shell = fromApp("./dist/core/MpvShell").default;
    win = new BrowserWindow({ width: 960, height: 540, frame: false, transparent: true, show: false,
        resizable: false, backgroundColor: "#00000000", title: "dx.bi preview regression test" });
    await win.loadURL("about:blank");
    Shell.setup(win);
    win.show(); // Match the app: establish ownership/taskbar styles before revealing the window.
    await waitFor("mpv IPC", () => Shell.socket);
    const preview = Shell.taskbarPreview;
    assert.ok(preview, "native DWM bindings must load");
    let captures = 0;
    const capture = preview.capture;
    preview.capture = async () => { captures++; return capture(); };
    const user = koffi.load("user32.dll");
    const post = user.func("int __stdcall PostMessageW(intptr_t hwnd, uint32_t message, uintptr_t wparam, intptr_t lparam)");
    const handle = win.getNativeWindowHandle();
    const hwnd = handle.readBigInt64LE(0);
    let iconic = false;
    const attributes = preview.native.attributes;
    preview.native.attributes = on => { attributes(on); iconic = on; };
    const hashes = [], errors = [];
    let thumbnails = 0, peeks = 0;
    const show = preview.native.show;
    preview.native.show = (image, live, width, height) => {
        try {
            show(image, live, width, height); // Calls real DWM and GDI; throws if Windows rejects the bitmap.
            if (live) {
                const [width, height] = preview.native.clientSize();
                const size = image.getSize();
                assert.ok(size.width <= width && size.height <= height);
                peeks++;
            } else {
                thumbnails++;
                const size = image.getSize();
                assert.ok(size.width > 0 && size.height > 0);
                hashes.push(createHash("sha256").update(image.toBitmap()).digest("hex"));
                if (output) writeFileSync(join(output, "native-preview-frame.png"), image.toPNG());
            }
        } catch (err) { errors.push(err); }
    };
    // Let DWM supply its real maximum dimensions; fabricated WM_* requests can be rejected.
    const request = () => preview.native.invalidate();
    const freshFrame = async () => {
        const before = captures;
        // Explicit capture also exercises PiP when DWM currently has no visible switch target.
        await preview.refresh();
        assert.ok(captures > before && preview.frame && !preview.pending);
        request();
        assert.ok(!existsSync(join(app.getPath("temp"), `dxbi-taskbar-${process.pid}.jpg`)));
    };
    const command = data => Shell.onPageMessage({ type: 6, args: ["mpv-command", data] });
    assert.equal(iconic, false);
    command(["loadfile", "av://lavfi:testsrc2=size=640x360:rate=24"]);
    await waitFor("a ready preview frame", () => preview.enabled);
    assert.equal(iconic, true);
    console.log("Waiting for DWM's first thumbnail request (open Alt+Tab if needed)");
    request();
    await waitFor("a DWM-accepted thumbnail", () => thumbnails > 0 || errors.length);
    assert.deepEqual(errors, []);
    console.log("PASS real mpv frame reaches DWM as a bounded 32-bit taskbar thumbnail");
    const firstHash = hashes.at(-1);
    win.minimize();
    await sleep(1300);
    await freshFrame();
    assert.ok(preview.frame.getSize().width >= 320, "minimizing must not shrink the cached video to a tiny window surface");
    await waitFor("an updated thumbnail while minimized", () => hashes.some(hash => hash !== firstHash) || errors.length);
    assert.deepEqual(errors, []);
    assert.ok(win.isMinimized());
    console.log("PASS thumbnail frames continue changing while dx.bi is minimized");

    command(["set_property", "pause", true]);
    await sleep(1300);
    await freshFrame();
    const paused = createHash("sha256").update(preview.frame.toBitmap()).digest("hex");
    await sleep(1300);
    await freshFrame();
    assert.equal(createHash("sha256").update(preview.frame.toBitmap()).digest("hex"), paused);
    console.log("PASS a paused video keeps its current frame");

    Shell.setPip(true);
    assert.ok(Shell.pip);
    await sleep(1300);
    await freshFrame();
    assert.equal(iconic, true);
    Shell.setPip(false);
    win.restore();
    post(hwnd, 0x0326, 0, 0);
    await waitFor("DWM-accepted Peek bitmap", () => peeks > 0 || errors.length);
    assert.deepEqual(errors, []);
    console.log("PASS native picture-in-picture and full-sized Peek requests");

    const kernel = koffi.load("kernel32.dll");
    const currentProcess = kernel.func("void * __stdcall GetCurrentProcess()");
    const resources = user.func("uint32_t __stdcall GetGuiResources(void *process, uint32_t flags)");
    const beforeGdi = resources(currentProcess(), 0);
    const sample = preview.frame.resize({ width: 100, height: 56 });
    for (let n = 0; n < 200; n++) show(sample, false);
    assert.ok(resources(currentProcess(), 0) <= beforeGdi + 2, "bitmap replies must release GDI handles");
    console.log("PASS 200 native bitmap replies do not leak GDI handles; temporary frames are removed");

    command(["stop"]);
    assert.equal(iconic, false);
    assert.equal(preview.timer, null);
    assert.equal(preview.frame, null);
    console.log("PASS stop restores the ordinary Windows thumbnail and releases the cached frame");
    command(["loadfile", "av://lavfi:testsrc2=size=640x360:rate=24"]);
    await waitFor("restart", () => preview.enabled);
    Shell.mpv.kill();
    await waitFor("mpv exit cleanup", () => !preview.active);
    assert.equal(iconic, false);
    console.log("PASS restarting playback and unexpected mpv exit restore preview state");
    clearTimeout(deadline);
    win.destroy();
    app.quit();
}).catch(err => {
    console.error(err);
    clearTimeout(deadline);
    if (Shell) Shell.shutdown();
    if (win && !win.isDestroyed()) win.destroy();
    app.exit(1);
});
