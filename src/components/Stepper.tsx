import { STEPS, useStore } from '../state/store'
import { cn } from '../lib/cn'
import { Check } from 'lucide-react'

/** Vertical progress rail showing the 6 steps. */
export default function Stepper() {
  const { state } = useStore()
  return (
    <ol className="flex flex-row gap-1 overflow-x-auto md:flex-col md:gap-0">
      {STEPS.map((s, i) => {
        const active = i === state.step
        const done = i < state.step
        return (
          <li key={s.key} className="flex items-center gap-3 md:py-1.5">
            <span
              className={cn(
                'step-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm transition-colors',
                active && 'border-vastu-dark bg-vastu-dark text-vastu-light',
                done && 'border-vastu-gold bg-vastu-gold/30 text-vastu-dark',
                !active && !done && 'border-vastu-sand bg-white text-vastu-text-light',
              )}
            >
              {done ? <Check size={15} /> : i + 1}
            </span>
            <span
              className={cn(
                'hidden whitespace-nowrap font-sans text-sm md:inline',
                active ? 'font-medium text-vastu-dark' : 'text-vastu-text-light',
              )}
            >
              {s.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
