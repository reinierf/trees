import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Flag, Check } from 'lucide-react'
import { CloseButton } from './InfoPopup'
import { capitalize } from '../lib/utils'
import type { Tree } from '../types'

interface FieldEntry {
  name: string
  label: string
  value: string
  autoChecked?: boolean
}

function buildFields(tree: Tree): FieldEntry[] {
  return [
    { name: 'species_binomial', label: 'Binomiaal',  value: tree.species_binomial ?? '' },
    { name: 'name_indigenous',  label: 'Soort',      value: tree.name_indigenous ?? '' },
    { name: 'species_cultivar', label: 'Cultivar',   value: tree.species_cultivar ?? '' },
    { name: 'street',           label: 'Straat',     value: capitalize(tree.street) },
    { name: 'trunk_diameter',   label: 'Stamdiam.',  value: tree.trunk_diameter != null ? String(tree.trunk_diameter) : '' },
    { name: 'crown_spread',     label: 'Kroon',      value: tree.crown_spread != null ? String(tree.crown_spread) : '' },
  ].filter((e) => e.value !== '')
}

function buildStaticFields(tree: Tree, noImages: boolean | null): FieldEntry[] {
  const entries: FieldEntry[] = []
  if (noImages === true) {
    entries.push({ name: 'no_images', label: "Geen foto's beschikbaar", value: 'ja', autoChecked: true })
  } else {
    entries.push({ name: 'images_incorrect', label: "Foto's onjuist", value: 'ja' })
  }
  if (tree.species_binomial) {
    entries.push({ name: 'wikipedia_incorrect', label: 'Wikipedia-link onjuist', value: 'ja' })
  }
  return entries
}

interface Props {
  tree: Tree
  /** true = confirmed no images; false/null = loading or images found */
  noImages: boolean | null
  onClose: () => void
  onSubmit: (fields: { name: string; value: string }[], note: string) => Promise<void>
}

export function FlagModal({ tree, noImages, onClose, onSubmit }: Props) {
  const dynamicFields = buildFields(tree)
  const staticFields = buildStaticFields(tree, noImages)
  const allFields = [...dynamicFields, ...staticFields]

  const [checked, setChecked] = useState<Set<string>>(() => {
    const initial = new Set<string>()
    for (const f of staticFields) {
      if (f.autoChecked) initial.add(f.name)
    }
    return initial
  })
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = !sent && (checked.size > 0 || note.trim() !== '')

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

  function toggleField(name: string) {
    setChecked((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const flaggedFields = allFields
        .filter((f) => checked.has(f.name))
        .map((f) => ({ name: f.name, value: f.value }))
      await onSubmit(flaggedFields, note.trim())
      setSent(true)
    } catch {
      setError('Versturen mislukt')
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-popover text-popover-foreground rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Flag size={13} className="text-muted-foreground" />
            <span className="font-semibold text-sm">Markeer datafout</span>
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
            <div className="px-4 py-3 space-y-2 overflow-y-auto max-h-72">
              {dynamicFields.map((f) => (
                <label key={f.name} className="flex items-baseline gap-3 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={checked.has(f.name)}
                    onChange={() => toggleField(f.name)}
                    className="mt-0.5 shrink-0"
                  />
                  <span className="text-sm min-w-0">
                    <span className="text-muted-foreground mr-1.5">{f.label}</span>
                    <span className="font-medium">{f.value}</span>
                  </span>
                </label>
              ))}
              <div className="border-t pt-2 space-y-2">
                {staticFields.map((f) => (
                  <label key={f.name} className="flex items-baseline gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checked.has(f.name)}
                      onChange={() => toggleField(f.name)}
                      className="mt-0.5 shrink-0"
                    />
                    <span className="text-sm text-muted-foreground">{f.label}</span>
                  </label>
                ))}
              </div>
            </div>

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
