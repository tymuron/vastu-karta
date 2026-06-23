# Васту Карта — Vastu Map Builder

A standalone, client-side tool that builds a Vastu sector map for an apartment
of any shape. Inspired by [nativastu.com](https://nativastu.com), rebuilt in the
client's (vastu-portal) burgundy design system, with an **automatic orientation**
improvement over the original (which makes the user eyeball the rotation by hand).

## How it works

A 6-step flow, all computed locally in the browser (the plan never leaves the device):

1. **Регион** — Russia (Yandex map) or abroad (Google map).
2. **Загрузить план** — drop a photo/scan/image of the floor plan.
3. **Контур** — click the apartment's corners; the polygon **centroid (центр тяжести)**
   is found automatically via the shoelace formula.
4. **Дом на карте** — a real satellite map (Esri World Imagery + OSM Nominatim address
   search, **no API key**). Find the building, draw a line along the window wall → the
   façade azimuth is read off the map. A manual compass dial is the fallback.
5. **Стена с окнами** — tap the window wall on the plan; it **auto-rotates** so North
   points true geographic North. Fine-tune slider + 180° flip for the line/edge ambiguity.
6. **Васту Карта** — 8 direction sectors (С/СВ/В/ЮВ/Ю/ЮЗ/З/СЗ, 45° each) clipped to
   the outline, axis lines, the central Brahmasthan (1/9 area), a life-zone legend,
   layer toggles, opacity, and PNG export.

## Stack

React 18 + Vite 5 + TypeScript + Tailwind 3. Canvas 2D for all overlay rendering.
Fonts (Cormorant Garamond + Inter, incl. Cyrillic) are self-hosted via Fontsource —
no Google CDN at runtime (it's blocked in Russia).

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # -> dist/  (static, deploy anywhere)
```

## Maps

The map is **keyless** — Esri World Imagery satellite tiles + OpenStreetMap Nominatim
geocoding, which work worldwide (including Russia). No Yandex/Google account or billing
needed. The `VITE_YANDEX_MAPS_KEY` / `VITE_GOOGLE_MAPS_KEY` env vars exist only if you
later want to swap in those providers; they are **not required**.

## Left for the client

- **Deploy** (static `dist/` to Render or any host) and **test on real apartments**.
- Set the real **"узнать об услугах"** link (services URL) in `src/App.tsx`.
- Validate orientation against a couple of known real cases (the 180° flip covers the
  line-direction ambiguity).
- Phase-2 ideas: auto-diagnosis of enlarged/reduced zones, room/object placement per
  sector, Brahmasthan "is it clean?" check, richer per-sector reading panel.
