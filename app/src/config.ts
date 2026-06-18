export const CELL_SIZE_DEG = 0.005
export const MAX_VIEWPORT_DEG2 = 0.04
export const MAX_CACHE_CELLS = 666
export const DEBOUNCE_MS = 300
export const MIN_FETCH_ZOOM = 16        // zoom level below which fetch is skipped and "zoom in" banner shows
export const MIN_CITY_SWITCH_ZOOM = 12  // zoom level below which auto city-switching is suppressed

export const RESTORE_CITY_POSITION = false  // restore last saved position when switching city; false always opens at city center

export const NL_CENTER: [number, number] = [52.22, 5.29]
export const NL_ZOOM = 7               // zoom level for the Netherlands overview

export const MAP_ZOOM = 14              // initial map zoom level
export const SHARE_ZOOM = 19            // zoom level used when opening a shared tree link
export const MAP_MAX_ZOOM = 19          // OSM standard tile layer cap
export const CLUSTER_DISABLE_ZOOM = 18  // zoom level at and above which markers are individual

export const LOCATION_MIN_ZOOM = 15     // zoom floor when flying to the user's GPS location, however inaccurate
export const LOCATION_MAX_ZOOM = MAP_MAX_ZOOM  // zoom ceiling for a highly accurate GPS fix

export const API_LIMIT = 20000
export const CITY_OVERVIEW_ZOOM = 12

// Number of recently visited cities shown in the city picker dropdown.
export const CITY_MENU_RECENT_COUNT = 5

// Override with VITE_API_BASE (e.g. './api' in production) when needed.
const envApiBase = import.meta.env.VITE_API_BASE?.trim()
export const API_BASE = envApiBase
	? envApiBase.replace(/\/$/, '')
	: import.meta.env.BASE_URL === '/'
		? '/api'
		: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`
