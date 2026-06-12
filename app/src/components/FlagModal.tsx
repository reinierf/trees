import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Flag, Check } from 'lucide-react'
import { CloseButton } from './InfoPopup'
import { capitalizeFirst } from '../lib/utils'
import { useStore } from '../store'
import type { Tree } from '../types'

// ── Flag definitions ──────────────────────────────────────────────────────────

export const TREE_FLAGS = [
  { id: 'incorrect-species',  label: 'Soort klopt niet' },
  { id: 'incorrect-street',   label: 'Straat klopt niet' },
  { id: 'incorrect-location', label: 'Locatie klopt niet' },
] as const

export const SPECIES_FLAGS = [
  { id: 'misspelled',          label: 'Naam verkeerd gespeld' },
  { id: 'soortnaam-incorrect', label: 'Soortnaam incorrect' },
  { id: 'no-images',           label: "Geen of onjuiste foto's" },
  { id: 'incorrect-wiki',      label: 'Wikipedia-link onjuist' },
] as const

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatName(binomial: string | null, cultivar: string | null, dutch: string | null): string {
  if (!binomial) return dutch ?? '?'
  const base = capitalizeFirst(binomial)
  const cv = cultivar ? ` '${capitalizeFirst(cultivar)}'` : ''
  const nl = dutch ? ` (${capitalizeFirst(dutch.toLowerCase())})` : ''
  return `${base}${cv}${nl}`
}

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  mode: 'tree' | 'species'
  tree: Tree
  cityId: string
  /** true = confirmed no images (used to auto-check no-images in species mode) */
  noImages: boolean
  onClose: () => void
  onSubmit: (flags: string[], note: string) => Promise<void>
}

export function FlagModal({ mode, tree, cityId, noImages, onClose, onSubmit }: Props) {
  const treeIssues    = useStore((s) => s.treeIssues)
  const speciesIssues = useStore((s) => s.speciesIssues)

  const existing = mode === 'tree'
    ? treeIssues.find((i) => i.city === cityId && i.tree_id === tree.id)
    : speciesIssues.find((i) => i.species_binomial === tree.species_binomial)

  const flags = mode === 'tree' ? TREE_FLAGS : SPECIES_FLAGS

  const [checked, setChecked] = useState<Set<string>>(() => {
    if (existing) return new Set(existing.flags)
    if (mode === 'species' && noImages) return new Set(['no-images'])
    return new Set()
  })
  const [note, setNote]           = useState(existing?.note ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent]           = useState(false)
  const [error, setError]         = useState<string | null>(null)

  const canSubmit = checked.size > 0 || note.trim() !== ''

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!sent) return
    const t = setTimeout(onClose, 1500)
    return () => clearTimeout(t)
  }, [sent, onClose])

  function toggleFlag(id: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit([...checked], note.trim())
      setSent(true)
    } catch {
      setError('Versturen mislukt')
    } finally {
      setSubmitting(false)
    }
  }

  const nameStr = formatName(tree.species_binomial, tree.species_cultivar, tree.name_indigenous)
  const header  = mode === 'tree' ? 'Markeer datafout voor boom' : 'Markeer datafout voor soort'

  return createPortal(
    <div
      className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-popover text-popover-foreground rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Flag size={13} className="text-muted-foreground" />
            <span className="font-semibold text-sm">{header}</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        {sent ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Check size={24} className="text-green-500" />
            Gemeld
          </div>
        ) : (
          <>
            {/* Context */}
            <div className="px-4 pt-3 pb-2">
              <p className="text-sm font-medium italic">{nameStr}</p>
              {mode === 'tree' && tree.street && (
                <p className="text-xs text-muted-foreground mt-0.5">{tree.street}</p>
              )}
            </div>

            {/* Checkboxes */}
            <div className="px-4 pb-3 space-y-2 border-t pt-3">
              {flags.map((f) => (
                <label key={f.id} className="flex items-center gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked.has(f.id)}
                    onChange={() => toggleFlag(f.id)}
                    className="shrink-0"
                  />
                  <span className="text-sm">{f.label}</span>
                </label>
              ))}
            </div>

            {/* Note */}
            <div className="px-4 pb-3">
              <input
                type="text"
                placeholder="Opmerking (optioneel)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) void handleSubmit() }}
                className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            {/* Footer */}
            <div className="px-4 pb-3 flex items-center justify-end gap-2">
              {error && <span className="text-xs text-red-500 mr-auto">{error}</span>}
              <button
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
              >
                Annuleren
              </button>
              <button
                onClick={() => void handleSubmit()}
                disabled={submitting || !canSubmit}
                className="text-sm bg-foreground text-background px-4 py-1.5 rounded-lg disabled:opacity-50"
              >
                OK
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
