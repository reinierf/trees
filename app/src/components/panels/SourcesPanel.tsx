import { useState } from 'react'
import { useStore } from '../../store'
import { CloseButton, CollapseButton, PopupShell } from '../InfoPopup'
import { useT } from '../../translations/useT'
import { getSourceDescription } from '../../translations/cityFields'
import { intlTag, type Locale } from '../../translations/locale'
import type { Source } from '../../types'

/** The datasets the trees in view come from, most trees first. */
export function SourcesPanel() {
  const closePopup = useStore((s) => s.closePopup)
  const locale = useStore((s) => s.locale)
  const sourcesInView = useStore((s) => s.sourcesInView)
  const sourcesById = useStore((s) => s.sourcesById)
  const t = useT()
  const [collapsed, setCollapsed] = useState(false)

  const inView = Object.entries(sourcesInView)
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => ({ source: sourcesById.get(id), count }))
    .filter((e): e is { source: Source; count: number } => e.source !== undefined)

  return (
    <PopupShell>
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <CollapseButton collapsed={collapsed} onClick={() => setCollapsed((c) => !c)} />
          <span className="font-semibold text-sm">
            {t('sources.title')}{' '}
            <span className="text-muted-foreground font-normal">({inView.length})</span>
          </span>
        </div>
        <CloseButton onClick={closePopup} />
      </div>

      {!collapsed && (
        <div className="overflow-y-auto max-h-[60vh] divide-y divide-gray-100">
          {inView.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t('species.empty')}</p>
          )}
          {inView.map(({ source, count }) => {
            const description = getSourceDescription(source, locale)
            return (
              <div key={source.id} className="px-3 py-3 space-y-1.5 text-sm">
                <p className="font-semibold">{source.name}</p>
                <Row label={t('sources.inView')} value={count.toLocaleString(intlTag(locale))} />
                <Row label={t('cityInfo.trees')} value={source.tree_count.toLocaleString(intlTag(locale))} />
                {source.meta?.source && <Row label={t('cityInfo.source')} value={source.meta.source} />}
                {source.meta?.lastFetched && (
                  <Row label={t('cityInfo.updated')} value={formatDate(source.meta.lastFetched, locale)} />
                )}
                {description && (
                  <p className="text-xs text-muted-foreground pt-1">{description}</p>
                )}
              </div>
            )
          })}
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
