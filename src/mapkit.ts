// Keyless maps: no API key, no billing, works in Russia and abroad.
//   Схема   — OpenStreetMap
//   Спутник — Esri World Imagery
//   Гибрид  — Esri World Imagery + Esri place names and roads
// Address search and reverse lookup: Esri World Geocoding, Nominatim (OSM) as a fallback.

import * as L from 'leaflet'

export type Region = 'ru' | 'abroad'
export type LayerKind = 'scheme' | 'satellite' | 'hybrid'
export type LatLng = [number, number]

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const tiles = {
  osm: () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }),
  imagery: () =>
    L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: 'Снимки © Esri, Maxar, Earthstar Geographics',
    }),
  places: () =>
    L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 21,
      maxNativeZoom: 19,
    }),
  roads: () =>
    L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, {
      maxZoom: 21,
      maxNativeZoom: 19,
      opacity: 0.85,
    }),
}

function makeLayer(kind: LayerKind): L.Layer {
  if (kind === 'scheme') return tiles.osm()
  if (kind === 'satellite') return tiles.imagery()
  return L.layerGroup([tiles.imagery(), tiles.roads(), tiles.places()])
}

/** A map with a «Схема / Спутник / Гибрид» switch, zoom and «где я» buttons. */
export function createSearchMap(el: HTMLElement, center: LatLng, zoom: number, initial: LayerKind): L.Map {
  const map = L.map(el, { center, zoom, zoomControl: false, attributionControl: true })
  map.attributionControl.setPrefix(false)
  map.attributionControl.addAttribution('Поиск адресов © Esri')
  L.control.zoom({ position: 'topleft', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map)

  let current: L.Layer = makeLayer(initial).addTo(map)
  const TypeControl = L.Control.extend({
    onAdd() {
      const box = L.DomUtil.create('div', 'map-types')
      const names: [LayerKind, string][] = [
        ['scheme', 'Схема'],
        ['satellite', 'Спутник'],
        ['hybrid', 'Гибрид'],
      ]
      names.forEach(([kind, label]) => {
        const b = L.DomUtil.create('button', kind === initial ? 'on' : '', box)
        b.type = 'button'
        b.textContent = label
        L.DomEvent.on(b, 'click', (e) => {
          L.DomEvent.stop(e)
          map.removeLayer(current)
          current = makeLayer(kind).addTo(map)
          box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
        })
      })
      L.DomEvent.disableClickPropagation(box)
      return box
    },
  })
  new TypeControl({ position: 'topright' }).addTo(map)

  let me: L.CircleMarker | null = null
  const GeoControl = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create('button', 'map-geo') as HTMLButtonElement
      b.type = 'button'
      b.title = 'Где я'
      b.innerHTML =
        '<svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.2" class="fill"/></svg>'
      L.DomEvent.on(b, 'click', (e) => {
        L.DomEvent.stop(e)
        if (!navigator.geolocation) return
        b.classList.add('busy')
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            b.classList.remove('busy')
            const ll: LatLng = [pos.coords.latitude, pos.coords.longitude]
            map.setView(ll, 17)
            if (me) me.remove()
            me = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#2F80ED', fillOpacity: 1 }).addTo(map)
          },
          () => b.classList.remove('busy'),
          { enableHighAccuracy: true, timeout: 12000 },
        )
      })
      L.DomEvent.disableClickPropagation(b)
      return b
    },
  })
  new GeoControl({ position: 'topleft' }).addTo(map)
  return map
}

/** Gold pin, optionally with a caption — the visitor's building. Draggable to the exact house. */
export function goldMarker(ll: LatLng, caption?: string, draggable = false): L.Marker {
  return L.marker(ll, {
    icon: pinIcon(caption),
    keyboard: false,
    interactive: draggable,
    draggable,
    autoPan: true,
  })
}

