// Free maps — no key, no card: used for flats outside Russia.
//   Схема   — OpenStreetMap
//   Спутник — Esri World Imagery
//   Гибрид  — Esri World Imagery + Esri place names and roads
// Address search: Esri World Geocoding (fast suggestions while typing, house-level);
// Nominatim (OpenStreetMap) only as a fallback when Esri fails.

import 'leaflet/dist/leaflet.css'
import * as L from 'leaflet'
import { GeoMap, type LatLng, type MapKind, type MapOptions, type Pt, type View } from './base'

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const GEOCODER = 'https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer'

export interface FreeText {
  scheme: string
  satellite: string
  hybrid: string
  imagery: string
  search: string
  zoomIn: string
  zoomOut: string
  whereAmI: string
}

const tiles = (t: FreeText) => ({
  osm: () =>
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 21,
      maxNativeZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }),
  imagery: () => L.tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 21, maxNativeZoom: 19, attribution: t.imagery }),
  places: () => L.tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 21, maxNativeZoom: 19 }),
  roads: () => L.tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 21, maxNativeZoom: 19, opacity: 0.85 }),
})

function makeLayer(kind: MapKind, t: FreeText): L.Layer {
  const s = tiles(t)
  if (kind === 'scheme') return s.osm()
  if (kind === 'satellite') return s.imagery()
  return L.layerGroup([s.imagery(), s.roads(), s.places()])
}

export class FreeMap extends GeoMap {
  private map: L.Map
  private topLeft: L.LatLng | null = null
  private frame2 = 0

  constructor(host: HTMLElement, opts: MapOptions, t: FreeText) {
    super(host)
    const map = L.map(host, { center: opts.view.center, zoom: opts.view.zoom, zoomControl: false, maxZoom: 21, zoomSnap: 0.25, wheelPxPerZoomLevel: 90 })
    this.map = map
    map.attributionControl.setPrefix(false)
    map.attributionControl.addAttribution(t.search)
    L.control.zoom({ position: 'topleft', zoomInTitle: t.zoomIn, zoomOutTitle: t.zoomOut }).addTo(map)

    let current: L.Layer = makeLayer(opts.kind, t).addTo(map)
    if (opts.full) {
      // on the house and wall maps a tap marks something — a quick second tap must not zoom
      map.doubleClickZoom.disable()
      const Types = L.Control.extend({
        onAdd() {
          const box = L.DomUtil.create('div', 'map-types')
          ;([
            ['scheme', t.scheme],
            ['satellite', t.satellite],
            ['hybrid', t.hybrid],
          ] as [MapKind, string][]).forEach(([kind, label]) => {
            const b = L.DomUtil.create('button', kind === opts.kind ? 'on' : '', box)
            b.type = 'button'
            b.textContent = label
            L.DomEvent.on(b, 'click', (e) => {
              L.DomEvent.stop(e)
              map.removeLayer(current)
              current = makeLayer(kind, t).addTo(map)
              box.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b))
            })
          })
          L.DomEvent.disableClickPropagation(box)
          return box
        },
      })
      new Types({ position: 'topright' }).addTo(map)

