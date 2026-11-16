/**
 * dx.bi in Stremio's redesigned Settings (Nov 2026).
 *
 * Stremio's new Settings page is one category at a time, picked from a left menu grouped as
 * Preferences / This browser / Help, with each page made of rounded cards of rows. The old dx.bi
 * section (a long scrolling block appended under Stremio's categories) has nowhere to go any more,
 * so dx.bi gets its own menu group instead:
 *
 *   DX.BI   Customise · Themes · Plugins · App
 *
 * Each item opens #/settings/dxbi-<page>. Stremio doesn't know those pages (it quietly draws
 * Interface underneath, which we hide), so the address, the Back button and the menu all behave like
 * Stremio's own pages. Class names are read from Stremio's live page at runtime, so dx.bi's pages
 * look native and keep matching when Stremio rebuilds its CSS.
 *
 * The Themes / Plugins / App pages are the same #enhanced > category elements the old layout used
 * (#enhanced > div:nth-child(2..4)), so every existing control and its wiring is unchanged.
 */
import { settingsAPI } from "../../api/settings";
import PluginOption from "../../../interfaces/PluginSettingSchema";
import { getThemeIcon, getPluginIcon, getAboutIcon } from "../../../utils/icons";
import { getLogger } from "../../../utils/logger";

const logger = getLogger("NewSettings");

export const PAGES = [
    { id: "customise", label: "Customise", scope: "dx.bi on this computer" },
    { id: "themes", label: "Themes", scope: "Looks you can apply" },
    { id: "plugins", label: "Plugins", scope: "Add-on features" },
    { id: "about", label: "App", scope: "Updates, window and playback" },
] as const;
type PageId = typeof PAGES[number]["id"];

const CUSTOMISE_ICON = `<svg viewBox="0 0 24 24" class="icon"><path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z" style="fill: currentcolor"></path></svg>`;
const ICONS: Record<PageId, () => string> = { customise: () => CUSTOMISE_ICON, themes: getThemeIcon, plugins: getPluginIcon, about: getAboutIcon };

const SETTINGS = '#app [class*="settings-content"]';

/** Is Stremio showing the redesigned Settings page? */
export function isNewLayout(): boolean {
    return !!document.querySelector(`${SETTINGS} [class*="pane-"]`) && !!document.querySelector(`${SETTINGS} nav[class*="menu-"] [class*="group-"]`);
}

export function currentPage(): PageId | null {
    const m = location.hash.match(/^#\/settings\/dxbi-([a-z]+)/);
    return m && PAGES.some(p => p.id === m[1]) ? (m[1] as PageId) : null;
}

// ---- Stremio's class names, read from its live page (with dx.bi fallbacks for anything missing)
type Classes = Record<string, string>;
function readClasses(): Classes {
    const root = document.querySelector(SETTINGS);
    const cls = (sel: string): string => {
        const el = root?.querySelector(sel);
        if (!el) return "";
        return typeof el.className === "string" ? el.className : (el as SVGElement).className.baseVal;
    };
    // Stremio's own "selected" class on a menu item, e.g. selected-S7SeK
    const selItem = root?.querySelector('nav [class*="item-"][class*="selected"]');
    const selected = selItem ? [...selItem.classList].find(c => c.startsWith("selected")) || "" : "";
    return {
        group: cls('nav [class*="group-"]'), groupLabel: cls('nav [class*="group-"] > [class*="label-"]'),
        item: cls('nav [class*="group-"] > a[class*="item-"]:not([class*="selected"])') || cls('nav [class*="group-"] > a[class*="item-"]').replace(/\bselected\S*/g, ""),
        itemIcon: cls('nav [class*="group-"] > a svg'), itemLabel: cls('nav [class*="group-"] > a [class*="item-label"]'), selected,
        page: cls('[class*="pane-"] [class*="page-"]:not([class*="page-container"])'), head: cls('[class*="pane-"] [class*="head-"]'),
        title: cls('[class*="pane-"] [class*="head-"] h1'), scope: cls('[class*="pane-"] [class*="head-"] p'),
        section: cls('[class*="pane-"] section[class*="group-"]'), heading: cls('[class*="pane-"] section > [class*="heading-"]'),
        h2: cls('[class*="pane-"] section h2'), card: cls('[class*="pane-"] section > [class*="card-"]'),
        row: cls('[class*="pane-"] [class*="card-"] > [class*="row-"]:not([class*="off-"]):not([class*="stack-"])'),
        rowHeading: cls('[class*="pane-"] [class*="row-"] > [class*="heading-"]'), rowText: cls('[class*="pane-"] [class*="row-"] [class*="text-"]'),
        rowLabel: cls('[class*="pane-"] [class*="row-"] [class*="text-"] > [class*="label-"]'), control: cls('[class*="pane-"] [class*="row-"] > [class*="control-"]:not([class*="wide"])'),
        toggle: cls('[class*="pane-"] [class*="toggle-container"]').replace(/\bchecked\b/g, ""), toggleKnob: cls('[class*="pane-"] [class*="toggle-container"] > div'),
        search: cls('nav label[class*="search"]'), searchInput: cls('nav label[class*="search"] input'),
    };
}

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));

