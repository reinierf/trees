import { capitalizeFirst } from '../../lib/utils'
import { displayName, useSpeciesNames } from '../../lib/species'
import { treeKey } from '../../lib/treeKey'
import { useTreesDetails } from '../../api/useTreeDetails'
import { useStore, PopupKind } from '../../store'
import { PopupShell, CloseButton } from '../InfoPopup'
import type { Tree } from '../../types'

interface Props {
  trees: Tree[]
}

export function SamePointListPanel({ trees }: Props) {
  const openTreeDetail = useStore((s) => s.openTreeDetail)
  const closePopup = useStore((s) => s.closePopup)
  const nameMode = useStore((s) => s.nameMode)
  const names = useSpeciesNames()
  const details = useTreesDetails(trees)

  return (
    <PopupShell>
      <div className="px-4 pt-2 pb-2 flex items-center justify-between gap-2 border-b">
        <span className="font-semibold text-sm">{trees.length} bomen op dezelfde locatie</span>
        <CloseButton onClick={closePopup} />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {trees.map((tree) => {
          const key = treeKey(tree)
          const d = details.get(key)
          const cultivar = d?.species_cultivar ? ` '${capitalizeFirst(d.species_cultivar)}'` : ''
          return (
            <button
              key={key}
              onClick={() => openTreeDetail(tree, PopupKind.SamePointList)}
              className="w-full flex items-center justify-between gap-2 px-4 py-1.5 text-sm text-left hover:bg-gray-100 border-b last:border-b-0"
            >
              <span className={`min-w-0 truncate ${nameMode === 'scientific' ? 'italic' : ''}`}>
                {displayName(names(tree.speciesId), nameMode)}{nameMode === 'scientific' ? cultivar : ''}
              </span>
              {d?.year_planted && (
                <span className="text-xs text-muted-foreground shrink-0">{d.year_planted}</span>
              )}
            </button>
          )
        })}
      </div>
    </PopupShell>
  )
}
