// Canvas renderer for the Vastu wheel. Works entirely in SCREEN coordinates so
// line widths and fonts stay crisp regardless of the image scale. Geometry is
// faithful to nativastu: 8 wedges × 45°, North centered on screen-up, the whole
// wheel rotated by `orientationDeg` (Δ) so North points at true geographic North.

import { Pt, maxVertexRadius, polygonArea, rayToPolygonBoundary, toRad } from './geometry'
import { SECTORS, SECTOR_SPAN, isCardinal } from './sectors'

export interface WheelOptions {
  sectors: boolean
  axes: boolean
  brahma: boolean
  contour: boolean
  labels: boolean
  /** Sector fill opacity, 0..1. */
  opacity: number
}

const COLORS = {
  contour: '#422326',
  axisCardinal: 'rgba(66, 35, 38, 0.85)',
  axisOrdinal: 'rgba(66, 35, 38, 0.45)',
  label: '#2f181a',
  brahmaFill: 'rgba(255, 255, 255, 0.45)',
  brahmaStroke: '#422326',
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function tracePath(ctx: CanvasRenderingContext2D, poly: Pt[]) {
  ctx.beginPath()
  poly.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
  ctx.closePath()
}

/** Canvas angle (rad) for a sector center, given the orientation offset Δ (deg). */
function sectorCenterAngle(bearing: number, orientationDeg: number): number {
  // canvasAngle = bearing - 90 - Δ  (see geometry.bearingToCanvasAngle)
  return toRad(bearing - 90 - orientationDeg)
}

/**
 * Draw the full wheel. `poly`, `center` are in screen pixels.
 */
export function drawWheel(
  ctx: CanvasRenderingContext2D,
  poly: Pt[],
  center: Pt,
  orientationDeg: number,
  opts: WheelOptions,
) {
  if (poly.length < 3) return
  const radius = maxVertexRadius(poly, center) * 1.06
  const span = toRad(SECTOR_SPAN)

  // --- Colored sector wedges, clipped to the apartment outline ---
  if (opts.sectors) {
    ctx.save()
    tracePath(ctx, poly)
    ctx.clip()
    SECTORS.forEach((s) => {
      const mid = sectorCenterAngle(s.bearing, orientationDeg)
      ctx.beginPath()
      ctx.moveTo(center.x, center.y)
      ctx.arc(center.x, center.y, radius, mid - span / 2, mid + span / 2)
      ctx.closePath()
      ctx.fillStyle = hexToRgba(s.color, opts.opacity)
      ctx.fill()
    })
    ctx.restore()
  }

  // --- Axis lines through the 8 directions (clipped to the outline) ---
  if (opts.axes) {
    ctx.save()
    tracePath(ctx, poly)
    ctx.clip()
    SECTORS.forEach((s, i) => {
      const a = sectorCenterAngle(s.bearing, orientationDeg)
      ctx.beginPath()
      ctx.moveTo(center.x, center.y)
      ctx.lineTo(center.x + radius * Math.cos(a), center.y + radius * Math.sin(a))
      if (isCardinal(i)) {
        ctx.strokeStyle = COLORS.axisCardinal
        ctx.lineWidth = 1.6
        ctx.setLineDash([])
      } else {
        ctx.strokeStyle = COLORS.axisOrdinal
        ctx.lineWidth = 1
        ctx.setLineDash([5, 4])
      }
      ctx.stroke()
    })
    ctx.setLineDash([])
    ctx.restore()
  }

  // --- Brahmasthan: central 1/9-area square (plan-aligned, like nativastu) ---
  if (opts.brahma) {
    const side = Math.sqrt(polygonArea(poly) / 9)
    ctx.save()
    ctx.fillStyle = COLORS.brahmaFill
    ctx.strokeStyle = COLORS.brahmaStroke
    ctx.lineWidth = 1.4
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.rect(center.x - side / 2, center.y - side / 2, side, side)
    ctx.fill()
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()
    // center dot
    ctx.beginPath()
    ctx.fillStyle = COLORS.brahmaStroke
    ctx.arc(center.x, center.y, 3, 0, Math.PI * 2)
    ctx.fill()
  }

  // --- Direction labels: a white disc + letter so it reads over any plan ---
  if (opts.labels) {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    SECTORS.forEach((s, i) => {
      const a = sectorCenterAngle(s.bearing, orientationDeg)
      // Sit each label inside its own sector: 62% of the way to the wall along
      // this direction (so labels never float outside an L-shaped plan).
      const wall = rayToPolygonBoundary(center, a, poly)
      const lr = wall > 0 ? Math.max(28, wall * 0.62) : radius * 0.62
      const lx = center.x + lr * Math.cos(a)
      const ly = center.y + lr * Math.sin(a)
      const rDisc = isCardinal(i) ? 15 : 12
      ctx.beginPath()
      ctx.arc(lx, ly, rDisc, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)'
      ctx.fill()
      ctx.lineWidth = 1.4
      ctx.strokeStyle = isCardinal(i) ? COLORS.contour : 'rgba(66,35,38,0.5)'
      ctx.stroke()
      ctx.font = `700 ${isCardinal(i) ? 15 : 12}px Inter, system-ui, sans-serif`
      ctx.fillStyle = COLORS.label
      ctx.fillText(s.abbr, lx, ly)
    })
  }

  // --- Apartment outline ---
  if (opts.contour) {
    tracePath(ctx, poly)
    ctx.strokeStyle = COLORS.contour
    ctx.lineWidth = 2
    ctx.setLineDash([])
    ctx.stroke()
  }
}
