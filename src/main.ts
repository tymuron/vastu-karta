import './style.css'
import { BRAND, LINKS } from './config'
import { bearing, centroid, distance, longestEdgeAngle, norm360, type Pt } from './geo'
import { escapeHtml, resolvePlace, reverseAddress, searchPlaces, startView, type LatLng, type Place } from './mapkit'
import type { GeoMap, Grabber, MapKind, View } from './maps/base'
import { FreeMap, type FreeText } from './maps/free'
import { pdfToDataUrl } from './pdf'
import { CONTOUR, drawResult, type Layers } from './result'
import { kvClear, kvGet, kvSet } from './store'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
/** Keep receiving a finger's moves outside the element; some browsers refuse, which is harmless. */
const capture = (el: Element, id: number) => {
  try {
    el.setPointerCapture(id)
  } catch {
    /* not capturable */
  }
}
const phone = () => matchMedia('(max-width: 900px)').matches

// ───────────────────────────── state ─────────────────────────────

const STEPS = ['Upload plan', 'Outline', 'Your building', 'Window wall', 'Rotate plan', 'Vastu Map']
const LAST = STEPS.length
const RED = '#C0392B'
const LAYER_IDS = ['togS', 'togA', 'togB', 'togBShape', 'togBindu', 'togFlow', 'togEl', 'togDev']

let step = 1
let img: HTMLImageElement | null = null
let pts: Pt[] = []
let closed = false
let center: Pt = { x: 0, y: 0 }

let pin: LatLng | null = null // the visitor's building
let mapView: { center: LatLng; zoom: number } | null = null
let baselineAz: number | null = null
let blPts: LatLng[] = [] // the wall with the windows: empty or two points
let draftPts: LatLng[] = [] // a wall being marked right now

let rot = 0 // clockwise turn of the plan that puts north straight up
let rotTouched = false
let autoRotDone = false
let planTrans = 0.82
let planCenter: LatLng | null = null
let planScale = 1 // the «Plan size» slider, × the size matched to the marked wall
let opacity = 0.55

const cv = $<HTMLCanvasElement>('cv')
const ctx = cv.getContext('2d')!

// ───────────────────────────── links ─────────────────────────────

document.querySelectorAll<HTMLAnchorElement>('[data-link]').forEach((a) => {
  const url = LINKS[a.dataset.link as keyof typeof LINKS]
  if (url) a.href = url
})
if (LINKS.videoGuide) {
  const v = $<HTMLAnchorElement>('videoLink')
  v.href = LINKS.videoGuide
  v.hidden = false
}

// ───────────────────────────── navigation ─────────────────────────────

/** Why the visitor can't go past step `t` yet, or null. */
function blocker(t: number): string | null {
  if (t > 1 && !img) return 'Upload a floor plan first'
  if (t > 2 && !closed) return 'Trace every corner and close the outline first'
  if (t > 3 && !pin) return 'Mark your building first: search for the address or tap the building on the map'
  if (t > 4 && blPts.length !== 2) return 'Mark the two corners of the window wall on the map'
  return null
}

function goto(t: number, quiet = false) {
  if (t < 1 || t > LAST) return
  const why = blocker(t)
  if (why) {
    if (quiet) return
    if (step === 1) flashUploadHint(why)
    else nudge(why)
    return
  }
  step = t
  endNudge() // a warning about the previous step is over

  document.querySelectorAll<HTMLElement>('.step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === t)
    el.classList.toggle('done', i + 1 < t)
  })
  document.querySelectorAll<HTMLElement>('.pane').forEach((el, i) => el.classList.toggle('active', i + 1 === t))
  $('mStepNum').textContent = String(t).padStart(2, '0')
  $('mStepLabel').textContent = STEPS[t - 1]
  $('mStepTotal').textContent = `step ${t} of ${LAST}`
  $('sidebarBody').scrollTo(0, 0)

  // phones: the working steps fit one screen — the plan or map on top, a few buttons under it
  document.body.dataset.step = String(t)
  document.body.classList.toggle('fit', t >= 2 && t <= 5)
  if (document.body.classList.contains('fit')) window.scrollTo(0, 0)

  $('cpanel').hidden = !(t <= 2 || t === LAST)
  $('mpanel').hidden = !(t === 3 || t === 4)
  $('rppanel').hidden = t !== 5
  $('cpanel').classList.toggle('tracing', t === 2)
  $('zoomCtl').hidden = t !== 2 || !img
  $('mbar').hidden = t !== 3
  sd.hidden = true
  resetView()

  if (t <= 2 && img) {
    fitCanvas()
    drawContour()
  }
  if (t === 3 || t === 4) enterMap()
  if (t === 5) enterRotate()
  if (t === LAST) {
    fitCanvas()
    renderResult()
  }

  $<HTMLButtonElement>('prevBtn').disabled = t === 1
  $('nextBtn').textContent = t === LAST ? 'Save PNG' : 'Next →'
  updateGuide()
  scheduleSave()
}

$('prevBtn').addEventListener('click', () => goto(step - 1))
$('nextBtn').addEventListener('click', () => (step === LAST ? savePng() : goto(step + 1)))

// ── the instruction strip written over the plan / map ──

const guide = $('guide')
let nudgeTimer = 0

function guideFor(): string {
  if (step === 2 && img) {
    if (closed) return 'Outline closed. Drag any point that sits off its corner'
    if (!pts.length) return 'Tap the first corner of your home, then go round along the outer walls'
    if (pts.length < 3) return 'Tap the next corner'
    return 'Go round every corner, then tap the first point to close the outline'
  }
  if (step === 3) {
    return pin
      ? 'Pin not on your building? Drag it or tap the right one. If it is, tap Next'
      : 'Type your address and pick your building from the list, or just tap your building on the map'
  }
  if (step === 4) {
    if (draftPts.length === 1) return 'Now tap the other corner of the same wall'
    if (blPts.length === 2) return 'Wall marked ✓ Missed? Just mark the two corners again'
    return 'Tap one corner of the wall your windows are in'
  }
  if (step === 5) return 'Turn the plan until the window wall lies on the red line'
  return ''
}

