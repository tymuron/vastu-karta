import { useStore } from '../state/store'
import { cn } from '../lib/cn'
import { MapPin, Globe } from 'lucide-react'

export default function RegionStep() {
  const { state, dispatch } = useStore()
  const opts = [
    {
      key: 'ru' as const,
      icon: MapPin,
      title: 'Россия',
      sub: 'Карта Яндекс',
    },
    {
      key: 'world' as const,
      icon: Globe,
      title: 'Другая страна',
      sub: 'Карта Google',
    },
  ]
  return (
    <div className="space-y-4">
      <p className="font-sans text-base leading-relaxed text-vastu-text">
        Этот конструктор построит Васту-карту вашей квартиры и покажет, какие зоны жизни —
        деньги, здоровье, отношения — попадают в каждую часть дома. Займёт пару минут.
      </p>
      <p className="font-sans text-base leading-relaxed text-vastu-text-light">
        Для начала: где находится квартира?
      </p>
      <div className="grid grid-cols-2 gap-3">
        {opts.map((o) => {
          const Icon = o.icon
          const active = state.region === o.key
          return (
            <button
              key={o.key}
              onClick={() => dispatch({ type: 'setRegion', region: o.key })}
              className={cn(
                'flex flex-col items-center gap-2 rounded-2xl border p-5 text-center transition-all',
                active
                  ? 'border-vastu-dark bg-vastu-dark/5 shadow-card'
                  : 'border-vastu-sand bg-white hover:border-vastu-gold',
              )}
            >
              <Icon size={26} className={active ? 'text-vastu-dark' : 'text-vastu-gold-deep'} />
              <span className="font-serif text-lg text-vastu-dark">{o.title}</span>
              <span className="font-sans text-xs text-vastu-text-light">{o.sub}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
