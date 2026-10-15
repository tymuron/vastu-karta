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

/** A still satellite backdrop for the rotate step (the plan canvas sits on top of it). */
export function createBackdropMap(el: HTMLElement, center: LatLng, zoom: number, kind: LayerKind): L.Map {
  const map = L.map(el, {
    center,
    zoom,
    zoomControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
    attributionControl: true,
  })
  map.attributionControl.setPrefix(false)
  makeLayer(kind).addTo(map)
  return map
}

/** Gold dot, optionally with a caption — the found building. */
export function goldMarker(ll: LatLng, caption?: string): L.Marker {
  const html = `<span class="gm-dot"></span>${caption ? `<span class="gm-cap">${escapeHtml(caption)}</span>` : ''}`
  return L.marker(ll, {
    icon: L.divIcon({ className: 'gold-marker', html, iconSize: [0, 0], iconAnchor: [0, 0] }),
    keyboard: false,
    interactive: false,
  })
}

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

/** Up to 5 suggestions, biased towards the visible part of the map. */
export async function searchPlaces(q: string, region: Region, near: LatLng, submitted: boolean): Promise<Place[]> {
  try {
    const params = new URLSearchParams({
      f: 'json',
      text: q,
      maxSuggestions: '5',
      langCode: 'ru',
      location: `${near[1].toFixed(5)},${near[0].toFixed(5)}`,
    })
    if (region === 'ru') params.set('countryCode', 'RUS')
    const res = await fetch(`${GEOCODER}/suggest?${params}`)
    if (!res.ok) throw new Error(`suggest ${res.status}`)
    const d = (await res.json()) as { suggestions?: { text: string; magicKey: string; isCollection: boolean }[]; error?: unknown }
    if (d.error) throw new Error('suggest error')
    const list = (d.suggestions ?? []).filter((s) => !s.isCollection).map((s) => ({ address: s.text, magicKey: s.magicKey }))
    if (list.length || !submitted) return list
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