function endNudge() {
  clearTimeout(nudgeTimer)
  nudgeTimer = 0
}

function updateGuide() {
  if (nudgeTimer) return
  const text = guideFor()
  $('guideText').textContent = text
  guide.hidden = !text
  guide.classList.remove('warn')
}

/** On step 1 the stage may be hidden (phones), so the reason goes under the upload box. */
function flashUploadHint(text: string) {
  const hint = $('uploadHint')
  hint.textContent = text
  hint.classList.remove('ok', 'warn')
  void hint.offsetWidth
  hint.classList.add('warn')
}

/** Say briefly, on the map itself, why «Next» didn't go on. */
function nudge(text: string) {
  clearTimeout(nudgeTimer)
  $('guideText').textContent = text
  guide.hidden = false
  guide.classList.remove('warn')
  void guide.offsetWidth // restart the shake
  guide.classList.add('warn')
  nudgeTimer = window.setTimeout(() => {
    nudgeTimer = 0
    updateGuide()
  }, 3500)
}

// ───────────────────────────── 1 · upload (images and PDF) ─────────────────────────────

const uz = $('uploadZone')

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = reject
    im.src = src
  })

async function loadFile(file?: File | null) {
  if (!file) return
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
  if (!isPdf && !file.type.startsWith('image/')) return
  const hint = $('uploadHint')
  let src: string
  try {
    if (isPdf) {
      hint.textContent = 'Opening the PDF…'
      hint.classList.remove('ok')
      src = await pdfToDataUrl(file)
    } else src = await readAsDataUrl(file)
    await showPlan(src)
  } catch {
    hint.textContent = "Couldn't open this file. Try a photo or a screenshot of the plan."
    hint.classList.remove('ok')
    return
  }
  resetPts()
  rotTouched = false
  autoRotDone = false
  planCenter = null
  planScale = 1
  kvSet('plan', src)
  goto(2)
}

/** Put a plan picture on the stage. */
async function showPlan(src: string) {
  const im = await loadImage(src)
  img = im
  cv.width = im.naturalWidth
  cv.height = im.naturalHeight
  $('emptyMsg').hidden = true
  $('cwrap').hidden = false
  document.body.classList.remove('no-plan')
  $('restartBtn').hidden = false
  const hint = $('uploadHint')
  hint.textContent = 'Plan uploaded.'
  hint.classList.add('ok')
}

uz.addEventListener('dragover', (e) => {
  e.preventDefault()
  uz.classList.add('drag')
})
uz.addEventListener('dragleave', () => uz.classList.remove('drag'))
uz.addEventListener('drop', (e) => {
  e.preventDefault()
  uz.classList.remove('drag')
  loadFile(e.dataTransfer?.files[0])
})
$<HTMLInputElement>('fileInput').addEventListener('change', (e) => {
  const input = e.target as HTMLInputElement
  loadFile(input.files?.[0])
  input.value = ''
})
$('restartBtn').addEventListener('click', async () => {
  await kvClear()
  location.reload()
})

/** Show the canvas at the largest size that fits the stage (never enlarged past 100 %). */
function fitCanvas() {
  if (!img) return
  const panel = $('cpanel')
  const pad = phone() ? 24 : 40
  const w = Math.max(panel.clientWidth - pad, 120)
  const h = Math.max(panel.clientHeight - pad, 120)
  const s = Math.min(w / cv.width, h / cv.height, 1)
  cv.style.width = `${Math.round(cv.width * s)}px`
  cv.style.height = `${Math.round(cv.height * s)}px`
}

/** Image pixels per on-screen pixel — keeps lines and labels the same size on screen. */
const dispScale = () => cv.width / (cv.getBoundingClientRect().width || cv.width)

// ───────────────────────────── 2 · outline ─────────────────────────────

let hover: Pt | null = null

function resetPts() {
  pts = []
  closed = false
  center = { x: 0, y: 0 }
  updContUI()
}

function updContUI() {
  $('ptCount').textContent = String(pts.length)
  $('closedSt').textContent = closed ? 'Yes' : 'No'
  $<HTMLButtonElement>('undoBtn').disabled = pts.length === 0
  $<HTMLButtonElement>('resetBtn').disabled = pts.length === 0
  $<HTMLButtonElement>('closeBtn').disabled = pts.length < 3
  if (step === 2) updateGuide()
}

function drawContour() {
  if (!img) return
  const k = dispScale()
  ctx.clearRect(0, 0, cv.width, cv.height)
  ctx.drawImage(img, 0, 0, cv.width, cv.height)
  if (!pts.length) return
  ctx.save()
  ctx.lineJoin = 'round'
  ctx.strokeStyle = CONTOUR
  ctx.lineWidth = 2 * k
  ctx.setLineDash(closed ? [] : [5 * k, 4 * k])
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  if (closed) ctx.closePath()
  ctx.stroke()
  ctx.setLineDash([])

  if (!closed && hover && step === 2) {
    const last = pts[pts.length - 1]
    ctx.setLineDash([5 * k, 4 * k])
    ctx.strokeStyle = '#E53935'
    ctx.lineWidth = 1.2 * k
    ctx.beginPath()
    ctx.moveTo(last.x, last.y)
    ctx.lineTo(hover.x, hover.y)
    ctx.stroke()
    ctx.setLineDash([])
    if (pts.length >= 3 && Math.hypot(hover.x - pts[0].x, hover.y - pts[0].y) < 12 * k) {
      ctx.beginPath()
      ctx.arc(pts[0].x, pts[0].y, 9 * k, 0, 2 * Math.PI)
      ctx.stroke()
    }
  }
  if (!closed) {
    pts.forEach((p, i) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, (i ? 6 : 8) * k, 0, 2 * Math.PI)
      ctx.fillStyle = '#E53935'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 1.5 * k
      ctx.stroke()
    })
  } else if (step === 2) {
    // back on this step with a closed contour: small handles, still draggable
    pts.forEach((p) => {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 4.5 * k, 0, 2 * Math.PI)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = CONTOUR
      ctx.lineWidth = 1.5 * k
      ctx.stroke()
    })
  }
  ctx.restore()
}

