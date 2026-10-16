# Васту Карта — Vastu map builder (Anna Romeo)

A free, standalone Vastu map constructor for apartments of any shape. Functionally it
replicates [nativastu.com](https://nativastu.com) step for step (state of 15 Oct 2026),
re-implemented in our own code and wording and dressed in Anna Romeo's design
(#422326 / #CABC90 / #F4F2ED, Cormorant + Vela Sans).

## The seven steps

nativastu has six; on 15 Oct 2026 Tymur asked for smaller steps because most people use
it on phones, so its map step is split in two («Ваш дом» + «Стена с окнами»).

1. **Загрузить план** — JPG/PNG/WebP, or a PDF (first page).
2. **Регион** — «в России» / «за рубежом». Russia limits address search to Russia and uses
   the satellite view on step 6; abroad searches worldwide and uses the hybrid view.
3. **Контур** — click/tap the outer corners; zoom (wheel, pinch, + / −), drag a corner to
   fix it. Closing finds the centre of gravity (shoelace centroid).
4. **Ваш дом** — the map opens where the visitor is (guessed from the phone's time zone,
   not always Moscow as on nativastu). Search with suggestions (house-number matches first),
   or tap the house; the gold pin can be dragged onto the exact building.
5. **Стена с окнами** — tap the two corners of the wall with the windows → its azimuth.
6. **Повернуть план** — the plan lies on a zoomable satellite map, pinned to the ground and
   sized so its longest wall matches the marked wall; the red line lies on the real wall.
   Drag the plan to move it, drag the map to pan. Turn with −90° / −1° / +1° / +90°
   (holding ±1° keeps turning) or the slider; «Точная настройка»: ±0,1°, «Рассчитать
   точно», plan size, transparency.
7. **Васту Карта** — nativastu's layers: 8 sectors, axes and labels, Brahmasthan 1/9 or by
   shape, Brahmabindu 1/81, inflow/outflow, five elements with shares, deviation caption,
   saturation, PNG export (share sheet on phones). Same switching rules as the original.

On phones, steps 3–6 fit one screen: the plan or map on top, the instruction written on it,
only that step's buttons below. «Далее» without what the step needs says why on the map.
Taps never zoom the page (`touch-action: manipulation`).

Everything runs in the browser — the plan never leaves the device.

## Improvements over nativastu (all approved by Tymur, 15 Oct 2026)

Turn buttons, draggable corners, zoom while tracing, upload-first on phones, saved progress
(IndexedDB, «Начать заново» clears it), PDF plans; then, after testing on a phone: 7 smaller
steps, map opening near the visitor, pin the house by hand, zoomable step-6 map with plan size
and a geo-pinned red line, on-map guidance, hold-to-repeat turns, no double-tap zoom.

Not taken (offered): tapping the window wall for automatic orientation.

## Stack

Vanilla TypeScript + Vite 5 + Leaflet (+ pdf.js, lazy). Canvas 2D for the plan and the map overlay.
Fonts are self-hosted in `public/fonts` (Google Fonts is unreliable in Russia).

```
src/main.ts     the six steps, navigation, zoom/drag, PNG export, saved progress
src/result.ts   draws the finished map (all layers)
src/mapkit.ts   maps, address search, where the map opens
src/planlayer.ts the plan on the step-6 map (pinned to the ground)
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

## English copy

An English version lives in `../vastu-map-builder-en` (16 Oct 2026, Anna's request), live at
https://annaromeo-vastu-map.onrender.com from the `en` branch of the same public repo. It is a
**separate copy** (Tymur's call), without the region step — six steps, worldwide search. Any
fix made here has to be ported there by hand; its README maps the step numbers.

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
