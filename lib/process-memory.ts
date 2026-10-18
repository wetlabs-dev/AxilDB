import { readFile } from 'node:fs/promises'
import os from 'node:os'

export function processMemory() {
  const memory = process.memoryUsage()
  return {
    rssBytes: memory.rss,
    peakRssBytes: process.resourceUsage().maxRSS * 1024,
    heapUsedBytes: memory.heapUsed,
    heapTotalBytes: memory.heapTotal,
    externalBytes: memory.external,
    // arrayBuffers is a subset of external, never add the two together.
    arrayBuffersBytes: memory.arrayBuffers,
    processUptimeSeconds: Math.round(process.uptime()),
    processId: process.pid,
  }
}
export function availableMemory(memory: {
  systemAvailableBytes?: number
  systemFreeBytes: number
}) {
  return memory.systemAvailableBytes ?? memory.systemFreeBytes
}
export function parseAvailableMemory(text: string) {
  const match = /^MemAvailable:\s+(\d+)\s+kB$/m.exec(text)
  return match ? Number(match[1]) * 1024 : undefined
}
export async function systemMemory() {
  let systemAvailableBytes: number | undefined
  try {
    systemAvailableBytes = parseAvailableMemory(
      await readFile('/proc/meminfo', 'utf8')
    )
  } catch {}
  return {
    systemTotalBytes: os.totalmem(),
    systemFreeBytes: os.freemem(),
    systemAvailableBytes,
  }
}
