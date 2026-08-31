'use client'

import { useMemo, useState } from 'react'

type UsageMetric = 'cost' | 'calls' | 'tokens'
type TimeRange = '24h' | '7d' | '30d' | '90d' | 'all'
type BucketWidth = 'hour' | 'sixHours' | 'day' | 'week'

export type AiUsageBreakdownEvent = {
  id: string
  collectionId: string
  collectionName: string
  collectionSlug: string
  collectionAiEnabled: boolean
  feature: string
  featureLabel: string
  model: string | null
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  totalTokens: number
  webSearchCalls: number
  webSearchPreviewCalls: number
  costDollars: number
  createdAt: string
}

const featureColors = [
  '#2f6b45',
  '#8f5f2f',
  '#2f5f8f',
  '#8f3f35',
  '#6d7f6d',
  '#9a6a35',
  '#60758f',
  '#8f6d7f',
  '#4f7f77',
  '#7a6a4f',
]

function money(value: number) {
  if (value > 0 && value < 0.01) return `$${value.toFixed(4)}`
  if (value > 0 && value < 10 && Math.abs(value - Number(value.toFixed(2))) >= 0.0001) return `$${value.toFixed(4)}`
  return `$${value.toFixed(2)}`
}

function shortNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 10_000 ? 0 : 1)}K`
  return String(Math.round(value))
}

function metricValue(event: AiUsageBreakdownEvent, metric: UsageMetric) {
  if (metric === 'cost') return event.costDollars
  if (metric === 'calls') return 1
  return event.totalTokens
}

function metricLabel(value: number, metric: UsageMetric) {
  if (metric === 'cost') return money(value)
  if (metric === 'calls') return `${shortNumber(value)} call${Math.round(value) === 1 ? '' : 's'}`
  return `${shortNumber(value)} tokens`
}

function bucketMs(width: BucketWidth) {
  if (width === 'hour') return 60 * 60 * 1000
  if (width === 'sixHours') return 6 * 60 * 60 * 1000
  if (width === 'week') return 7 * 24 * 60 * 60 * 1000
  return 24 * 60 * 60 * 1000
}

function rangeStart(range: TimeRange, events: AiUsageBreakdownEvent[], now: number) {
  if (range === '24h') return now - 24 * 60 * 60 * 1000
  if (range === '7d') return now - 7 * 24 * 60 * 60 * 1000
  if (range === '30d') return now - 30 * 24 * 60 * 60 * 1000
  if (range === '90d') return now - 90 * 24 * 60 * 60 * 1000
  return events.reduce((earliest, event) => Math.min(earliest, new Date(event.createdAt).getTime()), now)
}

function bucketStart(time: number, width: BucketWidth) {
  const date = new Date(time)
  if (width === 'week') {
    const day = date.getDay()
    date.setHours(0, 0, 0, 0)
    date.setDate(date.getDate() - day)
    return date.getTime()
  }
  if (width === 'day') {
    date.setHours(0, 0, 0, 0)
    return date.getTime()
  }
  if (width === 'sixHours') {
    date.setMinutes(0, 0, 0)
    date.setHours(Math.floor(date.getHours() / 6) * 6)
    return date.getTime()
  }
  date.setMinutes(0, 0, 0)
  return date.getTime()
}

function formatBucketLabel(time: number, width: BucketWidth, timezone?: string | null) {
  const options: Intl.DateTimeFormatOptions = width === 'hour' || width === 'sixHours'
    ? { month: 'short', day: 'numeric', hour: 'numeric', timeZone: timezone || undefined }
    : { month: 'short', day: 'numeric', timeZone: timezone || undefined }
  return new Intl.DateTimeFormat('en-US', options).format(new Date(time))
}

function toolSearchCalls(row: { webSearchCalls?: number; webSearchPreviewCalls?: number }) {
  return (row.webSearchCalls || 0) + (row.webSearchPreviewCalls || 0)
}

function summarize(events: AiUsageBreakdownEvent[], groupKey: (event: AiUsageBreakdownEvent) => string) {
  const groups = new Map<string, {
    calls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    totalTokens: number
    webSearchCalls: number
    webSearchPreviewCalls: number
    costDollars: number
    sample: AiUsageBreakdownEvent
  }>()
  for (const event of events) {
    const key = groupKey(event)
    const existing = groups.get(key) || {
      calls: 0,
      inputTokens: 0,
      cachedInputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      webSearchCalls: 0,
      webSearchPreviewCalls: 0,
      costDollars: 0,
      sample: event,
    }
    existing.calls += 1
    existing.inputTokens += event.inputTokens
    existing.cachedInputTokens += event.cachedInputTokens
    existing.outputTokens += event.outputTokens
    existing.totalTokens += event.totalTokens
    existing.webSearchCalls += event.webSearchCalls
    existing.webSearchPreviewCalls += event.webSearchPreviewCalls
    existing.costDollars += event.costDollars
    groups.set(key, existing)
  }
  return [...groups.entries()].map(([key, value]) => ({ key, ...value })).sort((a, b) => b.costDollars - a.costDollars || b.totalTokens - a.totalTokens || b.calls - a.calls)
}

export function AiUsageBreakdown({ events, timezone, now }: { events: AiUsageBreakdownEvent[]; timezone?: string | null; now: string }) {
  const nowMs = new Date(now).getTime()
  const features = useMemo(() => [...new Map(events.map((event) => [event.feature, event.featureLabel])).entries()].sort((a, b) => a[1].localeCompare(b[1])), [events])
  const collections = useMemo(() => summarize(events, (event) => event.collectionId), [events])
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(() => new Set(features.map(([feature]) => feature)))
  const [collectionId, setCollectionId] = useState('all')
  const [range, setRange] = useState<TimeRange>('30d')
  const [bucketWidth, setBucketWidth] = useState<BucketWidth>('day')
  const [metric, setMetric] = useState<UsageMetric>('cost')

  const featureColor = useMemo(() => new Map(features.map(([feature], index) => [feature, featureColors[index % featureColors.length]])), [features])
  const scopedEvents = useMemo(() => {
    const start = rangeStart(range, events, nowMs)
    return events.filter((event) => {
      const at = new Date(event.createdAt).getTime()
      return at >= start && (collectionId === 'all' || event.collectionId === collectionId)
    })
  }, [collectionId, events, nowMs, range])
  const filteredEvents = useMemo(() => scopedEvents.filter((event) => enabledFeatures.has(event.feature)), [enabledFeatures, scopedEvents])
  const featureTotals = useMemo(() => summarize(scopedEvents, (event) => event.feature), [scopedEvents])
  const collectionTotals = useMemo(() => summarize(filteredEvents, (event) => event.collectionId), [filteredEvents])
  const totals = useMemo(() => filteredEvents.reduce((total, event) => ({
    calls: total.calls + 1,
    inputTokens: total.inputTokens + event.inputTokens,
    cachedInputTokens: total.cachedInputTokens + event.cachedInputTokens,
    outputTokens: total.outputTokens + event.outputTokens,
    totalTokens: total.totalTokens + event.totalTokens,
    webSearchCalls: total.webSearchCalls + event.webSearchCalls,
    webSearchPreviewCalls: total.webSearchPreviewCalls + event.webSearchPreviewCalls,
    costDollars: total.costDollars + event.costDollars,
  }), {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    webSearchCalls: 0,
    webSearchPreviewCalls: 0,
    costDollars: 0,
  }), [filteredEvents])
  const buckets = useMemo(() => {
    const widthMs = bucketMs(bucketWidth)
    const start = bucketStart(rangeStart(range, events, nowMs), bucketWidth)
    const end = bucketStart(nowMs, bucketWidth)
    const estimatedBuckets = Math.floor((end - start) / widthMs) + 1
    const rows: Array<{ key: number; total: number; byFeature: Map<string, number> }> = []
    if (estimatedBuckets <= 180) {
      for (let time = start; time <= end; time += widthMs) rows.push({ key: time, total: 0, byFeature: new Map() })
    } else {
      const activeKeys = new Set(filteredEvents.map((event) => bucketStart(new Date(event.createdAt).getTime(), bucketWidth)))
      for (const key of [...activeKeys].sort((a, b) => a - b)) rows.push({ key, total: 0, byFeature: new Map() })
      if (!rows.length) rows.push({ key: start, total: 0, byFeature: new Map() })
    }
    const byKey = new Map(rows.map((row) => [row.key, row]))
    for (const event of filteredEvents) {
      const key = bucketStart(new Date(event.createdAt).getTime(), bucketWidth)
      const row = byKey.get(key)
      if (!row) continue
      const value = metricValue(event, metric)
      row.total += value
      row.byFeature.set(event.feature, (row.byFeature.get(event.feature) || 0) + value)
    }
    return rows
  }, [bucketWidth, events, filteredEvents, metric, nowMs, range])
  const maxBucket = Math.max(1, ...buckets.map((bucket) => bucket.total))
  const activeFeatureCount = features.filter(([feature]) => enabledFeatures.has(feature)).length

  const toggleFeature = (feature: string) => {
    setEnabledFeatures((current) => {
      const next = new Set(current)
      if (next.has(feature)) next.delete(feature)
      else next.add(feature)
      return next
    })
  }

  const setAllFeatures = (enabled: boolean) => {
    setEnabledFeatures(new Set(enabled ? features.map(([feature]) => feature) : []))
  }

  return (
    <div className="mt-4 grid gap-4">
      {events.length === 0 ? (
        <p className="rounded-lg border border-stone-200 bg-white/50 p-3 text-sm text-stone-600">No AI usage has been recorded yet.</p>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(18rem,1fr)_minmax(18rem,1fr)_minmax(14rem,0.6fr)_minmax(12rem,0.5fr)]">
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Collection
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
                <option value="all">All collections</option>
                {collections.map((collection) => <option key={collection.key} value={collection.key}>{collection.sample.collectionName}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Time scale
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" value={range} onChange={(event) => setRange(event.target.value as TimeRange)}>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
                <option value="30d">Last 30 days</option>
                <option value="90d">Last 90 days</option>
                <option value="all">All recorded</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Bucket width
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" value={bucketWidth} onChange={(event) => setBucketWidth(event.target.value as BucketWidth)}>
                <option value="hour">1 hour</option>
                <option value="sixHours">6 hours</option>
                <option value="day">1 day</option>
                <option value="week">1 week</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-stone-800">
              Metric
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm" value={metric} onChange={(event) => setMetric(event.target.value as UsageMetric)}>
                <option value="cost">Dollars</option>
                <option value="calls">Calls</option>
                <option value="tokens">Tokens</option>
              </select>
            </label>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Estimated spend</p>
              <p className="mt-1 text-2xl font-semibold">{money(totals.costDollars)}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Calls</p>
              <p className="mt-1 text-2xl font-semibold">{totals.calls.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Tokens</p>
              <p className="mt-1 text-2xl font-semibold">{totals.totalTokens.toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Web searches</p>
              <p className="mt-1 text-2xl font-semibold">{toolSearchCalls(totals).toLocaleString()}</p>
            </div>
            <div className="rounded-lg border border-stone-200 bg-white/55 p-3">
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Visible features</p>
              <p className="mt-1 text-2xl font-semibold">{activeFeatureCount}/{features.length}</p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">Usage over time</h4>
              <p className="text-xs text-stone-600">{metricLabel(Math.max(...buckets.map((bucket) => bucket.total), 0), metric)} peak bucket</p>
            </div>
            <div className="mt-3 overflow-x-auto pt-24">
              <div className="flex min-h-56 min-w-[42rem] items-end gap-1 border-b border-stone-200 px-1 pb-8">
                {buckets.map((bucket) => {
                  let bottom = 0
                  return (
                    <div key={bucket.key} className="group relative flex min-w-5 flex-1 items-end justify-center hover:z-40">
                      <div className="relative h-44 w-full rounded-t bg-stone-100">
                        {features.filter(([feature]) => enabledFeatures.has(feature)).map(([feature]) => {
                          const value = bucket.byFeature.get(feature) || 0
                          if (!value) return null
                          const height = Math.max(2, (value / maxBucket) * 176)
                          const segmentBottom = bottom
                          bottom += height
                          return <span key={feature} className="absolute left-0 w-full" style={{ bottom: segmentBottom, height, backgroundColor: featureColor.get(feature) }} />
                        })}
                      </div>
                      <div className="pointer-events-none absolute bottom-full z-50 mb-2 hidden w-56 rounded-md border border-stone-200 bg-white p-2 text-xs shadow-lg group-hover:block">
                        <p className="font-semibold text-stone-900">{formatBucketLabel(bucket.key, bucketWidth, timezone)}</p>
                        <p className="text-stone-600">Total: {metricLabel(bucket.total, metric)}</p>
                        {[...bucket.byFeature.entries()].sort((a, b) => b[1] - a[1]).map(([feature, value]) => (
                          <p key={feature} className="mt-1 flex justify-between gap-2">
                            <span>{features.find(([candidate]) => candidate === feature)?.[1] || feature}</span>
                            <span className="font-medium">{metricLabel(value, metric)}</span>
                          </p>
                        ))}
                      </div>
                      <span className="absolute top-full mt-2 hidden origin-top-left -rotate-45 whitespace-nowrap text-[0.65rem] text-stone-500 first:block last:block sm:block">
                        {formatBucketLabel(bucket.key, bucketWidth, timezone)}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white/45 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-stone-500">Feature categories</h4>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setAllFeatures(true)} className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800">All</button>
                <button type="button" onClick={() => setAllFeatures(false)} className="rounded-md border border-stone-200 bg-white px-2.5 py-1 text-xs font-semibold text-stone-800">None</button>
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {features.map(([feature, label]) => {
                const total = featureTotals.find((row) => row.key === feature)
                const enabled = enabledFeatures.has(feature)
                return (
                  <label key={feature} className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm ${enabled ? 'border-stone-200 bg-white/70' : 'border-stone-200 bg-stone-50/70 text-stone-500'}`}>
                    <input className="mt-1" type="checkbox" checked={enabled} onChange={() => toggleFeature(feature)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-semibold">
                        <span className="h-3 w-3 rounded-full" style={{ backgroundColor: featureColor.get(feature) }} />
                        {label}
                      </span>
                      <span className="mt-1 block text-xs text-stone-600">
                        {money(total?.costDollars || 0)} · {(total?.calls || 0).toLocaleString()} calls · {(total?.totalTokens || 0).toLocaleString()} tokens{toolSearchCalls(total || {}) ? ` · ${toolSearchCalls(total || {}).toLocaleString()} searches` : ''}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white/45">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-stone-200 text-xs uppercase tracking-[0.12em] text-stone-500">
                <tr>
                  <th className="px-3 py-2">Collection</th>
                  <th className="px-3 py-2 text-right">Dollars</th>
                  <th className="px-3 py-2 text-right">Calls</th>
                  <th className="px-3 py-2 text-right">Web searches</th>
                  <th className="px-3 py-2 text-right">Input</th>
                  <th className="px-3 py-2 text-right">Output</th>
                  <th className="px-3 py-2 text-right">Total tokens</th>
                </tr>
              </thead>
              <tbody>
                {collectionTotals.map((collection) => (
                  <tr key={collection.key} className="border-b border-stone-100 last:border-0">
                    <td className="px-3 py-2">
                      <p className="font-semibold text-stone-900">{collection.sample.collectionName}</p>
                      <p className="text-xs text-stone-600">/{collection.sample.collectionSlug} · AI {collection.sample.collectionAiEnabled ? 'enabled' : 'disabled'}</p>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">{money(collection.costDollars)}</td>
                    <td className="px-3 py-2 text-right">{collection.calls.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{toolSearchCalls(collection).toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{collection.inputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{collection.outputTokens.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right">{collection.totalTokens.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