export const pinIcon = (caption?: string) =>
  L.divIcon({
    className: 'gold-marker',
    html: `<span class="gm-hit"></span><span class="gm-dot"></span>${caption ? `<span class="gm-cap">${escapeHtml(caption)}</span>` : ''}`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })

// ── address search ──
// Esri World Geocoding: fast suggestions while typing (~0.3 s), house-level in Russia,
// and a country filter that matches the «в России / за рубежом» choice.
// Nominatim (OSM) is only a fallback for an explicit «Найти» — its rules forbid search-as-you-type.

const GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer'

export interface Place {
  /** full address line, street first */
  address: string
  lat?: number
  lng?: number
  /** Esri suggestion key, resolved to coordinates when picked */
  magicKey?: string
}

/** Up to 5 suggestions — near the visible map when it shows a city, and the house number typed first. */
export async function searchPlaces(q: string, region: Region, near: LatLng | null, submitted: boolean): Promise<Place[]> {
  try {
    const params = new URLSearchParams({ f: 'json', text: q, maxSuggestions: '8', langCode: 'ru' })
    if (near) params.set('location', `${near[1].toFixed(5)},${near[0].toFixed(5)}`)
    if (region === 'ru') params.set('countryCode', 'RUS')
    const res = await fetch(`${GEOCODER}/suggest?${params}`)
    if (!res.ok) throw new Error(`suggest ${res.status}`)
    const d = (await res.json()) as { suggestions?: { text: string; magicKey: string; isCollection: boolean }[]; error?: unknown }
    if (d.error) throw new Error('suggest error')
    const list = (d.suggestions ?? []).filter((s) => !s.isCollection).map((s) => ({ address: s.text, magicKey: s.magicKey }))
    const nums = q.match(/\d+[а-яa-z]?/gi) ?? []
    const hasNums = (a: string) => nums.every((n) => new RegExp(`(^|\\D)${n}(\\D|$)`, 'i').test(a))
    const ranked = [...list.filter((p) => hasNums(p.address)), ...list.filter((p) => !hasNums(p.address))].slice(0, 5)
    if (ranked.length || !submitted) return ranked
  } catch (err) {
    if (!submitted) throw err
  }
  return nominatimSearch(q, region)
}

async function nominatimSearch(q: string, region: Region): Promise<Place[]> {
  const params = new URLSearchParams({ format: 'jsonv2', limit: '5', addressdetails: '1', 'accept-language': 'ru', q })
  if (region === 'ru') params.set('countrycodes', 'ru')
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const d = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[]
  return d.map((r) => ({ address: (r.address && osmLine(r.address)) || r.display_name, lat: +r.lat, lng: +r.lon }))
}

/** Coordinates of a picked suggestion. */
export async function resolvePlace(p: Place): Promise<{ lat: number; lng: number; address: string } | null> {
  if (p.lat != null && p.lng != null) return { lat: p.lat, lng: p.lng, address: p.address }
  const params = new URLSearchParams({ f: 'json', SingleLine: p.address, magicKey: p.magicKey ?? '', maxLocations: '1', langCode: 'ru' })
  const res = await fetch(`${GEOCODER}/findAddressCandidates?${params}`)
  if (!res.ok) return null
  const d = (await res.json()) as { candidates?: { address: string; location: { x: number; y: number } }[] }
  const c = d.candidates?.[0]
  return c ? { lat: c.location.y, lng: c.location.x, address: p.address } : null
}

function osmLine(a: Record<string, string>): string {
  const settlement = a.city || a.town || a.village || a.municipality || a.county
  return [a.road || a.pedestrian || a.square, a.house_number, settlement, a.country].filter(Boolean).join(', ')
}

