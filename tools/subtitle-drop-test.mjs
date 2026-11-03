// node tools/subtitle-drop-test.mjs: keep dropped subtitle encodings and let Stremio import them.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const source = readFileSync(fileURLToPath(new URL("../dxbi.plugin.js", import.meta.url)), "utf8");
const start = source.indexOf("  function onSubtitleDrop(");
const end = source.indexOf("  // ---- Subtitle files:", start);
assert.ok(start > 0 && end > start, "subtitle drop handler found");

// Node supplies real Blob/File bytes; only the browser's DataTransfer file list is stubbed.
class DataTransfer {
  files = [];
  items = { add: file => this.files.push(file) };
}
let route = "player";
const errors = [];
const onDrop = vm.runInNewContext(source.slice(start, end) + "; onSubtitleDrop", {
  currentRoute: () => route, File, DataTransfer, log: (...args) => errors.push(args),
});
const drop = (...files) => ({ dataTransfer: { files } });
const srt = "2\r\n00:00:01,000 --> 00:00:03,000\r\nCafé 日本語\r\n";
const utf16le = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(srt, "utf16le")]);
const utf16be = Buffer.from(utf16le).swap16();

for (const [name, bytes, mime, expected] of [
  ["ordinary.srt", Buffer.from(srt.replace(/^2/, "1")), "", "application/x-subrip"],
  ["cue-two.srt", Buffer.from(srt), "", "application/x-subrip"],
  ["bom.SRT", Buffer.from("\ufeff" + srt), "", "application/x-subrip"],
  ["utf16le.srt", utf16le, "", "application/x-subrip"],
  ["utf16be.srt", utf16be, "", "application/x-subrip"],
  ["plain-text.srt", Buffer.from(srt), "text/plain", "application/x-subrip"],
  ["octet-stream.srt", Buffer.from(srt), "application/octet-stream", "application/x-subrip"],
  ["captions.VTT", Buffer.from("\ufeffWEBVTT\n\n00:01.000 --> 00:03.000\nHello\n"), "text/plain", "text/vtt"],
]) {
  const file = new File([bytes], name, { type: mime, lastModified: 123456789 });
  const event = drop(file);
  const original = event.dataTransfer;
  onDrop(event);
  const imported = event.dataTransfer.files[0];
  assert.equal(imported.type, expected, name);
  assert.equal(imported.name, name);
  assert.equal(imported.lastModified, file.lastModified);
  assert.deepEqual(Buffer.from(await imported.arrayBuffer()), bytes, `${name}: original encoding and cue numbers preserved`);
  assert.equal(file.type, mime, "original File is unchanged");
  onDrop(event);
  assert.equal(event.dataTransfer.files[0], imported, "already normalized drops are unchanged");
  assert.notEqual(event.dataTransfer, original);
}
console.log("PASS SRT/VTT MIME repair preserves names, timestamps, cue numbers and UTF-8/UTF-16 bytes");

for (const [name, mime] of [["known.srt", "application/x-subrip"], ["known.vtt", "text/vtt"], ["movie.torrent", ""], ["styles.ass", ""], ["readme.txt", "text/plain"]]) {
  const event = drop(new File(["unchanged"], name, { type: mime }));
  const original = event.dataTransfer;
  onDrop(event);
  assert.equal(event.dataTransfer, original, `${name}: original drop preserved`);
}
const extra = new File(["extra"], "second.srt");
const multiple = drop(new File([srt], "first.srt"), extra);
onDrop(multiple);
assert.equal(multiple.dataTransfer.files.length, 2);
assert.equal(multiple.dataTransfer.files[1], extra, "first-file semantics preserved");
const torrentFirst = drop(new File(["torrent"], "first.torrent"), extra);
const untouched = torrentFirst.dataTransfer;
onDrop(torrentFirst);
assert.equal(torrentFirst.dataTransfer, untouched);
route = "board";
const elsewhere = drop(new File([srt], "subtitles.srt"));
const original = elsewhere.dataTransfer;
onDrop(elsewhere);
assert.equal(elsewhere.dataTransfer, original, "only the player handles subtitle drops");
route = "player";
onDrop({});
onDrop(drop());
assert.equal(errors.length, 0);
console.log("PASS known MIME types, other formats, empty drops, multiple files and other routes are unchanged");

const readonly = drop(new File([srt], "readonly.srt"));
Object.freeze(readonly);
assert.doesNotThrow(() => onDrop(readonly));
assert.equal(errors.length, 1, "an unavailable event override falls back to the original drop");
console.log("PASS failed normalization leaves the original drop available to Stremio");
