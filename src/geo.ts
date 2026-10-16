// Pure geometry. No DOM.

export interface Pt {
  x: number
  y: number
}

export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

/** Polygon area (always positive), shoelace formula. */
export function area(poly: Pt[]): number {
  if (poly.length < 3) return 0
  let a = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    a += p.x * q.y - q.x * p.y
  }
  return Math.abs(a / 2)
}

/** Area-weighted centroid — the apartment's centre of gravity, not the mean of its corners. */
export function centroid(poly: Pt[]): Pt {
  let a = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]
    const q = poly[(i + 1) % poly.length]
    const cross = p.x * q.y - q.x * p.y
    a += cross
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  a /= 2
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1
    return { x: poly.reduce((s, p) => s + p.x, 0) / n, y: poly.reduce((s, p) => s + p.y, 0) / n }
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Initial great-circle bearing from A to B, degrees clockwise from north. */
export function bearing(a: [number, number], b: [number, number]): number {
  const φ1 = (a[0] * Math.PI) / 180
  const φ2 = (b[0] * Math.PI) / 180
  const Δλ = ((b[1] - a[1]) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return norm360((Math.atan2(y, x) * 180) / Math.PI)
}

/** Screen angle (deg) of the longest wall of the contour. */
export function longestEdgeAngle(poly: Pt[]): number {
  let best = 0
  let bestLen = -1
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const len = Math.hypot(b.x - a.x, b.y - a.y)
    if (len > bestLen) {
      bestLen = len
      best = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
    }
  }
  return best
}

// ── Sutherland–Hodgman against axis-aligned half-planes (for the element shares) ──

function clipX(poly: Pt[], xv: number, keepLeft: boolean): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ai = keepLeft ? a.x <= xv : a.x >= xv
    const bi = keepLeft ? b.x <= xv : b.x >= xv
    if (ai) out.push(a)
    if (ai !== bi) out.push({ x: xv, y: a.y + ((xv - a.x) / (b.x - a.x)) * (b.y - a.y) })
  }
  return out
}

function clipY(poly: Pt[], yv: number, keepTop: boolean): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const ai = keepTop ? a.y <= yv : a.y >= yv
    const bi = keepTop ? b.y <= yv : b.y >= yv
    if (ai) out.push(a)
    if (ai !== bi) out.push({ x: a.x + ((yv - a.y) / (b.y - a.y)) * (b.x - a.x), y: yv })
  }
  return out
}

const clipRect = (poly: Pt[], l: number, r: number, t: number, b: number) =>
  clipY(clipY(clipX(clipX(poly, l, false), r, true), t, false), b, true)

export interface ElementShare {
  name: string
  color: string
  pct: number
}

export const ELEMENT_COLORS = { air: '#6FB1DA', water: '#2FB3A3', fire: '#ED8B3C', earth: '#9A6E43' }

/**
 * Share of the apartment's area per element. The four quadrants around the centre
 * are Air (NW), Water (NE), Fire (SE), Earth (SW); the central square of Space (Ether) holds
 * 1/5 of the area and is cut out of the quadrants. North is screen-up.
 */
export function elementShares(poly: Pt[], c: Pt, half: number): ElementShare[] | null {
  const total = area(poly)
  if (total <= 0) return null
  const quad = (left: boolean, top: boolean) => clipY(clipX(poly, c.x, left), c.y, top)
  const withoutEther = (q: Pt[]) =>
    Math.max(0, area(q) - area(clipRect(q, c.x - half, c.x + half, c.y - half, c.y + half)))
  const pct = (v: number) => (v / total) * 100
  return [
    { name: 'Space', color: '#FFFFFF', pct: pct(area(clipRect(poly, c.x - half, c.x + half, c.y - half, c.y + half))) },
    { name: 'Air', color: ELEMENT_COLORS.air, pct: pct(withoutEther(quad(true, true))) },
    { name: 'Water', color: ELEMENT_COLORS.water, pct: pct(withoutEther(quad(false, true))) },
    { name: 'Fire', color: ELEMENT_COLORS.fire, pct: pct(withoutEther(quad(false, false))) },
    { name: 'Earth', color: ELEMENT_COLORS.earth, pct: pct(withoutEther(quad(true, false))) },
  ]
}
