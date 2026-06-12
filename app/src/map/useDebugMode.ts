import { useEffect } from 'react'
import { useStore } from '../store'

export function useDebugMode() {
  const setDebugMode = useStore((s) => s.setDebugMode)

  useEffect(() => {
    const buf: string[] = []
    const handleKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key.length !== 1) return
      buf.push(e.key.toLowerCase())
      if (buf.length > 3) buf.shift()
      if (buf.join('') === 'dbg') setDebugMode(!useStore.getState().debugMode)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [setDebugMode])
}
