// The bomenatlas.nl logo: a tree crown of map-marker dots (same as public/favicon.svg) beside
// "bomen" bold green + "atlas" + amber "." + "nl" in Bricolage Grotesque.

const GREEN = '#2d6a4f'
const GREEN_2 = '#52b788'
const AMBER = '#f59e0b'
const TONES = [GREEN, GREEN_2, AMBER]

// Hex-grid rows of 3/4/5/4 dots centred on x=32 with 11 px spacing; tone indexes into TONES.
const ROWS: [number, number[]][] = [
  [8, [0, 1, 0]],
  [17.5, [1, 0, 0, 1]],
  [27, [0, 1, 0, 2, 0]],
  [36.5, [1, 0, 1, 0]],
]
const DOTS = ROWS.flatMap(([y, tones]) =>
  tones.map((tone, i) => ({ x: 32 + (i - (tones.length - 1) / 2) * 11, y, fill: TONES[tone] })),
)

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      {DOTS.map(({ x, y, fill }) => (
        <circle key={`${x},${y}`} cx={x} cy={y} r={4.8} fill={fill} />
      ))}
      <rect x={29} y={40} width={6} height={21} rx={2} fill={GREEN} />
    </svg>
  )
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <div
      className={`flex items-center gap-[0.375em] font-display leading-none tracking-[-0.01em] ${className}`}
      aria-label="bomenatlas.nl"
      role="img"
    >
      <LogoMark className="w-[1.3em] h-[1.3em] shrink-0" />
      <span aria-hidden="true">
        <b className="font-bold" style={{ color: GREEN }}>bomen</b>
        atlas
        <span style={{ color: AMBER }}>.</span>
        nl
      </span>
    </div>
  )
}
