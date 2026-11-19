import { formatTypography } from '@/lib/typography'
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
  markers?: Array<{
    at: Date
    label: string
    severity: string
    status: string
    tooltip: string
  }>
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

export function MetricChart({ title, value, subtitle, points, markers = [], className = '' }: MetricChartProps) {
  const width = 520
  const height = 150
  const padding = 14
  const linePath = pathFor(points, width, height, padding)
  const areaPath = linePath ? `${linePath} L ${width - padding} ${height - padding} L ${padding} ${height - padding} Z` : ''
  const minTime = points[0]?.at.getTime() || 0
  const maxTime = points[points.length - 1]?.at.getTime() || minTime
  const timeSpan = Math.max(1, maxTime - minTime)
  const markerPosition = (at: Date) => padding + Math.max(0, Math.min(1, (at.getTime() - minTime) / timeSpan)) * (width - padding * 2)
  const markerStyle = (severity: string, status: string) => {
    if (status === 'RESOLVED') return { fill: 'var(--ax-chart-success)', text: '✓' }
    if (severity === 'CRITICAL') return { fill: 'var(--ax-chart-critical)', text: '!' }
    return { fill: 'var(--ax-chart-warning)', text: '!' }
  }
  const markerClusters = markers
    .map((marker) => ({ marker, x: markerPosition(marker.at) }))
    .sort((a, b) => a.x - b.x)
    .reduce<Array<{ x: number; markers: typeof markers }>>((clusters, item) => {
      const latest = clusters[clusters.length - 1]
      if (latest && Math.abs(latest.x - item.x) < 18) {
        latest.markers.push(item.marker)
        latest.x = (latest.x * (latest.markers.length - 1) + item.x) / latest.markers.length
      } else {
        clusters.push({ x: item.x, markers: [item.marker] })
      }
      return clusters
    }, [])

  return (
    <div className={cn('ax-metric-chart min-w-0 overflow-hidden rounded-lg border border-[color:var(--ax-border)] p-4 shadow-[0_8px_30px_rgba(47,38,24,0.12)]', className)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="ax-chart-title text-sm font-semibold">{formatTypography(title)}</h3>
          {subtitle && <p className="ax-chart-muted mt-1 text-xs">{subtitle}</p>}
        </div>
        <p className="text-right font-mono text-lg font-semibold">{value}</p>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="mt-4 h-36 w-full" role="img" aria-label={`${formatTypography(title)} chart`}>
        <defs>
          <linearGradient id={`metric-fill-${title.replace(/\W+/g, '-')}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ax-chart-fill)" stopOpacity="0.55" />
            <stop offset="100%" stopColor="var(--ax-chart-fill)" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1={padding}
            x2={width - padding}
            y1={padding + line * ((height - padding * 2) / 3)}
            y2={padding + line * ((height - padding * 2) / 3)}
            stroke="var(--ax-chart-grid)"
            strokeOpacity="0.13"
          />
        ))}
        {areaPath && <path d={areaPath} fill={`url(#metric-fill-${title.replace(/\W+/g, '-')})`} />}
        {linePath && <path d={linePath} fill="none" stroke="var(--ax-chart-series)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {markerClusters.map((cluster, index) => {
          const primary = cluster.markers.some((marker) => marker.status === 'RESOLVED')
            ? cluster.markers.find((marker) => marker.status === 'RESOLVED') || cluster.markers[0]
            : cluster.markers.some((marker) => marker.severity === 'CRITICAL')
              ? cluster.markers.find((marker) => marker.severity === 'CRITICAL') || cluster.markers[0]
              : cluster.markers[0]
          const style = markerStyle(primary.severity, primary.status)
          const tooltip = cluster.markers.map((marker) => marker.tooltip).join('\n\n')
          const lines = tooltip.split('\n').slice(0, 12)
          const panelX = cluster.x > width - 190 ? -178 : 12
          return (
            <g key={`${primary.label}-${primary.at.toISOString()}-${index}`} className="group" transform={`translate(${cluster.x.toFixed(1)} ${padding + 10 + (index % 3) * 18})`}>
              <circle r={cluster.markers.length > 1 ? 9 : 7} fill={style.fill} stroke="var(--ax-chart-text)" strokeWidth="1.5">
                <title>{tooltip}</title>
              </circle>
              <text x="0" y="3" textAnchor="middle" fill={primary.status === 'RESOLVED' || primary.severity !== 'CRITICAL' ? 'var(--ax-chart-marker-text)' : '#fffdf7'} fontSize="10" fontWeight="700">{cluster.markers.length > 1 ? cluster.markers.length : style.text}</text>
              <g className="pointer-events-none opacity-0 transition-opacity group-hover:opacity-100">
                <rect x={panelX} y="-8" width="166" height={Math.max(42, lines.length * 11 + 12)} rx="5" fill="var(--ax-chart-tooltip)" stroke="var(--ax-chart-grid)" />
                {lines.map((line, lineIndex) => (
                  <text key={`${line}-${lineIndex}`} x={panelX + 8} y={8 + lineIndex * 11} fill="var(--ax-chart-tooltip-text)" fontSize="8.5">{line}</text>
                ))}
              </g>
            </g>
          )
        })}
        {points.length === 0 && <text x="50%" y="50%" textAnchor="middle" fill="var(--ax-chart-muted)" fontSize="18">No history yet</text>}
      </svg>
    </div>
  )
}
