export function LoadingSpinner() {
  return (
    <svg className="animate-spin h-5 w-5 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]" style={{ color: '#333' }} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-30" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
    </svg>
  )
}
