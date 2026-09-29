import { useEffect } from 'react'
import { Undo2 } from 'lucide-react'
import { useStore } from '../store'
import { useT } from '../translations/useT'

// How long the bar stays after a jump; the browser's back button keeps working after that.
const BACK_BAR_MS = 8000

/**
 * Shown for a while after flying far away (nearest tree): one tap returns to the previous
 * view. Back already does this, since the jump added a history entry, but on phones and in an
 * installed web app the back button is easy to overlook.
 */
export function BackBar() {
  const t = useT()
  const backBarAt = useStore((s) => s.backBarAt)
  const hideBackBar = useStore((s) => s.hideBackBar)

  useEffect(() => {
    if (backBarAt === null) return
    const timer = setTimeout(hideBackBar, BACK_BAR_MS)
    return () => clearTimeout(timer)
  }, [backBarAt, hideBackBar])

  if (backBarAt === null) return null

  return (
    <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[1000]">
      <button
        onClick={() => { hideBackBar(); window.history.back() }}
        className="flex items-center gap-2 bg-white/95 backdrop-blur-sm px-3 py-2 rounded-lg shadow-md text-sm text-gray-700 hover:bg-gray-50 whitespace-nowrap"
      >
        <Undo2 className="w-4 h-4" />
        {t('nearest.back')}
      </button>
    </div>
  )
}
