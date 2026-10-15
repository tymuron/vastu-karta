# Васту Карта — Vastu map builder (Anna Romeo)

A free, standalone Vastu map constructor for apartments of any shape. Functionally it
replicates [nativastu.com](https://nativastu.com) step for step (state of 15 Oct 2026),
re-implemented in our own code and wording and dressed in Anna Romeo's design
(#422326 / #CABC90 / #F4F2ED, Cormorant + Vela Sans).

## The six steps

1. **Загрузить план** — drop or pick a JPG/PNG/WebP of the floor plan.
2. **Регион** — «в России» / «за рубежом». Russia limits address search to Russia and
   uses the satellite backdrop on step 5; abroad searches worldwide and uses the hybrid.
3. **Контур** — click the outer corners. Red points, a guide line to the cursor, a ring when
   you are near the first point; clicking it (or Enter, or the button) closes the contour.
   Отмена / Сброс, Cmd/Ctrl+Z. Closing finds the centre of gravity (shoelace centroid).
4. **Опорная линия** — address search with suggestions while typing, Схема / Спутник /
   Гибрид, zoom, «где я». «Задать линию» → two clicks along the façade → azimuth + address.
5. **Повернуть план** — the plan over the satellite map, draggable; a red dashed line at
   the façade azimuth. Rotation slider (shows the deviation from the cardinal directions),
   «Рассчитать точно» (lays the longest wall along the line, turning as little as possible;
   runs once automatically), transparency slider.
6. **Васту Карта** — the plan turned north-up with layers: 8 sectors (45°, N centred up),
   axes and labels, Brahmasthan 1/9 (square) or by the flat's shape, Brahmabindu at real
   size (1/81), inflow/outflow, five elements with area shares, deviation caption;
   saturation slider; PNG export (share sheet on phones, long-press fallback, download on
   desktop) at up to 3000 px. Sectors / flow / elements replace each other and one always
   stays on; the two Brahmasthan variants replace each other; elements hide Brahmasthan.

Everything runs in the browser — the plan never leaves the device.

## Improvements over nativastu (approved 15 Oct 2026)

- **Turn buttons** −90° / −1° / −0,1° / +0,1° / +1° / +90° under the rotation slider.
- **Drag corners to fix them** — while tracing, and again after closing (back on step 3,
  the closed contour shows small handles; the centre is recalculated).
- **Zoom while tracing** — mouse wheel / trackpad pinch, two-finger pinch on phones, and
  «+ / − / весь план» buttons; drag empty plan to pan when zoomed. Dots and lines keep
  their on-screen size.
- **Upload first on phones** — until a plan is loaded the empty stage is hidden, so the
  upload button is the first thing on screen.
- **Remember progress** — plan + every choice kept in the browser (IndexedDB) and restored
  on reload at the same step; «Начать заново с другим планом» on step 1 clears it.
- **PDF plans** — the first page is rendered as the plan (pdf.js, loaded only when a PDF
  is picked; legacy build for older iPhones).

Not taken (offered): tapping the window wall for automatic orientation.

## Stack

Vanilla TypeScript + Vite 5 + Leaflet (+ pdf.js, lazy). Canvas 2D for the plan and the map overlay.
Fonts are self-hosted in `public/fonts` (Google Fonts is unreliable in Russia).

```
src/main.ts     the six steps, navigation, zoom/drag, PNG export, saved progress
src/result.ts   draws the finished map (all layers)
src/mapkit.ts   maps and address search
src/geo.ts      centroid, area, azimuth, element shares
src/pdf.ts      first page of a PDF → plan picture
src/store.ts    progress kept in the browser (IndexedDB)
src/config.ts   Anna's links, signature handle, file name  ← edit here
```

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # → dist/ (static, deploy anywhere)
```

## Maps — keyless

nativastu uses Yandex Maps (Russia) and Google Maps (abroad) with its own API keys. We
use services that need no key or billing and work in Russia:

- Схема — OpenStreetMap tiles
- Спутник / Гибрид — Esri World Imagery (+ Esri place names and roads)
- Address search and reverse lookup — Esri World Geocoding (~0.3 s, house-level in Russia),
  with OSM Nominatim as a fallback on «Найти» only (its rules forbid search-as-you-type)

Photon (komoot) was tried and dropped: 10–19 s per query on 15 Oct 2026.

## Not copied on purpose

nativastu's Yandex.Metrika cookie banner, its server ping when a map is built, and its
copy-protection script are its own analytics/IP plumbing, not the builder. The privacy
policy here is our own and states the facts of this build (no cookies, no analytics).

## Deploy

Live at **https://annaromeo-vastu-karta.onrender.com** — Render static site
`annaromeo-vastu-karta`, auto-deploys from the public repo
[tymuron/vastu-karta](https://github.com/tymuron/vastu-karta) (`main`).

This folder (inside the private workspace repo) is the source of truth; the public repo
holds only this folder. To ship a change: commit in the workspace, then

```bash
git subtree push --prefix=scratch/vastu-map-builder vastu-karta main
```

(from the workspace root `~/antigravity-workspace`; the `vastu-karta` remote points at the public repo).
After a deploy, check that every file in `dist/` answers 200 on the live URL.
