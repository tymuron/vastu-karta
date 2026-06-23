import { useState } from 'react'
import { useStore, type ToggleKey } from '../state/store'
import { SECTORS } from '../lib/sectors'
import { exportPng } from '../lib/export'
import { cn } from '../lib/cn'
import { Download, RotateCcw, Loader2 } from 'lucide-react'

const TOGGLES: { key: ToggleKey; label: string }[] = [
  { key: 'showSectors', label: 'Секторы' },
  { key: 'showAxes', label: 'Оси' },
  { key: 'showLabels', label: 'Подписи' },
  { key: 'showBrahma', label: 'Брахмастан' },
  { key: 'showContour', label: 'Контур' },
]

export default function ResultStep() {
  const { state, dispatch } = useStore()
  const [saving, setSaving] = useState(false)

  const handleExport = async () => {
    setSaving(true)
    try {
      await exportPng(state)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Готово! Карта секторов наложена на ваш план. В центре — Брахмастан (сердце дома).
        Сохраните карту или покажите её специалисту.
      </p>

      {/* Layer toggles */}
      <div className="flex flex-wrap gap-2">
        {TOGGLES.map((t) => {
          const on = state[t.key]
          return (
            <button
              key={t.key}
              onClick={() => dispatch({ type: 'setToggle', key: t.key, value: !on })}
              className={cn(
                'rounded-full border px-3 py-1.5 font-sans text-xs transition-colors',
                on
                  ? 'border-vastu-dark bg-vastu-dark text-vastu-light'
                  : 'border-vastu-sand bg-white text-vastu-text-light',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Opacity */}
      <div className="space-y-1.5">
        <label className="font-sans text-xs text-vastu-text-light">Прозрачность секторов</label>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round(state.opacity * 100)}
          onChange={(e) => dispatch({ type: 'setOpacity', value: parseInt(e.target.value, 10) / 100 })}
          className="w-full accent-vastu-dark"
        />
      </div>

      {/* Legend */}
      <div className="space-y-1.5">
        <div className="font-sans text-xs font-medium text-vastu-dark">Зоны жизни</div>
        <ul className="grid grid-cols-1 gap-1">
          {SECTORS.map((s) => (
            <li key={s.abbr} className="flex items-center gap-2 font-sans text-xs">
              <span
                className="inline-block h-3.5 w-3.5 shrink-0 rounded-sm border border-black/10"
                style={{ background: s.color }}
              />
              <span className="w-6 font-medium text-vastu-dark">{s.abbr}</span>
              <span className="text-vastu-text-light">{s.domain}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2 pt-1">
        <button onClick={handleExport} disabled={saving} className="btn-primary w-full">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
          Скачать PNG
        </button>
        <button onClick={() => dispatch({ type: 'reset' })} className="btn-ghost w-full">
          <RotateCcw size={16} /> Начать заново
        </button>
      </div>
    </div>
  )
}