// ---- the dx.bi menu group
function ensureNav(c: Classes): void {
    const nav = document.querySelector(`${SETTINGS} nav[class*="menu-"]`);
    if (!nav || nav.querySelector(".dxn-group")) return;
    const groups = nav.querySelectorAll(':scope > [class*="group-"]');
    const group = document.createElement("div");
    group.className = `${c.group} dxn-group`;
    group.innerHTML = `<div class="${c.groupLabel} dxn-group-label">dx.bi</div>` + PAGES.map(p => {
        const icon = ICONS[p.id]().replace('class="icon"', `class="${c.itemIcon} dxn-icon"`);
        return `<a class="${c.item} dxn-item" data-dxn="${p.id}" href="#/settings/dxbi-${p.id}" tabindex="0">${icon}<div class="${c.itemLabel}">${p.label}</div></a>`;
    }).join("");
    // between "This browser" and "Help", or last
    const help = groups[groups.length - 1];
    if (groups.length >= 2 && help) nav.insertBefore(group, help); else nav.appendChild(group);
}

// ---- the page container that holds the four dx.bi pages
let enhanced: HTMLElement | null = null;

/**
 * The #enhanced element: [0] label (hidden), [1] Themes, [2] Plugins, [3] App/About, [4] Customise.
 * The first four keep the order the existing code addresses with #enhanced > div:nth-child(n).
 */
function createEnhanced(c: Classes): HTMLElement {
    const el = document.createElement("div");
    el.id = "enhanced";
    el.className = "dxn-pages";
    const pageHtml = (id: PageId) => {
        const p = PAGES.find(x => x.id === id)!;
        return `<div class="${c.page} dxn-page" data-page="${id}"><div class="${c.head} dxn-head heading"><h1 class="${c.title} dxn-title">${p.label}</h1><p class="${c.scope} dxn-scope">${p.scope}</p></div></div>`;
    };
    el.innerHTML = `<div class="dxn-label" hidden>dx.bi</div>${pageHtml("themes")}${pageHtml("plugins")}${pageHtml("about")}${pageHtml("customise")}`;
    return el;
}

let classes: Classes | null = null;
let built = false;

/**
 * Make sure the dx.bi menu group and pages are in place and the right one is showing.
 * `fill` populates Themes / Plugins / App the first time (the existing builders).
 */
export function ensure(fill: () => void): void {
    const content = document.querySelector<HTMLElement>(SETTINGS);
    const pane = content?.querySelector<HTMLElement>('[class*="pane-"]');
    if (!content || !pane) return;
    // read Stremio's classes while one of its own pages is on screen
    if (!classes || !classes.row) classes = readClasses();
    ensureStyle();
    ensureNav(classes);
    if (!enhanced) {
        enhanced = createEnhanced(classes);
        built = false;
    }
    if (enhanced.parentElement !== pane) pane.appendChild(enhanced);
    if (!built) {
        built = true;
        try { fill(); } catch (err) { logger.error("Failed to fill dx.bi settings: " + err); }
        buildCustomise(enhanced.querySelector('[data-page="customise"]') as HTMLElement, classes).catch(err => logger.error("Customise page: " + err));
    }
    show(content);
}