function doClose() {
  if (pts.length < 3 || closed) return
  closed = true
  hover = null
  center = centroid(pts)
  updContUI()
  drawContour()
  scheduleSave()
  setTimeout(() => step === 2 && goto(3), 300)
}

function undo() {
  if (closed) closed = false
  else pts.pop()
  updContUI()
  drawContour()
  scheduleSave()
}

const toImage = (x: number, y: number): Pt => {
  const r = cv.getBoundingClientRect()
  return {
    x: clamp(((x - r.left) * cv.width) / r.width, 0, cv.width),
    y: clamp(((y - r.top) * cv.height) / r.height, 0, cv.height),
  }
}

/** Index of the corner under the finger / cursor, or −1. */
function hitPoint(x: number, y: number): number {
  const r = cv.getBoundingClientRect()
  const tol = matchMedia('(pointer: coarse)').matches ? 24 : 14
  let best = -1
  let bestD = tol * tol
  pts.forEach((p, i) => {
    const dx = r.left + (p.x * r.width) / cv.width - x
    const dy = r.top + (p.y * r.height) / cv.height - y
    const d = dx * dx + dy * dy
    if (d <= bestD) {
      best = i
      bestD = d
    }
  })
  return best
}

// ── zoom and pan of the plan while tracing ──

const cwrap = $('cwrap')
let zoom = 1
let pan = { x: 0, y: 0 }
const MAX_ZOOM = 8

function applyView() {
  cwrap.style.transform = zoom === 1 ? '' : `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`
  $<HTMLButtonElement>('zoomOut').disabled = zoom <= 1
  $<HTMLButtonElement>('zoomReset').disabled = zoom <= 1
  $<HTMLButtonElement>('zoomIn').disabled = zoom >= MAX_ZOOM
}

function resetView() {
  zoom = 1
  pan = { x: 0, y: 0 }
  applyView()
}

/** Keep the zoomed plan covering its own footprint, so it can't be lost off-screen. */
function clampPan() {
  const w = cwrap.offsetWidth
  const h = cwrap.offsetHeight
  pan = { x: clamp(pan.x, w - w * zoom, 0), y: clamp(pan.y, h - h * zoom, 0) }
}

/** Zoom so that the plan point under (x, y) — taken from `from` — ends up under (x2, y2). */
function zoomTo(next: number, x: number, y: number, from = { zoom, pan }, x2 = x, y2 = y) {
  const r = cwrap.getBoundingClientRect()
  const ox = r.left - pan.x // untransformed position of the plan
  const oy = r.top - pan.y
  const ux = (x - ox - from.pan.x) / from.zoom
  const uy = (y - oy - from.pan.y) / from.zoom
  zoom = clamp(next, 1, MAX_ZOOM)
  pan = { x: x2 - ox - zoom * ux, y: y2 - oy - zoom * uy }
  if (zoom === 1) pan = { x: 0, y: 0 }
  clampPan()
  applyView()
  drawContour()
}

function zoomAtCenter(factor: number) {
  const r = $('cpanel').getBoundingClientRect()
  zoomTo(zoom * factor, r.left + r.width / 2, r.top + r.height / 2)
}
$('zoomIn').addEventListener('click', () => zoomAtCenter(1.6))
$('zoomOut').addEventListener('click', () => zoomAtCenter(1 / 1.6))
$('zoomReset').addEventListener('click', () => {
  resetView()
  drawContour()
})
$('cpanel').addEventListener(
  'wheel',
  (e) => {
    if (step !== 2 || !img) return
    e.preventDefault()
    zoomTo(zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY)
  },
  { passive: false },
)

// ── taps, corner drags, pans and pinches on the plan ──

type Gesture =
  | { kind: 'tap' | 'pan' | 'none'; sx: number; sy: number; moved: boolean; pan0: { x: number; y: number }; touch: boolean }
  | { kind: 'point'; index: number; sx: number; sy: number; moved: boolean }
  | { kind: 'pinch'; zoom0: number; pan0: { x: number; y: number }; dist0: number; mx: number; my: number }

const pointers = new Map<number, { x: number; y: number }>()
let gesture: Gesture | null = null

function startPinch() {
  const [a, b] = [...pointers.values()]
  gesture = {
    kind: 'pinch',
    zoom0: zoom,
    pan0: { ...pan },
    dist0: Math.max(Math.hypot(a.x - b.x, a.y - b.y), 1),
    mx: (a.x + b.x) / 2,
    my: (a.y + b.y) / 2,
  }
  hover = null
}

cv.addEventListener('pointerdown', (e) => {
  if (step !== 2 || !img) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  capture(cv, e.pointerId)
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pointers.size === 2) return startPinch()
  if (pointers.size > 2) return
  const i = hitPoint(e.clientX, e.clientY)
  gesture =
    i >= 0
      ? { kind: 'point', index: i, sx: e.clientX, sy: e.clientY, moved: false }
      : { kind: 'tap', sx: e.clientX, sy: e.clientY, moved: false, pan0: { ...pan }, touch: e.pointerType !== 'mouse' }
})

