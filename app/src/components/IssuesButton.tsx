import { Flag } from 'lucide-react'
import { useStore, PopupKind } from '../store'
import { useT } from '../translations/useT'

export function IssuesButton() {
  const t = useT()
  const debugMode     = useStore((s) => s.debugMode)
  const popupView     = useStore((s) => s.popupView)
  const openIssues    = useStore((s) => s.openIssues)
  const closePopup    = useStore((s) => s.closePopup)
  const treeIssues    = useStore((s) => s.treeIssues)
  const speciesIssues = useStore((s) => s.speciesIssues)

  if (!debugMode) return null

  const isActive = popupView?.kind === PopupKind.Issues
  const total    = treeIssues.length + speciesIssues.length

  return (
    <button
      onClick={isActive ? closePopup : openIssues}
      title={total > 0 ? `${t('issues.title')} (${total})` : t('issues.title')}
      className={[
        'absolute z-[1000] rounded-full p-2 shadow-md transition-colors',
        'bottom-[12px] left-[12px]',
        isActive ? 'bg-gray-100 text-amber-500' : 'bg-white text-gray-700 hover:bg-gray-50',
      ].join(' ')}
    >
      <Flag className={`w-4 h-4 ${isActive || total > 0 ? 'fill-amber-400' : ''}`} />
    </button>
  )
}
