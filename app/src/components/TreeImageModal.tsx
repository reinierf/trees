import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { TreePhoto } from '../api/useTreePhotos'

interface Props {
  thumbnail: TreePhoto
  photos: TreePhoto[] | null
  onClose: () => void
}

export function TreeImageModal({ thumbnail, photos, onClose }: Props) {
  const allPhotos = photos !== null && photos.length > 0 ? photos : [thumbnail]
  const [index, setIndex] = useState(0)
  const touchRef = useRef<{ x: number; y: number } | null>(null)

  // Reset to first photo when the full set loads
  useEffect(() => { setIndex(0) }, [photos])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, allPhotos.length - 1))
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0))
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, allPhotos.length])

  function onTouchStart(e: React.TouchEvent) {
    touchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchRef.current) return
    const dx = e.changedTouches[0].clientX - touchRef.current.x
    const dy = e.changedTouches[0].clientY - touchRef.current.y
    touchRef.current = null
    if (dy > 100 && dy > Math.abs(dx)) { onClose(); return }
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      setIndex((i) =>
        dx < 0 ? Math.min(i + 1, allPhotos.length - 1) : Math.max(i - 1, 0)
      )
    }
  }

  const current = allPhotos[index] ?? thumbnail

  return createPortal(
    <>
      {/* Modal */}
      <div
        className="fixed inset-1 z-[2001] bg-white/95 backdrop-blur-sm rounded-2xl flex flex-col overflow-hidden shadow-lg"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-4 z-10 text-white/80 hover:text-white bg-black/40 rounded-full p-1.5"
          aria-label="Sluiten"
        >
          <X size={16} />
        </button>

        {/* Large image */}
        <div className="relative flex-1 overflow-hidden p-1">
          <img
            key={current.largeUrl}
            src={current.largeUrl}
            alt=""
            className="w-full h-full object-contain"
          />
          {/* Attribution */}
          <div className="absolute bottom-3 inset-x-0 flex justify-center pointer-events-none">
            <span className="bg-black/40 text-white/85 text-[11px] leading-snug px-2.5 py-1 rounded max-w-[80%] text-center">
              {current.attribution}
            </span>
          </div>
        </div>

        {/* Thumb strip — outer scrolls, inner centers */}
        <div className="shrink-0 overflow-x-auto border-t border-gray-100">
          <div className="flex gap-2 px-3 py-2 w-max mx-auto">
            {photos === null
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 w-14 shrink-0 rounded bg-gray-200 animate-pulse"
                  />
                ))
              : allPhotos.map((p, i) => (
                  <button
                    key={p.squareUrl}
                    onClick={() => setIndex(i)}
                    className={`h-14 w-14 shrink-0 rounded overflow-hidden transition-opacity ${
                      i === index
                        ? 'ring-2 ring-gray-800 opacity-100'
                        : 'opacity-50 hover:opacity-80'
                    }`}
                  >
                    <img src={p.squareUrl} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
          </div>
        </div>
      </div>
    </>,
    document.body
  )
}
