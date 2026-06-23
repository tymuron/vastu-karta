import { StoreProvider, useStore, STEPS } from './state/store'
import Stepper from './components/Stepper'
import PlanStage from './components/PlanStage'
import MapPicker from './components/MapPicker'
import RegionStep from './steps/RegionStep'
import UploadStep from './steps/UploadStep'
import ContourStep from './steps/ContourStep'
import ReferenceStep from './steps/ReferenceStep'
import OrientStep from './steps/OrientStep'
import ResultStep from './steps/ResultStep'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const STEP_COMPONENTS = [
  RegionStep,
  UploadStep,
  ContourStep,
  ReferenceStep,
  OrientStep,
  ResultStep,
]

function canProceed(step: number, s: ReturnType<typeof useStore>['state']): boolean {
  switch (step) {
    case 0:
      return s.region != null
    case 1:
      return s.imageSrc != null
    case 2:
      return s.closed
    case 3:
      return s.wallAzimuth != null
    case 4:
      return s.windowEdge != null
    default:
      return true
  }
}

function Workspace() {
  const { state, dispatch } = useStore()
  const Active = STEP_COMPONENTS[state.step]
  const isLast = state.step === STEPS.length - 1
  const proceed = canProceed(state.step, state)
  // The canvas is only worth showing once there's something on it: a loaded
  // plan, or the map step. Otherwise the controls take center stage.
  const showStage = state.step === 3 || !!state.imageSrc

  return (
    <div className="flex h-[100dvh] flex-col bg-vastu-light">
      {/* Header */}
      <header className="shrink-0 border-b border-vastu-sand/70">
        <div className="mx-auto flex w-full max-w-[1480px] items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2.5">
            <img src="./favicon.svg" alt="" className="h-7 w-7" />
            <div className="leading-tight">
              <div className="font-serif text-lg text-vastu-dark">Васту Карта</div>
              <div className="hidden font-sans text-[11px] text-vastu-text-light sm:block">
                конструктор для квартиры любой формы
              </div>
            </div>
          </div>
          <a
            href="#"
            className="font-sans text-xs text-vastu-text-light underline-offset-2 hover:text-vastu-dark hover:underline"
          >
            узнать об услугах →
          </a>
        </div>
      </header>

      {/* Body — when there's nothing on the canvas yet, the controls take the
          whole (centered) column instead of sitting beside a big empty stage. */}
      <main
        className={
          showStage
            ? 'mx-auto grid w-full min-h-0 max-w-[1320px] flex-1 grid-rows-[46vh_1fr] md:grid-cols-[minmax(0,1fr)_500px] md:grid-rows-1'
            : 'mx-auto flex w-full min-h-0 max-w-[640px] flex-1 flex-col'
        }
      >
        {/* Canvas stage */}
        {showStage && (
          <section className="min-h-0 min-w-0 overflow-hidden bg-[repeating-conic-gradient(#efece6_0%_25%,#f4f2ed_0%_50%)] bg-[length:28px_28px] p-3 md:block md:p-5">
            <div className="card h-full w-full overflow-hidden">
              {state.step === 3 ? <MapPicker /> : <PlanStage />}
            </div>
          </section>
        )}

        {/* Control column */}
        <aside
          className={
            'flex min-h-0 flex-1 flex-col bg-white/40 ' +
            (showStage
              ? 'border-t border-vastu-sand/70 md:border-l md:border-t-0'
              : 'border-x border-vastu-sand/70')
          }
        >
          <div className="border-b border-vastu-sand/60 px-5 py-3">
            <Stepper />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <h2 className="mb-3 font-serif text-2xl text-vastu-dark">{STEPS[state.step].label}</h2>
            <Active />
          </div>

          {/* Nav */}
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-vastu-sand/60 px-5 py-3">
            <button
              onClick={() => dispatch({ type: 'setStep', step: Math.max(0, state.step - 1) })}
              disabled={state.step === 0}
              className="btn-ghost"
            >
              <ChevronLeft size={16} /> Назад
            </button>
            {!isLast && (
              <button
                onClick={() => proceed && dispatch({ type: 'setStep', step: state.step + 1 })}
                disabled={!proceed}
                className="btn-primary"
              >
                Далее <ChevronRight size={16} />
              </button>
            )}
          </div>
        </aside>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Workspace />
    </StoreProvider>
  )
}
