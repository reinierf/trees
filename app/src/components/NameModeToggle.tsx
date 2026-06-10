import { GraduationCap, Leaf } from 'lucide-react'
import { useStore } from '../store'

export function NameModeToggle() {
  const nameMode = useStore((s) => s.nameMode)
  const setNameMode = useStore((s) => s.setNameMode)

  return (
    <div className="flex items-center border rounded overflow-hidden">
      <button
        title="Scientific names"
        onClick={() => setNameMode('scientific')}
        className={`p-1 ${nameMode === 'scientific' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <GraduationCap size={15} />
      </button>
      <button
        title="Indigenous names"
        onClick={() => setNameMode('indigenous')}
        className={`p-1 ${nameMode === 'indigenous' ? 'bg-gray-100 text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      >
        <Leaf size={15} />
      </button>
    </div>
  )
}
