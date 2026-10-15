import 'leaflet/dist/leaflet.css'
import './style.css'
import * as L from 'leaflet'
import { BRAND, LINKS } from './config'
import { bearing, centroid, longestEdgeAngle, norm360, type Pt } from './geo'
import {
  createBackdropMap,
  createSearchMap,
  escapeHtml,
  goldMarker,
  resolvePlace,
  reverseAddress,
  searchPlaces,
  type LatLng,
  type Place,
  type Region,
} from './mapkit'
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

// ───────────────────────────── state ─────────────────────────────

const STEP_LABELS = ['Загрузить план', 'Регион', 'Контур', 'Опорная линия', 'Повернуть план', 'Васту Карта']
const RED = '#C0392B'
const LAYER_IDS = ['togS', 'togA', 'togB', 'togBShape', 'togBindu', 'togFlow', 'togEl', 'togDev']

let step = 1
let img: HTMLImageElement | null = null
let pts: Pt[] = []
let closed = false
let center: Pt = { x: 0, y: 0 }
let region: Region = 'ru'

let mapCenter: LatLng = [55.751244, 37.618423]
let mapView: { center: LatLng; zoom: number } | null = null
let searchPin: { ll: LatLng; caption: string } | null = null
let baselineAz: number | null = null
let blPts: LatLng[] = [] // the reference line: empty or two points
let draftPts: LatLng[] = [] // a line being drawn right now
let drawingLine = false

let rot = 0 // clockwise turn of the plan that puts north straight up
let rotTouched = false
let autoRotDone = false
let planTrans = 0.82
let planPos = { x: 0, y: 0 }
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

function goto(t: number) {
  if (t < 1 || t > 6) return
  if (t > 1 && !img) return
  if (t > 3 && !closed) return
  step = t

  document.querySelectorAll<HTMLElement>('.step').forEach((el, i) => {
    el.classList.toggle('active', i + 1 === t)
    el.classList.toggle('done', i + 1 < t)
  })
  document.querySelectorAll<HTMLElement>('.pane').forEach((el, i) => el.classList.toggle('active', i + 1 === t))
  $('mStepNum').textContent = String(t).padStart(2, '0')
  $('mStepLabel').textContent = STEP_LABELS[t - 1]
  $('mStepTotal').textContent = `шаг ${t} из 6`
  $('sidebarBody').scrollTo(0, 0)

  $('cpanel').hidden = !(t <= 3 || t === 6)
  $('mpanel').hidden = t !== 4
  $('rppanel').hidden = t !== 5
  $('cpanel').classList.toggle('tracing', t === 3)
  $('zoomCtl').hidden = t !== 3 || !img
  resetView()

  if (t <= 3 && img) {
    fitCanvas()
    drawContour()
  }
  if (t === 4) {
    initSearchMap()
    setTimeout(() => searchMap?.invalidateSize(), 50)
  }
  if (t === 5) initRotatePanel()
  if (t === 6) {
    fitCanvas()
    renderResult()
  }

  $<HTMLButtonElement>('prevBtn').disabled = t === 1
  $('nextBtn').textContent = t === 6 ? 'Сохранить PNG' : 'Далее →'
  scheduleSave()
}

$('prevBtn').addEventListener('click', () => goto(step - 1))
$('nextBtn').addEventListener('click', () => (step === 6 ? savePng() : goto(step + 1)))

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
      hint.textContent = 'Открываю PDF…'
      hint.classList.remove('ok')
      src = await pdfToDataUrl(file)
    } else src = await readAsDataUrl(file)
    await showPlan(src)
  } catch {
    hint.textContent = 'Не получилось открыть файл. Попробуйте фото или скриншот плана.'
    hint.classList.remove('ok')
    return
  }
  resetPts()
  rotTouched = false
  autoRotDone = false
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
  hint.textContent = 'План загружен.'
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
  const w = Math.max(panel.clientWidth - 40, 120)
  const h = Math.max(panel.clientHeight - 40, 120)
  const s = Math.min(w / cv.width, h / cv.height, 1)
  cv.style.width = `${Math.round(cv.width * s)}px`
  cv.style.height = `${Math.round(cv.height * s)}px`
}

/** Image pixels per on-screen pixel — keeps lines and labels the same size on screen. */
const dispScale = () => cv.width / (cv.getBoundingClientRect().width || cv.width)

// ───────────────────────────── 2 · region ─────────────────────────────

