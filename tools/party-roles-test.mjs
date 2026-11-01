// node tools/party-roles-test.mjs: who may control a watch party, and that the code proves the host
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const start = source.indexOf('    const CODE_ALPHABET = "');
const end = source.indexOf("    async function deriveRoom(code)");
const saved = new Map();
const api = vm.runInNewContext(`const enc = new TextEncoder();
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const store = { get: (k) => saved.get(k) ?? null, set: (k, v) => saved.set(k, v) };
  ${source.slice(start, end)}
  ({ partyRules, normaliseCode, prettyCode, ownedCode, keyFor, codeOf, OWNED_CODE_LENGTH })`, {
  saved, crypto: webcrypto, TextEncoder, Uint8Array, JSON, btoa, atob, String, Array, console,
});
const { partyRules: rules } = api;
const base = { owner: "host", ownerHere: true, open: false, mods: ["mod"], online: ["host", "mod", "guest"], host: "host" };
const may = (id, over = {}) => rules.mayControl({ ...base, id, ...over });

assert.equal(may("host"), true);
assert.equal(may("mod"), true);
assert.equal(may("guest"), false, "a viewer can't control");
assert.equal(may("guest", { open: true }), true, "everyone can when the host opens it up");
console.log("PASS host and mods control, viewers don't, unless the host opens it up");

assert.equal(may("guest", { ownerHere: false, host: "mod" }), false, "host away: the mods carry on, not viewers");
assert.equal(may("mod", { ownerHere: false, host: "mod" }), true);
assert.equal(may("guest", { ownerHere: false, mods: [], online: ["guest", "other"], host: "guest" }), true, "nobody in charge: the stand-in keeps it going");
assert.equal(may("other", { ownerHere: false, mods: [], online: ["guest", "other"], host: "guest" }), false);
console.log("PASS host away: mods carry on, otherwise one stand-in only");

const removal = (by, target) => rules.mayRemove({ by, target, owner: "host", mods: ["mod", "mod2"] });
assert.equal(removal("host", "guest"), true);
assert.equal(removal("host", "mod"), true);
assert.equal(removal("mod", "guest"), true);
assert.equal(removal("mod", "mod2"), false, "mods can't remove each other");
assert.equal(removal("mod", "host"), false);
assert.equal(removal("guest", "guest2"), false);
console.log("PASS only the host removes mods; viewers remove nobody");

const now = Date.now();
assert.equal(rules.mayWait([now - 1000, now - 2000], now), true);
assert.equal(rules.mayWait([now - 1000, now - 2000, now - 3000], now), false, "fake buffering can't pause forever");
assert.equal(rules.mayWait([now - 400000, now - 500000, now - 600000], now), true, "it wears off");
console.log("PASS a viewer's buffering pauses the party only a few times");

const code = await api.ownedCode();
assert.equal(code.length, api.OWNED_CODE_LENGTH);
assert.equal(api.normaliseCode(api.prettyCode(code).toLowerCase()), code, "codes survive typing");
assert.equal(api.normaliseCode("ABCDE-FGHJK"), "ABCDEFGHJK", "older codes still join");
assert.equal(api.normaliseCode("ABCDEFGHJKM"), null);
const host = await api.keyFor(code);
assert.equal(await api.codeOf(host.raw), code, "the host's key matches the code, also after coming back");
const other = await api.keyFor("OTHERPARTYAA");
assert.notEqual(await api.codeOf(other.raw), code, "nobody else's key does");
assert.notEqual(other.id, host.id, "keys differ per party");
console.log("PASS the code proves the host, and only the host");
