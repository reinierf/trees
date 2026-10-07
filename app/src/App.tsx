import { useEffect } from 'react'
import { fetchMeta } from './api/trees'
import { Map } from './components/Map'
import { InfoPopup } from './components/InfoPopup'
import { LoadingSpinner } from './components/LoadingSpinner'
import { SettingsButton } from './components/SettingsButton'
import { WelcomeDialog } from './components/WelcomeDialog'
import { useStore } from './store'

export default function App() {
  const meta = useStore((s) => s.meta)
  const setMeta = useStore((s) => s.setMeta)
  const welcomeOpen = useStore((s) => s.welcomeOpen)
  const setWelcomeOpen = useStore((s) => s.setWelcomeOpen)
  const welcome = welcomeOpen && <WelcomeDialog onClose={() => setWelcomeOpen(false)} />

  useEffect(() => {
    fetchMeta().then(setMeta).catch(console.error)
  }, [setMeta])

  if (!meta) {
    return (
      <div className="w-screen h-dvh flex items-center justify-center">
        {!welcomeOpen && <SettingsButton />}
        <div className="scale-150">
          <LoadingSpinner />
        </div>
        {welcome}
      </div>
    )
  }

  return (
    <div className="w-screen h-dvh">
      <Map controls={!welcomeOpen} />
      {!welcomeOpen && <InfoPopup />}
      {!welcomeOpen && <SettingsButton />}
      {welcome}
    </div>
  )
}