function showRegion() {
  $('btnRegionRu').classList.toggle('pri', region === 'ru')
  $('btnRegionAbroad').classList.toggle('pri', region === 'abroad')
}
function setRegion(r: Region) {
  region = r
  showRegion()
  goto(3)
}
$('btnRegionRu').addEventListener('click', () => setRegion('ru'))
$('btnRegionAbroad').addEventListener('click', () => setRegion('abroad'))

// ───────────────────────────── 3 · contour ─────────────────────────────

let hover: Pt | null = null

function resetPts() {
  pts = []
  closed = false
  center = { x: 0, y: 0 }
  updContUI()
}

function updContUI() {
  $('ptCount').textContent = String(pts.length)
  $('closedSt').textContent = closed ? 'Да' : 'Нет'
  $<HTMLButtonElement>('undoBtn').disabled = pts.length === 0
  $<HTMLButtonElement>('resetBtn').disabled = pts.length === 0
  $<HTMLButtonElement>('closeBtn').disabled = pts.length < 3
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

  if (!closed && hover && step === 3) {
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
  } else if (step === 3) {
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
  setTimeout(() => step === 3 && goto(4), 300)
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
    if (step !== 3 || !img) return
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
  if (step !== 3 || !img) return
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
  if (step !== 3 || !img) return
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
  if (step !== 3 || closed || gesture) return
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
  if (step !== 3 || t?.closest('input[type="text"], textarea')) return
  // Enter on a focused button or link keeps its own meaning
  if (e.key === 'Enter' && !t?.closest('button, a, input')) doClose()
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault()
    if (pts.length) undo()
  }
})

// ───────────────────────────── 4 · map + reference line ─────────────────────────────

let searchMap: L.Map | null = null
let lineLayer: L.LayerGroup | null = null
let searchMarker: L.Marker | null = null

/** The finished line, or the one being drawn (the old line stays until the first new point). */
function drawLine() {
  if (!lineLayer) return
  lineLayer.clearLayers()
  const shown = draftPts.length ? draftPts : blPts
  shown.forEach((ll) =>
    L.circleMarker(ll, { radius: 6, color: '#fff', weight: 2, fillColor: CONTOUR, fillOpacity: 1 }).addTo(lineLayer!),
  )
  if (shown.length === 2) L.polyline(shown, { color: CONTOUR, weight: 3, opacity: 1 }).addTo(lineLayer)
}

function initSearchMap() {
  if (searchMap) return
  searchMap = createSearchMap($('searchMap'), mapView?.center ?? mapCenter, mapView?.zoom ?? 16, 'scheme')
  lineLayer = L.layerGroup().addTo(searchMap)
  if (searchPin) searchMarker = goldMarker(searchPin.ll, searchPin.caption).addTo(searchMap)
  if (blPts.length === 2) {
    drawLine()
    if (!mapView) searchMap.fitBounds(L.latLngBounds(blPts), { maxZoom: 19, padding: [80, 80] })
  }
  searchMap.on('moveend', () => {
    const c = searchMap!.getCenter()
    mapView = { center: [c.lat, c.lng], zoom: searchMap!.getZoom() }
    scheduleSave()
  })
  searchMap.on('click', (e: L.LeafletMouseEvent) => {
    if (!drawingLine || !searchMap) return
    draftPts.push([e.latlng.lat, e.latlng.lng])
    if (draftPts.length === 2) {
      blPts = draftPts
      draftPts = []
    }
    drawLine()
    if (!draftPts.length) {
      baselineAz = bearing(blPts[0], blPts[1])
      autoRotDone = false
      showBaseline()
      const c = searchMap.getCenter()
      mapCenter = [c.lat, c.lng]
      const first = blPts[0]
      reverseAddress(first).then((line) => {
        if (line && blPts[0] === first) {
          $('addrVal').textContent = line
          scheduleSave()
        }
      })
      setDrawing(false)
      scheduleSave()
    }
  })
}

function showBaseline() {
  const hint = $('blHint')
  if (baselineAz === null) {
    $('azVal').textContent = '—'
    hint.textContent = 'Опорная линия показывает, как стоит стена вашего дома.'
    hint.classList.remove('ok')
  } else {
    const az = `${Math.round(baselineAz)}°`
    $('azVal').textContent = az
    hint.textContent = `Азимут опорной линии: ${az}. Переходите к шагу 5.`
    hint.classList.add('ok')
  }
  $<HTMLButtonElement>('blClear').disabled = baselineAz === null
}

