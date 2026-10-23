# Vastu Map — English Vastu map builder (Anna Romeo)

The English copy of the Russian builder in `../vastu-map-builder` («Васту Карта»), made on
16 Oct 2026 at Anna's request. Same builder, same design (#422326 / #CABC90 / #F4F2ED,
Cormorant + Vela Sans), same features — with one difference Tymur chose: **no region step**,
so it has six steps instead of seven and searches addresses worldwide.

**It is a separate copy, not a shared codebase** (Tymur's call, 16 Oct 2026). A fix made in
one builder must be made in the other by hand. The Russian folder is the original; port
changes from it step for step, minding the numbering below.

## The six steps

| EN | RU | |
|---|---|---|
| 1 Upload plan | 1 Загрузить план | JPG/PNG/WebP, or a PDF (first page) |
| — | 2 Регион | dropped: English visitors search the whole world |
| 2 Outline | 3 Контур | tap the outer corners; zoom, drag corners, close |
| 3 Your building | 4 Ваш дом | address search (house-number matches first) or tap the building; drag the pin |
| 4 Window wall | 5 Стена с окнами | tap the two corners of the wall with the windows → bearing |
| 5 Rotate plan | 6 Повернуть план | plan on a zoomable **hybrid** satellite map (the RU «за рубежом» view) |
| 6 Vastu Map | 7 Васту Карта | all layers, PNG export |

So in `src/main.ts` every step number is one lower than in the Russian `main.ts` from the
outline on, and `style.css` hides the sidebar on phones for `data-step="3"` (RU: `"4"`).

## What differs from the Russian copy

- All copy in English (British spelling): `index.html`, `src/main.ts` (guide strip, warnings,
  hints), `src/result.ts` (N NE E SE S SW W NW, Space/Air/Water/Fire/Earth, «Deviation»),
  `src/geo.ts` (element names). Google draws its own map buttons in English.
- Decimals with a point (`−36.6°`, `12.5%`), not a comma.
- Maps and geocoding: Google Maps in English (`language=en`), worldwide, no country filter.
- Where the map opens (`startView`): one worldwide time-zone lookup — Russian zones open on
  their city, more English-speaking zones added (India, Sri Lanka, Nepal, SE Asia, South
  Africa, more US/Canada/Australia cities, New Zealand); otherwise the continent.
- English title, meta, og (`en_GB`), JSON-LD, `lang="en"`; the Latin Cormorant is preloaded.
- Privacy text states that the plan and progress are kept in this browser for up to 30 days
  («Start over» deletes them at once).
- PNG file name `vastu-map-annaromeo.png`; IndexedDB database `vastu-map`.
- Links (`src/config.ts`) are the same as the Russian builder's — annaromeovastu.com and its
  /course, which are in Russian (Tymur's call; change them there when an English page exists).
  The signature stays `@annaromeo.blog`.

## Stack

Vanilla TypeScript + Vite 5 + Google Maps JS API (+ pdf.js, lazy). Canvas 2D for the plan and our map layer.
Fonts are self-hosted in `public/fonts`.

```
src/main.ts     the six steps, navigation, zoom/drag, PNG export, saved progress
src/result.ts   draws the finished map (all layers)
src/mapkit.ts   maps, address search, where the map opens
src/maps/base.ts our drawing layer over the map + grabbing the pin / plan (same file as the RU copy)
src/maps/google.ts Google Maps and its address search (RU copy's file, English «Where am I»)
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

Maps: **Google Maps** everywhere (Tymur's call — the Russian copy uses Yandex in Russia and
Google abroad, as nativastu does). No fallback: if Google fails or refuses the key, a «The map
didn't load» box covers the map. The browser key lives in `src/config.ts` → `MAP_KEYS.google`
(Google Cloud, tymurchystiakov07@gmail.com, locked to our sites). Google gives 10,000 free map
loads and 10,000 free geocodes a month, then bills the billing account's card. Our marks (pin +
caption, wall, plan, red line) are drawn on one canvas in Google's overlay pane
(`src/maps/base.ts`). Progress older than 30 days is dropped on load.

On 21 Oct 2026 Google's free trial asked for a prepayment, so this site ran on the free maps
(OpenStreetMap / Esri) for two days (commit 47e8930); on 23 Oct Anna chose to pay it and use
Google.

## Deploy

Live at **https://annaromeo-vastu-map.onrender.com** — Render static site
`annaromeo-vastu-map`, auto-deploys from the **`en` branch** of the public repo
[tymuron/vastu-karta](https://github.com/tymuron/vastu-karta) (its `main` is the Russian
builder, so the two sites never redeploy each other).

This folder (inside the private workspace repo) is the source of truth. To ship a change:
commit in the workspace, then

```bash
git subtree push --prefix=scratch/vastu-map-builder-en vastu-karta en
```

(from the workspace root `~/antigravity-workspace`). After a deploy, check that every file in
`dist/` answers 200 on the live URL and that a missing file gives a real 404.
No custom domain yet (Tymur's call, 16 Oct 2026).