cv.addEventListener('pointermove', (e) => {
  if (step !== 2 || !img) return
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (gesture?.kind === 'pinch') {
    if (pointers.size < 2) return
    const [a, b] = [...pointers.values()]
    const dist = Math.hypot(a.x - b.x, a.y - b.y)
    zoomTo((gesture.zoom0 * dist) / gesture.dist0, gesture.mx, gesture.my, { zoom: gesture.zoom0, pan: gesture.pan0 }, (a.x + b.x) / 2, (a.y + b.y) / 2)
    return
  }

  if (!gesture) {
    // plain hover (mouse): guide line, and a hand over a corner that can be dragged
    cv.style.cursor = hitPoint(e.clientX, e.clientY) >= 0 ? 'grab' : ''
    if (closed || !pts.length) return
    hover = toImage(e.clientX, e.clientY)
    drawContour()
    return
  }

  const dx = e.clientX - gesture.sx
  const dy = e.clientY - gesture.sy
  if (!gesture.moved && dx * dx + dy * dy < 25) return
  gesture.moved = true

  if (gesture.kind === 'point') {
    pts[gesture.index] = toImage(e.clientX, e.clientY)
    if (closed) center = centroid(pts)
    hover = null
    cv.style.cursor = 'grabbing'
    drawContour()
    return
  }
  if (gesture.kind === 'tap') {
    // a drag over empty plan pans when zoomed in; at 100 % a mouse click still counts, a finger swipe doesn't
    if (zoom > 1) gesture.kind = 'pan'
    else if (gesture.touch) gesture.kind = 'none'
  }
  if (gesture.kind === 'pan') {
    pan = { x: gesture.pan0.x + dx, y: gesture.pan0.y + dy }
    clampPan()
    applyView()
    cv.style.cursor = 'move'
  }
})

function endPointer(e: PointerEvent) {
  if (!pointers.delete(e.pointerId)) return
  const g = gesture
  if (!g) return
  if (g.kind === 'pinch') {
    // lifting one finger after a pinch must not drop a point
    gesture = pointers.size ? { kind: 'none', sx: 0, sy: 0, moved: true, pan0: { ...pan }, touch: true } : null
    scheduleSave()
    return
  }
  gesture = null
  cv.style.cursor = ''
  if (e.type === 'pointercancel') return

  if (g.kind === 'point') {
    if (g.moved) {
      drawContour()
      scheduleSave()
    } else if (g.index === 0 && pts.length >= 3 && !closed) doClose()
    return
  }
  if (g.kind === 'tap' && !closed) {
    pts.push(toImage(e.clientX, e.clientY))
    updContUI()
    drawContour()
    scheduleSave()
  }
}
cv.addEventListener('pointerup', endPointer)
cv.addEventListener('pointercancel', endPointer)
cv.addEventListener('pointerleave', () => {
  if (step !== 2 || closed || gesture) return
  hover = null
  drawContour()
})

$('undoBtn').addEventListener('click', undo)
$('resetBtn').addEventListener('click', () => {
  resetPts()
  drawContour()
  scheduleSave()
})
$('closeBtn').addEventListener('click', doClose)
document.addEventListener('keydown', (e) => {
  const t = e.target instanceof Element ? e.target : null
  if (step !== 2 || t?.closest('input[type="text"], textarea')) return
  // Enter on a focused button or link keeps its own meaning
  if (e.key === 'Enter' && !t?.closest('button, a, input, summary')) doClose()
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (pts.length) undo()
  }
})

// ───────────────────────────── 3 · your building · 4 · the wall with the windows ─────────────────────────────
// Free maps (OpenStreetMap / Esri). Our own marks — the house pin, the wall, later the plan and
// the red line — are drawn on one layer above the map.

let searchMap: GeoMap | null = null
let searchReady: Promise<GeoMap | null> | null = null
let pinCaption: string | undefined

async function makeMap(host: HTMLElement, kind: MapKind, view: View, full: boolean): Promise<GeoMap | null> {
  return new FreeMap(host, { view, kind, full }, FREE_TEXT)
}

const FREE_TEXT: FreeText = {
  scheme: 'Map',
  satellite: 'Satellite',
  hybrid: 'Hybrid',
  imagery: 'Imagery © Esri, Maxar, Earthstar Geographics',
  search: 'Address search © Esri',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  whereAmI: 'Where am I',
}

function initSearchMap(): Promise<GeoMap | null> {
  if (searchReady) return searchReady
  const view = mapView ?? (pin ? { center: pin, zoom: 18 } : startView())
  searchReady = makeMap($('searchMap'), 'scheme', view, true).then((m) => {
    searchMap = m
    if (!m) return null
    m.onDraw = drawSearchLayer
    m.grabber = pinGrabber(m)
    m.onIdle(() => {
      mapView = m.getView()
      scheduleSave()
    })
    m.onClick((ll) => {
      if (step === 3) setPin(ll)
      else if (step === 4) addWallPoint(ll)
    })
    return m
  })
  return searchReady
}

async function enterMap() {
  const at = step
  const m = await initSearchMap()
  if (!m || step !== at) return
  $('searchMap').classList.toggle('drawing', step === 4)
  setTimeout(() => {
    m.resize()
    if (step === 3 && !pin && !mapView) m.setView(startView())
    // on «Window wall», look at the house close enough to see its walls
    if (step === 4 && pin && (m.getView().zoom < 18 || !m.shows(pin))) m.setView({ center: pin, zoom: 19 })
    m.redraw()
  }, 60)
}

/** Street and house number only: «Carrer de Mallorca 401», «Rue de Rivoli, 12». */
function streetLine(address: string): string {
  const parts = address.split(',').map((x) => x.trim())
  return /\d/.test(parts[0]) || parts.length < 2 ? parts[0] : `${parts[0]}, ${parts[1]}`
}

const addrCaption = () => {
  const a = $('addrVal').textContent ?? ''
  return a && a !== '—' ? streetLine(a) : undefined
}

/** The pin can be dragged onto the exact house on «Your building». */
function pinGrabber(m: GeoMap): Grabber {
  let off = { x: 0, y: 0 }
  return {
    hit: (p) => {
      if (step !== 3 || !pin) return false
      const q = m.toPx(pin)
      return Math.hypot(q.x - p.x, q.y - p.y) <= 24
    },
    start: (p) => {
      const q = m.toPx(pin!)
      off = { x: q.x - p.x, y: q.y - p.y }
    },
    move: (p) => {
      pin = m.fromPx({ x: p.x + off.x, y: p.y + off.y })
      pinCaption = undefined
      m.redraw()
    },
    end: () => pin && setPin(pin),
  }
}

