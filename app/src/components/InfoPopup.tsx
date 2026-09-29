import { ChevronDown } from 'lucide-react'
import { useStore, PopupKind } from '../store'
import { useT } from '../translations/useT'
import { SpeciesListPanel } from './panels/SpeciesListPanel'
import { TreeDetailPanel } from './panels/TreeDetailPanel'
import { FavouritesPanel } from './panels/FavouritesPanel'
import { IssuesPanel } from './panels/IssuesPanel'
import { SourcesPanel } from './panels/SourcesPanel'
import { SamePointListPanel } from './panels/SamePointListPanel'

export const BASE =
  'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden'

export function PopupShell({ children }: { children: React.ReactNode }) {
  return <div className={BASE}>{children}</div>
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground leading-none text-2xl"
      aria-label={t('popup.close')}
    >
      ×
    </button>
  )
}

export function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  const t = useT()
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground"
      aria-label={collapsed ? t('popup.expand') : t('popup.collapse')}
    >
      <ChevronDown size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  )
}

export function InfoPopup() {
  const popupView = useStore((s) => s.popupView)

  if (!popupView) return null
  if (popupView.kind === PopupKind.Favourites) return <FavouritesPanel />
  if (popupView.kind === PopupKind.Issues) return <IssuesPanel />
  if (popupView.kind === PopupKind.Sources) return <SourcesPanel />
  if (popupView.kind === PopupKind.SpeciesList)
    return (
      <SpeciesListPanel
        expandedSpecies={popupView.expandedSpecies}
        selectedTreeKey={popupView.selectedTreeKey}
        initialQuery={popupView.query}
      />
    )
  if (popupView.kind === PopupKind.SamePointList)
    return <SamePointListPanel trees={popupView.trees} />
  return <TreeDetailPanel tree={popupView.tree} returnTo={popupView.returnTo} />
}
