import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

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
