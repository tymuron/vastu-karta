import { useRef } from 'react'
import { norm360, toDeg, toRad } from '../lib/geometry'

interface Props {
  value: number // bearing deg, 0 = North (up), clockwise
  onChange: (deg: number) => void
  size?: number
}

/** A small draggable compass to set a bearing by hand (façade direction). */
export default function CompassDial({ value, onChange, size = 160 }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const r = size / 2
  const needle = r * 0.78

  const setFromEvent = (clientX: number, clientY: number) => {
    const svg = ref.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const dx = clientX - (rect.left + rect.width / 2)
    const dy = clientY - (rect.top + rect.height / 2)
    const canvasAngle = toDeg(Math.atan2(dy, dx))
    onChange(Math.round(norm360(canvasAngle + 90)))
  }

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    setFromEvent(e.clientX, e.clientY)
  }
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return
    setFromEvent(e.clientX, e.clientY)
  }

  // needle tip from bearing: canvasAngle = bearing - 90
  const a = toRad(value - 90)
  const tip = { x: r + needle * Math.cos(a), y: r + needle * Math.sin(a) }
  const ticks = [
    { b: 0, t: 'С' },
    { b: 90, t: 'В' },
    { b: 180, t: 'Ю' },
    { b: 270, t: 'З' },
  ]

  return (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="cursor-grab touch-none active:cursor-grabbing"
      onPointerDown={onDown}
      onPointerMove={onMove}
    >
      <circle cx={r} cy={r} r={r - 2} fill="#fff" stroke="#E2DCCF" strokeWidth={2} />
      <circle cx={r} cy={r} r={r - 2} fill="none" stroke="#CABC90" strokeWidth={1} opacity={0.5} />
      {ticks.map((tk) => {
        const ang = toRad(tk.b - 90)
        const x = r + (r - 18) * Math.cos(ang)
        const y = r + (r - 18) * Math.sin(ang)
        return (
          <text
            key={tk.b}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={13}
            fontWeight={700}
            fill={tk.b === 0 ? '#9a2b2b' : '#422326'}
            fontFamily="Inter, sans-serif"
          >
            {tk.t}
          </text>
        )
      })}
      <line x1={r} y1={r} x2={tip.x} y2={tip.y} stroke="#422326" strokeWidth={3} strokeLinecap="round" />
      <circle cx={tip.x} cy={tip.y} r={5} fill="#9a2b2b" />
      <circle cx={r} cy={r} r={4} fill="#422326" />
    </svg>
  )
}
