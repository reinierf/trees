import { useEffect } from 'react'
import { fetchMeta } from './api/trees'
import { Map } from './components/Map'
import { InfoPopup } from './components/InfoPopup'
import { LoadingSpinner } from './components/LoadingSpinner'
import { SettingsButton } from './components/SettingsButton'
import { useStore } from './store'

export default function App() {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)

  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error)
  }, [setMeta])

  if (!meta) {
    return (
      <div className="w-screen h-dvh flex items-center justify-center">
        <SettingsButton />
        <div className="scale-150">
          <LoadingSpinner />
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-dvh">
      <Map />
      <InfoPopup />
      <SettingsButton />
    </div>
  )
}
