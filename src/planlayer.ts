// The floor plan laid over the satellite map on the «Rotate plan» step. It is pinned to
// the ground (a centre point and a real size in metres), so it moves and scales with the map
// when people zoom or pan; dragging the plan itself moves it over the building.

import * as L from 'leaflet'
import type { Pt } from './geo'

const EARTH = 40075016.686 // metres around the equator

/** Metres per screen pixel at a zoom level and latitude (Web Mercator, 256 px tiles). */
export const metresPerPixel = (zoom: number, lat: number) => (EARTH * Math.cos((lat * Math.PI) / 180)) / (256 * 2 ** zoom)

export interface PlanLook {
  img: HTMLImageElement
  /** contour in image pixels */
  pts: Pt[]
  stroke: string
}

export class PlanLayer extends L.Layer {
  center: L.LatLng
  /** metres per image pixel — the plan's real-world size */
  mpp: number
  rot = 0
  alpha = 0.82
  onMoved?: () => void

  private canvas!: HTMLCanvasElement
  private topLeft!: L.LatLng
  private frame = 0
  private grab: { id: number; dx: number; dy: number } | null = null

  constructor(
    private look: PlanLook,
    center: L.LatLng,
    mpp: number,
  ) {
    super({ pane: 'planPane' })
    this.center = center
    this.mpp = mpp
  }

  onAdd(map: L.Map) {
    this.canvas = L.DomUtil.create('canvas', 'plan-layer leaflet-zoom-animated') as HTMLCanvasElement
    map.getPane('planPane')!.appendChild(this.canvas)
    L.DomEvent.on(this.canvas, 'pointerdown', this.onDown as L.DomEvent.EventHandlerFn, this)
    L.DomEvent.on(this.canvas, 'pointermove', this.onMove as L.DomEvent.EventHandlerFn, this)
    L.DomEvent.on(this.canvas, 'pointerup pointercancel', this.onUp as L.DomEvent.EventHandlerFn, this)
    // the map's own drag/pinch listen to mouse and touch events: hold them back while the plan is grabbed
    L.DomEvent.on(this.canvas, 'mousedown touchstart', this.guard as L.DomEvent.EventHandlerFn, this)
    this.reset()
    return this
  }

  onRemove() {
    cancelAnimationFrame(this.frame)
    this.canvas.remove()
    return this
  }

  getEvents(): { [name: string]: L.LeafletEventHandlerFn } {
    return {
      zoom: this.reset,
      viewreset: this.reset,
      resize: this.reset,
      move: this.schedule,
      zoomanim: this.animateZoom as L.LeafletEventHandlerFn,
    }
  }

  /** Size of one image pixel on screen at the current zoom. */
  private screenScale() {
    return this.mpp / metresPerPixel(this._map.getZoom(), this.center.lat)
  }

  redraw() {
    if (this._map) this.reset()
  }

  private schedule() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.reset())
  }

  // The canvas always covers the visible map; it is re-drawn as the view changes.
  private reset() {
    const map = this._map
    if (!map) return
    const size = map.getSize()
    const dpr = window.devicePixelRatio || 1
    const c = this.canvas
    if (c.width !== Math.round(size.x * dpr) || c.height !== Math.round(size.y * dpr)) {
      c.width = Math.round(size.x * dpr)
      c.height = Math.round(size.y * dpr)
      c.style.width = `${size.x}px`
      c.style.height = `${size.y}px`
    }
    L.DomUtil.setPosition(c, map.containerPointToLayerPoint([0, 0]))
    this.topLeft = map.containerPointToLatLng([0, 0])

    const ctx = c.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.x, size.y)
    const { img, pts, stroke } = this.look
    const s = this.screenScale()
    const w = img.width * s
    const h = img.height * s
    const p = map.latLngToContainerPoint(this.center)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate((this.rot * Math.PI) / 180)
    ctx.globalAlpha = this.alpha
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    if (pts.length > 2) {
      ctx.globalAlpha = Math.min(1.5 * this.alpha, 1)
      ctx.strokeStyle = stroke
      ctx.lineWidth = 2
      ctx.lineJoin = 'round'
      ctx.beginPath()
      pts.forEach((q, i) => {
        const x = q.x * s - w / 2
        const y = q.y * s - h / 2
        if (i) ctx.lineTo(x, y)
        else ctx.moveTo(x, y)
      })
      ctx.closePath()
      ctx.stroke()
    }
    ctx.restore()
  }

  private animateZoom(e: L.ZoomAnimEvent) {
    const map = this._map as L.Map & { _latLngToNewLayerPoint(ll: L.LatLng, z: number, c: L.LatLng): L.Point }
    L.DomUtil.setTransform(this.canvas, map._latLngToNewLayerPoint(this.topLeft, e.zoom, e.center), map.getZoomScale(e.zoom))
  }

  /** Is this screen point on the plan picture itself (not the empty corners around it)? */
  private hit(clientX: number, clientY: number) {
    const map = this._map
    const r = map.getContainer().getBoundingClientRect()
    const p = map.latLngToContainerPoint(this.center)
    const dx = clientX - r.left - p.x
    const dy = clientY - r.top - p.y
    const a = (this.rot * Math.PI) / 180
    const ux = dx * Math.cos(a) + dy * Math.sin(a)
    const uy = -dx * Math.sin(a) + dy * Math.cos(a)
    const s = this.screenScale()
    return Math.abs(ux) <= (this.look.img.width * s) / 2 && Math.abs(uy) <= (this.look.img.height * s) / 2
  }

  private onDown(e: PointerEvent) {
    if (this.grab || (e.pointerType === 'mouse' && e.button !== 0) || !e.isPrimary) return
    if (!this.hit(e.clientX, e.clientY)) return // not on the plan: let the map pan
    const p = this._map.latLngToContainerPoint(this.center)
    const r = this._map.getContainer().getBoundingClientRect()
    this.grab = { id: e.pointerId, dx: e.clientX - r.left - p.x, dy: e.clientY - r.top - p.y }
    try {
      this.canvas.setPointerCapture(e.pointerId)
    } catch {
      /* not capturable */
    }
    this.canvas.classList.add('grabbing')
    L.DomEvent.stopPropagation(e)
  }

  private guard(e: MouseEvent | TouchEvent) {
    if (!this.grab) return
    if ('touches' in e && e.touches.length > 1) {
      // a second finger means pinch: hand the gesture to the map
      this.grab = null
      this.canvas.classList.remove('grabbing')
      return
    }
    L.DomEvent.stopPropagation(e)
  }

  private onMove(e: PointerEvent) {
    if (!this.grab || e.pointerId !== this.grab.id) {
      if (e.pointerType === 'mouse' && !this.grab) this.canvas.style.cursor = this.hit(e.clientX, e.clientY) ? 'grab' : ''
      return
    }
    const r = this._map.getContainer().getBoundingClientRect()
    this.center = this._map.containerPointToLatLng([e.clientX - r.left - this.grab.dx, e.clientY - r.top - this.grab.dy])
    this.schedule()
  }

  private onUp(e: PointerEvent) {
    if (!this.grab || e.pointerId !== this.grab.id) return
    this.grab = null
    this.canvas.classList.remove('grabbing')
    this.onMoved?.()
  }
}
