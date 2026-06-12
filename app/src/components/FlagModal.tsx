import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Flag } from 'lucide-react'
import { CloseButton } from './InfoPopup'
import { capitalize } from '../lib/utils'
import type { Tree } from '../types'

interface FieldEntry {
  name: string
  label: string
  value: string
}

function buildFields(tree: Tree): FieldEntry[] {
  return [
    { name: 'species_binomial', label: 'Binomiaal',  value: tree.species_binomial ?? '' },
    { name: 'species',          label: 'Soort',      value: tree.species ?? '' },
    { name: 'species_cultivar', label: 'Cultivar',   value: tree.species_cultivar ?? '' },
    { name: 'year_planted',     label: 'Geplant',    value: tree.year_planted ?? '' },
    { name: 'street',           label: 'Straat',     value: capitalize(tree.street) },
    { name: 'neighbourhood',    label: 'Wijk',       value: tree.neighbourhood ?? '' },
    { name: 'trunk_diameter',   label: 'Stamdiam.',  value: tree.trunk_diameter != null ? String(tree.trunk_diameter) : '' },
    { name: 'crown_spread',     label: 'Kroon',      value: tree.crown_spread != null ? String(tree.crown_spread) : '' },
  ].filter((e) => e.value !== '')
}

interface Props {
  tree: Tree
  onClose: () => void
  onSubmit: (fields: { name: string; value: string }[], note: string) => Promise<void>
}

export function FlagModal({ tree, onClose, onSubmit }: Props) {
  const fields = buildFields(tree)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

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
    try {
      const flaggedFields = fields
        .filter((f) => checked.has(f.name))
        .map((f) => ({ name: f.name, value: f.value }))
      await onSubmit(flaggedFields, note.trim())
      onClose()
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[2002] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-popover text-popover-foreground rounded-2xl shadow-xl w-full max-w-sm flex flex-col">
        <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b">
          <div className="flex items-center gap-2">
            <Flag size={13} className="text-muted-foreground" />
            <span className="font-semibold text-sm">Markeer datafout</span>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="px-4 py-3 space-y-2 overflow-y-auto max-h-72">
          {fields.map((f) => (
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
        </div>

        <div className="px-4 pb-3">
          <input
            type="text"
            placeholder="Opmerking (optioneel)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
            className="w-full text-sm border rounded px-3 py-1.5 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="px-4 pb-3 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="text-sm text-muted-foreground hover:text-foreground px-3 py-1.5"
          >
            Annuleren
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="text-sm bg-foreground text-background px-4 py-1.5 rounded-lg disabled:opacity-50"
          >
            OK
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
