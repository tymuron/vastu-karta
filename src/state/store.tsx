import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type { Pt } from '../lib/geometry'

export type Region = 'ru' | 'world'

export const STEPS = [
  { key: 'region', label: 'Где квартира' },
  { key: 'upload', label: 'План квартиры' },
  { key: 'contour', label: 'Обведите стены' },
  { key: 'reference', label: 'Дом на карте' },
  { key: 'orient', label: 'Та же стена' },
  { key: 'result', label: 'Васту Карта' },
] as const

export interface BuilderState {
  step: number
  region: Region | null
  imageSrc: string | null
  imageW: number
  imageH: number
  points: Pt[]
  closed: boolean
  /** index of the contour edge (i → i+1) that is the window wall */
  windowEdge: number | null
  /** real-world bearing of the window wall, from the map or entered by hand (deg) */
  wallAzimuth: number | null
  /** wheel orientation offset Δ (deg) — North is rotated by this from screen-up */
  orientationDeg: number
  flip180: boolean
  // result toggles
  showSectors: boolean
  showAxes: boolean
  showBrahma: boolean
  showContour: boolean
  showLabels: boolean
  opacity: number
}

const initialState: BuilderState = {
  step: 0,
  region: null,
  imageSrc: null,
  imageW: 0,
  imageH: 0,
  points: [],
  closed: false,
  windowEdge: null,
  wallAzimuth: null,
  orientationDeg: 0,
  flip180: false,
  showSectors: true,
  showAxes: true,
  showBrahma: true,
  showContour: true,
  showLabels: true,
  opacity: 0.55,
}

type Action =
  | { type: 'setStep'; step: number }
  | { type: 'setRegion'; region: Region }
  | { type: 'setImage'; src: string; w: number; h: number }
  | { type: 'addPoint'; pt: Pt }
  | { type: 'movePoint'; index: number; pt: Pt }
  | { type: 'undoPoint' }
  | { type: 'resetContour' }
  | { type: 'closeContour' }
  | { type: 'setWindowEdge'; index: number }
  | { type: 'setWallAzimuth'; azimuth: number | null }
  | { type: 'setOrientation'; deg: number }
  | { type: 'toggleFlip' }
  | { type: 'setToggle'; key: ToggleKey; value: boolean }
  | { type: 'setOpacity'; value: number }
  | { type: 'reset' }

export type ToggleKey = 'showSectors' | 'showAxes' | 'showBrahma' | 'showContour' | 'showLabels'

function reducer(state: BuilderState, action: Action): BuilderState {
  switch (action.type) {
    case 'setStep':
      return { ...state, step: action.step }
    case 'setRegion':
      return { ...state, region: action.region }
    case 'setImage':
      return {
        ...state,
        imageSrc: action.src,
        imageW: action.w,
        imageH: action.h,
        points: [],
        closed: false,
        windowEdge: null,
      }
    case 'addPoint':
      return state.closed ? state : { ...state, points: [...state.points, action.pt] }
    case 'movePoint': {
      if (action.index < 0 || action.index >= state.points.length) return state
      const points = state.points.slice()
      points[action.index] = action.pt
      return { ...state, points }
    }
    case 'undoPoint':
      return state.closed ? state : { ...state, points: state.points.slice(0, -1) }
    case 'resetContour':
      return { ...state, points: [], closed: false, windowEdge: null }
    case 'closeContour':
      return state.points.length >= 3 ? { ...state, closed: true } : state
    case 'setWindowEdge':
      return { ...state, windowEdge: action.index }
    case 'setWallAzimuth':
      return { ...state, wallAzimuth: action.azimuth }
    case 'setOrientation':
      return { ...state, orientationDeg: action.deg }
    case 'toggleFlip':
      return { ...state, flip180: !state.flip180 }
    case 'setToggle':
      return { ...state, [action.key]: action.value }
    case 'setOpacity':
      return { ...state, opacity: action.value }
    case 'reset':
      return initialState
    default:
      return state
  }
}

const StoreContext = createContext<{ state: BuilderState; dispatch: Dispatch<Action> } | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)
  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>
}

export function useStore() {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used within StoreProvider')
  return ctx
}
