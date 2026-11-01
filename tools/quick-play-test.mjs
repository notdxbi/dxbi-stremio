// node tools/quick-play-test.mjs: which stream "Just press Play" picks, and that it never starts a debrid download
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const start = source.indexOf("  const FLAG_LANG = {");
const end = source.indexOf("  const streamTools = {");
assert.ok(start > 0 && end > start, "stream parser found");
const { describeStream, streamChoice, NOT_LISTED } = vm.runInNewContext(`${source.slice(start, end)}
  ({ describeStream, streamChoice, NOT_LISTED })`);

const item = (name, desc, hint = {}, torrent = false) => ({ d: describeStream(name, `${name}\n${desc}`), hint, torrent, label: desc });
const cached4k = item("[RD+] Torrentio\n4k", "Film.2160p.WEB-DL.HDR 👤 40 💾 18 GB ⚙️ RARBG");
const cachedDv = item("[RD+] Torrentio\n4k", "Film.2160p.BluRay.DV 👤 80 💾 30 GB");
const cached1080 = item("[RD+] Torrentio\n1080p", "Film.1080p.WEB-DL 👤 12 💾 4 GB");
const remux = item("[RD+] Torrentio\n4k", "Film.2160p.Remux.HDR 💾 80 GB");
const uncached = item("[RD download] Torrentio\n4k", "Film.2160p.Remux.HDR 👤 900 💾 80 GB");
const cam = item("[RD+] Torrentio\n1080p", "Film.1080p.HDCAM 💾 2 GB");
const torrent = item("Torrentio\n1080p", "Film.1080p.BluRay 👤 300 💾 9 GB", {}, true);
const pick = (items, memory, options) => streamChoice.choose(items, memory, options)?.item.label ?? null;

assert.equal(describeStream("[RD download] Torrentio", "").pending, true);
assert.equal(describeStream("[RD+] Torrentio", "").pending, false);
assert.equal(describeStream("[TB ⚡] Comet", "").instant, true);
assert.equal(describeStream("Torrentio", "").pending, false);
console.log("PASS cached, uncached and plain torrents are told apart");

assert.equal(pick([uncached, cam]), null, "nothing safe to start");
assert.equal(pick([uncached, cached1080]), cached1080.label, "never starts a debrid download");
assert.equal(pick([cam, cached1080]), cached1080.label, "never a cinema recording");
console.log("PASS never starts a debrid download or a cinema recording");

assert.equal(pick([cached1080, cached4k]), cached4k.label);
assert.equal(pick([cachedDv, cached4k]), cached4k.label, "HDR before Dolby Vision");
assert.equal(pick([remux, cached4k]), cached4k.label, "an encode before a remux");
assert.equal(pick([torrent, cached1080]), cached1080.label, "ready to play before a torrent");
console.log("PASS ready, then quality, then what keeps playing");

assert.equal(pick([cached4k, cached1080], null, { limit: 1080 }), cached1080.label);
assert.equal(pick([cached4k], null, { limit: 1080 }), cached4k.label, "better too high than nothing");
assert.equal(pick([torrent], null, { torrents: false }), null, "no torrents without a server");
console.log("PASS quality limit and torrents without a server");

const hinted = item("[RD+] Other\n1080p", "Show.S01E02.1080p", { bingeGroup: "group-a" });
assert.equal(streamChoice.choose([cached4k, hinted], { bingeGroup: "group-a" }).how, "same");
assert.equal(pick([cached4k, cached1080], { res: 1080, provider: "Torrentio", langs: [NOT_LISTED] }), cached1080.label, "stays at the chosen quality");
const italian = item("[RD+] Torrentio\n1080p", "Film.1080p.WEB 🇮🇹 💾 4 GB");
assert.equal(pick([cached4k, cached1080, italian], { res: 1080, provider: "Torrentio", langs: ["Italian"] }), italian.label, "stays in the chosen language");
console.log("PASS remembers release, quality and language");

const gone = { res: 720, provider: "Nobody", langs: [] };
assert.equal(pick([cached1080], gone, { fallback: "ask" }), null, "asked to show the list");
assert.equal(pick([cached1080], gone, { fallback: "best" }), cached1080.label);
console.log("PASS missing choice: next best, or the list");
