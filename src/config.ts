// Everything Anna may want to change lives here — links, handle, file name.

export const BRAND = {
  /** Signature drawn under the plan on the finished map and in the exported PNG. */
  handle: '@annaromeo.blog',
  /** Download / share file name of the finished map. */
  fileName: 'vastu-map-annaromeo.png',
}

export const LINKS = {
  /** Header handle → Instagram. */
  instagram: 'https://www.instagram.com/annaromeo.blog',
  telegram: 'https://t.me/annaromeodesign',
  site: 'https://annaromeovastu.com',
  /** Header «consultations» link and the «explore consultations» button on the finished map. */
  services: 'https://annaromeovastu.com',
  /** Dark band under the sidebar («Vastu design with Anna Romeo»). */
  about: 'https://annaromeovastu.com/course',
  /** «Video guide» link on step 1. Empty string hides the link. */
  videoGuide: '',
  /** «No plan? You can draw one in the magicplan app» */
  magicPlan: 'https://apps.apple.com/us/app/magicplan/id427424432',
}

/**
 * Google Maps browser key (Maps JavaScript API + Geocoding API). It sits in the page by design
 * and is locked to our sites in Google Cloud (tymurchystiakov07@gmail.com, website
 * restrictions). Without it Google shows no map at all.
 */
export const MAP_KEYS = {
  google: 'AIzaSyBxMDuvIyP07j_9PP33vM5xRj8dn4R8Cpo',
}