/** Leaving Settings: the next visit rebuilds with fresh values. */
export function leave(): void {
    enhanced = null;
    built = false;
    classes = null;
}

function show(content: HTMLElement): void {
    const page = currentPage();
    if (page) content.dataset.dxnPage = page; else delete content.dataset.dxnPage;
    enhanced?.querySelectorAll<HTMLElement>(".dxn-page").forEach(p => p.classList.toggle("is-on", p.dataset.page === page));
    const sel = classes?.selected || "";
    // Stremio still marks Interface (its fallback page) as selected: on dx.bi's pages, only ours is
    if (page && sel) content.querySelectorAll<HTMLElement>(`nav a.${sel}:not(.dxn-item)`).forEach(a => a.classList.remove(sel));
    content.querySelectorAll<HTMLElement>(".dxn-item").forEach(a => {
        const on = a.dataset.dxn === page;
        if (sel) a.classList.toggle(sel, on);
        a.classList.toggle("is-on", on);
        a.setAttribute("aria-current", on ? "page" : "false");
    });
    if (page) {
        // Stremio scrolls its own pane; start ours at the top
        const scroller = content.querySelector<HTMLElement>('[class*="pane-"]');
        if (scroller && scroller.dataset.dxnShown !== page) { scroller.scrollTop = 0; scroller.dataset.dxnShown = page; }
    }
}

