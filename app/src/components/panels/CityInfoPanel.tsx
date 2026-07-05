import { useState } from 'react'
import { useStore } from '../../store'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { useT } from '../../translations/useT'
import { getCityDescription } from '../../translations/cityFields'
import { intlTag, type Locale } from '../../translations/locale'
import type { City } from '../../types'

interface Props {
  city: City | null
}

export function CityInfoPanel({ city }: Props) {
  const closePopup = useStore((s) => s.closePopup)
  const locale = useStore((s) => s.locale)
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)

  const description = city ? getCityDescription(city, locale) : undefined

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <span className="font-semibold text-sm">{city?.name ?? '—'}</span>
        </div>
        <CloseButton onClick={closePopup} />
      </div>

      {!collapsed && city && (
        <div className="px-3 py-3 space-y-2 text-sm">
          <Row label={t('cityInfo.trees')} value={city.tree_count.toLocaleString(intlTag(locale))} />
          {city.meta?.source && <Row label={t('cityInfo.source')} value={city.meta.source} />}
          {city.meta?.lastFetched && (
            <Row label={t('cityInfo.updated')} value={formatDate(city.meta.lastFetched, locale)} />
          )}
          {description && (
            <p className="text-xs text-muted-foreground pt-1">{description}</p>
          )}
        </div>
      )}
    </PopupShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  )
}

function formatDate(iso: string, locale: Locale): string {
  const [year, month, day] = iso.split('-').map(Number)
  return new Date(year, month - 1, day).toLocaleDateString(intlTag(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}
