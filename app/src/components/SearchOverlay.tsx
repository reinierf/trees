import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, Search, X } from 'lucide-react'
import { useStore } from '../store'
import { capitalizeFirst } from '../lib/utils'

const MAX_RESULTS = 100

interface Props {
  onSelect: (speciesBinomial: string) => void
  onClose: () => void
  initialQuery?: string
}

export function SearchOverlay({ onSelect, onClose, initialQuery }: Props) {
  const citySpecies = useStore((s) => s.citySpecies)
  const isLoadingSpeciesFilter = useStore((s) => s.isLoadingSpeciesFilter)
  const nameMode = useStore((s) => s.nameMode)
  const [query, setQuery] = useState(initialQuery ?? '')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase()
    const matches = q
      ? citySpecies.filter(
          (s) =>
            s.species.toUpperCase().includes(q) ||
            (s.name_vernacular?.toUpperCase().includes(q) ?? false),
        )
      : citySpecies.slice()
    matches.sort((a, b) => {
      const nameA = nameMode === 'vernacular' && a.name_vernacular ? a.name_vernacular : a.species
      const nameB = nameMode === 'vernacular' && b.name_vernacular ? b.name_vernacular : b.species
      return nameA.localeCompare(nameB, 'nl')
    })
    return matches.slice(0, MAX_RESULTS)
  }, [query, citySpecies, nameMode])

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Scroll active item into view on keyboard navigation
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const active = list.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      const item = filtered[activeIndex]
      if (item) onSelect(item.species_binomial ?? item.species)
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div
      className="absolute inset-0 z-[1001] bg-black/20 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        className="absolute top-4 left-1/2 -translate-x-1/2 w-[min(90vw,292px)] bg-white rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input row */}
        <div className="flex items-center gap-2 px-3 py-2.5 border-b">
          {isLoadingSpeciesFilter ? (
            <Loader2 className="w-4 h-4 shrink-0 text-gray-400 animate-spin" />
          ) : (
            <Search className="w-4 h-4 shrink-0 text-gray-400" />
          )}
          <input
            ref={inputRef}
            type="text"
            placeholder="Zoek op soortnaam..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 text-sm outline-none placeholder:text-gray-400 bg-transparent"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="text-gray-300 hover:text-gray-500"
              tabIndex={-1}
              aria-label="Wis zoekopdracht"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 ml-1" aria-label="Sluiten">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        {citySpecies.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">Soorten laden…</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-3 text-sm text-gray-400">Geen soorten gevonden</div>
        ) : (
          <div ref={listRef} className="overflow-y-auto max-h-[min(60vh,400px)]">
            {filtered.map((item, i) => {
              const primaryName =
                nameMode === 'vernacular' && item.name_vernacular
                  ? capitalizeFirst(item.name_vernacular)
                  : capitalizeFirst(item.species)
              const secondaryName =
                nameMode === 'vernacular' && item.name_vernacular
                  ? capitalizeFirst(item.species)
                  : item.name_vernacular
                    ? capitalizeFirst(item.name_vernacular)
                    : null

              return (
                <button
                  key={item.species_binomial ?? item.species}
                  data-active={i === activeIndex ? 'true' : undefined}
                  onClick={() => onSelect(item.species_binomial ?? item.species)}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={[
                    'w-full flex items-center justify-between px-4 py-1.5 text-left text-sm transition-colors',
                    i === activeIndex ? 'bg-gray-100' : 'hover:bg-gray-50',
                  ].join(' ')}
                >
                  <span className="flex flex-col min-w-0 mr-3">
                    <span
                      className={`truncate pr-0.5 ${nameMode === 'scientific' ? 'italic' : ''}`}
                    >
                      {primaryName}
                    </span>
                    {secondaryName && (
                      <span
                        className={`text-xs text-gray-400 truncate pr-0.5 ${nameMode === 'vernacular' ? 'italic' : ''}`}
                      >
                        {secondaryName}
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-gray-400 shrink-0">
                    {item.count.toLocaleString('nl-NL')}
                  </span>
                </button>
              )
            })}
            {filtered.length === MAX_RESULTS && (
              <div className="px-4 py-2 text-xs text-gray-400 text-center border-t">
                Typ meer om te verfijnen
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
