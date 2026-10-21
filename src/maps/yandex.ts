// Yandex Maps (JS API 2.1) — used for flats in Russia, as on nativastu.
// Free key (tymur0n's console): JavaScript API + Geocoder, 1,000 geocoder calls a day.

import { MAP_KEYS } from '../config'
import { GeoMap, loadScript, type LatLng, type MapKind, type MapOptions, type Pt, type View } from './base'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const ymaps: any

const TYPES: Record<MapKind, string> = { scheme: 'yandex#map', satellite: 'yandex#satellite', hybrid: 'yandex#hybrid' }

export function loadYandex(lang: 'ru' | 'en'): Promise<void> {
  const key = MAP_KEYS.yandex ? `apikey=${encodeURIComponent(MAP_KEYS.yandex)}&` : ''
  const url = `https://api-maps.yandex.ru/2.1/?${key}lang=${lang === 'ru' ? 'ru_RU' : 'en_US'}&onload=__vastuYandexReady`
  return loadScript(url, (done) => {
    ;(window as unknown as Record<string, unknown>).__vastuYandexReady = () => done()
  })
}

interface State {
  gc: [number, number] // global pixel centre
  z: number
}

export class YandexMap extends GeoMap {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private map: any
  /** where the map is heading during a drag or pinch (no animation) */
  private live: State | null = null
  /** what our canvas currently shows */
  private painted: State | null = null

  constructor(host: HTMLElement, opts: MapOptions) {
    super(host)
    const small = matchMedia('(max-width: 900px)').matches
    this.map = new ymaps.Map(
      host,
      { center: opts.view.center, zoom: opts.view.zoom, type: TYPES[opts.kind], controls: [] },
      // Yandex's terms (4.1.3.3) require the «Открыть в Картах» button to stay visible
      { yandexMapDisablePoiInteractivity: true, maxZoom: 21 },
    )
    this.map.controls.add(new ymaps.control.ZoomControl({ options: { size: small ? 'small' : 'auto', position: { left: 10, top: 10 } } }))
    if (opts.full) {
      // on the house and wall maps a tap marks something — a quick second tap must not zoom
      this.map.behaviors.disable('dblClickZoom')
      this.map.controls.add(new ymaps.control.TypeSelector({ options: { position: { right: 10, top: 10 }, panoramasItemMode: 'off' } }))
      this.map.controls.add(new ymaps.control.GeolocationControl({ options: { position: { left: 10, top: small ? 80 : 210 } } }))
    }
    const pane = new ymaps.pane.StaticPane(this.map, { zIndex: 450 })
    this.map.panes.append('vastu', pane)
    pane.getElement().appendChild(this.canvas)

    this.map.events.add('actiontick', (e: { get(k: string): { globalPixelCenter: [number, number]; zoom: number; duration: number; timingFunction?: string } }) => {
      const t = e.get('tick')
      if (t.duration > 0) this.animateTo({ gc: t.globalPixelCenter, z: t.zoom }, t.duration, t.timingFunction)
      else {
        this.live = { gc: t.globalPixelCenter, z: t.zoom }
        this.paint()
      }
    })
    this.map.events.add('actionend', () => {
      this.live = null
      this.paint()
    })
    this.map.events.add('sizechange', () => this.paint())
    this.paint()
  }

  private state(): State {
    return this.live ?? { gc: this.map.getGlobalPixelCenter(), z: this.map.getZoom() }
  }

  private size(): [number, number] {
    return this.map.container.getSize()
  }

  toPx(ll: LatLng): Pt {
    const s = this.state()
    const g = this.map.options.get('projection').toGlobalPixels(ll, s.z)
    const [w, h] = this.size()
    return { x: g[0] - s.gc[0] + w / 2, y: g[1] - s.gc[1] + h / 2 }
  }

  fromPx(p: Pt): LatLng {
    const s = this.state()
    const [w, h] = this.size()
    return this.map.options.get('projection').fromGlobalPixels([s.gc[0] - w / 2 + p.x, s.gc[1] - h / 2 + p.y], s.z)
  }

  // An animated zoom gives one tick with the end state; we glide our canvas there in step
  // with the tiles (a CSS transition of the same length), then repaint when it ends.
  private animateTo(to: State, ms: number, timing?: string) {
    const from = this.painted
    if (!from) return
    const [w, h] = this.size()
    const k = 2 ** (to.z - from.z)
    const tx = k * (from.gc[0] - w / 2) - (to.gc[0] - w / 2)
    const ty = k * (from.gc[1] - h / 2) - (to.gc[1] - h / 2)
    const css = /^(linear|ease|ease-in|ease-out|ease-in-out|cubic-bezier\([^)]*\))$/.test(timing ?? '') ? timing : 'ease-out'
    this.canvas.style.transformOrigin = '0 0'
    this.canvas.style.transition = `transform ${ms}ms ${css}`
    this.canvas.style.transform = `translate(${tx}px, ${ty}px) scale(${k})`
  }

  protected placeCanvas(): Pt {
    this.canvas.style.transition = 'none'
    this.canvas.style.transform = ''
    this.canvas.style.left = '0'
    this.canvas.style.top = '0'
    this.painted = this.state()
    const [w, h] = this.size()
    return { x: w, y: h }
  }

  getView(): View {
    return { center: this.map.getCenter(), zoom: this.map.getZoom() }
  }

  setView(v: View) {
    this.map.setCenter(v.center, v.zoom, { duration: 0 })
    this.paint()
  }

  fit(points: LatLng[], padding: number, maxZoom: number) {
    const bounds = ymaps.util.bounds.fromPoints(points)
    this.map.setBounds(bounds, { zoomMargin: padding, checkZoomRange: true, duration: 0 }).then(() => {
      if (this.map.getZoom() > maxZoom) this.map.setZoom(maxZoom, { duration: 0 })
      this.paint()
    })
  }

  getBounds(): [LatLng, LatLng] {
    return this.map.getBounds()
  }

  resize() {
    this.map.container.fitToViewport()
    this.paint()
  }

  onClick(cb: (ll: LatLng) => void) {
    this.map.events.add('click', (e: { get(k: string): LatLng }) => cb(e.get('coords')))
  }

  onIdle(cb: () => void) {
    this.map.events.add('actionend', cb)
  }

  destroy() {
    this.detach()
    this.map.destroy()
  }
}

// ── address search ──

export interface Found {
  address: string
  lat: number
  lng: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function lines(res: any): Found[] {
  const out: Found[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.geoObjects.each((g: any) => {
    const name: string = g.properties.get('name') ?? ''
    const desc: string = g.properties.get('description') ?? ''
    const [lat, lng] = g.geometry.getCoordinates()
    // street and house first, then town and country: «Тверская улица, 13, Москва, Россия»
    out.push({ address: [name, desc].filter(Boolean).join(', '), lat, lng })
  })
  return out
}

export async function yandexSearch(q: string, near: [LatLng, LatLng] | null): Promise<Found[]> {
  const res = await ymaps.geocode(q, near ? { results: 8, boundedBy: near } : { results: 8 })
  return lines(res)
}

export async function yandexReverse(ll: LatLng): Promise<string | null> {
  const res = await ymaps.geocode(ll, { results: 1, kind: 'house' })
  const found = lines(res)
  if (found.length) return found[0].address
  const any = lines(await ymaps.geocode(ll, { results: 1 }))
  return any[0]?.address ?? null
}
