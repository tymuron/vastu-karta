// Draws the finished Vastu map: the plan turned north-up, with the chosen layers on top.

import { area, elementShares, ELEMENT_COLORS, type ElementShare, type Pt } from './geo'

/** Traditional direction colours, N → NE → … → NW (45° each, N centred straight up). */
export const SECTOR_COLORS = ['#B2E0B2', '#FFE4B2', '#FFFFB2', '#FFECEF', '#FFB2B2', '#B2B2B2', '#B2B2E0', '#B2FFFF']
export const SECTOR_SHORT = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
export const FLOW_IN = [7, 0, 1, 2] // NW, N, NE, E
export const FLOW_OUT = [3, 4, 5, 6] // SE, S, SW, W
export const FLOW_IN_COLOR = '#8FC1E3'
export const FLOW_OUT_COLOR = '#8A6446'

const INK = '66,35,38' // burgundy #422326 as rgb
const GOLD = '202,188,144' // #CABC90
export const CONTOUR = '#8C2F3C'
const SANS = "'Vela Sans', 'Manrope', system-ui, sans-serif"
const SERIF = "'Cormorant', Georgia, serif"

export interface Layers {
  sectors: boolean
  axes: boolean
  brahma: boolean
  brahmaShape: boolean
  bindu: boolean
  flow: boolean
  elements: boolean
  deviation: boolean
}

export interface ResultInput {
  img: HTMLImageElement
  /** contour in image pixels */
  pts: Pt[]
  /** centre of gravity in image pixels */
  center: Pt
  /** clockwise turn (deg) that puts north straight up */
  rot: number
  layers: Layers
  /** fill strength of sectors / flow / elements, 0..1 */
  opacity: number
  deviationText: string
  handle: string
}

/**
 * Renders onto `canvas` (any size with the image's aspect ratio). `k` scales every
 * stroke and font so the drawing looks the same on screen and in the exported PNG.
 * Returns the element shares when that layer is on (for the sidebar legend).
 */
