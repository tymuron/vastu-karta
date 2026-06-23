// Pure geometry helpers. No DOM, no React — easy to reason about and verify.

export interface Pt {
  x: number
  y: number
}

export const toRad = (deg: number) => (deg * Math.PI) / 180
export const toDeg = (rad: number) => (rad * 180) / Math.PI

/** Normalize any angle (deg) into [0, 360). */
export const norm360 = (deg: number) => ((deg % 360) + 360) % 360

/**
 * Signed area of a polygon via the shoelace formula.
 * Positive when vertices are counter-clockwise in a y-down canvas… but we only
 * ever use the sign internally, so callers should treat magnitude as the area.
 */
export function polygonSignedArea(pts: Pt[]): number {
  let a = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a / 2
}

export const polygonArea = (pts: Pt[]) => Math.abs(polygonSignedArea(pts))

/**
 * True area-weighted centroid (center of mass) of a polygon — this is the
 * "центр тяжести" the Vastu method requires, NOT the average of the vertices.
 * Falls back to the vertex mean for degenerate (zero-area) polygons.
 */
export function polygonCentroid(pts: Pt[]): Pt {
  const a = polygonSignedArea(pts)
  if (Math.abs(a) < 1e-7) {
    // Degenerate — average the vertices so we still return something sane.
    const m = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
    return { x: m.x / pts.length, y: m.y / pts.length }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const cross = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * cross
    cy += (p.y + q.y) * cross
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)

/** Largest distance from a point to any polygon vertex (used to size the wheel). */
export function maxVertexRadius(pts: Pt[], c: Pt): number {
  return pts.reduce((m, p) => Math.max(m, dist(p, c)), 0)
}

/** Midpoint of two points. */
export const midpoint = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Canvas angle (deg, measured from +X, clockwise because y is down) of the
 * direction a→b.
 */
export function segmentCanvasAngle(a: Pt, b: Pt): number {
  return toDeg(Math.atan2(b.y - a.y, b.x - a.x))
}

/**
 * Distance from point p to the line segment a-b, plus the closest point.
 * Used to let the user tap an edge of the contour to mark the window wall.
 */
export function pointToSegment(p: Pt, a: Pt, b: Pt): { d: number; t: number } {
  const vx = b.x - a.x
  const vy = b.y - a.y
  const len2 = vx * vx + vy * vy
  let t = len2 === 0 ? 0 : ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = a.x + t * vx
  const cy = a.y + t * vy
  return { d: Math.hypot(p.x - cx, p.y - cy), t }
}

/**
 * Distance from `origin` along a ray (angle in radians, canvas convention) to
 * the first polygon boundary it crosses. Used to keep direction labels inside
 * their own sector even on L-shaped / irregular plans. Returns 0 if no hit.
 */
export function rayToPolygonBoundary(origin: Pt, angleRad: number, poly: Pt[]): number {
  const dx = Math.cos(angleRad)
  const dy = Math.sin(angleRad)
  let best = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const b = poly[(i + 1) % poly.length]
    const sx = b.x - a.x
    const sy = b.y - a.y
    const denom = dx * sy - dy * sx
    if (Math.abs(denom) < 1e-9) continue
    const t = ((a.x - origin.x) * sy - (a.y - origin.y) * sx) / denom // distance along ray
    const u = ((a.x - origin.x) * dy - (a.y - origin.y) * dx) / denom // 0..1 along edge
    if (t > 1e-6 && u >= -1e-6 && u <= 1 + 1e-6) best = Math.min(best, t)
  }
  return Number.isFinite(best) ? best : 0
}

/** Index of the polygon edge (i → i+1) nearest to point p. */
export function nearestEdgeIndex(pts: Pt[], p: Pt): { index: number; d: number } {
  let best = { index: -1, d: Infinity }
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]
    const b = pts[(i + 1) % pts.length]
    const { d } = pointToSegment(p, a, b)
    if (d < best.d) best = { index: i, d }
  }
  return best
}

/**
 * Convert a compass bearing (deg, 0 = North/up, clockwise) into a canvas angle
 * (deg, 0 = +X/right, clockwise) for a north-up plan. Up on screen is -Y.
 *   North(0)  -> -90 (up)
 *   East(90)  ->   0 (right)
 *   South(180)->  90 (down)
 *   West(270) -> 180 (left)
 */
export const bearingToCanvasAngle = (bearing: number) => bearing - 90

/**
 * Outward normal bearing of a polygon edge — the compass-style angle (in the
 * plan's own frame, before orientation) pointing AWAY from the centroid. Lets us
 * disambiguate which way the window wall faces.
 */
export function edgeOutwardNormalCanvasAngle(a: Pt, b: Pt, centroid: Pt): number {
  const mid = midpoint(a, b)
  // Two candidate normals (perpendicular to the edge).
  const ex = b.x - a.x
  const ey = b.y - a.y
  const n1 = { x: -ey, y: ex }
  // Pick the normal pointing away from the centroid.
  const towardOut = { x: mid.x - centroid.x, y: mid.y - centroid.y }
  const dot = n1.x * towardOut.x + n1.y * towardOut.y
  const n = dot >= 0 ? n1 : { x: ey, y: -ex }
  return toDeg(Math.atan2(n.y, n.x))
}
