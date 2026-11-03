import Helpers from '../../utils/Helpers';
import { type ExternalPlayerStatus } from '../../interfaces/ExternalPlayerTypes';

// While a stream plays in mpv or VLC: a card at the top with the title, a progress bar and where it's
// at, so it's clear dx.bi is keeping the place. ✕ shrinks it to a small pill in the corner.

interface Shown {
    name: string;
    poster: string | null;
    episode: string | null;
}

const STYLE_ID = 'dxbi-ext-progress-style';
const CARD_ID = 'dxbi-ext-progress';
const PILL_ID = 'dxbi-ext-progress-pill';

const CSS = `
#${CARD_ID} {
    position: fixed; top: 24px; left: 50%; transform: translateX(-50%); z-index: 100000;
    width: min(520px, calc(100vw - 32px)); box-sizing: border-box; overflow: hidden;
    padding: 28px 24px 22px; border-radius: 16px; text-align: center; color: #fff;
    background: rgba(18, 18, 18, 0.97); border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55); font-family: inherit;
    animation: dxbi-ext-in 0.2s ease-out;
}
@keyframes dxbi-ext-in { from { opacity: 0; transform: translate(-50%, -8px); } to { opacity: 1; transform: translateX(-50%); } }
#${CARD_ID} .bar { position: absolute; left: 0; top: 0; height: 4px; width: 100%; background: rgba(255, 255, 255, 0.1); }
#${CARD_ID} .bar > div { height: 100%; width: 0; background: var(--dx-accent, #e50914); transition: width 0.9s linear; }
#${CARD_ID} .close {
    position: absolute; top: 14px; right: 14px; width: 30px; height: 30px; border: 0; border-radius: 50%;
    background: transparent; color: rgba(255, 255, 255, 0.7); font-size: 18px; line-height: 30px; cursor: pointer;
}
#${CARD_ID} .close:hover { background: rgba(255, 255, 255, 0.1); color: #fff; }
#${CARD_ID} .poster { width: 64px; height: 64px; margin: 0 auto 12px; border-radius: 50%; background: #222 center / cover no-repeat; }
#${CARD_ID} .name { font-size: 17px; font-weight: 500; color: rgba(255, 255, 255, 0.88); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#${CARD_ID} .episode { margin-top: 2px; font-size: 24px; font-weight: 700; }
#${CARD_ID} .time { margin-top: 6px; font-size: 14px; color: rgba(255, 255, 255, 0.6); font-variant-numeric: tabular-nums; }
#${CARD_ID} .note { margin-top: 10px; font-size: 14px; color: rgba(255, 255, 255, 0.5); }
#${CARD_ID} .note.watched { color: #46d369; }
#${PILL_ID} {
    position: fixed; right: 20px; bottom: 20px; z-index: 100000; padding: 9px 14px; border: 0; border-radius: 999px;
    background: rgba(18, 18, 18, 0.97); color: #fff; font: inherit; font-size: 13px; cursor: pointer;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5); font-variant-numeric: tabular-nums;
}
#${PILL_ID} b { color: var(--dx-accent, #e50914); }
`;

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

function clock(seconds: number): string {
    const s = Math.max(0, Math.floor(seconds));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    const mm = h ? String(m).padStart(2, '0') : String(m);
    return `${h ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

let minimised = false;

function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
}

export const externalPlayerProgress = {
    show(item: Shown): void {
        externalPlayerProgress.hide();
        ensureStyle();
        minimised = false;
        const card = document.createElement('div');
        card.id = CARD_ID;
        card.innerHTML = `
            <div class="bar"><div></div></div>
            <button class="close" title="Hide (your progress is still saved)">✕</button>
            ${item.poster ? `<div class="poster"></div>` : ''}
            <div class="name">${escape(item.name)}</div>
            ${item.episode ? `<div class="episode">${escape(item.episode)}</div>` : ''}
            <div class="time">Starting…</div>
            <div class="note">Your progress is saved as you watch</div>`;
        const poster = card.querySelector('.poster') as HTMLElement | null;
        if (poster && item.poster) poster.style.backgroundImage = `url("${encodeURI(item.poster)}")`;
        card.querySelector('.close')?.addEventListener('click', () => {
            minimised = true;
            card.style.display = 'none';
            document.getElementById(PILL_ID)!.style.display = '';
        });

        const pill = document.createElement('button');
        pill.id = PILL_ID;
        pill.title = 'Show progress';
        pill.style.display = 'none';
        pill.innerHTML = `<b>●</b> <span>Watching</span>`;
        pill.addEventListener('click', () => {
            minimised = false;
            pill.style.display = 'none';
            card.style.display = '';
        });

        document.body.append(card, pill);
    },

    update(status: ExternalPlayerStatus | null, watched: boolean): void {
        const card = document.getElementById(CARD_ID);
        if (!card || !status) return;
        const pct = status.duration > 0 ? Math.min(100, (status.position / status.duration) * 100) : 0;
        (card.querySelector('.bar > div') as HTMLElement).style.width = `${pct}%`;
        const time = `${clock(status.position)}${status.duration > 0 ? ` / ${clock(status.duration)}` : ''}`;
        card.querySelector('.time')!.textContent = status.state === 'paused' ? `${time} · Paused` : time;
        const note = card.querySelector('.note')!;
        note.textContent = watched ? 'Marked as watched' : 'Your progress is saved as you watch';
        note.classList.toggle('watched', watched);
        const pill = document.getElementById(PILL_ID);
        const label = pill?.querySelector('span');
        if (label) label.textContent = `${watched ? 'Watched' : 'Watching'}${status.duration > 0 ? ` · ${Math.floor(pct)}%` : ''}`;
        if (pill && minimised) pill.style.display = '';
    },

    hide(): void {
        document.getElementById(CARD_ID)?.remove();
        document.getElementById(PILL_ID)?.remove();
    },

    // The player closed
    saved(item: Shown, position: number, watched: boolean): void {
        // the toast takes HTML
        const what = escape(item.episode ? `${item.name} ${item.episode}` : item.name);
        const message = watched ? `${what} is marked as watched.` : `${what}: saved at ${clock(position)}.`;
        Helpers.createToast('extPlayerSaved', 'Progress saved', message, 'success', 4000);
    },
};
