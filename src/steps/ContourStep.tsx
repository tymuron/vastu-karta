import { useEffect } from 'react'
import { useStore } from '../state/store'
import { Undo2, RotateCcw, Check } from 'lucide-react'

export default function ContourStep() {
  const { state, dispatch } = useStore()

  // Keyboard helpers: ⌘/Ctrl-Z to undo, Enter to close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        dispatch({ type: 'undoPoint' })
      } else if (e.key === 'Enter' && state.points.length >= 3 && !state.closed) {
        dispatch({ type: 'closeContour' })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.points.length, state.closed, dispatch])

  return (
    <div className="space-y-4">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Нажимайте по очереди на каждый угол квартиры. Поставили не туда?{' '}
        <b>Перетащите точку</b> пальцем. Когда обойдёте все углы — нажмите «Замкнуть контур».
      </p>

      <div className="flex items-center justify-between rounded-xl border border-vastu-sand bg-white/70 px-4 py-3 font-sans text-sm">
        <span className="text-vastu-text-light">Точек поставлено</span>
        <span className="font-medium text-vastu-dark">{state.points.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => dispatch({ type: 'undoPoint' })}
          disabled={state.points.length === 0 || state.closed}
          className="btn-ghost"
        >
          <Undo2 size={16} /> Отменить
        </button>
        <button
          onClick={() => dispatch({ type: 'resetContour' })}
          disabled={state.points.length === 0}
          className="btn-ghost"
        >
          <RotateCcw size={16} /> Сброс
        </button>
      </div>

      {!state.closed ? (
        <button
          onClick={() => dispatch({ type: 'closeContour' })}
          disabled={state.points.length < 3}
          className="btn-primary w-full"
        >
          <Check size={16} /> Замкнуть контур
        </button>
      ) : (
        <div className="rounded-xl border border-vastu-gold/50 bg-vastu-gold/10 px-4 py-3 font-sans text-sm text-vastu-dark">
          Контур замкнут · центр квартиры найден ✓
        </div>
      )}
    </div>
  )
}
