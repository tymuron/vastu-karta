import { useEffect, useRef, useState } from 'react'
import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useStore } from '../state/store'
import { Search, RotateCcw, Check, Loader2, MapPin } from 'lucide-react'

const DEFAULT_VIEW: Record<string, { center: [number, number]; zoom: number }> = {
  ru: { center: [55.7512, 37.6184], zoom: 11 },
  world: { center: [48.8566, 2.3522], zoom: 11 },
}

/** Great-circle bearing A→B in degrees (0 = North, clockwise). */
function bearing(a: L.LatLng, b: L.LatLng): number {
  const φ1 = (a.lat * Math.PI) / 180
  const φ2 = (b.lat * Math.PI) / 180
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360
}

/**
 * Real satellite map (keyless: Esri World Imagery + OSM Nominatim search).
 * The user finds their building and draws a line along the window wall;
 * we read the façade azimuth straight off the map.
 */
export default function MapPicker() {
  const { state, dispatch } = useStore()
  const boxRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<L.Map | null>(null)
  const ptsRef = useRef<L.LatLng[]>([])
  const layerRef = useRef<L.LayerGroup | null>(null)
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [hasLine, setHasLine] = useState(state.wallAzimuth != null)
  const [notFound, setNotFound] = useState(false)

  // --- init map once ---
  useEffect(() => {
    if (mapRef.current || !boxRef.current) return
    const view = DEFAULT_VIEW[state.region ?? 'ru']
    const map = L.map(boxRef.current, { center: view.center, zoom: view.zoom, zoomControl: true })
    mapRef.current = map

    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, attribution: 'Imagery © Esri' },
    ).addTo(map)
    L.tileLayer(
      'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      { maxZoom: 20, opacity: 0.9 },
    ).addTo(map)

    const layer = L.layerGroup().addTo(map)
    layerRef.current = layer

    map.on('click', (e: L.LeafletMouseEvent) => {
      const pts = ptsRef.current
      if (pts.length >= 2) {
        pts.length = 0
        layer.clearLayers()
        setHasLine(false)
        dispatch({ type: 'setWallAzimuth', azimuth: null })
      }
      pts.push(e.latlng)
      L.circleMarker(e.latlng, {
        radius: 8,
        color: '#fff',
        weight: 2,
        fillColor: '#9a2b2b',
        fillOpacity: 1,
      }).addTo(layer)
      if (pts.length === 2) {
        L.polyline([pts[0], pts[1]], { color: '#9a2b2b', weight: 4, dashArray: '8 6' }).addTo(layer)
        const az = Math.round(bearing(pts[0], pts[1]))
        dispatch({ type: 'setWallAzimuth', azimuth: az })
        setHasLine(true)
      }
    })

    setTimeout(() => map.invalidateSize(), 60)
    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const search = async () => {
    const q = query.trim()
    if (!q || !mapRef.current) return
    setSearching(true)
    setNotFound(false)
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`,
        { headers: { Accept: 'application/json' } },
      )
      const data = (await res.json()) as Array<{ lat: string; lon: string }>
      if (data.length) {
        mapRef.current.setView([parseFloat(data[0].lat), parseFloat(data[0].lon)], 19)
      } else {
        setNotFound(true)
      }
    } catch {
      setNotFound(true)
    } finally {
      setSearching(false)
    }
  }

  const reset = () => {
    ptsRef.current.length = 0
    layerRef.current?.clearLayers()
    setHasLine(false)
    dispatch({ type: 'setWallAzimuth', azimuth: null })
  }

  return (
    <div className="relative h-full w-full">
      <div ref={boxRef} className="h-full w-full" />

      {/* Search bar (overlay, top) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[500] flex justify-center p-3">
        <div className="pointer-events-auto flex w-full max-w-xl gap-2 rounded-2xl bg-white/95 p-2 shadow-card backdrop-blur">
          <div className="flex flex-1 items-center gap-2 pl-2">
            <MapPin size={18} className="shrink-0 text-vastu-gold-deep" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && search()}
              placeholder="Введите адрес вашего дома"
              className="w-full bg-transparent py-2 font-sans text-base text-vastu-dark outline-none placeholder:text-vastu-text-light"
            />
          </div>
          <button onClick={search} disabled={searching} className="btn-primary px-4 py-2.5">
            {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
            <span className="hidden sm:inline">Найти</span>
          </button>
        </div>
      </div>

      {/* Status / help (overlay, bottom) */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[500] flex justify-center p-3">
        <div className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-card backdrop-blur">
          {hasLine ? (
            <>
              <span className="flex items-center gap-2 font-sans text-sm font-medium text-vastu-dark">
                <Check size={18} className="text-green-700" /> Стена отмечена
              </span>
              <button onClick={reset} className="btn-ghost px-3 py-1.5 text-sm">
                <RotateCcw size={14} /> Заново
              </button>
            </>
          ) : (
            <span className="font-sans text-sm leading-snug text-vastu-text-light">
              Найдите свой дом и нажмите на <b className="text-vastu-dark">два конца одной стены</b>{' '}
              (например, фасада). Эту же стену отметите на плане.
            </span>
          )}
        </div>
      </div>

      {notFound && (
        <div className="absolute left-1/2 top-20 z-[500] -translate-x-1/2 rounded-xl bg-white px-4 py-2 font-sans text-sm text-vastu-dark shadow-card">
          Адрес не найден — попробуйте по-другому или приблизьте карту вручную.
        </div>
      )}
    </div>
  )
}
