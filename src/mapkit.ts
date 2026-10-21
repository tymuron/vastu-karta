// The map and address search: free maps everywhere (OpenStreetMap / Esri imagery, Esri address
// search with Nominatim as its fallback) — no key, no card. The Russian copy uses Yandex for flats in Russia.

import type { LatLng } from './maps/base'
import { freeResolve, freeReverse, freeSearch } from './maps/free'

export type { LatLng } from './maps/base'

export interface Place {
  /** full address line, street first */
  address: string
  lat?: number
  lng?: number
  /** Esri suggestion key, turned into coordinates when picked */
  magicKey?: string
}

/** Up to 5 places — near the visible map, and with the house number typed ranked first.
 *  `submitted`: «Find» or Enter was pressed, not just typing. */
export async function searchPlaces(q: string, near: [LatLng, LatLng] | null, submitted: boolean): Promise<Place[]> {
  const centre = near ? ([(near[0][0] + near[1][0]) / 2, (near[0][1] + near[1][1]) / 2] as LatLng) : null
  const list: Place[] = await freeSearch(q, centre, 'en', submitted)
  const seen = new Set<string>()
  const uniq = list.filter((x) => !seen.has(x.address) && seen.add(x.address))
  const nums = q.match(/\d+[a-z]?/gi) ?? []
  const hasNums = (a: string) => nums.every((n) => new RegExp(`(^|\\D)${n}(\\D|$)`, 'i').test(a))
  return [...uniq.filter((x) => hasNums(x.address)), ...uniq.filter((x) => !hasNums(x.address))].slice(0, 5)
}

/** Coordinates of a picked place (suggestions come without them). */
export async function resolvePlace(place: Place): Promise<LatLng | null> {
  try {
    return await freeResolve(place, 'en')
  } catch {
    return null
  }
}

/** Address line of the building at a point (street first). */
export async function reverseAddress(ll: LatLng): Promise<string | null> {
  try {
    return await freeReverse(ll, 'en')
  } catch {
    return null
  }
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}

// ── where the map opens ──
// nativastu always opens on Moscow. We open where the visitor probably is, judged by the
// phone's time zone (no permission prompt): their city or country, else their continent.

const RU_ZONES: Record<string, LatLng> = {
  'Europe/Moscow': [55.7512, 37.6184],
  'Europe/Kaliningrad': [54.7104, 20.4522],
  'Europe/Samara': [53.1959, 50.1002],
  'Europe/Volgograd': [48.708, 44.5133],
  'Europe/Saratov': [51.5336, 46.0343],
  'Europe/Ulyanovsk': [54.3142, 48.4031],
  'Europe/Astrakhan': [46.3479, 48.0336],
  'Europe/Kirov': [58.6036, 49.668],
  'Asia/Yekaterinburg': [56.8389, 60.6057],
  'Asia/Omsk': [54.9885, 73.3242],
  'Asia/Novosibirsk': [55.0084, 82.9357],
  'Asia/Barnaul': [53.3548, 83.7698],
  'Asia/Tomsk': [56.4847, 84.9482],
  'Asia/Novokuznetsk': [53.7576, 87.136],
  'Asia/Krasnoyarsk': [56.0153, 92.8932],
  'Asia/Irkutsk': [52.2869, 104.305],
  'Asia/Chita': [52.0515, 113.4712],
  'Asia/Yakutsk': [62.0355, 129.6755],
  'Asia/Vladivostok': [43.1198, 131.8869],
  'Asia/Sakhalin': [46.9591, 142.738],
  'Asia/Magadan': [59.568, 150.8085],
  'Asia/Kamchatka': [53.0452, 158.6483],
}

