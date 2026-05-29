# Lost Mountain Engraving

A dark, futuristic outdoor-adventure storefront for custom laser-engraved
stainless water bottles. The home page is an immersive, single-frame
customizer: a procedurally-built 3D bottle floats in a black void you can
drag-rotate and scroll-zoom, and any image you drop is vectorized into
two-tone laser art **live in the browser** and wrapped onto the bottle.

Implemented from a Claude Design handoff (`Lost Mountain.html`).

## Entry point

`index.html` — the home / customize page (GitHub Pages serves it
automatically).

## What's here

| Path | Purpose |
| --- | --- |
| `index.html` | Home page: hero, 3D bottle stage, live customizer, sections, footer |
| `css/lost.css` | Design system — dark void surfaces, icy-cyan accent, type scale, nav/buttons/glass |
| `js/scene.js` | Three.js scene: procedural bottle, studio environment for metal reflections, live engraving sleeve, orbit controls |
| `js/app.js` | In-browser vectorizer (image → 2-tone ink mask), customizer logic, finish/style/quantity/price, drag-and-drop |
| `js/image-slot.js` | `<image-slot>` web component — user-fillable image placeholder used by the Trip Studio teaser |
| `assets/` | Knockout logo + web-optimized mountain photography |

## How the customizer works

1. **Upload** — drop a PNG or photo onto the stage or the dropzone.
2. **Vectorize** — `app.js` reduces it to a clean two-tone ink mask; the
   threshold slider and invert toggle tune it live.
3. **Wrap** — `scene.js` paints the mask onto the bottle's engraving sleeve
   as either a dark *Laser Mark* or a frosted *Etched* finish.
4. **Own it** — pick a bottle finish, set quantity (with bulk pricing), and
   purchase.

## Dependencies

Three.js r128 (3D scene) and its `OrbitControls`, loaded from a CDN. Fonts
(Space Grotesk / Manrope / Space Mono) come from Google Fonts. Everything
else is dependency-free vanilla JS — no build step.

## Run locally

Serve the folder over HTTP (the `<image-slot>` component fetches a state
sidecar, which needs a real origin rather than `file://`):

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy on GitHub Pages

Settings → Pages → **Deploy from a branch** → `main` → `/ (root)`. The
included `.nojekyll` keeps Pages from reprocessing the static files.

## Notes

- The bottle is **procedurally generated** — it reads as a premium insulated
  bottle but isn't a scan of a specific product.
- The Trip Studio teaser uses `<image-slot>`, which is interactive inside the
  design editor and read-only (shows the supplied photo) when served as a
  plain static site.
- The sibling pages linked in the nav (Trip Studio, Process, About, Reviews)
  are part of the wider design but out of scope for this build.