/** Put the house pin here; without an address, look the address up. */
function setPin(ll: LatLng, address?: string) {
  // a house far from the marked wall makes that wall meaningless
  if (blPts.length === 2 && distance(ll, midpoint(blPts)) > 150) clearWall()
  pin = ll
  planCenter = null
  if (address) {
    $('addrVal').textContent = address.split(',').slice(0, 3).join(',')
    pinCaption = streetLine(address)
  } else {
    $('addrVal').textContent = '—'
    pinCaption = undefined
    const asked = ll
    reverseAddress(ll).then((line) => {
      if (!line || pin !== asked) return
      $('addrVal').textContent = line.split(',').slice(0, 3).join(',')
      pinCaption = streetLine(line)
      searchMap?.redraw()
      scheduleSave()
    })
  }
  searchMap?.redraw()
  endNudge()
  updateGuide()
  scheduleSave()
}

const midpoint = (p: LatLng[]): LatLng => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]

/** A white chip with a label, the way the gold pin and the red line are captioned.
 *  Beside a point it sits on the right, or on the left where the map ends first. */
function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, centred = false) {
  ctx.save()
  ctx.font = "600 12px 'Vela Sans', 'Manrope', sans-serif"
  const mapW = ctx.canvas.width / ctx.getTransform().a
  while (text.length > 4 && ctx.measureText(text).width + 18 > mapW - 16) text = `${text.slice(0, -2).trimEnd()}…`
  const w = ctx.measureText(text).width + 18
  const h = 24
  const left = centred ? x - w / 2 : x + 15 + w > mapW - 8 ? x - 15 - w : x + 15
  ctx.shadowColor = 'rgba(0,0,0,.28)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 2
  ctx.fillStyle = 'rgba(255,255,255,.96)'
  ctx.beginPath()
  ctx.roundRect(left, y - h / 2, w, h, 3)
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = color
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 9, y + 0.5)
  ctx.restore()
}

/** The wall being marked or already marked, then the house pin above it. */
function drawSearchLayer(ctx: CanvasRenderingContext2D) {
  const m = searchMap
  if (!m) return
  const shown = draftPts.length ? draftPts : blPts
  const ps = shown.map((ll) => m.toPx(ll))
  ctx.save()
  if (ps.length === 2) {
    ctx.strokeStyle = CONTOUR
    ctx.lineWidth = 4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(ps[0].x, ps[0].y)
    ctx.lineTo(ps[1].x, ps[1].y)
    ctx.stroke()
  }
  ps.forEach((p) => {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 7, 0, 2 * Math.PI)
    ctx.fillStyle = CONTOUR
    ctx.fill()
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 2
    ctx.stroke()
  })
  if (pin) {
    const p = m.toPx(pin)
    ctx.shadowColor = 'rgba(0,0,0,.35)'
    ctx.shadowBlur = 8
    ctx.shadowOffsetY = 2
    ctx.beginPath()
    ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI)
    ctx.fillStyle = '#CABC90'
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.strokeStyle = '#422326'
    ctx.lineWidth = 3
    ctx.stroke()
    if (pinCaption) chip(ctx, pinCaption, p.x, p.y, '#422326')
  }
  ctx.restore()
}

function addWallPoint(ll: LatLng) {
  draftPts.push(ll)
  if (draftPts.length === 2) {
    blPts = draftPts
    draftPts = []
    baselineAz = bearing(blPts[0], blPts[1])
    autoRotDone = false
    planCenter = null
    planScale = 1
    showBaseline()
    scheduleSave()
  }
  searchMap?.redraw()
  endNudge()
  updateGuide()
}

function clearWall() {
  blPts = []
  draftPts = []
  baselineAz = null
  autoRotDone = false
  planCenter = null
  searchMap?.redraw()
  showBaseline()
}

function showBaseline() {
  const hint = $('blHint')
  if (baselineAz === null) {
    $('azVal').textContent = '—'
    hint.textContent = "This line shows which way your building's wall runs against the cardinal directions."
    hint.classList.remove('ok')
  } else {
    const az = `${Math.round(baselineAz)}°`
    $('azVal').textContent = az
    hint.textContent = `Window wall marked: its bearing is ${az}. On to the next step.`
    hint.classList.add('ok')
  }
  $<HTMLButtonElement>('blClear').disabled = baselineAz === null && !draftPts.length
}

$('blClear').addEventListener('click', () => {
  clearWall()
  updateGuide()
  scheduleSave()
})

// address search, with suggestions while typing (as on nativastu)
const si = $<HTMLInputElement>('msearch')
const sd = $('sdrop')
let sTimer = 0
let searchSeq = 0

async function doSearch(q: string, submitted = false) {
  if (!q) return
  const seq = ++searchSeq
  const m = await initSearchMap()
  if (!m || seq !== searchSeq) return
  // a whole country on screen says nothing about the street; a city does
  const near = m.getView().zoom >= 10 ? m.getBounds() : null
  try {
    const places = await searchPlaces(q, near, submitted)
    if (seq !== searchSeq) return
    if (!places.length) {
      sd.innerHTML = '<div class="si si-empty">Nothing found — tap your building on the map instead</div>'
    } else {
      sd.innerHTML = places
        .map((p, i) => `<button type="button" class="si" data-i="${i}">${escapeHtml(p.address)}</button>`)
        .join('')
      sd.querySelectorAll<HTMLButtonElement>('.si[data-i]').forEach((el) =>
        el.addEventListener('click', () => pickPlace(places[Number(el.dataset.i)])),
      )
    }
  } catch {
    if (seq !== searchSeq) return
    sd.innerHTML = "<div class=\"si si-empty\">Address search isn't working right now — find your building on the map and tap it</div>"
  }
  sd.hidden = false
}

async function pickPlace(place: Place) {
  sd.hidden = true
  si.value = place.address
  si.blur()
  const seq = ++searchSeq
  const ll = await resolvePlace(place)
  if (seq !== searchSeq) return
  if (!ll) {
    sd.innerHTML = "<div class=\"si si-empty\">Couldn't open that address — please try again</div>"
    sd.hidden = false
    return
  }
  searchMap?.setView({ center: ll, zoom: 19 })
  setPin(ll, place.address)
}