// ---- Customise: the dx.bi plugin's own options, grouped, with a search, saved as you change them
async function buildCustomise(page: HTMLElement, c: Classes): Promise<void> {
    const base = "dxbi";
    const schema: PluginOption[] | null = await settingsAPI.getRegisteredSettings(base);
    if (!schema || !schema.length) {
        page.insertAdjacentHTML("beforeend", `<p class="dxn-empty">Turn the dx.bi plugin on under <a href="#/settings/dxbi-plugins">Plugins</a> to customise it here.</p>`);
        return;
    }
    const values: Record<string, any> = {};
    await Promise.all(schema.map(async s => {
        const v = await settingsAPI.getSetting(base, s.key);
        values[s.key] = v === undefined || v === null ? s.defaultValue : v;
    }));

    const groups = new Map<string, PluginOption[]>();
    for (const s of schema) {
        const g = s.group || "More";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(s);
    }
    const control = (s: PluginOption) => {
        const v = values[s.key];
        if (s.type === "toggle") {
            const on = v === true || v === "true";
            return `<div class="${c.control} dxn-control"><div class="${c.toggle} dxn-toggle${on ? " checked" : ""}" role="switch" aria-checked="${on}" tabindex="0" data-key="${esc(s.key)}" aria-label="${esc(s.label)}"><div class="${c.toggleKnob}"></div></div></div>`;
        }
        if (s.type === "select") {
            const opts = (s.options || []).map(o => `<option value="${esc(o.value)}"${String(o.value) === String(v) ? " selected" : ""}>${esc(o.label)}</option>`).join("");
            return `<div class="${c.control} dxn-control is-wide"><span class="dxn-select-wrap"><select class="dxn-select" data-key="${esc(s.key)}" aria-label="${esc(s.label)}">${opts}</select></span></div>`;
        }
        const secret = /key$/i.test(s.key);
        return `<div class="${c.control} dxn-control is-wide"><input class="dxn-input" data-key="${esc(s.key)}" type="${secret ? "password" : "text"}" value="${esc(v ?? "")}" placeholder="${esc(s.label)}" autocomplete="off" spellcheck="false" aria-label="${esc(s.label)}"></div>`;
    };
    let html = `<label class="dxn-search"><svg viewBox="0 0 24 24"><path d="M10 2a8 8 0 0 1 6.32 12.9l5.39 5.39-1.42 1.42-5.39-5.39A8 8 0 1 1 10 2zm0 2a6 6 0 1 0 0 12 6 6 0 0 0 0-12z" style="fill: currentcolor"/></svg><input type="search" placeholder="Search dx.bi settings" aria-label="Search dx.bi settings" autocomplete="off" spellcheck="false"></label>`;
    for (const [group, opts] of groups) {
        html += `<section class="${c.section} dxn-section"><div class="${c.heading}"><h2 class="${c.h2}">${esc(group)}</h2></div><div class="${c.card} dxn-card">`;
        for (const s of opts) {
            const words = [s.label, s.description, group, ...(s.options || []).map(o => o.label)].join(" ").toLowerCase();
            html += `<div class="${c.row} dxn-row" data-search="${esc(words)}"><div class="${c.rowHeading} dxn-row-heading"><div class="${c.rowText}"><div class="${c.rowLabel} dxn-label-text">${esc(s.label)}</div>${s.description ? `<div class="dxn-desc">${esc(s.description)}</div>` : ""}</div></div>${control(s)}</div>`;
        }
        html += `</div></section>`;
    }
    html += `<p class="dxn-none">No dx.bi settings match your search.</p>`;
    page.insertAdjacentHTML("beforeend", html);

    const save = (key: string, value: any) => {
        settingsAPI.saveSetting(base, key, value).catch((err: unknown) => logger.error(`Saving ${key}: ${err}`));
    };
    page.addEventListener("click", e => {
        const t = (e.target as HTMLElement).closest<HTMLElement>(".dxn-toggle");
        if (!t) return;
        const on = !t.classList.contains("checked");
        t.classList.toggle("checked", on);
        t.setAttribute("aria-checked", String(on));
        save(t.dataset.key!, on);
    });
    page.addEventListener("keydown", e => {
        const t = (e.target as HTMLElement).closest<HTMLElement>(".dxn-toggle");
        if (t && (e.key === " " || e.key === "Enter")) { e.preventDefault(); t.click(); }
    });
    page.addEventListener("change", e => {
        const el = e.target as HTMLInputElement | HTMLSelectElement;
        if (el.matches(".dxn-select, .dxn-input")) save(el.dataset.key!, el.classList.contains("dxn-input") ? el.value.trim() : el.value);
    });
    const search = page.querySelector<HTMLInputElement>(".dxn-search input")!;
    search.addEventListener("input", () => {
        const words = search.value.toLowerCase().split(/\s+/).filter(Boolean);
        let shown = 0;
        page.querySelectorAll<HTMLElement>(".dxn-row").forEach(r => {
            const hit = words.every(w => (r.dataset.search || "").includes(w));
            r.classList.toggle("is-hidden", !hit);
            if (hit) shown++;
        });
        page.querySelectorAll<HTMLElement>(".dxn-section").forEach(s => s.classList.toggle("is-hidden", !s.querySelector(".dxn-row:not(.is-hidden)")));
        page.classList.toggle("is-nothing", shown === 0);
    });
    search.addEventListener("keydown", e => {
        if (e.key === "Escape" && search.value) { e.stopPropagation(); search.value = ""; search.dispatchEvent(new Event("input")); }
    });
}

