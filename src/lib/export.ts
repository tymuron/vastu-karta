import type { BuilderState } from '../state/store'
import { polygonCentroid, type Pt } from './geometry'
import { drawWheel } from './render'

const MAX_DIM = 2400

/** Render the plan + wheel at full resolution and trigger a PNG download. */
export async function exportPng(state: BuilderState): Promise<void> {
  if (!state.imageSrc || !state.closed) return
  const img = await loadImage(state.imageSrc)

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const w = Math.round(img.width * scale)
  const h = Math.round(img.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, w, h)

  const project = (p: Pt): Pt => ({ x: p.x * scale, y: p.y * scale })
  const screen = state.points.map(project)
  const center = project(polygonCentroid(state.points))
  drawWheel(ctx, screen, center, state.orientationDeg, {
    sectors: state.showSectors,
    axes: state.showAxes,
    brahma: state.showBrahma,
    contour: state.showContour,
    labels: state.showLabels,
    opacity: state.opacity,
  })

  // subtle watermark
  ctx.font = `600 ${Math.round(13 * (w / 800) + 8)}px Inter, sans-serif`
  ctx.fillStyle = 'rgba(66,35,38,0.45)'
  ctx.textAlign = 'right'
  ctx.fillText('Васту Карта', w - 14, h - 14)

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'))
  if (!blob) return

  // On phones, prefer the native share sheet ("Save to Photos") — far easier
  // for older users than a file download.
  const file = new File([blob], 'vastu-karta.png', { type: 'image/png' })
  const nav = navigator as Navigator & {
    canShare?: (d: { files: File[] }) => boolean
    share?: (d: { files: File[]; title?: string }) => Promise<void>
  }
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: 'Васту Карта' })
      return
    } catch {
      /* user cancelled or share failed — fall through to download */
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'vastu-karta.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}
