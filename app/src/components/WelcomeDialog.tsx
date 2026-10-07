import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Heart, LocateFixed, Share2, Signpost, TreeDeciduous, Trees, type LucideIcon } from 'lucide-react'
import { CloseButton } from './InfoPopup'
import { openContactMail } from '../lib/contact'
import { Wordmark } from './Wordmark'
import { isWelcomeHidden, setWelcomeHidden } from '../lib/welcomeStorage'
import { useT } from '../translations/useT'
import type { TranslationKey } from '../translations/strings'

// Icons match the map buttons each step refers to.
const STEPS: [LucideIcon, TranslationKey][] = [
  [Signpost, 'welcome.stepPlace'],
  [TreeDeciduous, 'welcome.stepTree'],
  [Trees, 'welcome.stepSpecies'],
  [Heart, 'welcome.stepFavourites'],
  [LocateFixed, 'welcome.stepLocation'],
]

/** Explains the site to first-time visitors; shown on load until closed with "Niet meer tonen" checked. */
export function WelcomeDialog({ onClose }: { onClose: () => void }) {
  const t = useT()
  const [hideNextTime, setHideNextTime] = useState(isWelcomeHidden)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function close() {
    setWelcomeHidden(hideNextTime)
    onClose()
  }

  function showToast(msg: string) {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  // Shares the site itself (same fallback as sharing a tree: copy the link).
  async function handleShare() {
    const url = `${window.location.origin}${window.location.pathname}`
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: document.title, url })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      showToast(t('tree.linkCopied'))
    } catch {
      showToast(url)
    }
  }

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return createPortal(
    <div
      className="fixed inset-0 z-[2003] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('welcome.title')}
        className="bg-popover text-popover-foreground rounded-2xl shadow-xl w-full max-w-md max-h-full flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <Wordmark className="text-[28px]" />
          <CloseButton onClick={close} />
        </div>

        <div className="px-5 pb-4 overflow-y-auto text-sm space-y-3">
          <p>{t('welcome.intro')}</p>
          <ul className="space-y-2">
            {STEPS.map(([Icon, key]) => (
              <li key={key} className="flex items-start gap-3">
                <Icon size={16} className="shrink-0 mt-0.5 text-muted-foreground" />
                <span>{t(key)}</span>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground">{t('welcome.disclaimer')}</p>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t text-sm">
          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hideNextTime}
              onChange={(e) => setHideNextTime(e.target.checked)}
              className="shrink-0 translate-y-[1.5px]"
            />
            {t('welcome.dontShowAgain')}
          </label>
          <div className="flex items-center gap-3">
            {toast && <span className="text-xs text-muted-foreground">{toast}</span>}
            <button
              onClick={() => void handleShare()}
              className="text-muted-foreground hover:text-foreground"
              aria-label={t('welcome.share')}
              title={t('welcome.share')}
            >
              <Share2 size={15} />
            </button>
            <button
              onClick={openContactMail}
              className="text-muted-foreground hover:text-foreground leading-none text-xl -translate-y-px"
              aria-label={t('welcome.contact')}
              title={t('welcome.contact')}
            >
              {'✉︎'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