function setDrawing(on: boolean) {
  drawingLine = on
  const b = $('blBtn')
  b.textContent = on ? 'Отметьте 2 точки…' : 'Задать линию'
  b.classList.toggle('on', on)
  $('searchMap').classList.toggle('drawing', on)
}

$('blBtn').addEventListener('click', () => {
  initSearchMap()
  draftPts = []
  drawLine()
  setDrawing(!drawingLine)
})

$('blClear').addEventListener('click', () => {
  blPts = []
  draftPts = []
  lineLayer?.clearLayers()
  baselineAz = null
  autoRotDone = false
  setDrawing(false)
  showBaseline()
  $('addrVal').textContent = '—'
  scheduleSave()
})

// address search, with suggestions while typing
const si = $<HTMLInputElement>('msearch')
const sd = $('sdrop')
let sTimer = 0
let searchSeq = 0

async function doSearch(q: string, submitted: boolean) {
  if (!q) return
  initSearchMap()
  const seq = ++searchSeq
  const c = searchMap!.getCenter()
  try {
    const places = await searchPlaces(q, region, [c.lat, c.lng], submitted)
    if (seq !== searchSeq) return
    if (!places.length) {
      sd.innerHTML = '<div class="si si-empty">Ничего не найдено</div>'
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
    sd.innerHTML = '<div class="si si-empty">Ошибка поиска — попробуйте ещё раз</div>'
  }
  sd.hidden = false
}

async function pickPlace(place: Place) {
  sd.hidden = true
  si.value = place.address
  const seq = ++searchSeq
  const p = await resolvePlace(place).catch(() => null)
  if (seq !== searchSeq || !searchMap) return
  if (!p) {
    sd.innerHTML = '<div class="si si-empty">Не удалось открыть адрес — попробуйте ещё раз</div>'
    sd.hidden = false
    return
  }
  const ll: LatLng = [p.lat, p.lng]
  searchMap.setView(ll, 19)
  searchMarker?.remove()
  searchPin = { ll, caption: p.address.split(',').slice(0, 2).join(',') }
  searchMarker = goldMarker(ll, searchPin.caption).addTo(searchMap)
  $('addrVal').textContent = p.address.split(',').slice(0, 3).join(',')
  mapCenter = ll
  scheduleSave()
}

si.addEventListener('input', () => {
  clearTimeout(sTimer)
  const q = si.value.trim()
  if (q.length < 3) {
    searchSeq++
    sd.hidden = true
  } else sTimer = window.setTimeout(() => doSearch(q, false), 400)
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

const rotCanvas = $<HTMLCanvasElement>('rotCanvas')
const rotCtx = rotCanvas.getContext('2d')!
const baseCanvas = $<HTMLCanvasElement>('baselineCanvas')
let backdrop: L.Map | null = null
let backdropRegion: Region | null = null
let backdropMarker: L.Marker | null = null
let stageW = 0
let stageH = 0

function sizeStage() {
  const wrap = $('rpwrap')
  const dpr = window.devicePixelRatio || 1
  const oldW = stageW
  const oldH = stageH
  stageW = wrap.clientWidth
  stageH = wrap.clientHeight
  for (const c of [rotCanvas, baseCanvas]) {
    c.width = Math.round(stageW * dpr)
    c.height = Math.round(stageH * dpr)
    c.style.width = `${stageW}px`
    c.style.height = `${stageH}px`
    c.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  if (oldW && oldH) planPos = { x: (planPos.x * stageW) / oldW, y: (planPos.y * stageH) / oldH }
}

function initRotatePanel() {
  if (!img) return
  sizeStage()
  planPos = { x: stageW / 2, y: stageH / 2 }
  if (!rotTouched) rot = 0

  // Russia → satellite, abroad → hybrid (as on the original)
  const kind = region === 'ru' ? 'satellite' : 'hybrid'
  if (backdrop && backdropRegion !== region) {
    backdrop.remove()
    backdrop = null
  }
  if (!backdrop) {
    backdrop = createBackdropMap($('rpMap'), mapCenter, 17, kind)
    backdropRegion = region
  } else {
    backdrop.invalidateSize()
    backdrop.setView(mapCenter, 17, { animate: false })
  }
  backdropMarker?.remove()
  backdropMarker = goldMarker(mapCenter).addTo(backdrop)
  setTimeout(() => backdrop?.invalidateSize(), 50)

  $<HTMLInputElement>('rotSlider').value = String(rot)
  if (baselineAz !== null && !autoRotDone) {
    autoRotDone = true
    autoAlign(true)
  } else {
    showRotation()
    drawPlan()
  }
  drawBaseline()
}

function drawPlan() {
  if (!img || !stageW) return
  rotCtx.clearRect(0, 0, stageW, stageH)
  rotCtx.save()
  const rad = (rot * Math.PI) / 180
  const ac = Math.abs(Math.cos(rad))
  const as = Math.abs(Math.sin(rad))
  const s = Math.min((0.9 * stageW) / (img.width * ac + img.height * as), (0.9 * stageH) / (img.width * as + img.height * ac))
  const w = img.width * s
  const h = img.height * s
  rotCtx.globalAlpha = planTrans
  rotCtx.translate(planPos.x, planPos.y)
  rotCtx.rotate(rad)
  rotCtx.drawImage(img, -w / 2, -h / 2, w, h)
  if (closed && pts.length) {
    const sx = w / cv.width
    const sy = h / cv.height
    rotCtx.globalAlpha = Math.min(1.5 * planTrans, 1)
    rotCtx.strokeStyle = CONTOUR
    rotCtx.lineWidth = 2
    rotCtx.lineJoin = 'round'
    rotCtx.beginPath()
    pts.forEach((p, i) => {
      const x = p.x * sx - w / 2
      const y = p.y * sy - h / 2
      if (i) rotCtx.lineTo(x, y)
      else rotCtx.moveTo(x, y)
    })
    rotCtx.closePath()
    rotCtx.stroke()
  }
  rotCtx.restore()
}

function drawBaseline() {
  const c = baseCanvas.getContext('2d')!
  c.clearRect(0, 0, stageW, stageH)
  if (baselineAz === null) return
  const a = ((baselineAz - 90) * Math.PI) / 180
  const cx = stageW / 2
  const cy = stageH / 2
  const d = 0.8 * Math.max(stageW, stageH)
  c.save()
  c.strokeStyle = RED
  c.lineWidth = 2.5
  c.setLineDash([10, 6])
  c.globalAlpha = 0.9
  c.beginPath()
  c.moveTo(cx - Math.cos(a) * d, cy - Math.sin(a) * d)
  c.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d)
  c.stroke()
  c.setLineDash([])
  c.globalAlpha = 1
  c.font = "500 12px 'Vela Sans', 'Manrope', sans-serif"
  c.textAlign = 'left'
  c.textBaseline = 'bottom'
  c.lineJoin = 'round'
  c.lineWidth = 3.5
  c.strokeStyle = 'rgba(255,255,255,0.9)'
  c.strokeText('стена с окнами', cx + 12, cy - 6)
  c.fillStyle = RED
  c.fillText('стена с окнами', cx + 12, cy - 6)
  c.restore()
}

// drag the plan to lay it over the building
let drag: { dx: number; dy: number; id: number } | null = null
rotCanvas.addEventListener('pointerdown', (e) => {
  const r = rotCanvas.getBoundingClientRect()
  drag = { dx: e.clientX - r.left - planPos.x, dy: e.clientY - r.top - planPos.y, id: e.pointerId }
  capture(rotCanvas, e.pointerId)
  rotCanvas.classList.add('grabbing')
})
rotCanvas.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return
  const r = rotCanvas.getBoundingClientRect()
  planPos = { x: e.clientX - r.left - drag.dx, y: e.clientY - r.top - drag.dy }
  drawPlan()
})
const endDrag = () => {
  drag = null
  rotCanvas.classList.remove('grabbing')
}
rotCanvas.addEventListener('pointerup', endDrag)
rotCanvas.addEventListener('pointercancel', endDrag)

/** The building's tilt from the cardinal directions, folded into −45…+45°. */
function deviation() {
  let d = ((rot % 90) + 90) % 90
  if (d > 45) d -= 90
  return d
}
function deviationSigned() {
  const d = Math.round(deviation() * 10) / 10
  const sign = Math.abs(d) < 0.05 ? '' : d > 0 ? '+' : '−'
  return `${sign}${Math.abs(d).toFixed(1).replace('.', ',')}°`
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
  drawPlan()
  scheduleSave()
}

/** Lays the plan's longest wall along the reference line, turning it as little as possible. */
function autoAlign(auto: boolean) {
  const hint = $('rotHint')
  if (baselineAz === null) {
    if (!auto) {
      hint.textContent = 'Сначала задайте опорную линию на шаге 4.'
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
  hint.textContent = `Отклонение рассчитано по опорной линии: ${deviationSigned()}. Если план лёг не той стеной, доверните его слайдером или кнопками ±90°.`
  hint.classList.add('ok')
}

$('rotSlider').addEventListener('input', (e) => setRot(parseFloat((e.target as HTMLInputElement).value)))
document.querySelectorAll<HTMLButtonElement>('[data-turn]').forEach((b) =>
  b.addEventListener('click', () => setRot(rot + parseFloat(b.dataset.turn!))),
)
$('autoRotBtn').addEventListener('click', () => autoAlign(false))
function showTrans() {
  const pct = Math.round(planTrans * 100)
  $<HTMLInputElement>('transSlider').value = String(pct)
  $('transDisp').textContent = `${pct}%`
}
$('transSlider').addEventListener('input', (e) => {
  planTrans = parseInt((e.target as HTMLInputElement).value, 10) / 100
  showTrans()
  drawPlan()
  scheduleSave()
})
$('applyRotBtn').addEventListener('click', () => {
  showRotation()
  goto(6)
})

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
    deviationText: `Отклонение ${deviationSigned()}`,
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
          `<div class="leg"><span class="legc" style="background:${s.color}"></span><span class="leg-name">${s.name}</span><span class="leg-v">${s.pct.toFixed(1)} %</span></div>`,
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

// ── save PNG: share sheet on phones («Сохранить в Фото»), a download elsewhere ──

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
// accidental swipe back doesn't lose the work. «Начать заново» on step 1 clears it.

interface Saved {
  v: 1
  step: number
  region: Region
  pts: Pt[]
  closed: boolean
  center: Pt
  mapCenter: LatLng
  mapView: { center: LatLng; zoom: number } | null
  searchPin: { ll: LatLng; caption: string } | null
  search: string
  addr: string
  baselineAz: number | null
  blPts: LatLng[]
  rot: number
  rotTouched: boolean
  autoRotDone: boolean
  planTrans: number
  opacity: number
  layers: Record<string, boolean>
}

let saveTimer = 0
let restoring = false

function snapshot(): Saved {
  return {
    v: 1,
    step,
    region,
    pts,
    closed,
    center,
    mapCenter,
    mapView,
    searchPin,
    search: si.value,
    addr: $('addrVal').textContent ?? '—',
    baselineAz,
    blPts,
    rot,
    rotTouched,
    autoRotDone,
    planTrans,
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
  if (!plan || !s || s.v !== 1) return
  restoring = true
  try {
    await showPlan(plan)
    region = s.region
    showRegion()
    pts = s.pts
    closed = s.closed && s.pts.length >= 3
    center = s.center
    updContUI()
    mapCenter = s.mapCenter
    mapView = s.mapView
    searchPin = s.searchPin
    si.value = s.search
    $('addrVal').textContent = s.addr
    baselineAz = s.baselineAz
    blPts = s.blPts
    showBaseline()
    rot = s.rot
    rotTouched = s.rotTouched
    autoRotDone = s.autoRotDone
    $<HTMLInputElement>('rotSlider').value = String(rot)
    showRotation()
    planTrans = s.planTrans
    showTrans()
    opacity = s.opacity
    showOpacity()
    LAYER_IDS.forEach((id) => {
      if (id in s.layers) $<HTMLInputElement>(id).checked = s.layers[id]
    })
    syncLayerUI()
  } finally {
    restoring = false
  }
  goto(s.step)
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
    if (step === 4) searchMap?.invalidateSize()
    if (step === 5 && img) {
      sizeStage()
      backdrop?.invalidateSize()
      drawPlan()
      drawBaseline()
    }
    if ((step <= 3 || step === 6) && img) {
      resetView()
      fitCanvas()
      if (step === 6) renderResult()
      else drawContour()
    }
  }, 120)
})

// Canvas text needs the brand fonts loaded before the first result is drawn.
document.fonts
  ?.load("600 12px 'Vela Sans'")
  .then(() => Promise.all([document.fonts.load("500 13px 'Vela Sans'"), document.fonts.load("italic 500 18px 'Cormorant'")]))
  .then(() => {
    if (step === 6) renderResult()
    if (step === 5) drawBaseline()
  })
  .catch(() => {})

goto(1)
restore().catch(() => {})