const ZONES: Record<string, [number, number, number]> = {
  'Asia/Kolkata': [22.5, 79.0, 5],
  'Asia/Calcutta': [22.5, 79.0, 5],
  'Asia/Colombo': [7.9, 80.7, 8],
  'Asia/Kathmandu': [28.4, 84.1, 7],
  'Asia/Dhaka': [23.7, 90.4, 7],
  'Asia/Karachi': [29.9, 69.3, 5],
  'Asia/Kuala_Lumpur': [3.14, 101.69, 9],
  'Asia/Manila': [12.9, 121.8, 6],
  'Asia/Jakarta': [-6.2, 106.85, 9],
  'Africa/Johannesburg': [-29.0, 25.0, 5],
  'Africa/Nairobi': [-1.29, 36.82, 9],
  'Africa/Lagos': [9.1, 8.7, 6],
  'America/Phoenix': [33.45, -112.07, 8],
  'America/Halifax': [44.65, -63.58, 8],
  'America/Edmonton': [53.55, -113.49, 8],
  'America/Mexico_City': [19.43, -99.13, 8],
  'America/Sao_Paulo': [-23.55, -46.63, 8],
  'Australia/Melbourne': [-37.81, 144.96, 8],
  'Australia/Brisbane': [-27.47, 153.03, 8],
  'Australia/Perth': [-31.95, 115.86, 8],
  'Australia/Adelaide': [-34.93, 138.6, 8],
  'Pacific/Auckland': [-41.0, 174.0, 5],
  'Europe/Madrid': [40.2, -3.7, 6],
  'Atlantic/Canary': [28.3, -15.8, 8],
  'Europe/Lisbon': [39.6, -8.0, 7],
  'Europe/Paris': [46.6, 2.4, 6],
  'Europe/Monaco': [43.738, 7.424, 13],
  'Europe/Berlin': [51.2, 10.4, 6],
  'Europe/Rome': [42.6, 12.6, 6],
  'Europe/London': [53.5, -2.0, 6],
  'Europe/Dublin': [53.3, -7.9, 7],
  'Europe/Amsterdam': [52.2, 5.3, 7],
  'Europe/Brussels': [50.6, 4.5, 8],
  'Europe/Luxembourg': [49.7, 6.1, 9],
  'Europe/Zurich': [46.8, 8.2, 7],
  'Europe/Vienna': [47.6, 14.1, 7],
  'Europe/Prague': [49.8, 15.5, 7],
  'Europe/Warsaw': [52.1, 19.4, 6],
  'Europe/Budapest': [47.2, 19.4, 7],
  'Europe/Bratislava': [48.7, 19.7, 7],
  'Europe/Ljubljana': [46.1, 14.8, 8],
  'Europe/Zagreb': [45.1, 15.2, 7],
  'Europe/Belgrade': [44.0, 20.9, 7],
  'Europe/Podgorica': [42.7, 19.3, 8],
  'Europe/Sarajevo': [43.9, 17.7, 7],
  'Europe/Skopje': [41.6, 21.7, 8],
  'Europe/Tirane': [41.2, 20.0, 8],
  'Europe/Athens': [38.5, 23.6, 6],
  'Europe/Sofia': [42.7, 25.3, 7],
  'Europe/Bucharest': [45.9, 25.0, 6],
  'Europe/Chisinau': [47.0, 28.8, 7],
  'Europe/Kyiv': [49.0, 31.3, 6],
  'Europe/Kiev': [49.0, 31.3, 6],
  'Europe/Minsk': [53.7, 27.9, 6],
  'Europe/Riga': [56.9, 24.6, 7],
  'Europe/Vilnius': [55.2, 23.9, 7],
  'Europe/Tallinn': [58.6, 25.0, 7],
  'Europe/Helsinki': [61.9, 25.7, 5],
  'Europe/Stockholm': [60.1, 18.6, 5],
  'Europe/Oslo': [60.5, 8.5, 5],
  'Europe/Copenhagen': [56.0, 10.0, 7],
  'Europe/Istanbul': [39.0, 35.2, 6],
  'Europe/Malta': [35.9, 14.4, 10],
  'Asia/Nicosia': [35.1, 33.4, 9],
  'Europe/Nicosia': [35.1, 33.4, 9],
  'Asia/Tbilisi': [42.3, 43.4, 7],
  'Asia/Yerevan': [40.1, 45.0, 8],
  'Asia/Baku': [40.4, 47.6, 7],
  'Asia/Almaty': [48.0, 67.0, 5],
  'Asia/Tashkent': [41.4, 64.6, 6],
  'Asia/Bishkek': [41.2, 74.8, 7],
  'Asia/Dubai': [25.2, 55.3, 9],
  'Asia/Qatar': [25.3, 51.2, 9],
  'Asia/Jerusalem': [31.5, 34.9, 8],
  'Asia/Bangkok': [13.7, 100.5, 6],
  'Asia/Makassar': [-8.4, 115.2, 9],
  'Asia/Singapore': [1.35, 103.82, 11],
  'Asia/Hong_Kong': [22.3, 114.17, 11],
  'Asia/Tokyo': [36.2, 138.3, 5],
  'Asia/Shanghai': [35.9, 104.2, 4],
  'America/New_York': [40.7, -74.0, 7],
  'America/Chicago': [41.88, -87.63, 7],
  'America/Denver': [39.74, -104.99, 7],
  'America/Los_Angeles': [34.05, -118.24, 7],
  'America/Toronto': [43.65, -79.38, 7],
  'America/Vancouver': [49.28, -123.12, 8],
  'Australia/Sydney': [-33.87, 151.21, 8],
}

const CONTINENTS: Record<string, [number, number, number]> = {
  Europe: [50, 10, 4],
  Africa: [5, 20, 3],
  America: [35, -95, 3],
  Asia: [35, 80, 3],
  Australia: [-27, 134, 4],
  Atlantic: [40, -20, 3],
  Indian: [-10, 75, 3],
  Pacific: [0, -160, 3],
}

export function startView(): { center: LatLng; zoom: number } {
  let tz = ''
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  } catch {
    /* very old browser */
  }
  if (RU_ZONES[tz]) return { center: RU_ZONES[tz], zoom: 11 }
  const z = ZONES[tz] ?? CONTINENTS[tz.split('/')[0]]
  return z ? { center: [z[0], z[1]], zoom: z[2] } : { center: [48, 12], zoom: 4 }
}
