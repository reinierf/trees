import { useStore } from '../store'
import { SpeciesListPanel } from './panels/SpeciesListPanel'
import { TreeDetailPanel } from './panels/TreeDetailPanel'

export const BASE =
  'absolute bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[1000] w-72 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg overflow-hidden'

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

interface Props {
  onCenter: (lat: number, lon: number) => void
}

export function InfoPopup({ onCenter }: Props) {
  const popupView = useStore((s) => s.popupView)

  if (!popupView) return null
  if (popupView.kind === 'species-list')
    return (
      <SpeciesListPanel
        expandedSpecies={popupView.expandedSpecies}
        selectedTreeId={popupView.selectedTreeId}
        onCenter={onCenter}
      />
    )
  return (
    <TreeDetailPanel tree={popupView.tree} onCenter={onCenter} />
  )
}
