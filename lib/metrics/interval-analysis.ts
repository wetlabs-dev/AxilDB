// Pure metric-independent calendar interval analysis. Adapters own provenance and eligibility.
export type Observation = { day: number; recordedDay?: number; grouped?: boolean; adjusted?: boolean }
export const mean = (values: number[]) => values.length ? values.reduce((a,b) => a+b, 0) / values.length : null
export function quantile(values: number[], fraction: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a,b) => a-b), index = (sorted.length-1)*fraction
  return sorted[Math.floor(index)] + (sorted[Math.ceil(index)]-sorted[Math.floor(index)]) * (index%1)
}
export const median = (values: number[]) => quantile(values, .5)
export function analyzeIntervals(observations: Observation[], today: number, halfLifeDays = 75) {
  const valid = observations.filter(o => Number.isFinite(o.day) && o.day <= today)
  const days = [...new Set(valid.map(o => o.day))].sort((a,b) => a-b)
  const intervals = days.slice(1).map((day,i) => ({ days: day-days[i], end: day }))
  const values = intervals.map(i => i.days), center = median(values)
  const mad = center == null ? null : median(values.map(v => Math.abs(v-center)))!
  // Retain ordinary averages; only the recommendation estimator is robust to anomalies.
  const robust = intervals.filter(i => center != null && Math.abs(i.days-center) <= Math.max(2, center*.5, 3*(mad || 0)))
  const weights = intervals.map(i => 2 ** (-(today-i.end)/halfLifeDays))
  const robustWeights = robust.map(i => 2 ** (-(today-i.end)/halfLifeDays))
  const weighted = (rows: typeof intervals, w: number[]) => rows.length ? rows.reduce((sum,i,index) => sum+i.days*w[index], 0)/w.reduce((a,b)=>a+b,0) : null
  const average = mean(values)
  const seasonal = [0,1,2,3].map(season => {
    const sample = intervals.filter(i => Math.floor(new Date(i.end*86400000).getUTCMonth()/3) === season).map(i => i.days)
    return { season, count: sample.length, median: median(sample) }
  }).filter(s => s.count >= 3)
  return { mean: average, median: center, min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null,
    standardDeviation: values.length > 1 ? Math.sqrt(values.reduce((sum,v)=>sum+(v-average!)**2,0)/(values.length-1)) : null,
    iqr: values.length ? quantile(values,.75)!-quantile(values,.25)! : null, weightedMean: weighted(intervals,weights), robustEstimate: weighted(robust,robustWeights),
    intervalCount: values.length, eventCount: days.length, spanDays: days.length > 1 ? days.at(-1)!-days[0] : 0,
    earliestDay: days[0] ?? null, latestDay: days.at(-1) ?? null, ongoingDays: days.length ? today-days.at(-1)! : null,
    duplicates: valid.length-days.length, excluded: observations.length-valid.length, outliers: intervals.length-robust.length,
    groupedEvents: valid.filter(o=>o.grouped).length, adjustedEvents: valid.filter(o=>o.adjusted).length,
    recentMean: mean(intervals.filter(i=>today-i.end <= 60).map(i=>i.days)), historicalMean: mean(intervals.filter(i=>today-i.end > 60).map(i=>i.days)),
    seasonal, recentIntervals: intervals.slice(-12), // Bounded explanation, never duplicate full event histories.
  }
}
export type IntervalSummary = ReturnType<typeof analyzeIntervals>
export function aggregateIntervals(series: IntervalSummary[]) {
  const contributing = series.filter(s=>s.intervalCount)
  const estimates = contributing.map(s=>s.robustEstimate!).filter(v=>v != null)
  return { mean: mean(contributing.map(s=>s.mean!)), median: median(contributing.map(s=>s.median!)), weightedMean: mean(contributing.map(s=>s.weightedMean!)), robustEstimate: median(estimates),
    min: contributing.length ? Math.min(...contributing.map(s=>s.min!)) : null,
    max: contributing.length ? Math.max(...contributing.map(s=>s.max!)) : null,
    instanceMeanStandardDeviation: contributing.length > 1 ? Math.sqrt(mean(contributing.map(s=>(s.mean!-mean(contributing.map(c=>c.mean!))!)**2))!) : null,
    instanceMedianIqr: contributing.length ? quantile(contributing.map(s=>s.median!),.75)!-quantile(contributing.map(s=>s.median!),.25)! : null,
    contributingInstances: contributing.length, intervalCount: contributing.reduce((sum,s)=>sum+s.intervalCount,0), eventCount: contributing.reduce((sum,s)=>sum+s.eventCount,0),
    earliestDay: contributing.length ? Math.min(...contributing.map(s=>s.earliestDay!)) : null, latestDay: contributing.length ? Math.max(...contributing.map(s=>s.latestDay!)) : null,
    spanDays: contributing.length ? Math.max(...contributing.map(s=>s.spanDays)) : 0,
    disagreement: estimates.length > 1 && median(estimates)! > 0 ? (Math.max(...estimates)-Math.min(...estimates))/median(estimates)! : 0,
    excluded: series.reduce((sum,s)=>sum+s.excluded+s.duplicates,0), outliers: series.reduce((sum,s)=>sum+s.outliers,0),
  }
}
