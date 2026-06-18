import { useState, useEffect, useRef } from 'react'
import { LocateFixed, Loader2 } from 'lucide-react'

interface Props {
  onLocate: (lat: number, lon: number, accuracy: number) => void
}

type State = 'idle' | 'loading' | { error: string }

export function LocationButton({ onLocate }: Props) {
  const [state, setState] = useState<State>('idle')
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  if (!navigator.geolocation) return null

  function handleClick() {
    if (state !== 'idle') return
    setState('loading')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState('idle')
        onLocate(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy)
      },
      (err) => {
        const msg =
          err.code === err.PERMISSION_DENIED ? 'Location access denied'
          : err.code === err.POSITION_UNAVAILABLE ? 'Location unavailable'
          : 'Location timed out'
        setState({ error: msg })
        timerRef.current = setTimeout(() => setState('idle'), 3000)
      },
      { timeout: 10_000 },
    )
  }

  const isLoading = state === 'loading'
  const isError = typeof state === 'object'

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title="Go to my location"
      className={[
        'absolute top-[80px] right-2 z-[1000] flex items-center gap-1.5',
        'bg-white shadow-md text-gray-700 hover:bg-gray-50 transition-colors',
        isError ? 'rounded-md px-2.5 py-2 text-xs' : 'rounded-full p-2',
        isLoading ? 'cursor-default opacity-70' : '',
      ].join(' ')}
    >
      {isLoading
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <LocateFixed className="w-4 h-4" />}
      {isError && <span>{(state as { error: string }).error}</span>}
    </button>
  )
}
