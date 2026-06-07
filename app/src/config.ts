export const CELL_SIZE_DEG = 0.005
export const MAX_VIEWPORT_DEG2 = 0.04
export const MAX_CACHE_CELLS = 666
export const DEBOUNCE_MS = 300
export const MIN_FETCH_ZOOM = 16        // zoom level below which fetch is skipped and "zoom in" banner shows

export const MAP_ZOOM = 17              // initial map zoom level
export const MAP_MAX_ZOOM = 19          // OSM standard tile layer cap
export const CLUSTER_DISABLE_ZOOM = 18  // zoom level at and above which markers are individual

export const API_LIMIT = 20000

// Override with VITE_API_BASE (e.g. './api' in production) when needed.
const envApiBase = import.meta.env.VITE_API_BASE?.trim()
export const API_BASE = envApiBase
	? envApiBase.replace(/\/$/, '')
	: import.meta.env.BASE_URL === '/'
		? '/api'
		: `${import.meta.env.BASE_URL.replace(/\/$/, '')}/api`
