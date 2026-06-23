import { useState } from 'react'
import { useStore } from '../state/store'
import CompassDial from '../components/CompassDial'
import { Check, Compass, Satellite } from 'lucide-react'

export default function ReferenceStep() {
  const { state, dispatch } = useStore()
  const [manual, setManual] = useState(false)
  const done = state.wallAzimuth != null

  return (
    <div className="space-y-4">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Найдите свой дом на спутнике и проведите линию вдоль <b>одной прямой наружной стены</b>.
        Подойдёт любая — например, фасад или стена с окнами. Так мы узнаем, как повёрнут ваш дом.
      </p>

      <div className="flex items-start gap-3 rounded-xl border border-vastu-sand bg-white/70 p-3">
        <Satellite size={18} className="mt-0.5 shrink-0 text-vastu-gold-deep" />
        <p className="font-sans text-sm leading-snug text-vastu-text-light">
          Неважно, какую стену выбрать — главное, чтобы вы узнали её на своём плане. Эту же
          стену вы отметите на следующем шаге.
        </p>
      </div>

      {done && (
        <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 font-sans text-sm font-medium text-green-800">
          <Check size={18} /> Направление получено
        </div>
      )}

      {/* Manual fallback for anyone who can't find their house */}
      <button
        onClick={() => setManual((m) => !m)}
        className="flex items-center gap-2 font-sans text-sm text-vastu-text-light underline-offset-2 hover:text-vastu-dark hover:underline"
      >
        <Compass size={15} /> Не получается найти дом? Задать направление вручную
      </button>

      {manual && (
        <div className="flex items-center gap-4 rounded-xl border border-vastu-sand bg-white/60 p-3">
          <CompassDial
            value={state.wallAzimuth ?? 0}
            onChange={(d) => dispatch({ type: 'setWallAzimuth', azimuth: d })}
          />
          <p className="font-sans text-xs leading-snug text-vastu-text-light">
            Покрутите компас в ту сторону, куда смотрят окна вашей квартиры.
          </p>
        </div>
      )}
    </div>
  )
}
