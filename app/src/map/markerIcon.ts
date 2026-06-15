import L from 'leaflet'

function speciesCode(binomial: string): string {
  const parts = binomial.trim().split(/\s+/)
  // "× CHITALPA TASHKENTENSIS" → leading ×, genus is parts[1]
  const offset  = parts[0] === '×' ? 1 : 0
  const genus   = parts[offset]
  // "ACER × FREEMANII" → parts[offset+1] is '×', epithet is parts[offset+2]
  const epithet = parts[offset + 1] === '×' ? parts[offset + 2] : parts[offset + 1]

  const g1 = genus[0]?.toUpperCase() ?? '?'
  const g2 = genus[1]?.toLowerCase() ?? '?'
  if (!epithet) return `${g1}${g2}??`

  const e1 = epithet[0]?.toUpperCase() ?? '?'
  const e2 = epithet[1]?.toLowerCase() ?? '?'
  return `${g1}${g2}${e1}${e2}`
}

function buildDivIcon(code: string): L.DivIcon {
  const r = 14
  const d = r * 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" style="display:block">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#81e0b4" stroke="#2d6a4f" stroke-width="1.5"/>` +
    `<text x="${r}" y="${r + 4}" font-family="Arial" font-size="10"` +
    ` font-weight="normal" text-anchor="middle" fill="#000000">${code}</text>` +
    `</svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [d, d], iconAnchor: [r, r] })
}

function buildSelectedDivIcon(code: string): L.DivIcon {
  const r = 17
  const d = r * 2
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" style="display:block">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#81e0b4" stroke="#2d6a4f" stroke-width="1.5"/>` +
    `<text x="${r}" y="${r + 4}" font-family="Arial" font-size="10"` +
    ` font-weight="bold" text-anchor="middle" fill="#000000">${code}</text>` +
    `</svg>`
  return L.divIcon({ html: `<div class="selected-marker-inner">${svg}</div>`, className: '', iconSize: [d, d], iconAnchor: [r, r] })
}

const iconCache = new Map<string, L.DivIcon>()
const selectedIconCache = new Map<string, L.DivIcon>()

export function createSelectedSpeciesIcon(speciesBinomial: string): L.DivIcon {
  const code = speciesCode(speciesBinomial)
  let icon = selectedIconCache.get(code)
  if (!icon) {
    icon = buildSelectedDivIcon(code)
    selectedIconCache.set(code, icon)
  }
  return icon
}

export function createSpeciesIcon(speciesBinomial: string): L.DivIcon {
  const code = speciesCode(speciesBinomial)
  let icon = iconCache.get(code)
  if (!icon) {
    icon = buildDivIcon(code)
    iconCache.set(code, icon)
  }
  return icon
}

export function createClusterIcon(count: number): L.DivIcon {
  const size = count < 100 ? 34 : 40
  const r = size / 2
  const fs = count < 100 ? 11 : 9
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" style="display:block">` +
    `<circle cx="${r}" cy="${r}" r="${r - 1}" fill="#2d6a4f" opacity="0.85" stroke="white" stroke-width="1.5"/>` +
    `<text x="${r}" y="${r + 4}" font-family="Arial,sans-serif" font-size="${fs}"` +
    ` font-weight="normal" text-anchor="middle" fill="white">${count}</text>` +
    `</svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [size, size], iconAnchor: [r, r] })
}