si.addEventListener('input', () => {
  clearTimeout(sTimer)
  const q = si.value.trim()
  if (q.length < 3) {
    searchSeq++
    sd.hidden = true
  } else sTimer = window.setTimeout(() => doSearch(q), 400)
})
si.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    clearTimeout(sTimer)
    doSearch(si.value.trim(), true)
  }
})
$('searchBtn').addEventListener('click', () => {
  clearTimeout(sTimer)
  doSearch(si.value.trim(), true)
})
document.addEventListener('click', (e) => {
  if (!(e.target instanceof Element && e.target.closest('.swrap'))) sd.hidden = true
})

// ───────────────────────────── 5 · rotate the plan over the map ─────────────────────────────

let rotMap: GeoMap | null = null
let rotReady: Promise<GeoMap | null> | null = null
let planMpp = 0.05 // metres per plan-image pixel

/** Metres per image pixel that make the plan's longest wall as long as the wall marked on the map. */
function matchedMpp(): number {
  if (!img || blPts.length !== 2) return 0.05
  let longest = 0
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    longest = Math.max(longest, Math.hypot(b.x - a.x, b.y - a.y))
  }
  const wall = distance(blPts[0], blPts[1])
  const side = Math.max(img.width, img.height)
  // keep the plan between 6 m and 400 m across, whatever was clicked
  return clamp(longest > 0 ? wall / longest : 0.05, 6 / side, 400 / side)
}

function initRotMap(): Promise<GeoMap | null> {
  if (rotReady) return rotReady
  const view = { center: pin ?? midpoint(blPts), zoom: 18 }
  rotReady = makeMap($('rpMap'), 'hybrid', view, false).then((m) => {
    // hybrid satellite, as the original does outside Russia
    rotMap = m
    if (!m) return null
    m.onDraw = drawRotateLayer
    m.grabber = planGrabber(m)
    return m
  })
  return rotReady
}

/** Points a given distance north, south, east and west of a centre. */
function around(c: LatLng, metres: number): LatLng[] {
  const dLat = metres / 111320
  const dLng = metres / (111320 * Math.cos((c[0] * Math.PI) / 180))
  return [
    [c[0] + dLat, c[1]],
    [c[0] - dLat, c[1]],
    [c[0], c[1] + dLng],
    [c[0], c[1] - dLng],
  ]
}

async function enterRotate() {
  if (!img || blPts.length !== 2) return
  const m = await initRotMap()
  if (!m || step !== 5) return
  if (!planCenter) planCenter = pin ?? midpoint(blPts)
  planMpp = matchedMpp() * planScale
  m.resize()
  // show the whole plan and the whole marked wall
  const across = Math.hypot(img.width, img.height) * planMpp
  m.fit([...blPts, ...around(planCenter, across / 2)], 24, 20)

  if (!rotTouched) rot = 0
  $<HTMLInputElement>('rotSlider').value = String(rot)
  if (baselineAz !== null && !autoRotDone) {
    autoRotDone = true
    autoAlign(true)
  } else showRotation()
  showSize()
  showTrans()
  setTimeout(() => {
    m.resize()
    m.redraw()
  }, 60)
}

/** On-screen size of one plan-image pixel. */
const planScreenScale = (m: GeoMap) => planMpp / m.metresPerPx()

/** The plan, then the red line on the real wall above it. */
function drawRotateLayer(ctx: CanvasRenderingContext2D) {
  const m = rotMap
  if (!m || !img || blPts.length !== 2) return
  if (planCenter) {
    const s = planScreenScale(m)
    const w = img.width * s
    const h = img.height * s
    const p = m.toPx(planCenter)
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate((rot * Math.PI) / 180)
    ctx.globalAlpha = planTrans
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, -w / 2, -h / 2, w, h)
    if (pts.length > 2) {
      ctx.globalAlpha = Math.min(1.5 * planTrans, 1)
      ctx.strokeStyle = CONTOUR
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

  // the red line lies on the real wall and runs on past both corners
  const a = m.toPx(blPts[0])
  const b = m.toPx(blPts[1])
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1
  const ux = (b.x - a.x) / len
  const uy = (b.y - a.y) / len
  const far = 2 * Math.max(m.host.clientWidth, m.host.clientHeight)
  ctx.save()
  ctx.strokeStyle = RED
  ctx.globalAlpha = 0.9
  ctx.lineWidth = 2.5
  ctx.setLineDash([10, 7])
  ctx.beginPath()
  ctx.moveTo(a.x - ux * far, a.y - uy * far)
  ctx.lineTo(b.x + ux * far, b.y + uy * far)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.restore()
  chip(ctx, 'window wall', (a.x + b.x) / 2, (a.y + b.y) / 2 - 20, RED, true)
}

/** Dragging the plan itself moves it over the building; dragging elsewhere pans the map. */
function planGrabber(m: GeoMap): Grabber {
  let off = { x: 0, y: 0 }
  return {
    hit: (p) => {
      if (!img || !planCenter) return false
      const c = m.toPx(planCenter)
      const a = (rot * Math.PI) / 180
      const dx = p.x - c.x
      const dy = p.y - c.y
      const ux = dx * Math.cos(a) + dy * Math.sin(a)
      const uy = -dx * Math.sin(a) + dy * Math.cos(a)
      const s = planScreenScale(m)
      return Math.abs(ux) <= (img.width * s) / 2 && Math.abs(uy) <= (img.height * s) / 2
    },
    start: (p) => {
      const c = m.toPx(planCenter!)
      off = { x: c.x - p.x, y: c.y - p.y }
    },
    move: (p) => {
      planCenter = m.fromPx({ x: p.x + off.x, y: p.y + off.y })
      m.redraw()
    },
    end: () => scheduleSave(),
  }
}

/** The building's tilt from the cardinal directions, folded into −45…+45°. */
function deviation() {
  let d = ((rot % 90) + 90) % 90
  if (d > 45) d -= 90
  return d
}
function deviationSigned() {
  const d = Math.round(deviation() * 10) / 10
  const sign = Math.abs(d) < 0.05 ? '' : d > 0 ? '+' : '−'
  return `${sign}${Math.abs(d).toFixed(1)}°`
}

function showRotation() {
  const txt = deviationSigned()
  $('rotDisp').textContent = txt
  $('devVal').textContent = txt
}

function setRot(v: number) {
  rot = Math.round(norm360(v) * 10) / 10
  rotTouched = true
  $<HTMLInputElement>('rotSlider').value = String(rot)
  showRotation()
  rotMap?.redraw()
  scheduleSave()
}

/** Lays the plan's longest wall along the marked wall, turning it as little as possible. */
function autoAlign(auto: boolean) {
  const hint = $('rotHint')
  if (baselineAz === null) {
    if (!auto) {
      hint.textContent = 'Mark the window wall on step 4 first.'
      hint.classList.remove('ok')
    }
    return
  }
  const target = baselineAz - 90 - longestEdgeAngle(pts)
  let best = 0
  let bestDiff = Infinity
  for (let q = 0; q < 4; q++) {
    const cand = norm360(target + 90 * q)
    const diff = Math.abs((((cand - rot) % 360) + 540) % 360 - 180)
    if (diff < bestDiff) {
      bestDiff = diff
      best = cand
    }
  }
  setRot(best)
  hint.textContent = `Deviation worked out from the window wall: ${deviationSigned()}. If the plan landed on the wrong wall, turn it with the ±90° buttons.`
  hint.classList.add('ok')
}

$('rotSlider').addEventListener('input', (e) => setRot(parseFloat((e.target as HTMLInputElement).value)))

// turn buttons; holding ±1° / ±0.1° keeps turning (and taps never zoom the page — see style.css)
document.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach((b) => {
  const delta = parseFloat(b.dataset.turn!)
  const turn = () => setRot(rot + delta)
  if (!b.hasAttribute('data-repeat')) {
    b.addEventListener('click', turn)
    return
  }
  let hold = 0
  let rep = 0
  const stop = () => {
    clearTimeout(hold)
    clearInterval(rep)
  }
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    e.preventDefault()
    stop()
    turn()
    hold = window.setTimeout(() => (rep = window.setInterval(turn, 70)), 420)
  })
  ;['pointerup', 'pointerleave', 'pointercancel'].forEach((t) => b.addEventListener(t, stop))
  b.addEventListener('click', (e) => e.detail === 0 && turn()) // keyboard
  b.addEventListener('contextmenu', (e) => e.preventDefault())
})

