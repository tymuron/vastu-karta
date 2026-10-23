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
 * Map keys — browser keys: they sit in the page by design and are locked to our sites.
 * yandex — flats in Russia. Yandex console (tymur0n@yandex.ru), Key #1 — JavaScript API +
 *          Geocoder, locked by HTTP Referer, free plan: 1,000 address lookups a day.
 * google — flats abroad. Google Cloud (tymurchystiakov07@gmail.com) — Maps JavaScript API +
 *          Geocoding API, locked to our sites. Without it Google shows no map at all.
 */
export const MAP_KEYS = {
  yandex: '4961d40e-6cdf-4c4b-a85d-f073ab5d7646',
  google: 'AIzaSyBxMDuvIyP07j_9PP33vM5xRj8dn4R8Cpo',
}
