// The URL is <base><place>#@52.12345,4.12345,17: the map position lives in the hash, the place in
// view (if any) in the path, e.g. /rotterdam#@51.92,4.47,15. The path is a label kept in sync
// with the view (setUrlPlace); the server (api/page.php) uses it for the page's title and tags.
//
// Entry points:
//   /rotterdam  or  #/rotterdam            the map fits that place
//   /rotterdam?boom=<id>#@lat,lon,zoom     a shared tree (shareUrl); the server builds its preview
//   #@lat,lon,zoom?tree=<source>:<id>      a shared tree in the older form
// After the first move the URL becomes a position like any other (?boom= is dropped).
//
// Panning updates the current history entry (replaceState) so the back button isn't flooded;
// deliberate jumps (picking a place, locate-me) push a new entry so back returns to where the
// user was.

export interface TreeRef {
  source: string
  id: string
}

export type UrlState =
  | { kind: 'position'; center: [number, number]; zoom: number; tree: TreeRef | null }
  | { kind: 'place'; sourceId: string }

// Directory the app is served from ('/' or '/subfolder/'), and the place in the path.
let basePath = '/'
let place: string | null = null

/**
 * Reads the URL and remembers its base and place for the URLs written afterwards.
 * isPlace tells known source ids apart from other path segments (e.g. index.html).
 */
export function readUrlState(isPlace: (id: string) => boolean): UrlState | null {
  const { pathname, search, hash } = window.location
  const slash = pathname.lastIndexOf('/')
  basePath = pathname.slice(0, slash + 1)
  const segment = decodeURIComponent(pathname.slice(slash + 1)).toLowerCase()
  place = segment && isPlace(segment) ? segment : null

  const state = parseHash(hash)
  const boom = new URLSearchParams(search).get('boom')
  if (state?.kind === 'position' && !state.tree && place && boom) state.tree = { source: place, id: boom }
  if (!state && place) return { kind: 'place', sourceId: place }
  return state
}

export function parseHash(hash: string): UrlState | null {
  const placeHash = /^#\/([a-z0-9-]+)\/?$/i.exec(hash)
  if (placeHash) return { kind: 'place', sourceId: placeHash[1].toLowerCase() }

  const m = /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:\?(.*))?$/.exec(hash)
  if (!m) return null
  const [lat, lon, zoom] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null

  let tree: TreeRef | null = null
  const treeParam = new URLSearchParams(m[4] ?? '').get('tree')
  const sep = treeParam?.indexOf(':') ?? -1
  if (treeParam && sep > 0) tree = { source: treeParam.slice(0, sep), id: treeParam.slice(sep + 1) }

  return { kind: 'position', center: [lat, lon], zoom: Math.round(zoom), tree }
}

function formatHash(center: [number, number], zoom: number): string {
  return `#@${center[0].toFixed(5)},${center[1].toFixed(5)},${Math.round(zoom)}`
}

function url(hash: string): string {
  return `${basePath}${place ?? ''}${hash}`
}

function currentUrl(): string {
  const { pathname, search, hash } = window.location
  return pathname + search + hash
}

export function replaceUrlPosition(center: [number, number], zoom: number): void {
  const next = url(formatHash(center, zoom))
  if (currentUrl() !== next) window.history.replaceState(window.history.state, '', next)
}

export function pushUrlPosition(center: [number, number], zoom: number): void {
  window.history.pushState(null, '', url(formatHash(center, zoom)))
}

/** Puts the place in view in the path (null: none), keeping the position. */
export function setUrlPlace(sourceId: string | null): void {
  if (sourceId === place) return
  place = sourceId
  const hash = window.location.hash
  window.history.replaceState(window.history.state, '', url(hash.startsWith('#@') ? hash.replace(/\?.*$/, '') : ''))
}

export function shareUrl(tree: TreeRef & { lat: number; lon: number }, zoom: number): string {
  const query = new URLSearchParams({ boom: tree.id })
  return `${window.location.origin}${basePath}${tree.source}?${query}${formatHash([tree.lat, tree.lon], zoom)}`
}
