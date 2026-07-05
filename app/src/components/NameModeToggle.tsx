import { GraduationCap, Leaf } from 'lucide-react'
import { useStore } from '../store'
import { useT } from '../translations/useT'

export function NameModeToggle() {
  const t = useT()
  const nameMode = useStore((s) => s.nameMode)
  const setNameMode = useStore((s) => s.setNameMode)

  return (
    <div className="flex items-center border rounded overflow-hidden">
      <button
        title={t('nameMode.scientific')}
        onClick={() => setNameMode('scientific')}
        className={`p-1 ${nameMode === 'scientific' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <GraduationCap size={15} />
      </button>
      <button
        title={t('nameMode.vernacular')}
        onClick={() => setNameMode('vernacular')}
        className={`p-1 ${nameMode === 'vernacular' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Leaf size={15} />
      </button>
    </div>
  )
}
