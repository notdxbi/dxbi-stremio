import { ipcRenderer } from "electron";
import { ICONS, IPC_CHANNELS, SELECTORS } from "../../constants";
import { getTitleBarTemplate } from "../../components/title-bar/titleBar";
import logger from "../../utils/logger";

let transparencyStatusCache: boolean | null = null;

export async function getTransparencyStatus(): Promise<boolean> {
    if (transparencyStatusCache === null) {
        transparencyStatusCache = await ipcRenderer.invoke(IPC_CHANNELS.GET_TRANSPARENCY_STATUS) as boolean;
    }
    return transparencyStatusCache ?? false;
}

// The empty parts of these bars move the window: Stremio's top bar, a title page's, the player's
const DRAG_AREAS = '#app [class*="horizontal-nav-bar"], #app [class*="player-container"] [class*="player-nav"]';
// …but never anything in them that does something when pressed
const INTERACTIVE = 'a, button, input, select, textarea, label, [tabindex]:not([tabindex="-1"]), [role="button"], [class*="button"], [class*="search-bar"], [class*="menu"], [class*="logo"]';

export function addTitleBar(): void {
    // Once, on the page itself, above everything
    if (!document.body || document.querySelector(SELECTORS.ROUTE_CONTAINER) === null) return;
    if (document.body.querySelector(":scope > .title-bar")) return;

    logger.info("Adding window controls...");
    document.body.insertAdjacentHTML("afterbegin", getTitleBarTemplate());

    const titleBar = document.body.querySelector(":scope > .title-bar") as HTMLElement;
    if (!titleBar) return;

    const setMaximized = (isMax: boolean) => {
        document.body.classList.toggle("is-maximized", isMax);
        titleBar.querySelector("#maximizeApp-btn svg path")?.setAttribute("d", isMax ? ICONS.RESTORE : ICONS.MAXIMIZE);
        const button = titleBar.querySelector("#maximizeApp-btn") as HTMLElement | null;
        if (button) button.title = isMax ? "Restore" : "Maximize";
    };

    ipcRenderer.invoke(IPC_CHANNELS.IS_MAXIMIZED).then(setMaximized);
    ipcRenderer.on(IPC_CHANNELS.WINDOW_MAXIMIZED, (_, isMax: boolean) => setMaximized(isMax));
    ipcRenderer.on(IPC_CHANNELS.FULLSCREEN_CHANGED, (_, isFullscreen: boolean) => {
        document.body.classList.toggle("is-fullscreen", isFullscreen);
    });

    titleBar.querySelector("#minimizeApp-btn")?.addEventListener("click", () => ipcRenderer.send(IPC_CHANNELS.MINIMIZE_WINDOW));
    titleBar.querySelector("#maximizeApp-btn")?.addEventListener("click", () => ipcRenderer.send(IPC_CHANNELS.MAXIMIZE_WINDOW));
    titleBar.querySelector("#closeApp-btn")?.addEventListener("click", () => ipcRenderer.send(IPC_CHANNELS.CLOSE_WINDOW));

    // Moving: press on an empty part of a top bar and drag. The main process does the arithmetic
    // (and brings a maximized window back to its normal size under the pointer, like Windows)
    const dragArea = (target: EventTarget | null): boolean => {
        const el = target as HTMLElement | null;
        if (!el || !el.closest || document.body.classList.contains("is-fullscreen")) return false;
        return !!el.closest(DRAG_AREAS) && !el.closest(INTERACTIVE);
    };

    document.addEventListener("pointerdown", (e: PointerEvent) => {
        if (e.button !== 0 || !dragArea(e.target)) return;
        e.preventDefault();
        const move = (ev: PointerEvent) => ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG, "move", ev.screenX, ev.screenY);
        const end = () => {
            document.removeEventListener("pointermove", move, true);
            document.removeEventListener("pointerup", end, true);
            window.removeEventListener("blur", end);
            ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG, "end", 0, 0);
        };
        ipcRenderer.send(IPC_CHANNELS.WINDOW_DRAG, "start", e.screenX, e.screenY);
        document.addEventListener("pointermove", move, true);
        document.addEventListener("pointerup", end, true);
        window.addEventListener("blur", end);
    }, true);

    // Double-click an empty part of a top bar: maximize or restore
    document.addEventListener("dblclick", (e: MouseEvent) => {
        if (!dragArea(e.target)) return;
        ipcRenderer.send(IPC_CHANNELS.MAXIMIZE_WINDOW);
    }, true);

    // Resizing from the edges and corners (a see-through window has no system edges to grab)
    titleBar.querySelectorAll<HTMLElement>(".dx-edge").forEach((handle) => {
        handle.addEventListener("pointerdown", (e: PointerEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            handle.setPointerCapture(e.pointerId);
            ipcRenderer.send(IPC_CHANNELS.WINDOW_RESIZE, "start", handle.dataset.edge, e.screenX, e.screenY);
            const move = (ev: PointerEvent) => ipcRenderer.send(IPC_CHANNELS.WINDOW_RESIZE, "move", handle.dataset.edge, ev.screenX, ev.screenY);
            const end = () => {
                handle.removeEventListener("pointermove", move);
                handle.removeEventListener("pointerup", end);
                handle.removeEventListener("lostpointercapture", end);
                ipcRenderer.send(IPC_CHANNELS.WINDOW_RESIZE, "end", handle.dataset.edge, 0, 0);
            };
            handle.addEventListener("pointermove", move);
            handle.addEventListener("pointerup", end);
            handle.addEventListener("lostpointercapture", end);
        });
    });

    // In the player, the buttons hide and show with the player's own controls
    let watched: Element | null = null;
    const idle = new MutationObserver(() => {
        document.body.classList.toggle("dx-player-idle", !!watched && /overlayHidden/.test(String((watched as HTMLElement).className)));
    });
    const followPlayer = () => {
        const player = document.querySelector('#app [class*="player-container"]');
        if (player === watched) return;
        idle.disconnect();
        watched = player;
        if (player) idle.observe(player, { attributes: true, attributeFilter: ["class"] });
        else document.body.classList.remove("dx-player-idle");
    };
    new MutationObserver(followPlayer).observe(document.getElementById("app") || document.body, { childList: true, subtree: true });
    followPlayer();
}
