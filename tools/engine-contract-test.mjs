// node tools/engine-contract-test.mjs: what the phone app's native screens rely on in the plugin, dxbi-tv.js
// and the Android bridge is still there. A change upstream that renames or reshapes one of these fails here,
// in the fork's sync pull request, before it reaches a phone.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const plugin = read("dxbi.plugin.js");
const tv = read("tv/app/src/main/assets/dxbi-tv.js");
const engine = read("tv/app/src/mobile/assets/dxbi-engine.js");
const bridge = read("tv/app/src/main/java/com/notdxbi/dxbi/tv/Bridge.kt");
const main = read("tv/app/src/main/java/com/notdxbi/dxbi/tv/MainActivity.kt");

// The text between `opening` and the bracket that closes it (the first `opening` that ends its line, when `multiline`)
function block(text, opening, multiline = false) {
  const start = multiline ? text.search(new RegExp(opening.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\r?\\n")) : text.indexOf(opening);
  assert.ok(start >= 0, `found ${opening}`);
  let depth = 0;
  for (let i = start + opening.length - 1; i < text.length; i++) {
    if (text[i] === "{" || text[i] === "(" || text[i] === "[") depth++;
    else if (text[i] === "}" || text[i] === ")" || text[i] === "]") depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }
  assert.fail(`${opening} never closes`);
}

// 1. dx.bi's features the native screens call through window.__dxbi (the engine's "dx" op)
const api = block(plugin, "  const api = {");
for (const name of ["settings", "viewers", "whoIsWatching", "homeLayout", "episodes", "calendarFill", "skipSegments",
  "openTrailer", "partyInfo", "partyLeave", "quickPlayNext", "streamHints", "titleColourOf"]) {
  assert.match(api, new RegExp(`\\n\\s+(async\\s+)?${name}\\b`), `plugin api still has ${name}`);
}
assert.match(plugin, /window\.__dxbi = api/, "the api is window.__dxbi");
// the phone app's own entry (Home's billboard and rows as data), and what it builds on
const phone = block(api, "    phone: {");
for (const name of ["billboard", "myList", "forYou", "airing", "layout", "viewers", "reviews", "streams", "play"]) {
  assert.match(phone, new RegExp(`\\n\\s+(async\\s+)?${name}\\(`), `api.phone.${name}`);
}
for (const [owner, method] of [["hero", "load"], ["hero", "background"], ["myList", "groups"], ["forYou", "seed"], ["forYou", "saved"], ["forYou", "load"],
  ["episodes", "refresh"], ["homeLayout", "data"], ["homeLayout", "save"], ["viewers", "current"], ["viewers", "list"], ["viewers", "select"],
  ["reviews", "load"], ["reviews", "wikipedia"], ["reviews", "tmdb"], ["quickPlay", "memory"], ["quickPlay", "play"], ["streamChoice", "choose"], ["streamChoice", "spares"]]) {
  assert.match(block(plugin, `  const ${owner} = {`), new RegExp(`\\n    (async )?${method}\\(`), `${owner}.${method} (used by api.phone or the phone app)`);
}
console.log("PASS the plugin's api has what the phone app calls");

// 2. dx.bi's settings, drawn natively from their description
assert.match(plugin, /\n  const SCHEMA = \[/, "SCHEMA");
assert.match(plugin, /\n  const SETTING_GROUPS = /, "SETTING_GROUPS");
const schema = block(plugin, "  const SCHEMA = [");
for (const field of ["key:", "type:", "label:"]) assert.ok(schema.includes(field), `settings entries have ${field}`);
for (const type of ["toggle", "select"]) assert.ok(schema.includes(`"${type}"`), `settings use ${type}`);
console.log("PASS settings keep their shape");

// 3. What the native player is given (dxbi-tv.js → PlayerActivity), and how it reports back
// (the stream handoff: the one written out over many lines, not the short ones for trailers and the like)
const payload = block(tv, "native.play(JSON.stringify({", true);
for (const key of ["hash", "videoId", "skips", "url", "title", "subtitle", "startMs", "headers", "subtitles", "next", "upNext", "audioLanguage", "subtitleStyle", "background"]) {
  assert.match(payload, new RegExp(`\\n\\s+${key}\\b`), `play payload has ${key}`);
}
// dx.bi settings, which the phone app draws natively from dxbi-tv.js's list
for (const name of ["settings", "saveSetting"]) assert.match(tv, new RegExp(`tv\\.${name} = `), `dxbi-tv.js offers __dxbiTv.${name}`);
for (const callback of ["onProgress", "playerClosed", "onPartyTick", "back"]) {
  assert.match(tv, new RegExp(`tv\\.${callback} = `), `dxbi-tv.js still offers __dxbiTv.${callback}`);
  assert.ok(main.includes(`__dxbiTv.${callback}`), `MainActivity still calls __dxbiTv.${callback}`);
}
assert.match(tv, /\/\^#\\\/player\\\/\//, "dxbi-tv.js takes over Stremio's #/player/ route (the engine plays through it)");
console.log("PASS the play handoff keeps its fields and callbacks");

// 4. Every bridge call the page makes exists in Bridge.kt
const used = new Set([...tv.matchAll(/bridge\.(\w+)\(/g), ...engine.matchAll(/bridge\.(\w+)\(/g)].map((m) => m[1]));
const offered = new Set([...bridge.matchAll(/@JavascriptInterface\s+fun (\w+)/g)].map((m) => m[1]));
for (const name of used) assert.ok(offered.has(name), `Bridge.kt offers ${name}`);
assert.ok(offered.has("engine"), "Bridge.kt offers engine");
console.log(`PASS the bridge has all ${used.size} methods the page calls`);

// 5. The engine hears Stremio through window.core and window.onCoreEvent: nothing else may take them over
for (const [name, text] of [["dxbi.plugin.js", plugin], ["dxbi-tv.js", tv]]) {
  assert.doesNotMatch(text, /window\.onCoreEvent\s*=/, `${name} leaves window.onCoreEvent to Stremio and the engine`);
  assert.doesNotMatch(text, /defineProperty\(window,\s*["']core["']/, `${name} doesn't redefine window.core`);
}
console.log("PASS Stremio's core events reach the engine");
