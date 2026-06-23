// The 8-direction Vastu model — faithful to nativastu.com, enriched with the
// life-domain meaning of each direction (RU) so we can optionally label them.
// Colors are the exact pastel fills the reference tool uses.

export interface Sector {
  /** Abbreviation drawn on the map (Russian compass letters). */
  abbr: string
  /** Full Russian name (for the legend). */
  name: string
  /** Pastel fill, matching nativastu. */
  color: string
  /** Compass bearing of the sector center (deg, 0 = North, clockwise). */
  bearing: number
  /** Short life-domain label (RU) — the consultant's reading per direction. */
  domain: string
  /** Ruling planet (RU school convention). */
  planet: string
  /** Element (Indian 5-element set). */
  element: string
}

export const SECTORS: Sector[] = [
  { abbr: 'С', name: 'Север', color: '#B2E0B2', bearing: 0, domain: 'Карьера, деньги', planet: 'Меркурий', element: 'Вода' },
  { abbr: 'СВ', name: 'Северо-восток', color: '#FFE4B2', bearing: 45, domain: 'Ясность, духовность', planet: 'Юпитер', element: 'Вода/Эфир' },
  { abbr: 'В', name: 'Восток', color: '#FFFFB2', bearing: 90, domain: 'Здоровье, рост', planet: 'Солнце', element: 'Воздух' },
  { abbr: 'ЮВ', name: 'Юго-восток', color: '#FFECEF', bearing: 135, domain: 'Финансы, энергия', planet: 'Венера', element: 'Огонь' },
  { abbr: 'Ю', name: 'Юг', color: '#FFB2B2', bearing: 180, domain: 'Слава, репутация', planet: 'Марс', element: 'Огонь' },
  { abbr: 'ЮЗ', name: 'Юго-запад', color: '#B2B2B2', bearing: 225, domain: 'Отношения, стабильность', planet: 'Раху', element: 'Земля' },
  { abbr: 'З', name: 'Запад', color: '#B2B2E0', bearing: 270, domain: 'Прибыль, доходы', planet: 'Сатурн', element: 'Земля/Вода' },
  { abbr: 'СЗ', name: 'Северо-запад', color: '#B2FFFF', bearing: 315, domain: 'Помощники, связи', planet: 'Луна', element: 'Воздух' },
]

export const SECTOR_COUNT = SECTORS.length // 8
export const SECTOR_SPAN = 360 / SECTOR_COUNT // 45°

/** Cardinal directions (N/E/S/W) get a heavier axis line than the ordinals. */
export const isCardinal = (index: number) => index % 2 === 0