$('autoRotBtn').addEventListener('click', () => autoAlign(false))

function showSize() {
  $<HTMLInputElement>('sizeSlider').value = String(Math.round(Math.log2(planScale) * 100))
  $('sizeDisp').textContent = `${Math.round(planScale * 100)}%`
}
$('sizeSlider').addEventListener('input', (e) => {
  planScale = 2 ** (parseInt((e.target as HTMLInputElement).value, 10) / 100)
  showSize()
  planMpp = matchedMpp() * planScale
  rotMap?.redraw()
  scheduleSave()
})

function showTrans() {
  const pct = Math.round(planTrans * 100)
  $<HTMLInputElement>('transSlider').value = String(pct)
  $('transDisp').textContent = `${pct}%`
}
$('transSlider').addEventListener('input', (e) => {
  planTrans = parseInt((e.target as HTMLInputElement).value, 10) / 100
  showTrans()
  rotMap?.redraw()
  scheduleSave()
})
$('applyRotBtn').addEventListener('click', () => {
  showRotation()
  goto(LAST)
})
if (!phone()) $<HTMLDetailsElement>('rotMore').open = true

// ───────────────────────────── 6 · result ─────────────────────────────

const on = (id: string) => $<HTMLInputElement>(id).checked

function layers(): Layers {
  return {
    sectors: on('togS'),
    axes: on('togA'),
    brahma: on('togB'),
    brahmaShape: on('togBShape'),
    bindu: on('togBindu'),
    flow: on('togFlow'),
    elements: on('togEl'),
    deviation: on('togDev'),
  }
}

function resultInput() {
  return {
    img: img!,
    pts,
    center,
    rot,
    layers: layers(),
    opacity,
    deviationText: `Deviation ${deviationSigned()}`,
    handle: BRAND.handle,
  }
}

function renderResult() {
  if (!img || !closed) return
  const shares = drawResult(cv, resultInput(), dispScale())
  const legend = $('elLegend')
  if (shares) {
    legend.innerHTML = shares
      .map(
        (s) =>
          `<div class="leg"><span class="legc" style="background:${s.color}"></span><span class="leg-name">${s.name}</span><span class="leg-v">${s.pct.toFixed(1)}%</span></div>`,
      )
      .join('')
  }
}

/** Legends and the dimmed Brahmasthan rows follow the switches. */
function syncLayerUI() {
  $('flowLegend').hidden = !on('togFlow')
  $('elLegend').hidden = !on('togEl')
  // the element map is drawn without Brahmasthan / Brahmabindu
  ;['togB', 'togBShape', 'togBindu'].forEach((b) =>
    $<HTMLInputElement>(b).closest('.tog-row')!.classList.toggle('muted', on('togEl')),
  )
}

const EXCLUSIVE = ['togS', 'togFlow', 'togEl']
LAYER_IDS.forEach((id) => {
  const box = $<HTMLInputElement>(id)
  box.addEventListener('change', () => {
    // sectors, inflow/outflow and elements replace each other; one of them always stays on
    if (EXCLUSIVE.includes(id) && box.checked) EXCLUSIVE.forEach((o) => o !== id && ($<HTMLInputElement>(o).checked = false))
    if (EXCLUSIVE.includes(id) && !box.checked && !EXCLUSIVE.some(on)) box.checked = true
    // the two Brahmasthan variants replace each other too
    if (id === 'togBShape' && box.checked) $<HTMLInputElement>('togB').checked = false
    if (id === 'togB' && box.checked) $<HTMLInputElement>('togBShape').checked = false
    syncLayerUI()
    renderResult()
    scheduleSave()
  })
})

