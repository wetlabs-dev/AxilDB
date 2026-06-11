import { mkdir } from 'node:fs/promises'
import { createHmac } from 'node:crypto'
import path from 'node:path'
import { chromium, type Page } from '@playwright/test'
import { manualScreenshotTargets } from '../lib/user-manual'

const baseUrl = (process.env.AXILDB_DOCS_BASE_URL || 'http://127.0.0.1:3100').replace(/\/$/, '')
const collectionSlug = process.env.AXILDB_DOCS_COLLECTION_SLUG || ['a', 'x', 'i', 'l', 'd', 'b'].join('')
const email = process.env.AXILDB_DOCS_EMAIL || 'admin@axildb.com'
const password = process.env.AXILDB_DOCS_PASSWORD || 'password'
const totpCode = process.env.AXILDB_DOCS_TOTP_CODE
const totpSecret = cleanTotpSecret(process.env.AXILDB_DOCS_TOTP_SECRET)
const skipLogin = process.env.AXILDB_DOCS_SKIP_LOGIN === '1'
const outputDir = path.join(process.cwd(), 'public', 'manual', 'screenshots')

const globalRoutes = new Set(['/account', '/collections', '/server'])

function manualUrl(route: string) {
  if (globalRoutes.has(route)) return `${baseUrl}${route}?collection=${encodeURIComponent(collectionSlug)}`
  if (route === '/') return `${baseUrl}/c/${encodeURIComponent(collectionSlug)}`
  return `${baseUrl}/c/${encodeURIComponent(collectionSlug)}${route}`
}

function base32Decode(input: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, '')
  let bits = ''
  for (const char of clean) {
    const value = alphabet.indexOf(char)
    if (value === -1) throw new Error('AXILDB_DOCS_TOTP_SECRET is not valid base32.')
    bits += value.toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let index = 0; index + 8 <= bits.length; index += 8) {
    bytes.push(Number.parseInt(bits.slice(index, index + 8), 2))
  }
  return Buffer.from(bytes)
}

function cleanTotpSecret(value: string | undefined) {
  if (!value) return undefined
  const trimmed = value.trim()
  if (trimmed.includes('secret=')) {
    try {
      const parsed = new URL(trimmed)
      return parsed.searchParams.get('secret')?.trim() || trimmed
    } catch {
      const match = trimmed.match(/[?&]secret=([^&\s]+)/i)
      return match ? decodeURIComponent(match[1]).trim() : trimmed
    }
  }
  return trimmed
}

function generateTotp(secret: string, counterOffset = 0) {
  const key = base32Decode(secret)
  const counter = Math.floor(Date.now() / 30_000) + counterOffset
  const buffer = Buffer.alloc(8)
  buffer.writeBigUInt64BE(BigInt(counter))
  const digest = createHmac('sha1', key).update(buffer).digest()
  const offset = digest[digest.length - 1] & 0x0f
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff)
  return String(binary % 1_000_000).padStart(6, '0')
}

async function completeTwoFactorIfNeeded(page: Page) {
  if (!page.url().includes('/two-factor')) return

  const codes = totpCode
    ? [totpCode]
    : totpSecret
      ? [0, -1, 1, -2, 2].map((offset) => generateTotp(totpSecret, offset))
      : []
  if (codes.length === 0) {
    throw new Error(
      'Screenshot capture reached two-factor verification. Set AXILDB_DOCS_TOTP_SECRET for the dedicated docs account, set AXILDB_DOCS_TOTP_CODE for a one-time run, or use a docs account with a role that does not require 2FA.',
    )
  }

  console.log('Completing two-factor verification for documentation capture.')
  for (const code of codes) {
    const startingUrl = page.url()
    await page.locator('input[name="code"]').first().fill(code)
    await page.locator('button[type="submit"], button:has-text("Verify")').first().click()
    await page
      .waitForURL((url) => {
        if (!url.pathname.includes('/two-factor')) return true
        if (url.href !== startingUrl && url.searchParams.has('error')) return true
        return false
      }, { timeout: 10_000 })
      .catch(() => null)
    await page.waitForLoadState('networkidle').catch(() => null)
    if (!page.url().includes('/two-factor')) return
  }

  if (page.url().includes('/two-factor')) {
    const visibleText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const pageText = visibleText ? ` Visible page text: ${visibleText.slice(0, 500)}` : ''
    throw new Error(`Two-factor verification failed for documentation capture. Check AXILDB_DOCS_TOTP_SECRET or AXILDB_DOCS_TOTP_CODE.${pageText}`)
  }
}

async function maybeLogin(page: Page) {
  if (skipLogin) return

  console.log(`Signing in documentation account ${email} with password length ${password.length}.`)
  await page.goto(`${baseUrl}/login?next=${encodeURIComponent(`/c/${collectionSlug}`)}`, {
    waitUntil: 'networkidle',
  })

  const emailField = page.locator('input[name="email"]').first()
  if ((await emailField.count()) === 0) return

  await emailField.fill(email)
  await page.locator('input[name="password"]').first().fill(password)

  const startingUrl = page.url()
  await page.locator('button[type="submit"], button:has-text("Sign in")').first().click()
  await page
    .waitForURL((url) => {
      if (url.href !== startingUrl) return true
      if (url.pathname === '/two-factor') return true
      if (url.pathname === '/login' && (url.searchParams.has('error') || url.searchParams.has('twoFactor'))) return true
      return false
    }, { timeout: 15_000 })
    .catch(() => null)
  await page.waitForLoadState('networkidle').catch(() => null)
  await completeTwoFactorIfNeeded(page)

  if (page.url().includes('/login')) {
    const visibleText = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/g, ' ').trim()
    const loginError = visibleText.includes('Invalid email or password')
      ? ' The login page says: Invalid email or password.'
      : ''
    const pageText = visibleText ? ` Visible page text: ${visibleText.slice(0, 500)}` : ''
    throw new Error(
      `Documentation account is still on the login page after sign-in.${loginError} Current URL: ${page.url()}.${pageText} Check AXILDB_DOCS_EMAIL, AXILDB_DOCS_PASSWORD, and whether the docs account exists.`,
    )
  }

  console.log(`Documentation account signed in; current page is ${page.url()}`)
}

async function openManualScreenshotPage(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
  await page.waitForLoadState('load', { timeout: 15_000 }).catch(() => null)
  await page.locator('main, body').first().waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => null)
  await page.waitForTimeout(500)
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
    await openManualScreenshotPage(page, url)
    await completeTwoFactorIfNeeded(page)
    if (page.url().includes('/login')) {
      throw new Error(`Documentation capture was redirected to login while opening ${target.title}. Check the docs account membership and role for ${collectionSlug}.`)
    }
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
