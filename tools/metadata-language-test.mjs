// node tools/metadata-language-test.mjs [optional-preview-folder]
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "dxbi.plugin.js"), "utf8");
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const code = slice("  const META_TTL =", "  // Anime scores for kitsu:")
    + slice("  const metadataSource =", "  // Carousels (arrows")
    + slice("  const coreMeta =", "  const io = new IntersectionObserver")
    + slice("  function isWideRow(", "  function syncCards(")
    + slice("  const preview =", "  // Scroll what's under a floating layer")
    + slice("  function addonServes(", "  const prefetch =")
    + "\n({metadataSource, hero, getInfo, addonMeta, coreMeta, artworkUrl, preview, decorate})";

function setup() {
    let now = Date.now();
    const stock = { transportUrl: "https://v3-cinemeta.strem.io/manifest.json", manifest: { version: "1", resources: ["meta"], types: ["movie", "series"], idPrefixes: ["tt"], catalogs: [] } };
    const configured = {
        transportUrl: "https://metadata.example/fr%2Fconfiguration/manifest.json?language=fr-FR&key=fixture",
        manifest: { version: "1", resources: ["meta"], types: ["movie", "series"], idPrefixes: ["tt", "tmdb:"], catalogs: [
            { type: "movie", id: "popular" },
            { type: "series", id: "search", extra: [{ name: "search", isRequired: true }] },
        ] },
    };
    const state = { profile: { uid: "fixture-account", settings: { interfaceLanguage: "fr-FR" }, addons: [stock, configured] }, metaFailure: false, catalogFailure: false, malformedMeta: false, canonicalMeta: false, ctxAvailable: true, slowCatalog: null, slowMeta: null, kids: false };
    const requests = [], images = [], persisted = new Map();
    const settings = { billboardSource: "mixed", billboard: true, billboardInterval: "0" };
    const movie = (id, french = true) => ({ id, type: "movie", name: french ? "Le Voyage des étoiles" : "Journey to the Stars", description: french ? "Une aventure française à travers les étoiles." : "An English journey through the stars.", genres: [french ? "Aventure" : "Adventure"], releaseInfo: "2026", imdbRating: "8.1", runtime: "108 min", poster: "https://images.example/poster.jpg", background: "https://images.example/background.jpg" });
    const snapshot = () => JSON.parse(JSON.stringify(state.profile));
    const getState = async model => model === "ctx" ? state.ctxAvailable ? { profile: snapshot() } : null : model === "board" ? { catalogs: [{ content: { content: [movie("tt1234567", false)] } }] } : {};
    const fetch = async address => {
        const url = new URL(address); requests.push(url.href);
        const french = url.searchParams.get("language") !== "en-US";
        let result;
        if (url.hostname === "metadata.example") {
            if (url.pathname.includes("/catalog/")) {
                if (state.slowCatalog) await state.slowCatalog;
                result = state.catalogFailure ? null : { metas: [movie("tmdb:42", french), movie("tmdb:42", french)] };
            } else {
                if (state.slowMeta) await state.slowMeta;
                const id = decodeURIComponent(url.pathname.split("/").at(-1).replace(/\.json$/, ""));
                const meta = movie(state.canonicalMeta && id.startsWith("tt") ? "tmdb:42" : id, french);
                if (state.canonicalMeta) meta.imdb_id = id.startsWith("tt") ? id : "tt1234567";
                if (state.malformedMeta) meta.type = "series";
                result = state.metaFailure ? null : { meta };
            }
        } else if (url.hostname === "v3-cinemeta.strem.io") {
            result = url.pathname.includes("/catalog/") ? { metas: [movie("tt1234567", false)] } : { meta: { ...movie("tt1234567", false), logo: "https://images.example/english-logo.png" } };
        } else throw Error("Unexpected provider: " + url.hostname);
        return { ok: !!result, json: async () => result };
    };
    const realDate = Date;
    class Clock extends realDate { static now() { return now; } }
    const document = { querySelector: () => null, querySelectorAll: () => [] };
    const api = vm.runInNewContext(code, {
        URL, AbortSignal, Date: Clock, Promise, setTimeout: (fn, delay) => setTimeout(fn, delay === 900 || delay === 1200 ? 1 : delay), clearTimeout, settings, fetch,
        localStorage: { getItem: k => persisted.get(k) ?? null, setItem: (k, v) => persisted.set(k, v), removeItem: k => persisted.delete(k) },
        core: () => ({ getState }),
        isImdb: id => /^tt\d+$/.test(id || ""),
        preload: async url => { images.push(url); return !!url; },
        art: { background: id => `https://images.metahub.space/background/large/${id}/img`, backgroundMedium: id => `https://images.metahub.space/background/medium/${id}/img`, logo: id => `https://images.metahub.space/logo/medium/${id}/img` },
        restrict: { kidsAge: () => state.kids, decide: async () => true },
        animeScore: { parse: () => null }, scheduleSync() {},
        trailer: { stop() {} }, decodeImage: async () => true, IN_TV: false,
        cardInfo: card => card.info, crisp: { card() {} }, newEpisodeBadge() {}, animeCaption() {},
        document,
        currentRoute: () => "board", navigate() {}, window: {},
        esc: value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]),
        imdbHtml: value => `<span>${value}</span>`, formatRuntime: value => value,
        ICONS: { play: "▶", info: "ⓘ" },
    });
    return { ...api, state, stock, configured, requests, images, persisted, settings, movie, document, advance: n => { now += n; }, async refresh() { this.advance(5000); await api.metadataSource.refresh(); } };
}

