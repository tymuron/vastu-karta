// Everything Anna may want to change lives here — links, handle, file name.

export const BRAND = {
  /** Signature drawn under the plan on the finished map and in the exported PNG. */
  handle: '@annaromeo.blog',
  /** Download / share file name of the finished map. */
  fileName: 'vastu-karta-annaromeo.png',
}

export const LINKS = {
  /** Header handle → Instagram. */
  instagram: 'https://www.instagram.com/annaromeo.blog',
  telegram: 'https://t.me/annaromeodesign',
  site: 'https://annaromeovastu.com',
  /** Header nav link and the «узнать об услугах» button on the finished map. */
  services: 'https://annaromeovastu.com',
  /** Dark band under the sidebar (nativastu's «почему эта карта точнее»). */
  about: 'https://annaromeovastu.com/course',
  /** «Видео-инструкция» link on step 1. Empty string hides the link. */
  videoGuide: '',
  /** «Нет плана? Постройте в приложении…» */
  magicPlan: 'https://apps.apple.com/us/app/magicplan/id427424432',
}

/**
 * Yandex Maps key, used for flats in Russia (as on nativastu). A browser key: it sits in the
 * page by design and is locked by HTTP Referer in the Yandex console (tymur0n@yandex.ru,
 * Key #1 — JavaScript API + Geocoder, free plan: 1,000 address lookups a day).
 * Flats abroad use free maps (OpenStreetMap / Esri) that need no key.
 */
export const MAP_KEYS = {
  yandex: '4961d40e-6cdf-4c4b-a85d-f073ab5d7646',
}
