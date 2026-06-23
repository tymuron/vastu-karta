import { Pt, segmentCanvasAngle, norm360 } from './geometry'

/**
 * Compute the wheel orientation Δ (deg) so that the marked window-wall edge,
 * which on the real building faces bearing `wallAzimuth`, lines up correctly —
 * North then points at true geographic North.
 *
 *   bearing = canvasAngle + 90 + Δ   ⇒   Δ = wallAzimuth − edgeAngle − 90
 *
 * `flip` resolves the unavoidable 180° ambiguity (a wall is a line with two
 * directions; the user taps a flip button if North ends up reversed).
 */
export function autoOrientation(
  points: Pt[],
  edgeIndex: number,
  wallAzimuth: number,
  flip: boolean,
): number {
  const a = points[edgeIndex]
  const b = points[(edgeIndex + 1) % points.length]
  const edgeAngle = segmentCanvasAngle(a, b)
  return norm360(wallAzimuth - edgeAngle - 90 + (flip ? 180 : 0))
}
