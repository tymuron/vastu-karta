import { useEffect } from 'react'
import { useStore } from '../state/store'
import { autoOrientation } from '../lib/orient'
import { norm360 } from '../lib/geometry'
import { RefreshCw, Sparkles, MousePointerClick, Check } from 'lucide-react'

export default function OrientStep() {
  const { state, dispatch } = useStore()
  const edgeChosen = state.windowEdge != null
  const canAuto = edgeChosen && state.wallAzimuth != null

  // Auto-align whenever the inputs (edge / azimuth / flip) change.
  useEffect(() => {
    if (state.windowEdge != null && state.wallAzimuth != null) {
      const deg = autoOrientation(state.points, state.windowEdge, state.wallAzimuth, state.flip180)
      dispatch({ type: 'setOrientation', deg })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.windowEdge, state.wallAzimuth, state.flip180])

  return (
    <div className="space-y-4">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Отметьте на плане <b>ту же стену</b>, вдоль которой вы провели линию на карте.
        План сам повернётся, и мы узнаем все стороны света.
      </p>

      {!edgeChosen ? (
        <div className="flex items-center gap-2 rounded-xl border border-vastu-sand bg-white/70 px-4 py-3 font-sans text-sm text-vastu-text-light">
          <MousePointerClick size={18} className="shrink-0 text-vastu-gold-deep" />
          Нажмите на ту же стену на плане слева
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm font-medium text-green-800">
          <Check size={18} /> Стена отмечена
        </div>
      )}

      {edgeChosen && (
        <>
          <p className="font-sans text-sm leading-relaxed text-vastu-text-light">
            {canAuto ? (
              <>
                <Sparkles size={14} className="-mt-0.5 mr-1 inline text-vastu-gold-deep" />
                План повёрнут автоматически. Стрелка «С» на плане показывает север.
              </>
            ) : (
              'Подправьте поворот, чтобы стрелка «С» смотрела на север.'
            )}
          </p>

          <div className="flex items-center justify-between rounded-xl border border-vastu-sand bg-white/70 px-4 py-3 font-sans text-sm">
            <span className="text-vastu-text-light">Угол севера</span>
            <span className="font-medium text-vastu-dark">
              {Math.round(norm360(state.orientationDeg))}°
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="font-sans text-xs text-vastu-text-light">Точная подстройка</label>
            <input
              type="range"
              min={0}
              max={359}
              value={Math.round(norm360(state.orientationDeg))}
              onChange={(e) =>
                dispatch({ type: 'setOrientation', deg: parseInt(e.target.value, 10) })
              }
              className="h-2 w-full accent-vastu-dark"
            />
          </div>

          <button onClick={() => dispatch({ type: 'toggleFlip' })} className="btn-ghost w-full">
            <RefreshCw size={18} /> Север смотрит не туда? Развернуть
          </button>
        </>
      )}
    </div>
  )
}
