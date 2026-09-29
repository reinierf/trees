// The map position lives in the URL hash: #@52.12345,4.12345,17 — optionally followed by
// ?tree=<source>:<id> for a shared tree. Panning updates the current history entry
// (replaceState) so the back button isn't flooded; deliberate jumps (picking a place,
// locate-me) push a new entry so back returns to where the user was.

export interface TreeRef {
  source: string
  id: string
}

export interface UrlState {
  center: [number, number]
  zoom: number
  tree: TreeRef | null
}

export function parseHash(hash: string): UrlState | null {
  const m = /^#@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)(?:\?(.*))?$/.exec(hash)
  if (!m) return null
  const [lat, lon, zoom] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (Math.abs(lat) > 85 || Math.abs(lon) > 180) return null

  let tree: TreeRef | null = null
  const treeParam = new URLSearchParams(m[4] ?? '').get('tree')
  const sep = treeParam?.indexOf(':') ?? -1
  if (treeParam && sep > 0) tree = { source: treeParam.slice(0, sep), id: treeParam.slice(sep + 1) }

  return { center: [lat, lon], zoom: Math.round(zoom), tree }
}

export function readUrlState(): UrlState | null {
  return parseHash(window.location.hash)
}

function formatHash(center: [number, number], zoom: number, tree?: TreeRef): string {
  const pos = `#@${center[0].toFixed(5)},${center[1].toFixed(5)},${Math.round(zoom)}`
  return tree ? `${pos}?${new URLSearchParams({ tree: `${tree.source}:${tree.id}` })}` : pos
}

export function replaceUrlPosition(center: [number, number], zoom: number): void {
  const hash = formatHash(center, zoom)
  if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
}

export function pushUrlPosition(center: [number, number], zoom: number): void {
  window.history.pushState(null, '', formatHash(center, zoom))
}

export function shareUrl(tree: TreeRef & { lat: number; lon: number }, zoom: number): string {
  return `${window.location.origin}${window.location.pathname}${formatHash([tree.lat, tree.lon], zoom, tree)}`
}
