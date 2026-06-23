import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'
import { Pt, polygonCentroid, nearestEdgeIndex, midpoint, toRad } from '../lib/geometry'
import { drawWheel } from '../lib/render'

const STEP = { region: 0, upload: 1, contour: 2, reference: 3, orient: 4, result: 5 }

interface Transform {
  scale: number
  ox: number
  oy: number
}

/** Shared canvas: floor plan + step-specific overlays + the final wheel. */
export default function PlanStage() {
  const { state, dispatch } = useStore()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const tfRef = useRef<Transform>({ scale: 1, ox: 0, oy: 0 })
  const [, force] = useState(0)
  const redraw = useCallback(() => force((n) => n + 1), [])

  // Load image whenever the source changes.
  useEffect(() => {
    if (!state.imageSrc) {
      imgRef.current = null
      redraw()
      return
    }
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      redraw()
    }
    img.src = state.imageSrc
  }, [state.imageSrc, redraw])

  // Redraw on container resize.
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [redraw])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const dpr = window.devicePixelRatio || 1
    const cssW = wrap.clientWidth
    const cssH = wrap.clientHeight
    canvas.width = Math.round(cssW * dpr)
    canvas.height = Math.round(cssH * dpr)
    canvas.style.width = `${cssW}px`
    canvas.style.height = `${cssH}px`
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, cssW, cssH)

    const img = imgRef.current
    if (!img) return

    const margin = 0.96
    const scale = Math.min(cssW / img.width, cssH / img.height) * margin
    const ox = (cssW - img.width * scale) / 2
    const oy = (cssH - img.height * scale) / 2
    tfRef.current = { scale, ox, oy }
    const project = (p: Pt): Pt => ({ x: ox + p.x * scale, y: oy + p.y * scale })

    // Dim the plan a touch on the result step so the overlay reads clearly.
    ctx.globalAlpha = state.step === STEP.result ? 0.92 : 1
    ctx.drawImage(img, ox, oy, img.width * scale, img.height * scale)
    ctx.globalAlpha = 1

    const pts = state.points
    const screen = pts.map(project)

    // ----- Result: full wheel -----
    if (state.step === STEP.result && state.closed && pts.length >= 3) {
      const c = project(polygonCentroid(pts))
      drawWheel(ctx, screen, c, state.orientationDeg, {
        sectors: state.showSectors,
        axes: state.showAxes,
        brahma: state.showBrahma,
        contour: state.showContour,
        labels: state.showLabels,
        opacity: state.opacity,
      })
      return
    }

    // ----- Contour / reference / orient: outline + helpers -----
    if (screen.length > 0) {
      // edges
      ctx.beginPath()
      screen.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      if (state.closed) ctx.closePath()
      ctx.strokeStyle = '#422326'
      ctx.lineWidth = 2
      ctx.stroke()

      // dashed preview edge back to start while drawing
      if (!state.closed && screen.length >= 1 && state.step === STEP.contour) {
        // (live cursor edge handled by browser; just hint closure)
        if (screen.length >= 3) {
          ctx.beginPath()
          ctx.moveTo(screen[screen.length - 1].x, screen[screen.length - 1].y)
          ctx.lineTo(screen[0].x, screen[0].y)
          ctx.setLineDash([6, 5])
          ctx.strokeStyle = 'rgba(66,35,38,0.4)'
          ctx.lineWidth = 1.5
          ctx.stroke()
          ctx.setLineDash([])
        }
      }

      // vertices — large and ringed so they're easy to see and grab
      screen.forEach((p, i) => {
        ctx.beginPath()
        ctx.arc(p.x, p.y, i === 0 ? 9 : 7, 0, Math.PI * 2)
        ctx.fillStyle = i === 0 ? '#CABC90' : '#422326'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = '#fff'
        ctx.stroke()
      })
    }

    // centroid marker once closed
    if (state.closed && pts.length >= 3) {
      const c = project(polygonCentroid(pts))
      ctx.beginPath()
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = '#9a2b2b'
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2
      ctx.stroke()
      // crosshair
      ctx.beginPath()
      ctx.moveTo(c.x - 12, c.y)
      ctx.lineTo(c.x + 12, c.y)
      ctx.moveTo(c.x, c.y - 12)
      ctx.lineTo(c.x, c.y + 12)
      ctx.strokeStyle = 'rgba(154,43,43,0.6)'
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // highlight the chosen window-wall edge (reference + orient steps)
    if (state.closed && state.windowEdge != null && state.step === STEP.orient) {
      const a = screen[state.windowEdge]
      const b = screen[(state.windowEdge + 1) % screen.length]
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.strokeStyle = '#CABC90'
      ctx.lineWidth = 5
      ctx.stroke()
      // outward arrow (windows face out)
      const mid = midpoint(a, b)
      const c = project(polygonCentroid(pts))
      const out = Math.atan2(mid.y - c.y, mid.x - c.x)
      const tip = { x: mid.x + 26 * Math.cos(out), y: mid.y + 26 * Math.sin(out) }
      ctx.beginPath()
      ctx.moveTo(mid.x, mid.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.strokeStyle = '#9a2b2b'
      ctx.lineWidth = 2
      ctx.stroke()
      // arrow head
      ctx.beginPath()
      ctx.arc(tip.x, tip.y, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#9a2b2b'
      ctx.fill()
    }

    // orient step: draw a north arrow from centroid
    if (state.step === STEP.orient && state.closed && pts.length >= 3) {
      const c = project(polygonCentroid(pts))
      const a = toRad(0 - 90 - state.orientationDeg) // North canvas angle
      const len = 60
      const tip = { x: c.x + len * Math.cos(a), y: c.y + len * Math.sin(a) }
      ctx.beginPath()
      ctx.moveTo(c.x, c.y)
      ctx.lineTo(tip.x, tip.y)
      ctx.strokeStyle = '#422326'
      ctx.lineWidth = 2.5
      ctx.stroke()
      ctx.fillStyle = '#422326'
      ctx.font = '700 14px Inter, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('С', tip.x, tip.y - 8)
    }
  }, [state])

  // Draw after every render that touched state/size.
  useEffect(() => {
    draw()
  })

  // ----- Pointer interaction -----
  const toImage = (clientX: number, clientY: number): Pt => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const { scale, ox, oy } = tfRef.current
    // Clamp to the image bounds so clicks in the letterbox margin don't create
    // wildly out-of-bounds contour vertices.
    const x = (clientX - rect.left - ox) / scale
    const y = (clientY - rect.top - oy) / scale
    return {
      x: Math.max(0, Math.min(state.imageW, x)),
      y: Math.max(0, Math.min(state.imageH, y)),
    }
  }

  // Index of the contour vertex currently being dragged, if any.
  const dragRef = useRef<number | null>(null)

  /** Nearest contour vertex to a client point, within a generous touch radius. */
  const vertexNear = (clientX: number, clientY: number): number => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const { scale, ox, oy } = tfRef.current
    const lx = clientX - rect.left
    const ly = clientY - rect.top
    let best = -1
    let bestD = 22 // large hit target for older fingers
    state.points.forEach((p, i) => {
      const sx = ox + p.x * scale
      const sy = oy + p.y * scale
      const d = Math.hypot(sx - lx, sy - ly)
      if (d < bestD) {
        bestD = d
        best = i
      }
    })
    return best
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (!imgRef.current) return

    if (state.step === STEP.contour) {
      // Grab an existing corner to drag it (works before or after closing).
      const hit = vertexNear(e.clientX, e.clientY)
      if (hit >= 0) {
        dragRef.current = hit
        canvasRef.current!.setPointerCapture(e.pointerId)
        return
      }
      // Otherwise drop a new corner (only while still open).
      if (!state.closed) dispatch({ type: 'addPoint', pt: toImage(e.clientX, e.clientY) })
      return
    }

    if (state.step === STEP.orient && state.closed) {
      const { index } = nearestEdgeIndex(state.points, toImage(e.clientX, e.clientY))
      if (index >= 0) dispatch({ type: 'setWindowEdge', index })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (dragRef.current == null) return
    dispatch({ type: 'movePoint', index: dragRef.current, pt: toImage(e.clientX, e.clientY) })
  }

  const onPointerUp = (e: React.PointerEvent) => {
    if (dragRef.current != null) {
      dragRef.current = null
      try {
        canvasRef.current!.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be gone */
      }
    }
  }

  const interactive = state.step === STEP.contour || state.step === STEP.orient

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full"
      style={{ cursor: interactive ? 'crosshair' : 'default' }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
      />
      {!imgRef.current && (
        <div className="absolute inset-0 flex items-center justify-center text-vastu-text-light">
          <span className="font-sans text-sm">Загрузите план, чтобы начать</span>
        </div>
      )}
    </div>
  )
}
