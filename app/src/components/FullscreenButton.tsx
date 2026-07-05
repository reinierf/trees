import { useState, useEffect } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { useT } from '../translations/useT'

export function FullscreenButton() {
  const t = useT()
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    function onChange() { setIsFullscreen(!!document.fullscreenElement) }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  if (!document.fullscreenEnabled) return null

  function toggle() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  return (
    <button
      onClick={toggle}
      title={isFullscreen ? t('fullscreen.exit') : t('fullscreen.enter')}
      className="absolute top-2 right-2 z-[1000] rounded-full p-2 bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors"
    >
      {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
    </button>
  )
}
