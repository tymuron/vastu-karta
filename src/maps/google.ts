// Google Maps (Maps JavaScript API) — the English site's only map (same file as the RU copy).

/// <reference types="google.maps" />
import { MAP_KEYS } from '../config'
import { GeoMap, loadScript, type LatLng, type MapKind, type MapOptions, type Pt, type View } from './base'

const TYPES: Record<MapKind, string> = { scheme: 'roadmap', satellite: 'satellite', hybrid: 'hybrid' }

/** Set when Google refuses the key (wrong key, site not allowed, billing off). */
export let googleRefused = false

export function loadGoogle(lang: 'ru' | 'en'): Promise<void> {
  const w = window as unknown as Record<string, unknown>
  w.gm_authFailure = () => {
    googleRefused = true
    window.dispatchEvent(new Event('vastu-map-failed'))
  }
  const key = MAP_KEYS.google ? `key=${encodeURIComponent(MAP_KEYS.google)}&` : ''
  const url = `https://maps.googleapis.com/maps/api/js?${key}language=${lang}&v=weekly&loading=async&callback=__vastuGoogleReady`
  return loadScript(url, (done) => {
    w.__vastuGoogleReady = () => done()
  })
}

export class GoogleMap extends GeoMap {
  private map: google.maps.Map
  private overlay: google.maps.OverlayView

  constructor(host: HTMLElement, opts: MapOptions) {
    super(host)
    this.map = new google.maps.Map(host, {
      center: { lat: opts.view.center[0], lng: opts.view.center[1] },
      zoom: opts.view.zoom,
      mapTypeId: TYPES[opts.kind],
      tilt: 0,
      gestureHandling: 'greedy',
      clickableIcons: false,
      // on the house and wall maps a tap marks something — a quick second tap must not zoom
      disableDoubleClickZoom: opts.full,
      keyboardShortcuts: false,
      streetViewControl: false,
      fullscreenControl: false,
      rotateControl: false,
      cameraControl: false,
      zoomControl: true,
      zoomControlOptions: { position: google.maps.ControlPosition.LEFT_TOP },
      mapTypeControl: opts.full,
      mapTypeControlOptions: {
        mapTypeIds: ['roadmap', 'hybrid'],
        position: google.maps.ControlPosition.TOP_RIGHT,
        style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR,
      },
      maxZoom: 21,
    })
    if (opts.full) this.addGeoButton()

    // our canvas lives in Google's overlay pane, so it slides and scales with the tiles
    const self = this
    class Layer extends google.maps.OverlayView {
      onAdd() {
        this.getPanes()!.overlayLayer.appendChild(self.canvas)
      }
      draw() {
        self.paint()
      }
      onRemove() {
        self.canvas.remove()
      }
    }
    this.overlay = new Layer()
    this.overlay.setMap(this.map)
    this.map.addListener('bounds_changed', () => this.redraw())
  }

  private proj() {
    return this.overlay.getProjection()
  }

  toPx(ll: LatLng): Pt {
    const p = this.proj()?.fromLatLngToContainerPixel(new google.maps.LatLng(ll[0], ll[1]))
    return p ? { x: p.x, y: p.y } : { x: NaN, y: NaN }
  }

  fromPx(p: Pt): LatLng {
    const ll = this.proj()?.fromContainerPixelToLatLng(new google.maps.Point(p.x, p.y))
    return ll ? [ll.lat(), ll.lng()] : this.getView().center
  }

  protected placeCanvas(): Pt {
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    const pr = this.proj()
    if (pr) {
      // the pane's own coordinates of the map's top-left corner
      const corner = pr.fromContainerPixelToLatLng(new google.maps.Point(0, 0))
      const o = corner && pr.fromLatLngToDivPixel(corner)
      if (o) {
        this.canvas.style.left = `${o.x}px`
        this.canvas.style.top = `${o.y}px`
      }
    }
    return { x: w, y: h }
  }

  protected paint() {
    if (this.proj()) super.paint()
  }

  private addGeoButton() {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'map-geo'
    b.title = 'Where am I'
    b.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="2.2" class="fill"/></svg>'
    b.addEventListener('click', () => {
      if (!navigator.geolocation) return
      b.classList.add('busy')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          b.classList.remove('busy')
          this.setView({ center: [pos.coords.latitude, pos.coords.longitude], zoom: 18 })
        },
        () => b.classList.remove('busy'),
        { enableHighAccuracy: true, timeout: 12000 },
      )
    })
    this.map.controls[google.maps.ControlPosition.LEFT_TOP].push(b)
  }

  getView(): View {
    const c = this.map.getCenter()
    return { center: c ? [c.lat(), c.lng()] : [0, 0], zoom: this.map.getZoom() ?? 2 }
  }

  setView(v: View) {
    this.map.setCenter({ lat: v.center[0], lng: v.center[1] })
    this.map.setZoom(v.zoom)
  }

  fit(points: LatLng[], padding: number, maxZoom: number) {
    const b = new google.maps.LatLngBounds()
    points.forEach((p) => b.extend({ lat: p[0], lng: p[1] }))
    this.map.fitBounds(b, padding)
    google.maps.event.addListenerOnce(this.map, 'idle', () => {
      if ((this.map.getZoom() ?? 0) > maxZoom) this.map.setZoom(maxZoom)
    })
  }

  getBounds(): [LatLng, LatLng] {
    const b = this.map.getBounds()
    if (!b) {
      const c = this.getView().center
      return [c, c]
    }
    const sw = b.getSouthWest()
    const ne = b.getNorthEast()
    return [
      [sw.lat(), sw.lng()],
      [ne.lat(), ne.lng()],
    ]
  }

  resize() {
    google.maps.event.trigger(this.map, 'resize')
    this.redraw()
  }

  onClick(cb: (ll: LatLng) => void) {
    this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) cb([e.latLng.lat(), e.latLng.lng()])
    })
  }

  onIdle(cb: () => void) {
    this.map.addListener('idle', cb)
  }

  destroy() {
    this.detach()
    this.overlay.setMap(null)
    google.maps.event.clearInstanceListeners(this.map)
    this.host.innerHTML = ''
  }
}

// ── address search ──

export interface Found {
  address: string
  lat: number
  lng: number
}

const found = (r: google.maps.GeocoderResult): Found => ({
  address: r.formatted_address,
  lat: r.geometry.location.lat(),
  lng: r.geometry.location.lng(),
})

export async function googleSearch(q: string, near: [LatLng, LatLng] | null): Promise<Found[]> {
  const req: google.maps.GeocoderRequest = { address: q }
  if (near) req.bounds = new google.maps.LatLngBounds({ lat: near[0][0], lng: near[0][1] }, { lat: near[1][0], lng: near[1][1] })
  try {
    const { results } = await new google.maps.Geocoder().geocode(req)
    return results.slice(0, 8).map(found)
  } catch (e) {
    if ((e as { code?: string }).code === 'ZERO_RESULTS') return []
    throw e
  }
}

export async function googleReverse(ll: LatLng): Promise<string | null> {
  const { results } = await new google.maps.Geocoder().geocode({ location: { lat: ll[0], lng: ll[1] } })
  const house = results.find((r) => r.types.includes('street_address') || r.types.includes('premise'))
  return (house ?? results[0])?.formatted_address ?? null
}
