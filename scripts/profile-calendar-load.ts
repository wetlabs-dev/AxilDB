import { performance } from 'node:perf_hooks'
import { startOfDayInTimeZone, addCalendarDays, dateInputValue } from '../lib/time'
const gc = (globalThis as unknown as { gc?: () => void }).gc
const samples = []
for (let cycle = 0; cycle < 5; cycle++) {
  gc?.()
  const start = performance.now(), cpu = process.cpuUsage()
  for (let index = 0; index < 150; index++) {
    const date = startOfDayInTimeZone(new Date('2026-10-22T12:00:00Z'), 'America/New_York')
    dateInputValue(addCalendarDays(date, index % 21, 'America/New_York'), 'America/New_York')
  }
  const active = process.memoryUsage(), elapsedMs = performance.now() - start, used = process.cpuUsage(cpu)
  gc?.()
  samples.push({ cycle, elapsedMs, cpuMs: (used.user + used.system) / 1000, peakRssBytes: process.resourceUsage().maxRSS * 1024, active, settled: process.memoryUsage() })
}
console.log(JSON.stringify({ node: process.version, samples }, null, 2))