// ---- styles: dx.bi's pages in Stremio's new look. The old controls (option rows, buttons, plugin and
// theme cards, notes) keep their ids and handlers and are restyled here.
function ensureStyle(): void {
    if (document.getElementById("dxn-style")) return;
    const st = document.createElement("style");
    st.id = "dxn-style";
    st.textContent = `
    /* our pages replace Stremio's fallback page */
    [class*="settings-content"][data-dxn-page] [class*="pane-"] > :not(#enhanced) { display: none !important; }
    [class*="settings-content"]:not([data-dxn-page]) #enhanced { display: none !important; }
    #enhanced .dxn-page { display: none; max-width: 46rem; padding-bottom: 4rem; }
    #enhanced .dxn-page.is-on { display: block; }
    #enhanced .dxn-head { margin-bottom: 1.4rem; }
    #enhanced .dxn-title { margin: 0; font-size: 1.8rem; font-weight: 500; }
    #enhanced .dxn-scope { margin: .25rem 0 0; opacity: .6; font-size: .95rem; }

    /* menu: Stremio marks Interface as selected on our pages; only ours should look selected */
    [class*="settings-content"][data-dxn-page] nav a[class*="item-"][class*="selected"]:not(.dxn-item) { background: transparent !important; font-weight: 500 !important; }
    .dxn-item.is-on { background: rgba(255,255,255,.05); font-weight: 600; }
    .dxn-icon { flex: none; }

    /* Customise page */
    #enhanced .dxn-search { display: flex; align-items: center; gap: .6rem; height: 2.75rem; padding: 0 1.1rem; margin: 0 0 1.4rem; border-radius: 2.7rem; background: rgba(255,255,255,.05); }
    #enhanced .dxn-search svg { width: 1.1rem; height: 1.1rem; opacity: .6; flex: none; }
    #enhanced .dxn-search input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: inherit; font: inherit; }
    #enhanced .dxn-section { margin-bottom: 1.6rem; }
    #enhanced .dxn-section > div:first-child h2 { margin: 0 0 .7rem; font-size: .92rem; font-weight: 600; }
    #enhanced .dxn-card { border-radius: 1.1rem; background: rgba(255,255,255,.05); overflow: hidden; }
    #enhanced .dxn-row { display: flex; align-items: center; justify-content: space-between; gap: 1.3rem; padding: .75rem 1.1rem; min-height: 3.2rem; box-sizing: border-box; }
    #enhanced .dxn-row + .dxn-row { border-top: 1px solid rgba(255,255,255,.06); }
    #enhanced .dxn-row-heading { flex: 1; min-width: 0; }
    #enhanced .dxn-label-text { white-space: normal; line-height: 1.35; }
    #enhanced .dxn-desc { margin-top: .2rem; font-size: .82rem; font-weight: 400 !important; line-height: 1.45; opacity: .58; }
    #enhanced .dxn-label-text { font-weight: 500; }
    #enhanced .dxn-control { flex: none; display: flex; justify-content: flex-end; }
    #enhanced .dxn-control.is-wide { width: min(16rem, 45%); }
    #enhanced .dxn-select-wrap { position: relative; display: block; width: 100%; }
    #enhanced .dxn-select-wrap::after { content: ""; position: absolute; right: 1rem; top: 50%; width: .45rem; height: .45rem; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: translateY(-70%) rotate(45deg); opacity: .7; pointer-events: none; }
    #enhanced .dxn-select, #enhanced .dxn-input { width: 100%; height: 2.6rem; padding: 0 2.4rem 0 1.1rem; box-sizing: border-box; border: 0; border-radius: 2.7rem; background: rgba(255,255,255,.05); color: inherit; font: inherit; outline: none; appearance: none; cursor: pointer; text-overflow: ellipsis; }
    #enhanced .dxn-input { padding-right: 1.1rem; cursor: text; }
    #enhanced .dxn-select:hover, #enhanced .dxn-input:hover { background: rgba(255,255,255,.08); }
    #enhanced .dxn-select:focus-visible, #enhanced .dxn-input:focus { background: rgba(255,255,255,.1); }
    #enhanced .dxn-select option { background: #1b1b22; color: #fff; }
    #enhanced .dxn-row.is-hidden, #enhanced .dxn-section.is-hidden { display: none; }
    #enhanced .dxn-none, #enhanced .dxn-empty { display: none; padding: 2rem 0; text-align: center; opacity: .6; }
    #enhanced .dxn-empty { display: block; }
    #enhanced .dxn-page.is-nothing .dxn-none { display: block; }
    #enhanced .dxn-toggle { cursor: pointer; }

    /* Themes / Plugins / App: the existing controls, in cards */
    #enhanced .dxn-page [class*="option-"] { display: flex; align-items: center; justify-content: space-between; gap: 1.3rem; padding: .75rem 1.1rem; min-height: 3.2rem; box-sizing: border-box; margin: 0; background: rgba(255,255,255,.05); border-radius: 1.1rem; }
    #enhanced .dxn-page [class*="option-"] + [class*="option-"] { margin-top: 2px; }
    #enhanced .dxn-page [class*="option-"] [class*="heading-"] { flex: 1; min-width: 0; }
    #enhanced .dxn-page [class*="option-"] [class*="content-"] { flex: none; display: flex; justify-content: flex-end; min-width: 0; max-width: 60%; }
    #enhanced .dxn-page [class*="option-"] select, #enhanced .dxn-page [class*="option-"] input[type="text"] { min-width: 14rem; }
    #enhanced .dxn-page h5 { margin: 1.6rem 0 .7rem !important; font-size: .92rem !important; font-weight: 600 !important; letter-spacing: 0 !important; text-transform: none !important; color: inherit !important; opacity: 1; }
    #enhanced .dxn-page .dxbi-note { margin: .6rem .3rem 0; font-size: .82rem; line-height: 1.5; opacity: .58; }
    #enhanced .dxn-page .button, #enhanced .dxn-page [class*="button-DNmYL"] { display: inline-flex; align-items: center; justify-content: center; gap: .4rem; height: 2.6rem; padding: 0 1.3rem; border-radius: 2.7rem; background: rgba(255,255,255,.08); color: inherit; font-weight: 600; cursor: pointer; white-space: nowrap; }
    #enhanced .dxn-page .button:hover, #enhanced .dxn-page [class*="button-DNmYL"]:hover { background: rgba(255,255,255,.14); }
    #enhanced .dxn-page .dxbi-about { margin: 0 0 1rem !important; }
    /* plugin & theme cards */
    #enhanced .dxn-page [class*="addon-container"] { display: flex; align-items: center; gap: 1.2rem; padding: 1rem 1.1rem; margin: 0 0 .6rem !important; border-radius: 1.1rem; background: rgba(255,255,255,.05); cursor: default; }
    #enhanced .dxn-page [class*="info-container"] { flex: 1; min-width: 0; }
    #enhanced .dxn-page [class*="name-container"] { display: inline; font-size: 1.05rem; font-weight: 600; }
    #enhanced .dxn-page [class*="version-container"] { display: inline; margin-left: .5rem; opacity: .55; font-size: .85rem; }
    #enhanced .dxn-page [class*="description-container"] { margin-top: .35rem; font-size: .85rem; line-height: 1.5; opacity: .7; }
    #enhanced .dxn-page [class*="action-buttons-container"] { display: flex; align-items: center; gap: .6rem; }
    #enhanced .dxn-page [class*="action-buttons-container"] > [id$="-settings"] { width: 2.6rem; height: 2.6rem; border-radius: 50%; align-items: center; justify-content: center; background: rgba(255,255,255,.08); cursor: pointer; }
    #enhanced .dxn-page [class*="action-buttons-container"] > [id$="-settings"] svg { width: 1.3rem; height: 1.3rem; }
    #enhanced .dxn-page [class*="action-buttons-container"] > [class*="button-container"]:not([class*="toggle"]):not([id$="-settings"]) { display: inline-flex; align-items: center; justify-content: center; height: 2.6rem; padding: 0 1.3rem; border-radius: 2.7rem; cursor: pointer; font-weight: 600; }
    #enhanced .dxn-page [class*="install-button-container"], #enhanced .dxn-page [class*="uninstall-button-container"] { background: rgba(255,255,255,.1); }
    #enhanced .dxn-page [class*="install-button-container"]:not([class*="uninstall"]) { background: var(--primary-accent-color, #7b5bf5); }
    #enhanced .dxn-page [class*="install-button-container"][style*="f5bf42"] { color: #111; }
    #enhanced .dxn-page .disabled { opacity: .55; pointer-events: none; }
    @media (max-width: 760px) {
      #enhanced .dxn-row, #enhanced .dxn-page [class*="option-"] { flex-wrap: wrap; }
      #enhanced .dxn-control.is-wide, #enhanced .dxn-page [class*="option-"] [class*="content-"] { width: 100%; max-width: none; }
    }`;
    document.head.appendChild(st);
}
