import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { manualScreenshotTargets } from '../lib/user-manual'

const baseUrl = (process.env.AXILDB_DOCS_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
const collectionSlug = process.env.AXILDB_DOCS_COLLECTION_SLUG || ['a', 'x', 'i', 'l', 'd', 'b'].join('')
const email = process.env.AXILDB_DOCS_EMAIL || 'admin@axildb.com'
const password = process.env.AXILDB_DOCS_PASSWORD || 'password'
const skipLogin = process.env.AXILDB_DOCS_SKIP_LOGIN === '1'
const outputDir = path.join(process.cwd(), 'public', 'manual', 'screenshots')

const globalRoutes = new Set(['/account', '/collections', '/server'])

function manualUrl(route: string) {
  if (globalRoutes.has(route)) return `${baseUrl}${route}?collection=${encodeURIComponent(collectionSlug)}`
  if (route === '/') return `${baseUrl}/c/${encodeURIComponent(collectionSlug)}`
  return `${baseUrl}/c/${encodeURIComponent(collectionSlug)}${route}`
}

async function maybeLogin(page: Page) {
  if (skipLogin) return

  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(`/c/${collectionSlug}`)}`, {
    waitUntil: 'networkidle',
  })

  const emailField = page.locator('input[name="email"]').first()
  if ((await emailField.count()) === 0) return

  await emailField.fill(email)
  await page.locator('input[name="password"]').first().fill(password)
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click()
  await page.waitForLoadState('networkidle').catch(() => null)

  if (page.url().includes('/two-factor')) {
    throw new Error(
      'Screenshot capture reached the two-factor page. Use a dedicated docs user without enforced 2FA, or set AXILDB_DOCS_SKIP_LOGIN=1 with a pre-authenticated browser context.',
    )
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true })

  let browser
  try {
    browser = await chromium.launch()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (message.includes('Executable doesn')) {
      throw new Error('Playwright Chromium is not installed. Run `npx playwright install chromium`, then retry `npm run docs:screenshots`.')
    }
    throw error
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 })
  await maybeLogin(page)

  for (const target of manualScreenshotTargets) {
    const url = manualUrl(target.route)
    console.log(`Capturing ${target.title}: ${url}`)
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45_000 })
    await page.screenshot({
      path: path.join(outputDir, target.screenshot),
      fullPage: true,
    })
  }

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