const a = setup();
await a.hero.load();
assert.equal(a.hero.items.length, 1, "duplicate catalog entries must collapse");
assert.equal(a.hero.items[0].id, "tmdb:42", "configured catalog IDs must be retained");
assert.equal(a.hero.items[0].name, "Le Voyage des étoiles");
assert.match(a.hero.items[0].description, /française/);
assert.ok(a.requests.every(url => !url.includes("/catalog/series/search")), "required catalog extras must not be guessed");
assert.ok(a.requests.filter(url => url.includes("metadata.example")).every(url => url.includes("fr%2Fconfiguration") && url.includes("language=fr-FR") && url.includes("key=fixture")));
const frenchHtml = a.hero.slideHtml(a.hero.items[0], 0);
assert.match(frenchHtml, /Lire/);
assert.match(frenchHtml, /Plus d’infos/);
assert.match(frenchHtml, /<h1[^>]*>Le Voyage des étoiles<\/h1>/);
assert.match(frenchHtml, /\/detail\/movie\/tmdb%3A42\/tmdb%3A42/);
assert.ok(!a.images.some(url => url.includes("metahub") && url.includes("tmdb")));
assert.ok(!a.requests.some(url => url.includes("v3-cinemeta")), "a working configured catalog must not be replaced by default Cinemeta");
console.log("PASS French configured catalogs, metadata, title text, controls and non-IMDb navigation");

const details = await a.getInfo("movie", "tt1234567");
assert.equal(details.name, "Le Voyage des étoiles", "configured metadata must beat cached English core metadata");
assert.equal(details.logo, null, "missing localized title art must not import an English logo");
const count = a.requests.filter(url => url.includes("/meta/")).length;
await a.getInfo("movie", "tt1234567");
assert.equal(a.requests.filter(url => url.includes("/meta/")).length, count, "same-scope requests should share cached metadata");
assert.ok(!JSON.stringify([...a.persisted]).includes("key=fixture"));
console.log("PASS previews prefer configured text; metadata cache stays in memory and preserves URL configuration");

const catalogOnly = setup();
catalogOnly.state.profile.addons = [catalogOnly.stock];
await catalogOnly.metadataSource.refresh(); await catalogOnly.coreMeta.refresh(true);
catalogOnly.coreMeta.map.get("movie:tt1234567").logo = "https://images.example/english-logo.png";
const catalogTitle = await catalogOnly.getInfo("movie", "tt1234567", catalogOnly.movie("tt1234567"));
assert.equal(catalogTitle.name, "Le Voyage des étoiles");
assert.equal(catalogTitle.logo, null, "localized catalog text must not inherit an English core logo");