      let me: L.CircleMarker | null = null
      const Geo = L.Control.extend({
        onAdd() {
          const b = L.DomUtil.create('button', 'map-geo') as HTMLButtonElement
          b.type = 'button'
          b.title = t.whereAmI
          b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.2" class="fill"/></svg>'
          L.DomEvent.on(b, 'click', (e) => {
            L.DomEvent.stop(e)
            if (!navigator.geolocation) return
            b.classList.add('busy')
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                b.classList.remove('busy')
                const ll: LatLng = [pos.coords.latitude, pos.coords.longitude]
                map.setView(ll, 18)
                me?.remove()
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
      new Geo({ position: 'topleft' }).addTo(map)
    }

    // our canvas lives in a pane of the map, so it slides with the tiles and glides with their zoom
    const pane = map.createPane('vastu')
    pane.style.zIndex = '450'
    pane.style.pointerEvents = 'none'
    this.canvas.classList.add('leaflet-zoom-animated')
    pane.appendChild(this.canvas)
    map.on('zoom viewreset resize zoomend', () => this.paint())
    map.on('move', () => {
      cancelAnimationFrame(this.frame2)
      this.frame2 = requestAnimationFrame(() => this.paint())
    })
    map.on('zoomanim', (e: L.ZoomAnimEvent) => {
      if (!this.topLeft) return
      const m = map as L.Map & { _latLngToNewLayerPoint(ll: L.LatLng, z: number, c: L.LatLng): L.Point }
      L.DomUtil.setTransform(this.canvas, m._latLngToNewLayerPoint(this.topLeft, e.zoom, e.center), map.getZoomScale(e.zoom))
    })
    this.paint()
  }

  protected placeCanvas(): Pt {
    const size = this.map.getSize()
    L.DomUtil.setPosition(this.canvas, this.map.containerPointToLayerPoint([0, 0]))
    this.topLeft = this.map.containerPointToLatLng([0, 0])
    return { x: size.x, y: size.y }
  }

  toPx(ll: LatLng): Pt {
    const p = this.map.latLngToContainerPoint(ll)
    return { x: p.x, y: p.y }
  }

  fromPx(p: Pt): LatLng {
    const ll = this.map.containerPointToLatLng([p.x, p.y])
    return [ll.lat, ll.lng]
  }

  getView(): View {
    const c = this.map.getCenter()
    return { center: [c.lat, c.lng], zoom: this.map.getZoom() }
  }

  setView(v: View) {
    this.map.setView(v.center, v.zoom, { animate: false })
    this.paint()
  }

  fit(points: LatLng[], padding: number, maxZoom: number) {
    this.map.fitBounds(L.latLngBounds(points), { padding: [padding, padding], maxZoom, animate: false })
    this.paint()
  }

  getBounds(): [LatLng, LatLng] {
    const b = this.map.getBounds()
    return [
      [b.getSouth(), b.getWest()],
      [b.getNorth(), b.getEast()],
    ]
  }

  resize() {
    this.map.invalidateSize()
    this.paint()
  }

  onClick(cb: (ll: LatLng) => void) {
    this.map.on('click', (e: L.LeafletMouseEvent) => cb([e.latlng.lat, e.latlng.lng]))
  }

  onIdle(cb: () => void) {
    this.map.on('moveend', cb)
  }

  destroy() {
    cancelAnimationFrame(this.frame2)
    this.detach()
    this.map.remove()
  }
}

// ── address search (Esri World Geocoding) ──

export interface FreeFound {
  address: string
  lat?: number
  lng?: number
  /** Esri suggestion key, turned into coordinates when picked */
  magicKey?: string
}

export async function freeSearch(q: string, near: LatLng | null, lang: 'ru' | 'en', submitted: boolean): Promise<FreeFound[]> {
  try {
    const params = new URLSearchParams({ f: 'json', text: q, maxSuggestions: '8', langCode: lang })
    if (near) params.set('location', `${near[1].toFixed(5)},${near[0].toFixed(5)}`)
    const res = await fetch(`${GEOCODER}/suggest?${params}`)
    if (!res.ok) throw new Error(`suggest ${res.status}`)
    const d = (await res.json()) as { suggestions?: { text: string; magicKey: string; isCollection: boolean }[]; error?: unknown }
    if (d.error) throw new Error('suggest error')
    const list = (d.suggestions ?? []).filter((s) => !s.isCollection).map((s) => ({ address: s.text, magicKey: s.magicKey }))
    if (list.length || !submitted) return list
  } catch (err) {
    if (!submitted) throw err
  }
  // Nominatim's rules forbid search-as-you-type, so it only answers a pressed «Найти» / Enter
  const params = new URLSearchParams({ format: 'jsonv2', limit: '5', addressdetails: '1', 'accept-language': lang, q })
  const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`)
  if (!res.ok) throw new Error(`nominatim ${res.status}`)
  const d = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[]
  return d.map((r) => ({ address: (r.address && osmLine(r.address)) || r.display_name, lat: +r.lat, lng: +r.lon }))
}

export async function freeResolve(p: FreeFound, lang: 'ru' | 'en'): Promise<LatLng | null> {
  if (p.lat != null && p.lng != null) return [p.lat, p.lng]
  const params = new URLSearchParams({ f: 'json', SingleLine: p.address, magicKey: p.magicKey ?? '', maxLocations: '1', langCode: lang })
  const res = await fetch(`${GEOCODER}/findAddressCandidates?${params}`)
  if (!res.ok) return null
  const d = (await res.json()) as { candidates?: { location: { x: number; y: number } }[] }
  const c = d.candidates?.[0]
  return c ? [c.location.y, c.location.x] : null
}

export async function freeReverse(ll: LatLng, lang: 'ru' | 'en'): Promise<string | null> {
  try {
    const res = await fetch(`${GEOCODER}/reverseGeocode?f=json&langCode=${lang}&featureTypes=PointAddress,StreetAddress&location=${ll[1]},${ll[0]}`)
    if (res.ok) {
      const d = (await res.json()) as { address?: { LongLabel?: string } }
      if (d.address?.LongLabel) return d.address.LongLabel
    }
  } catch {
    /* fall through to OSM */
  }
  const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&accept-language=${lang}&lat=${ll[0]}&lon=${ll[1]}`)
  if (!res.ok) return null
  const d = (await res.json()) as { address?: Record<string, string> }
  return (d.address && osmLine(d.address)) || null
}

function osmLine(a: Record<string, string>): string {
  const settlement = a.city || a.town || a.village || a.municipality || a.county
  return [a.road || a.pedestrian || a.square, a.house_number, settlement, a.country].filter(Boolean).join(', ')
}
