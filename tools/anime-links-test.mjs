// node tools/anime-links-test.mjs: the MyAnimeList / AniList buttons only link an AniList entry that
// really is the title on the page (same name, same kind, within a year)
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8").replace(/\r\n/g, "\n");
const start = source.indexOf("  function anilistMatch(");
const end = source.indexOf("  function slimMeta(");
assert.ok(start > 0 && end > start, "anilistMatch found");
const anilistMatch = vm.runInNewContext(`${source.slice(start, end)}; anilistMatch`, {});

// AniList's answers for "Frieren: Beyond Journey's End", in its own order
const frieren = [
  { id: 189513, idMal: null, format: "ONA", startDate: { year: 2025 }, title: { romaji: "Sousou no Frieren: ●● no Mahou", english: null } },
  { id: 170068, idMal: 56885, format: "ONA", startDate: { year: 2023 }, title: { romaji: "Sousou no Frieren: Mini Anime", english: null } },
  { id: 154587, idMal: 52991, format: "TV", startDate: { year: 2023 }, title: { romaji: "Sousou no Frieren", english: "Frieren: Beyond Journey’s End" } },
  { id: 182255, idMal: 59978, format: "TV", startDate: { year: 2026 }, title: { romaji: "Sousou no Frieren 2nd Season", english: "Frieren: Beyond Journey’s End Season 2" } },
];
assert.equal(anilistMatch(frieren, "Frieren: Beyond Journey's End", 2023, "series").id, 154587, "curly and straight apostrophes match");
assert.equal(anilistMatch(frieren, "Frieren: Beyond Journey's End", 2010, "series"), null, "a different year is someone else");
assert.equal(anilistMatch(frieren, "Frieren: Beyond Journey's End", 2023, "movie"), null, "a series is not the film");
assert.equal(anilistMatch(frieren, "Sousou no Frieren", 2023, "series").id, 154587, "romaji name");
assert.equal(anilistMatch(frieren, "Frieren", 2023, "series"), null, "only the full name, not a part of it");
assert.equal(anilistMatch([{ id: 1, format: "MOVIE", startDate: { year: 2016 }, title: { english: "Your Name." }, synonyms: ["Kimi no Na wa."] }], "Kimi no Na wa", 2016, "movie").id, 1, "synonyms count");
assert.equal(anilistMatch([], "Breaking Bad", 2008, "series"), null);
assert.equal(anilistMatch(null, "x", 0, "series"), null);
console.log("PASS anime links match only the same title");