a.state.profile.settings.interfaceLanguage = "en-US";
await a.refresh();
await a.hero.load();
assert.equal(a.hero.items[0].name, "Le Voyage des étoiles", "interface language must not rewrite an addon's configured content language");
assert.match(a.hero.slideHtml(a.hero.items[0], 0), />Play</);
a.state.profile.addons[1].transportUrl = a.configured.transportUrl.replace("fr-FR", "en-US");
await a.refresh();
await a.hero.load();
assert.equal(a.hero.items[0].name, "Journey to the Stars");
const englishHtml = a.hero.slideHtml(a.hero.items[0], 0);
assert.match(englishHtml, />Play</);
assert.match(englishHtml, />More Info</);
assert.doesNotMatch(englishHtml, /française|Lire|Le Voyage/);
a.state.profile.addons = [a.stock];
await a.refresh();
await a.hero.load();
assert.equal(a.hero.items[0].id, "tt1234567");
assert.match(a.hero.slideHtml(a.hero.items[0], 0), /images\.metahub\.space\/logo\//);
console.log("PASS language/addon changes invalidate old text; English default Cinemeta remains available");

const english = setup();
english.state.profile.settings.interfaceLanguage = "en-US";
english.configured.manifest.catalogs.push({ type: "series", id: "popular" });
await english.hero.load();
assert.equal(english.hero.items[0].id, "tt1234567", "English keeps Cinemeta's Popular roster");
assert.ok(!english.requests.some(url => url.includes("metadata.example") && url.includes("/catalog/")), "English must not swap the billboard for an addon's first catalog");
assert.match(english.hero.slideHtml(english.hero.items[0], 0), /images\.metahub\.space\/logo\//, "English keeps title art when the addon has no logo");
const noLogo = await english.getInfo("movie", "tt1234567");
assert.equal(noLogo.logo, null);
assert.match(english.hero.slideHtml({ ...noLogo, id: "tt1234567", type: "movie", name: "Journey to the Stars", description: "x", background: "https://images.example/b.jpg" }, 0), /metahub\.space\/logo\//);
const german = setup();
german.state.profile.settings.interfaceLanguage = "de-DE";
german.state.profile.addons = [german.stock];
await german.hero.load();
assert.match(german.hero.slideHtml(german.hero.items[0], 0), /metahub\.space\/logo\//, "without translated text, other languages keep title art");
console.log("PASS English keeps Popular and title art; other languages keep art unless the title is translated");

const scoreOnly = setup();
await scoreOnly.metadataSource.refresh();
await scoreOnly.getInfo("movie", "tt1234567", null, true);
assert.ok(!scoreOnly.requests.some(url => url.includes("metadata.example")), "rating badges must not fetch addon metadata per card");
console.log("PASS rating badges don't call configured addons");

const fallback = setup();
fallback.state.catalogFailure = true;
await fallback.hero.load();
assert.equal(fallback.hero.items[0].id, "tt1234567");
assert.equal(fallback.hero.items[0].name, "Le Voyage des étoiles", "default roster must still use configured metadata");
fallback.settings.billboardSource = "rated";
fallback.hero.reset(); await fallback.hero.load();
assert.ok(fallback.requests.some(url => url.endsWith("/imdbRating.json")));
assert.equal(fallback.hero.items[0].name, "Le Voyage des étoiles");
fallback.settings.billboardSource = "mixed";
fallback.state.kids = true;
fallback.hero.reset(); await fallback.hero.load();
assert.ok(fallback.requests.some(url => url.includes("genre=Animation")));
console.log("PASS catalog failure fallback, rated selection and existing children’s roster retain localized metadata");

const errors = setup();
errors.state.metaFailure = true;
await errors.metadataSource.refresh();
const failed = await errors.getInfo("movie", "tt1234567");
assert.equal(failed.name, "Journey to the Stars", "unavailable translations must fall back honestly");
const failedCount = errors.requests.length;
await errors.getInfo("movie", "tt1234567");
assert.equal(errors.requests.length, failedCount, "failed provider should have a short retry cooldown");
errors.state.metaFailure = false;
errors.advance(11000);
assert.equal((await errors.getInfo("movie", "tt1234567")).name, "Le Voyage des étoiles");
errors.state.malformedMeta = true;
errors.state.profile.uid = "another-fixture-account";
await errors.refresh();
assert.equal((await errors.getInfo("movie", "tt1234567")).name, "Journey to the Stars", "mismatched resource types must not overwrite a title");
const aliases = setup(); aliases.state.canonicalMeta = true;
const aliased = await aliases.getInfo("movie", "tt1234567");
assert.equal(aliased.name, "Le Voyage des étoiles", "canonical TMDB IDs must not discard a valid IMDb lookup");
assert.equal(aliased.imdbId, "tt1234567");
await aliases.hero.load();
assert.equal(aliases.hero.items[0].id, "tmdb:42");
assert.equal(aliases.hero.items[0].imdbId, "tt1234567");
console.log("PASS provider errors, retry cooldown, account isolation, canonical IDs and resource-type validation");

const race = setup();
await race.metadataSource.refresh();
let release;
race.state.slowCatalog = new Promise(done => { release = done; });
const oldLoad = race.hero.load();
await new Promise(done => setImmediate(done));
race.state.profile.settings.interfaceLanguage = "en-US";
race.state.profile.addons = [race.stock];
await race.refresh();
release(); await oldLoad;
assert.equal(race.hero.items.length, 0, "an old language response must not rebuild the banner");
race.state.slowCatalog = null;
await race.hero.load();
assert.equal(race.hero.items[0].name, "Journey to the Stars");
const startup = setup();
startup.state.ctxAvailable = false;
await startup.hero.ensure();
assert.equal(startup.requests.length, 0, "initial profile must resolve before default English data is shown");
startup.state.ctxAvailable = true;
await startup.hero.load();
assert.equal(startup.hero.items[0].name, "Le Voyage des étoiles");
console.log("PASS startup and in-flight language changes cannot publish stale English/French slides");

const slow = setup();
await slow.metadataSource.refresh(); await slow.coreMeta.refresh(true);
let releaseMeta;
slow.state.slowMeta = new Promise(done => { releaseMeta = done; });
const card = { info: { id: "tt1234567", type: "movie", title: "Journey to the Stars", poster: "https://images.example/poster.jpg" } };
assert.equal((await slow.preview.prepare(card)).name, "Journey to the Stars", "a slow request may initially use core metadata");
releaseMeta();
await new Promise(done => setTimeout(done, 10));
assert.equal((await slow.preview.prepare(card)).name, "Le Voyage des étoiles", "the initial English timeout must not stay cached after localized details arrive");
slow.state.profile.settings.interfaceLanguage = "en-US";
await slow.refresh();
assert.equal(slow.preview.prep, null, "scope changes must discard prepared hover cards");
console.log("PASS slow localized replies replace prepared English fallbacks; language changes clear hover preparations");

const repaint = setup();
await repaint.metadataSource.refresh();
const title = { textContent: "Journey to the Stars" };
let hasLogo = true, logoRemoved = false;
const logo = { src: "https://images.example/english.png", remove() { logoRemoved = true; } };
const media = { querySelector: () => logoRemoved ? null : logo, classList: { remove: name => { if (name === "has-logo") hasLogo = false; } } };
repaint.document.createElement = () => ({ querySelector: () => ({}) });
repaint.preview.render = () => "localized details";
repaint.preview.refreshDetails({ querySelector: selector => selector === ".dx-preview-name" ? title : selector === ".dx-preview-media" ? media : selector === ".dx-preview-body" ? { replaceWith() {}, isEqualNode: () => false } : null }, card.info, { name: "Le Voyage des étoiles", logo: null, _configuredMeta: true });
assert.equal(title.textContent, "Le Voyage des étoiles");
assert.equal(logoRemoved, true);
assert.equal(hasLogo, false, "translated text must become visible after removing an English logo");
console.log("PASS late hover updates replace English artwork and reveal the translated title");

const wide = setup();
wide.settings.wideContinue = true;
await wide.metadataSource.refresh(); await wide.coreMeta.refresh(true);
let wideNode;
const poster = { querySelector: selector => selector.includes("dx-wide-art") ? wideNode : null, prepend: node => { wideNode = node; node.isConnected = true; } };
const row = { hasAttribute: () => true };
const wideCard = { ...card, querySelector: () => poster, closest: () => row };
const domNode = () => ({ dataset: {}, style: {}, classList: { add() {}, remove() {} }, querySelector: () => null, innerHTML: "", isConnected: false, remove() { this.isConnected = false; wideNode = null; } });
wide.document.createElement = domNode;
wide.decorate(wideCard);
await new Promise(done => setTimeout(done, 10));
assert.match(wideNode.innerHTML, /Le Voyage des étoiles/);
const previousWide = wideNode;
wide.state.profile.settings.interfaceLanguage = "en-US";
wide.state.profile.addons[1].transportUrl = wide.configured.transportUrl.replace("fr-FR", "en-US");
await wide.refresh(); await wide.coreMeta.refresh(true);
wide.decorate(wideCard);
await new Promise(done => setTimeout(done, 10));
assert.notEqual(wideNode, previousWide);
assert.match(wideNode.innerHTML, /metahub\.space\/logo\//, "English keeps title art on wide cards");
assert.doesNotMatch(wideNode.innerHTML, /Le Voyage/);
assert.equal(previousWide.isConnected, false);
console.log("PASS Continue Watching uses configured titles and repaints after a language/configuration change");

const escaped = a.hero.slideHtml({ ...a.movie("tmdb:7"), name: '<img src=x onerror="alert(1)">', background: "https://images.example/a';color:red;.jpg", logo: "javascript:alert(1)" }, 0);
assert.match(escaped, /&lt;img/);
assert.doesNotMatch(escaped, /<img src=x|javascript:/);
assert.equal(a.artworkUrl("data:text/html,bad"), null);
console.log("PASS addon title/artwork values remain escaped and limited to HTTP(S) artwork");

if (process.argv[2]) {
    const folder = resolve(process.argv[2]); mkdirSync(folder, { recursive: true });
    const css = readFileSync(join(root, "dxbi.theme.css"), "utf8");
    for (const [lang, html] of [["fr", frenchHtml], ["en", englishHtml]]) {
        const active = html.replace('class="dx-hero-slide"', 'class="dx-hero-slide is-active"');
        writeFileSync(join(folder, `${lang}.html`), `<!doctype html><meta charset="utf-8"><title>Metadata language preview</title><style>${css}\nbody{margin:0;background:#111}.dx-hero{margin:0;height:720px;animation:none}.dx-hero-backdrop{background-image:linear-gradient(115deg,#27304b,#344d41)!important}.dx-hero-content{transition:none!important}.dx-hero-title{font-family:Arial,sans-serif}</style><section class="dx-hero is-first">${active}</section>`);
    }
    console.log("Wrote French and English banner previews");
}
