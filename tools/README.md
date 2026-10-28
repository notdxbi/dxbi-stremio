# Tools

## Built-in theme

The plugin carries a copy of `dxbi.theme.css` (so the plugin alone gives the whole look). After
changing the theme, copy it in before releasing:

```bash
node tools/bundle-theme.mjs
```

## Intro

The intro is rendered from code, so you can change it and re-render.

| File | What it does |
|---|---|
| `render_intro.py` | Renders the picture (1920×1080, 60 fps) as a PNG sequence: the logo landing letter by letter, the push-in, and the 3D tunnel of light ribbons with motion blur, bloom and a saturation-preserving tone map. |
| `intro_audio.py` | Renders the matching stereo score (letter ticks, "ta-dum", chord, dive whoosh, room reverb), synced to the same timeline. |

Requirements: Python 3 with `numpy` and `Pillow`, `ffmpeg` with `libsvtav1` and `libopus`, and the
[Bebas Neue](https://github.com/google/fonts/tree/main/ofl/bebasneue) font in `tools/fonts/BebasNeue-Regular.ttf`.

```bash
cd tools
mkdir -p fonts && curl -L -o fonts/BebasNeue-Regular.ttf https://github.com/google/fonts/raw/main/ofl/bebasneue/BebasNeue-Regular.ttf

python3 render_intro.py frames            # ~2–3 min on 16 cores
python3 intro_audio.py score.wav
ffmpeg -framerate 60 -i frames/f%04d.png -i score.wav \
  -c:v libsvtav1 -preset 4 -crf 34 -pix_fmt yuv420p10le -g 300 \
  -c:a libopus -b:a 96k -ac 2 -shortest intro.webm

base64 -w0 intro.webm   # paste into introVideoData() at the bottom of dxbi.plugin.js

# dx.bi TV plays an H.264 copy natively (every TV decodes it in hardware)
ffmpeg -i intro.webm -vf format=yuv420p -c:v libx264 -profile:v high -level 4.2 -preset veryslow \
  -crf 20 -x264-params keyint=300 -c:a aac -b:a 128k -movflags +faststart \
  ../tv/app/src/main/res/raw/intro.mp4
```

Change `TEXT` and `ACCENT` at the top of `render_intro.py` to use your own wordmark and colour.
Preview a few frames quickly with `--w 960 --h 540 --frames 60,120,180`.
