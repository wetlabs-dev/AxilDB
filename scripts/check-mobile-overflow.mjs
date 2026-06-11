#!/usr/bin/env node
import { chromium } from '@playwright/test'

const args = new Set(process.argv.slice(2))
const baseUrl = process.env.AXILDB_OVERFLOW_BASE_URL || 'http://localhost:3100'
const widths = (process.env.AXILDB_OVERFLOW_WIDTHS || '360,375,390')
  .split(',')
  .map((value) => Number(value.trim()))
  .filter(Boolean)
const paths = (process.env.AXILDB_OVERFLOW_PATHS || '/,/instances,/gallery,/account,/server')
  .split(',')
  .map((path) => path.trim())
  .filter(Boolean)

if (args.has('--help')) {
  console.log(`Usage:
  AXILDB_OVERFLOW_BASE_URL=http://localhost:3100 npm run check:mobile-overflow

Environment:
  AXILDB_OVERFLOW_BASE_URL   App URL to test. Defaults to http://localhost:3100
  AXILDB_OVERFLOW_PATHS      Comma-separated paths. Defaults to /,/instances,/gallery,/account,/server
  AXILDB_OVERFLOW_WIDTHS     Comma-separated viewport widths. Defaults to 360,375,390
  AXILDB_OVERFLOW_CHANNEL    Browser channel fallback, such as chrome or msedge`)
  process.exit(0)
}

function joinUrl(path) {
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

async function launchBrowser() {
  const channels = [process.env.AXILDB_OVERFLOW_CHANNEL, undefined, 'chrome', 'msedge'].filter((value, index, array) => {
    return value !== '' && array.indexOf(value) === index
  })

  let lastError
  for (const channel of channels) {
    try {
      return await chromium.launch(channel ? { channel } : {})
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

const browser = await launchBrowser()
let failures = 0

try {
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, isMobile: true })

    for (const path of paths) {
      const url = joinUrl(path)
      let response
      try {
        response = await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
      } catch (error) {
        failures += 1
        console.error(`[${width}px] ${path}: navigation failed: ${error.message}`)
        continue
      }

      const status = response?.status() ?? 0
      if (status >= 500) {
        failures += 1
        console.error(`[${width}px] ${path}: server responded ${status}`)
        continue
      }

      const result = await page.evaluate(() => {
        const viewportWidth = window.innerWidth
        const scrollWidth = document.documentElement.scrollWidth
        const offenders = Array.from(document.body.querySelectorAll('*'))
          .map((element) => {
            const rect = element.getBoundingClientRect()
            const excessRight = rect.right - viewportWidth
            const excessLeft = 0 - rect.left
            return {
              tag: element.tagName.toLowerCase(),
              id: element.id || '',
              className: typeof element.className === 'string' ? element.className : '',
              text: (element.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              width: Math.round(rect.width),
              excess: Math.round(Math.max(excessRight, excessLeft)),
            }
          })
          .filter((item) => item.width > 0 && item.excess > 1)
          .sort((a, b) => b.excess - a.excess)
          .slice(0, 8)

        return { viewportWidth, scrollWidth, offenders }
      })

      const overflow = result.scrollWidth - result.viewportWidth
      if (overflow > 1) {
        failures += 1
        console.error(`[${width}px] ${path}: document overflow ${overflow}px`)
        for (const offender of result.offenders) {
          const selector = `${offender.tag}${offender.id ? `#${offender.id}` : ''}`
          console.error(`  ${selector} excess=${offender.excess}px width=${offender.width}px class="${offender.className}" text="${offender.text}"`)
        }
      } else {
        console.log(`[${width}px] ${path}: OK (${result.scrollWidth}/${result.viewportWidth})`)
      }
    }

    await page.close()
  }
} finally {
  await browser.close()
}

if (failures > 0) {
  console.error(`Mobile overflow check failed with ${failures} issue(s).`)
  process.exit(1)
}

console.log('Mobile overflow check passed.')