/** Address line of the building at a point (street first). */
export async function reverseAddress(ll: LatLng): Promise<string | null> {
  try {
    const res = await fetch(
      `${GEOCODER}/reverseGeocode?f=json&langCode=ru&featureTypes=PointAddress,StreetAddress&location=${ll[1]},${ll[0]}`,
    )
    if (res.ok) {
      const d = (await res.json()) as { address?: { LongLabel?: string } }
      if (d.address?.LongLabel) return d.address.LongLabel
    }
  } catch {
    /* fall through to OSM */
  }
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=ru&lat=${ll[0]}&lon=${ll[1]}`,
    )
    if (!res.ok) return null
    const d = (await res.json()) as { address?: Record<string, string> }
    return (d.address && osmLine(d.address)) || null
  } catch {
    return null
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// ── where the map opens ──
// nativastu always opens on Moscow. We open where the visitor probably is, judged by the
// phone's time zone (no permission prompt): their city for Russia, their country abroad.

const RU_ZONES: Record<string, LatLng> = {
  'Europe/Moscow': [55.7512, 37.6184],
  'Europe/Kaliningrad': [54.7104, 20.4522],
  'Europe/Samara': [53.1959, 50.1002],
  'Europe/Volgograd': [48.708, 44.5133],
  'Europe/Saratov': [51.5336, 46.0343],
  'Europe/Ulyanovsk': [54.3142, 48.4031],
  'Europe/Astrakhan': [46.3479, 48.0336],
  'Europe/Kirov': [58.6036, 49.668],
  'Asia/Yekaterinburg': [56.8389, 60.6057],
  'Asia/Omsk': [54.9885, 73.3242],
  'Asia/Novosibirsk': [55.0084, 82.9357],
  'Asia/Barnaul': [53.3548, 83.7698],
  'Asia/Tomsk': [56.4847, 84.9482],
  'Asia/Novokuznetsk': [53.7576, 87.136],
  'Asia/Krasnoyarsk': [56.0153, 92.8932],
  'Asia/Irkutsk': [52.2869, 104.305],
  'Asia/Chita': [52.0515, 113.4712],
  'Asia/Yakutsk': [62.0355, 129.6755],
  'Asia/Vladivostok': [43.1198, 131.8869],
  'Asia/Sakhalin': [46.9591, 142.738],
  'Asia/Magadan': [59.568, 150.8085],
  'Asia/Kamchatka': [53.0452, 158.6483],
}

const ABROAD_ZONES: Record<string, [number, number, number]> = {
  'Europe/Madrid': [40.2, -3.7, 6],
  'Atlantic/Canary': [28.3, -15.8, 8],
  'Europe/Lisbon': [39.6, -8.0, 7],
  'Europe/Paris': [46.6, 2.4, 6],
  'Europe/Monaco': [43.738, 7.424, 13],
  'Europe/Berlin': [51.2, 10.4, 6],
  'Europe/Rome': [42.6, 12.6, 6],
  'Europe/London': [53.5, -2.0, 6],
  'Europe/Dublin': [53.3, -7.9, 7],
  'Europe/Amsterdam': [52.2, 5.3, 7],
  'Europe/Brussels': [50.6, 4.5, 8],
  'Europe/Luxembourg': [49.7, 6.1, 9],
  'Europe/Zurich': [46.8, 8.2, 7],
  'Europe/Vienna': [47.6, 14.1, 7],
  'Europe/Prague': [49.8, 15.5, 7],
  'Europe/Warsaw': [52.1, 19.4, 6],
  'Europe/Budapest': [47.2, 19.4, 7],
  'Europe/Bratislava': [48.7, 19.7, 7],
  'Europe/Ljubljana': [46.1, 14.8, 8],
  'Europe/Zagreb': [45.1, 15.2, 7],
  'Europe/Belgrade': [44.0, 20.9, 7],
  'Europe/Podgorica': [42.7, 19.3, 8],
  'Europe/Sarajevo': [43.9, 17.7, 7],
  'Europe/Skopje': [41.6, 21.7, 8],
  'Europe/Tirane': [41.2, 20.0, 8],
  'Europe/Athens': [38.5, 23.6, 6],
  'Europe/Sofia': [42.7, 25.3, 7],
  'Europe/Bucharest': [45.9, 25.0, 6],
  'Europe/Chisinau': [47.0, 28.8, 7],
  'Europe/Kyiv': [49.0, 31.3, 6],
  'Europe/Kiev': [49.0, 31.3, 6],
  'Europe/Minsk': [53.7, 27.9, 6],
  'Europe/Riga': [56.9, 24.6, 7],
  'Europe/Vilnius': [55.2, 23.9, 7],
  'Europe/Tallinn': [58.6, 25.0, 7],
  'Europe/Helsinki': [61.9, 25.7, 5],
  'Europe/Stockholm': [60.1, 18.6, 5],
  'Europe/Oslo': [60.5, 8.5, 5],
  'Europe/Copenhagen': [56.0, 10.0, 7],
  'Europe/Istanbul': [39.0, 35.2, 6],
  'Europe/Malta': [35.9, 14.4, 10],
  'Asia/Nicosia': [35.1, 33.4, 9],
  'Europe/Nicosia': [35.1, 33.4, 9],
  'Asia/Tbilisi': [42.3, 43.4, 7],
  'Asia/Yerevan': [40.1, 45.0, 8],
  'Asia/Baku': [40.4, 47.6, 7],
  'Asia/Almaty': [48.0, 67.0, 5],
  'Asia/Tashkent': [41.4, 64.6, 6],
  'Asia/Bishkek': [41.2, 74.8, 7],
  'Asia/Dubai': [25.2, 55.3, 9],
  'Asia/Qatar': [25.3, 51.2, 9],
  'Asia/Jerusalem': [31.5, 34.9, 8],
  'Asia/Bangkok': [13.7, 100.5, 6],
  'Asia/Makassar': [-8.4, 115.2, 9],
  'Asia/Singapore': [1.35, 103.82, 11],
  'Asia/Hong_Kong': [22.3, 114.17, 11],
  'Asia/Tokyo': [36.2, 138.3, 5],
  'Asia/Shanghai': [35.9, 104.2, 4],
  'America/New_York': [40.7, -74.0, 7],
  'America/Chicago': [41.88, -87.63, 7],
  'America/Denver': [39.74, -104.99, 7],
  'America/Los_Angeles': [34.05, -118.24, 7],
  'America/Toronto': [43.65, -79.38, 7],
  'America/Vancouver': [49.28, -123.12, 8],
  'Australia/Sydney': [-33.87, 151.21, 8],
}

const CONTINENTS: Record<string, [number, number, number]> = {
  Europe: [50, 10, 4],
  Africa: [5, 20, 3],
  America: [35, -95, 3],
  Asia: [35, 80, 3],
  Australia: [-27, 134, 4],
  Atlantic: [40, -20, 3],
  Indian: [-10, 75, 3],
  Pacific: [0, -160, 3],
}

export function startView(region: Region): { center: LatLng; zoom: number } {
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    /* very old browser */
  }
  if (region === 'ru') return RU_ZONES[tz] ? { center: RU_ZONES[tz], zoom: 11 } : { center: RU_ZONES['Europe/Moscow'], zoom: 10 }
  const z = ABROAD_ZONES[tz] ?? (RU_ZONES[tz] ? undefined : CONTINENTS[tz.split('/')[0]])
  return z ? { center: [z[0], z[1]], zoom: z[2] } : { center: [48, 12], zoom: 4 }
}

/** A satellite map for the rotate step that can be zoomed and panned. */
export function createRotateMap(el: HTMLElement, kind: LayerKind): L.Map {
  const map = L.map(el, { zoomControl: false, attributionControl: true, maxZoom: 21, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 })
  map.attributionControl.setPrefix(false)
  L.control.zoom({ position: 'topleft', zoomInTitle: 'Приблизить', zoomOutTitle: 'Отдалить' }).addTo(map)
  map.createPane('planPane').style.zIndex = '450'
  const line = map.createPane('linePane')
  line.style.zIndex = '460'
  line.style.pointerEvents = 'none'
  makeLayer(kind).addTo(map)
  return map
}