function showOpacity() {
  const pct = Math.round(opacity * 100)
  $<HTMLInputElement>('opSlider').value = String(pct)
  $('opDisp').textContent = `${pct}%`
}
$('opSlider').addEventListener('input', (e) => {
  opacity = parseInt((e.target as HTMLInputElement).value, 10) / 100
  showOpacity()
  renderResult()
  scheduleSave()
})

// ── save PNG: share sheet on phones (save to Photos), a download elsewhere ──

const isMobile = () =>
  /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

function savePng() {
  if (!img || !closed) return
  const s = Math.min(3, 3000 / Math.max(cv.width, cv.height))
  const out = document.createElement('canvas')
  out.width = Math.round(cv.width * s)
  out.height = Math.round(cv.height * s)
  drawResult(out, resultInput(), (out.width / cv.width) * dispScale())
  const mobile = isMobile()
  if (mobile && 'canShare' in navigator) {
    out.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], BRAND.fileName, { type: 'image/png' })
        try {
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] })
            return
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return
        }
      }
      saveFallback(out, true)
    }, 'image/png')
  } else saveFallback(out, mobile)
}

function saveFallback(out: HTMLCanvasElement, mobile: boolean) {
  const url = out.toDataURL('image/png')
  if (mobile) {
    $<HTMLImageElement>('saveImg').src = url
    const dl = $<HTMLAnchorElement>('saveDl')
    dl.href = url
    dl.download = BRAND.fileName
    $('saveModal').hidden = false
  } else {
    const a = document.createElement('a')
    a.href = url
    a.download = BRAND.fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

// ───────────────────────────── remember progress ─────────────────────────────
// The plan picture and every choice are kept in this browser only, so a refresh or an
// accidental swipe back doesn't lose the work. «Start over» on step 1 clears it.

interface Saved {
  v: 2
  /** when it was saved — progress older than 30 days is dropped */
  savedAt?: number
  step: number
  pts: Pt[]
  closed: boolean
  center: Pt
  pin: LatLng | null
  addr: string
  mapView: { center: LatLng; zoom: number } | null
  search: string
  baselineAz: number | null
  blPts: LatLng[]
  rot: number
  rotTouched: boolean
  autoRotDone: boolean
  planTrans: number
  planCenter: LatLng | null
  planScale: number
  opacity: number
  layers: Record<string, boolean>
}

let saveTimer = 0
let restoring = false

function snapshot(): Saved {
  return {
    v: 2,
    savedAt: Date.now(),
    step,
    pts,
    closed,
    center,
    pin,
    addr: $('addrVal').textContent ?? '—',
    mapView,
    search: si.value,
    baselineAz,
    blPts,
    rot,
    rotTouched,
    autoRotDone,
    planTrans,
    planCenter,
    planScale,
    opacity,
    layers: Object.fromEntries(LAYER_IDS.map((id) => [id, on(id)])),
  }
}

function saveNow() {
  clearTimeout(saveTimer)
  if (img && !restoring) kvSet('state', snapshot())
}
function scheduleSave() {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(saveNow, 300)
}
window.addEventListener('pagehide', saveNow)

async function restore() {
  const [plan, s] = await Promise.all([kvGet<string>('plan'), kvGet<Saved>('state')])
  if (!plan || !s || s.v !== 2) return
  if (s.savedAt && Date.now() - s.savedAt > 30 * 24 * 3600 * 1000) {
    await kvClear()
    return
  }
  restoring = true
  try {
    await showPlan(plan)
    pts = s.pts
    closed = s.closed && s.pts.length >= 3
    center = s.center
    updContUI()
    pin = s.pin
    $('addrVal').textContent = s.addr
    pinCaption = addrCaption()
    mapView = s.mapView
    si.value = s.search
    baselineAz = s.baselineAz
    blPts = s.blPts.length === 2 ? s.blPts : []
    if (!blPts.length) baselineAz = null
    showBaseline()
    rot = s.rot
    rotTouched = s.rotTouched
    autoRotDone = s.autoRotDone
    $<HTMLInputElement>('rotSlider').value = String(rot)
    showRotation()
    planTrans = s.planTrans
    planCenter = s.planCenter
    planScale = s.planScale || 1
    showTrans()
    showSize()
    opacity = s.opacity
    showOpacity()
    LAYER_IDS.forEach((id) => {
      if (id in s.layers) $<HTMLInputElement>(id).checked = s.layers[id]
    })
    syncLayerUI()
  } finally {
    restoring = false
  }
  // back to where they were — or to the first step that still needs something
  let t = s.step
  while (t > 1 && blocker(t)) t--
  goto(t, true)
}

// ───────────────────────────── modals ─────────────────────────────

$('privacyBtn').addEventListener('click', () => ($('modalPrivacy').hidden = false))
$('modalPrivacy').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) $('modalPrivacy').hidden = true
})
document.querySelectorAll<HTMLElement>('[data-close]').forEach((el) =>
  el.addEventListener('click', () => {
    $('modalPrivacy').hidden = true
    $('saveModal').hidden = true
  }),
)
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('modalPrivacy').hidden = true
    $('saveModal').hidden = true
  }
})

// ───────────────────────────── resize ─────────────────────────────

let resizeTimer = 0
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = window.setTimeout(() => {
    searchMap?.resize()
    rotMap?.resize()
    if ((step <= 2 || step === LAST) && img) {
      resetView()
      fitCanvas()
      if (step === LAST) renderResult()
      else drawContour()
    }
  }, 120)
})

// Canvas text needs the brand fonts loaded before the first result is drawn.
document.fonts
  ?.load("600 12px 'Vela Sans'")
  .then(() => Promise.all([document.fonts.load("500 13px 'Vela Sans'"), document.fonts.load("italic 500 18px 'Cormorant'")]))
  .then(() => {
    if (step === LAST) renderResult()
  })
  .catch(() => {})

goto(1)
restore().catch(() => {})
