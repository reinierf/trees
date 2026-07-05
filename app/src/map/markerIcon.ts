import L from 'leaflet'
import { useStore } from '../store'
import { TRANSLATIONS } from '../translations/strings'
import { intlTag } from '../translations/locale'
import type { City } from '../types'

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

export function createCityCircleMarker(city: City): L.CircleMarker {
  const locale = useStore.getState().locale
  const t = TRANSLATIONS[locale]
  const isInstitution = city.type === 'institution'
  const fillColor = isInstitution
    ? (city.has_data ? '#f59e0b' : '#cbd5e1')
    : (city.has_data ? '#2d6a4f' : '#9ca3af')
  const m = L.circleMarker(city.center, {
    radius: 10,
    fillColor,
    fillOpacity: city.has_data ? 1 : 0.7,
    color: 'white',
    weight: 2,
  })
  const tooltip = city.has_data
    ? `<strong>${city.name}</strong><br>${city.tree_count.toLocaleString(intlTag(locale))} ${t['marker.trees']}`
    : `<strong>${city.name}</strong><br><em>${t['marker.dataComingSoon']}</em>`
  m.bindTooltip(tooltip, { direction: 'top', offset: [0, -12] })
  return m
}

const groupIconCache = new Map<number, L.DivIcon>()

// Multiple trees at the exact same coordinate (common for datasets positioned
// per planting-section rather than individually surveyed). Drawn as a stack of
// largely-overlapping circles (back to front) with the count badge on the
// front one — deliberately amber and shaped differently from both the plain
// green species marker and the dark-green cluster icon, so "one point,
// multiple distinct trees" doesn't read as the same thing as either.
function buildGroupIcon(count: number): L.DivIcon {
  const r = 13
  const offset = 3
  const w = r * 2
  const h = r * 2 + offset * 2
  const cx = r
  const cyBack = r + offset * 2
  const cyMid = r + offset
  const cyFront = r
  const circle = (cy: number) => `<circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="#f59e0b" stroke="#7c4a03" stroke-width="1.5"/>`
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block">` +
    circle(cyBack) + circle(cyMid) + circle(cyFront) +
    `<text x="${cx}" y="${cyFront + 4}" font-family="Arial" font-size="10"` +
    ` font-weight="bold" text-anchor="middle" fill="#ffffff">${count}</text>` +
    `</svg>`
  return L.divIcon({ html: svg, className: '', iconSize: [w, h], iconAnchor: [cx, h / 2] })
}

export function createGroupIcon(count: number): L.DivIcon {
  let icon = groupIconCache.get(count)
  if (!icon) {
    icon = buildGroupIcon(count)
    groupIconCache.set(count, icon)
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
