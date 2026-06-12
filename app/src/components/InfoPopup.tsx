import { ChevronDown } from 'lucide-react'
import { useStore } from '../store'
import { SpeciesListPanel } from './panels/SpeciesListPanel'
import { TreeDetailPanel } from './panels/TreeDetailPanel'
import { FavouritesPanel } from './panels/FavouritesPanel'
import { IssuesPanel } from './panels/IssuesPanel'
import type { City } from '../types'

export const BASE =
  'fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden'

export function PopupShell({ children }: { children: React.ReactNode }) {
  return <div className={BASE}>{children}</div>
}

export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground leading-none text-2xl"
      aria-label="Close"
    >
      ×
    </button>
  )
}

export function CollapseButton({ collapsed, onClick }: { collapsed: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-muted-foreground hover:text-foreground"
      aria-label={collapsed ? 'Uitklappen' : 'Inklappen'}
    >
      <ChevronDown size={16} className={`transition-transform ${collapsed ? 'rotate-180' : ''}`} />
    </button>
  )
}

interface Props {
  cities: City[]
  currentCityId: string
}

export function InfoPopup({ cities, currentCityId }: Props) {
  const popupView = useStore((s) => s.popupView)

  if (!popupView) return null
  if (popupView.kind === 'favourites')
    return <FavouritesPanel cities={cities} currentCityId={currentCityId} />
  if (popupView.kind === 'issues')
    return <IssuesPanel cities={cities} currentCityId={currentCityId} />
  if (popupView.kind === 'species-list')
    return (
      <SpeciesListPanel
        expandedSpecies={popupView.expandedSpecies}
        selectedTreeId={popupView.selectedTreeId}
      />
    )
  return (
    <TreeDetailPanel
      tree={popupView.tree}
      returnTo={popupView.returnTo}
      cityId={currentCityId}
    />
  )
}
