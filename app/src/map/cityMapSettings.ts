import { MAP_ZOOM, MIN_FETCH_ZOOM, MAX_VIEWPORT_DEG2, CLUSTER_DISABLE_ZOOM } from '../config'
import type { City } from '../types'

// Single source of truth for which config.ts default pairs with which
// per-city override, so call sites don't have to repeat `city?.x ?? X` and
// risk forgetting the pairing when a new override is added.
export function getMapSettings(city: City | null) {
  return {
    mapZoom:            city?.mapZoom ?? MAP_ZOOM,
    minFetchZoom:       city?.minFetchZoom ?? MIN_FETCH_ZOOM,
    maxViewportDeg2:    city?.maxViewportDeg2 ?? MAX_VIEWPORT_DEG2,
    clusterDisableZoom: city?.clusterDisableZoom ?? CLUSTER_DISABLE_ZOOM,
  }
}
