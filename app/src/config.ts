export const DEBOUNCE_MS = 300
export const MAX_CACHE_TILES = 2000      // LRU cap of the tile cache (all zooms and filters together)

// Limits of the API — keep in sync with api/index.php.
export const MIN_MAP_ZOOM = 5            // lowest zoom with precomputed clusters (MIN_PYRAMID_ZOOM)
export const MAX_TILES_PER_REQUEST = 100
export const MAX_SPECIES_TILES = 400
export const MAX_DETAILS_PER_REQUEST = 200

export const NL_CENTER: [number, number] = [52.22, 5.29]
export const NL_ZOOM = 7               // zoom level for the Netherlands overview

export const PLACES_OVERLAY_MAX_ZOOM = 11 // zooming in beyond this hides the places overlay
export const PLACE_MAX_ZOOM = 17        // zoom cap when fitting the map to a place's extent
export const SHARE_ZOOM = 19            // zoom level used when opening a shared tree link
export const MAP_MAX_ZOOM = 19          // OSM standard tile layer cap
export const CLUSTER_DISABLE_ZOOM = 18  // zoom level at and above which markers are individual, possibly overridden per source

export const LOCATION_MIN_ZOOM = 15     // zoom floor when flying to the user's GPS location, however inaccurate
export const LOCATION_MAX_ZOOM = MAP_MAX_ZOOM  // zoom ceiling for a highly accurate GPS fix

// Number of recently visited places shown in the place picker dropdown.
export const CITY_MENU_RECENT_COUNT = 5

// Override with VITE_API_BASE (e.g. './api' in production) when needed.
const envApiBase = import.meta.env.VITE_API_BASE?.trim()
export const API_BASE = envApiBase
	? envApiBase.replace(/\/$/, '')
	: import.meta.env.BASE_URL === '/'
		? '/api'
		: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`