export function drawResult(canvas: HTMLCanvasElement, input: ResultInput, k: number): ElementShare[] | null {
  const ctx = canvas.getContext('2d')!
  const { img, pts, center, layers, opacity } = input
  const W = canvas.width
  const H = canvas.height
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, W, H)

  // Fit the turned plan into 88 % of the canvas.
  const rad = (input.rot * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  const ac = Math.abs(cos)
  const as = Math.abs(sin)
  const g = Math.min((0.88 * W) / (img.width * ac + img.height * as), (0.88 * H) / (img.width * as + img.height * ac))
  const pw = img.width * g
  const ph = img.height * g
  const ox = W / 2
  const oy = H / 2

  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.save()
  ctx.translate(ox, oy)
  ctx.rotate(rad)
  ctx.drawImage(img, -pw / 2, -ph / 2, pw, ph)
  ctx.restore()

  const tp = (p: Pt): Pt => {
    const nx = (p.x - img.width / 2) * g
    const ny = (p.y - img.height / 2) * g
    return { x: ox + nx * cos - ny * sin, y: oy + nx * sin + ny * cos }
  }
  const poly = pts.map(tp)
  const c = tp(center)
  const polyArea = area(poly)

  const UP = -Math.PI / 2
  const STEP = Math.PI / 4
  const R = 1.15 * Math.hypot(Math.max(c.x, W - c.x), Math.max(c.y, H - c.y))

  const tracePoly = (p: Pt[]) => {
    ctx.beginPath()
    p.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)))
    ctx.closePath()
  }
  const clipToFlat = () => {
    tracePoly(poly)
    ctx.clip()
  }
  const wedge = (i: number) => {
    const start = UP + i * STEP - STEP / 2
    ctx.beginPath()
    ctx.moveTo(c.x, c.y)
    ctx.arc(c.x, c.y, R, start, start + STEP)
    ctx.closePath()
  }

  // ── sectors ──
  if (layers.sectors) {
    ctx.save()
    ctx.globalAlpha = opacity
    clipToFlat()
    for (let i = 0; i < 8; i++) {
      wedge(i)
      ctx.fillStyle = SECTOR_COLORS[i]
      ctx.fill()
    }
    ctx.restore()
  }

  // ── inflow / outflow ──
  if (layers.flow) {
    ctx.save()
    ctx.globalAlpha = opacity
    clipToFlat()
    ctx.fillStyle = FLOW_IN_COLOR
    FLOW_IN.forEach((i) => {
      wedge(i)
      ctx.fill()
    })
    ctx.fillStyle = FLOW_OUT_COLOR
    FLOW_OUT.forEach((i) => {
      wedge(i)
      ctx.fill()
    })
    ctx.restore()
  }

  // ── five elements: quadrants around the centre + Space (Ether) square of 1/5 area ──
  let shares: ElementShare[] | null = null
  if (layers.elements) {
    const half = Math.sqrt(polyArea / 5) / 2
    shares = elementShares(poly, c, half)
    const byName: Record<string, number> = {}
    shares?.forEach((s) => (byName[s.name] = s.pct))

    ctx.save()
    ctx.globalAlpha = opacity
    clipToFlat()
    ctx.fillStyle = ELEMENT_COLORS.air
    ctx.fillRect(0, 0, c.x, c.y)
    ctx.fillStyle = ELEMENT_COLORS.water
    ctx.fillRect(c.x, 0, W - c.x, c.y)
    ctx.fillStyle = ELEMENT_COLORS.fire
    ctx.fillRect(c.x, c.y, W - c.x, H - c.y)
    ctx.fillStyle = ELEMENT_COLORS.earth
    ctx.fillRect(0, c.y, c.x, H - c.y)
    ctx.restore()

    ctx.save()
    clipToFlat()
    ctx.strokeStyle = `rgba(${INK},0.55)`
    ctx.lineWidth = 1.2 * k
    ctx.beginPath()
    ctx.moveTo(c.x, 0)
    ctx.lineTo(c.x, H)
    ctx.moveTo(0, c.y)
    ctx.lineTo(W, c.y)
    ctx.stroke()
    ctx.beginPath()
    ctx.rect(c.x - half, c.y - half, 2 * half, 2 * half)
    ctx.fillStyle = 'rgba(255,255,255,0.92)'
    ctx.fill()
    ctx.strokeStyle = `rgba(${INK},0.45)`
    ctx.lineWidth = k
    ctx.stroke()
    ctx.restore()

    const xs = poly.map((p) => p.x)
    const ys = poly.map((p) => p.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const spots: [string, number, number][] = [
      ['Air', (minX + c.x) / 2, (minY + c.y) / 2],
      ['Water', (c.x + maxX) / 2, (minY + c.y) / 2],
      ['Fire', (c.x + maxX) / 2, (c.y + maxY) / 2],
      ['Earth', (minX + c.x) / 2, (c.y + maxY) / 2],
    ]
    const label = (txt: string, x: number, y: number, size: number, weight: number, alpha: number) => {
      ctx.font = `${weight} ${Math.round(size * k)}px ${SANS}`
      ctx.lineWidth = 3.5 * k
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.strokeText(txt, x, y)
      ctx.fillStyle = `rgba(${INK},${alpha})`
      ctx.fillText(txt, x, y)
    }
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    spots.forEach(([name, x, y]) => {
      const pct = byName[name]
      label(name, x, y - (pct != null ? 9 * k : 0), 15, 500, 0.95)
      if (pct != null) label(`${pct.toFixed(1)}%`, x, y + 11 * k, 14, 600, 0.8)
    })
    label('Space', c.x, c.y - half * 0.8, 13, 500, 0.95)
    if (byName['Space'] != null) label(`${byName['Space'].toFixed(1)}%`, c.x, c.y + half * 0.8, 13, 600, 0.8)
    ctx.restore()
  }

  // ── axes and direction labels ──
  if (layers.axes) {
    ctx.save()
    clipToFlat()
    ctx.strokeStyle = `rgba(${INK},0.8)`
    ctx.lineWidth = 1.2 * k
    for (let i = 0; i < 8; i++) {
      const a = UP + i * STEP
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R)
      ctx.stroke()
    }
    ctx.restore()

    ctx.save()
    ctx.font = `600 ${Math.round(12 * k)}px ${SANS}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (let i = 0; i < 8; i++) {
      const a = UP + i * STEP
      const ax = Math.cos(a) * R
      const ay = Math.sin(a) * R
      // stop before the first wall the ray meets, so the label stays inside its own sector
      let lim = 0.85
      for (let q = 0; q < poly.length; q++) {
        const A = poly[q]
        const B = poly[(q + 1) % poly.length]
        const bx = B.x - A.x
        const by = B.y - A.y
        const den = ax * by - ay * bx
        if (Math.abs(den) < 1e-10) continue
        const t1 = ((A.x - c.x) * by - (A.y - c.y) * bx) / den
        const t2 = ((A.x - c.x) * ay - (A.y - c.y) * ax) / den
        if (t1 > 0.05 && t1 < lim + 0.01 && t2 >= 0 && t2 <= 1) lim = Math.min(lim, t1)
      }
      const lx = c.x + ax * lim * 0.82
      const ly = c.y + ay * lim * 0.82
      ctx.lineWidth = 3 * k
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'
      ctx.strokeText(SECTOR_SHORT[i], lx, ly)
      ctx.fillStyle = `rgba(${INK},0.95)`
      ctx.fillText(SECTOR_SHORT[i], lx, ly)
    }
    ctx.restore()
  }

  // ── Brahmasthan 1/9: energetic square, or the apartment's own shape scaled 1/3 ──
  const noBrahma = layers.elements // the element map is drawn without Brahmasthan / Brahmabindu
  const byShape = !noBrahma && layers.brahmaShape
  if (!noBrahma && (layers.brahma || byShape)) {
    ctx.save()
    if (byShape) {
      tracePoly(poly.map((p) => ({ x: c.x + (p.x - c.x) / 3, y: c.y + (p.y - c.y) / 3 })))
    } else {
      const side = Math.sqrt(polyArea / 9)
      ctx.beginPath()
      ctx.rect(c.x - side / 2, c.y - side / 2, side, side)
    }
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = k
    ctx.stroke()
    ctx.restore()
  }

  // ── Brahmabindu at real size: a circle of 1/9 of the Brahmasthan (1/81 of the flat) ──
  if (!noBrahma && layers.bindu) {
    const rb = Math.sqrt(polyArea / 81 / Math.PI)
    ctx.save()
    ctx.beginPath()
    ctx.arc(c.x, c.y, rb, 0, 2 * Math.PI)
    ctx.fillStyle = 'rgba(255,255,255,0.5)'
    ctx.fill()
    ctx.strokeStyle = `rgba(${GOLD},0.95)`
    ctx.lineWidth = 0.8 * k
    ctx.lineCap = 'round'
    const r0 = Math.min(6.5 * k, rb * 0.5)
    for (let q = 0; q < 24; q++) {
      const a = (q * 2 * Math.PI) / 24
      ctx.beginPath()
      ctx.moveTo(c.x + Math.cos(a) * r0, c.y + Math.sin(a) * r0)
      ctx.lineTo(c.x + Math.cos(a) * rb, c.y + Math.sin(a) * rb)
      ctx.stroke()
    }
    ctx.restore()
  }

  // ── centre point ──
  if (!noBrahma && (layers.brahma || layers.brahmaShape || layers.bindu)) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(c.x, c.y, 5 * k, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(${INK},0.8)`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(c.x, c.y, 2.5 * k, 0, 2 * Math.PI)
    ctx.fillStyle = `rgba(${GOLD},1)`
    ctx.fill()
    ctx.restore()
  }

  // ── contour ──
  ctx.save()
  ctx.strokeStyle = CONTOUR
  ctx.lineWidth = 2 * k
  ctx.lineJoin = 'round'
  tracePoly(poly)
  ctx.stroke()
  ctx.restore()

  // ── deviation caption ──
  if (layers.deviation) {
    ctx.save()
    ctx.font = `500 ${Math.round(13 * k)}px ${SANS}`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillStyle = `rgba(${INK},0.6)`
    ctx.fillText(input.deviationText, 16 * k, H - 14 * k)
    ctx.restore()
  }

  // ── signature ──
  ctx.save()
  ctx.font = `italic 500 ${Math.round(18 * k)}px ${SERIF}`
  ctx.fillStyle = `rgba(${INK},0.62)`
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.translate(Math.max(...poly.map((p) => p.x)) + 4 * k, Math.max(...poly.map((p) => p.y)) + 8 * k)
  ctx.rotate(-0.018)
  ctx.fillText(input.handle, 0, 0)
  ctx.restore()

  return shares
}
