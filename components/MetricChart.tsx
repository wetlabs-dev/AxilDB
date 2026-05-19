import { cn } from '@/lib/utils'

type MetricPoint = {
  at: Date
  value: number
}

type MetricChartProps = {
  title: string
  value: string
  subtitle?: string
  points: MetricPoint[]
  className?: string
}

function pathFor(points: MetricPoint[], width: number, height: number, padding: number) {
  if (points.length === 0) return ''
  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = Math.max(1, max - min)
  const step = points.length === 1 ? 0 : (width - padding * 2) / (points.length - 1)

  return points
    .map((point, index) => {
      const x = padding + step * index
      const y = height - padding - ((point.value - min) / span) * (height - padding * 2)
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`
    })
    .join(' ')
}

export function MetricChart({ title, value, subtitle, points, className = '' }: MetricChartProps) {
  const width = 520
  const height = 150
  const padding = 14
  const linePath = pathFor(points, width, height, padding)
  const areaPath = linePath ? `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z` : ''

  return (
    <div className={cn('min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-[#10170f] p-4 text-[#f8f2e4] shadow-[0_8px_30px_rgba(47,38,24,0.12)]', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[#d6dfc9]">{title}</h3>
          {subtitle && <p className="mt-1 text-xs text-[#bfc7b2]">{subtitle}</p>}
        </div>
        <p className="text-right font-mono text-lg font-semibold">{value}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-36 w-full" role="img" aria-label={`${title} chart`}>
        <defs>
          <linearGradient id={`metric-fill-${title.replace(/\W+/g, '-')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#8fa58f" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#8fa58f" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1={padding}
            x2={width - padding}
            y1={padding + line * ((height - padding * 2) / 3)}
            y2={padding + line * ((height - padding * 2) / 3)}
            stroke="#d6dfc9"
            strokeOpacity="0.13"
          />
        ))}
        {areaPath && <path d={areaPath} fill={`url(#metric-fill-${title.replace(/\W+/g, '-')})`} />}
        {linePath && <path d={linePath} fill="none" stroke="#a8d08d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {points.length === 0 && <text x="50%" y="50%" textAnchor="middle" fill="#bfc7b2" fontSize="18">No history yet</text>}
      </svg>
    </div>
  )
}
