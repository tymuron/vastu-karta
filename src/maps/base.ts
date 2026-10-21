// One map surface for both providers: Yandex in Russia (as on nativastu), free maps abroad.
// The provider draws tiles and its own buttons; everything of ours — the house pin, the wall,
// the plan, the red line — is drawn on one canvas above the tiles, so it looks and behaves the
// same on both. Fingers on the pin or the plan are held back from the map, so it doesn't pan.

import { distance } from '../geo'

export type LatLng = [number, number]
export type Region = 'ru' | 'abroad'
export type Provider = 'yandex' | 'free'
export type MapKind = 'scheme' | 'satellite' | 'hybrid'
export interface Pt {
  x: number
  y: number
}
export interface View {
  center: LatLng
  zoom: number
}

export interface MapOptions {
  view: View
  kind: MapKind
  /** «Схема / Спутник / Гибрид» switch and the «где я» button */
  full: boolean
}

/** Something on our layer that can be dragged: the house pin, the plan. */
export interface Grabber {
  hit(p: Pt): boolean
  start(p: Pt): void
  move(p: Pt): void
  end(): void
}

export abstract class GeoMap {
  /** draws our layer, in container pixels */
  onDraw: ((ctx: CanvasRenderingContext2D) => void) | null = null
  grabber: Grabber | null = null
  protected canvas = document.createElement('canvas')
  private frame = 0
  private grabbedAt = 0
  private grabbing = false

  constructor(readonly host: HTMLElement) {
    this.canvas.className = 'map-overlay'
    // capture phase: we see the press before the map does
    for (const t of ['pointerdown', 'mousedown', 'touchstart']) host.addEventListener(t, this.onPress, true)
    host.addEventListener('click', this.onClickCapture, true)
    host.addEventListener('pointermove', this.onHover)
  }

  abstract getView(): View
  abstract setView(v: View): void
  /** show all these points, at most `maxZoom` */
  abstract fit(points: LatLng[], padding: number, maxZoom: number): void
  abstract getBounds(): [LatLng, LatLng]
  abstract resize(): void
  /** container pixels of a point, as currently drawn */
  abstract toPx(ll: LatLng): Pt
  abstract fromPx(p: Pt): LatLng
  abstract onClick(cb: (ll: LatLng) => void): void
  /** after every pan or zoom has settled */
  abstract onIdle(cb: () => void): void
  abstract destroy(): void
  /** place and size the canvas for a fresh paint; returns its CSS size */
  protected abstract placeCanvas(): Pt

  /** metres per screen pixel at the middle of the map */
  metresPerPx(): number {
    const w = this.host.clientWidth / 2
    const h = this.host.clientHeight / 2
    return distance(this.fromPx({ x: w - 50, y: h }), this.fromPx({ x: w + 50, y: h })) / 100
  }

  /** is the point comfortably inside the visible map? */
  shows(ll: LatLng, margin = 0.15): boolean {
    const p = this.toPx(ll)
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    return p.x > w * margin && p.x < w * (1 - margin) && p.y > h * margin && p.y < h * (1 - margin)
  }

  redraw() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.paint())
  }

  protected paint() {
    cancelAnimationFrame(this.frame)
    const size = this.placeCanvas()
    const dpr = Math.min(window.devicePixelRatio || 1, 3)
    const c = this.canvas
    const w = Math.round(size.x * dpr)
    const h = Math.round(size.y * dpr)
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
      c.style.width = `${size.x}px`
      c.style.height = `${size.y}px`
    }
    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    this.onDraw?.(ctx)
  }

  private local(e: { clientX: number; clientY: number }): Pt {
    const r = this.host.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  private onPress = (e: Event) => {
    if (e.type !== 'pointerdown') {
      // the mouse/touch twins of a press we already took
      if (!this.grabbing) return
      if (e.type === 'touchstart' && (e as TouchEvent).touches.length > 1) {
        this.release() // a second finger: let the map pinch
        return
      }
      e.stopPropagation()
      return
    }
    const pe = e as PointerEvent
    if (!this.grabber || !pe.isPrimary || (pe.pointerType === 'mouse' && pe.button !== 0)) return
    const p = this.local(pe)
    if (!this.grabber.hit(p)) return
    e.stopPropagation()
    this.grabbing = true
    this.grabber.start(p)
    this.host.classList.add('map-grabbing')
    const id = pe.pointerId
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== id || !this.grabbing) return
      ev.preventDefault()
      this.grabber?.move(this.local(ev))
    }
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return
      document.removeEventListener('pointermove', move, true)
      document.removeEventListener('pointerup', up, true)
      document.removeEventListener('pointercancel', up, true)
      this.release()
    }
    document.addEventListener('pointermove', move, true)
    document.addEventListener('pointerup', up, true)
    document.addEventListener('pointercancel', up, true)
  }

  private release() {
    if (!this.grabbing) return
    this.grabbing = false
    this.grabbedAt = Date.now()
    this.host.classList.remove('map-grabbing')
    this.grabber?.end()
  }

  // a drag must not end as a tap that drops the pin somewhere else
  private onClickCapture = (e: Event) => {
    if (Date.now() - this.grabbedAt < 400) e.stopPropagation()
  }

  private onHover = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse' || this.grabbing) return
    this.host.classList.toggle('map-can-grab', !!this.grabber?.hit(this.local(e)))
  }

  protected detach() {
    cancelAnimationFrame(this.frame)
    for (const t of ['pointerdown', 'mousedown', 'touchstart']) this.host.removeEventListener(t, this.onPress, true)
    this.host.removeEventListener('click', this.onClickCapture, true)
    this.host.removeEventListener('pointermove', this.onHover)
    this.host.classList.remove('map-grabbing', 'map-can-grab')
    this.canvas.remove()
  }
}

/** Load a script once; resolves when its global is ready. */
const loading = new Map<string, Promise<void>>()
export function loadScript(url: string, ready: (done: () => void, fail: (e: Error) => void) => void): Promise<void> {
  let p = loading.get(url)
  if (!p) {
    p = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script')
      s.src = url
      s.async = true
      s.onerror = () => reject(new Error(`script ${url}`))
      document.head.appendChild(s)
      ready(resolve, reject)
    })
    p.catch(() => loading.delete(url))
    loading.set(url, p)
  }
  return p
}
