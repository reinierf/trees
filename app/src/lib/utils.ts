import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { LOCATION_MIN_ZOOM, LOCATION_MAX_ZOOM } from '../config'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function capitalizeFirst(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  return trimmed[0].toUpperCase() + trimmed.slice(1).toLowerCase()
}

export function capitalize(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => capitalizeFirst(word))
    .join(' ')
}

// Halving the GPS accuracy radius should roughly double the map resolution (one zoom level),
// since Web Mercator meters-per-pixel halves with each zoom step.
export function zoomForAccuracy(accuracyMeters: number): number {
  const zoom = Math.round(LOCATION_MAX_ZOOM - Math.log2(Math.max(accuracyMeters, 10) / 10))
  return Math.min(LOCATION_MAX_ZOOM, Math.max(LOCATION_MIN_ZOOM, zoom))
}
