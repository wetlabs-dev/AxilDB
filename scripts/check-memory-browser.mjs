import assert from 'node:assert/strict'
import { randomBytes, createHash } from 'node:crypto'
import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from '@playwright/test'
import { PrismaClient } from '@prisma/client'
import sharp from 'sharp'
assert.match(process.env.DATABASE_URL || '', /localhost:55439\/axildb(?:\?|$)/)
const cycleCount = Number(process.env.AXILDB_MEMORY_CYCLES || 20)
const base = process.env.AXILDB_MEMORY_TEST_URL || 'http://localhost:3107'
assert.match(base, /^http:\/\/(localhost|127\.0\.0\.1):/)
const db = new PrismaClient(),
  browser = await chromium.launch({ channel: 'chrome' })
let collection, user, socket
const files = []
try {
  const stamp = Date.now()
  collection = await db.collection.create({
    data: { name: 'Memory audit fixture', slug: `memory-${stamp}` },
  })
  user = await db.user.create({
    data: {
      email: `memory-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
      role: 'SERVER_ADMIN',
      twoFactor: {
        create: { enabledAt: new Date(), secretCiphertext: 'fixture' },
      },
    },
  })
  await db.collectionMembership.create({
    data: {
      collectionId: collection.id,
      userId: user.id,
      role: 'MANAGER',
      status: 'ACTIVE',
    },
  })
  const definition = await db.plantDefinition.create({
    data: {
      collectionId: collection.id,
      genus: 'Hoya',
      species: 'carnosa',
      careCadences: {
        create: { activity: 'WATERING', interval: 7, unit: 'DAY' },
      },
    },
  })
  const plant = await db.plantInstance.create({
    data: {
      collectionId: collection.id,
      plantDefinitionId: definition.id,
      plantId: 'MEMORY-1',
      instanceType: 'ACQUIRED',
    },
  })
  await db.plantDefinition.createMany({
    data: Array.from({ length: 200 }, (_, i) => ({
      collectionId: collection.id,
      genus: 'Hoya',
      species: `fixture${i}`,
    })),
  })
  const token = randomBytes(32).toString('hex')
  await db.session.create({
    data: {
      userId: user.id,
      tokenHash: createHash('sha256').update(token).digest('hex'),
      expiresAt: new Date(Date.now() + 3600000),
      twoFactorVerifiedAt: new Date(),
    },
  })
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  await ctx.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL)
    const urls = new Set()
    URL.createObjectURL = (blob) => {
      const url = create(blob)
      urls.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      urls.delete(url)
      revoke(url)
    }
    window.__memoryAuditUrls = urls
  })
  await ctx.addCookies([{ name: 'axildb_session', value: token, url: base }])
  const page = await ctx.newPage(),
    errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Performance.enable')
  const targets = await (await fetch('http://127.0.0.1:9237/json/list')).json()
  socket = new WebSocket(targets[0].webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    socket.onopen = resolve
    socket.onerror = reject
  })
  let sequence = 0
  const nodeCall = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence
      const handler = ({ data }) => {
        const result = JSON.parse(data)
        if (result.id !== id) return
        socket.removeEventListener('message', handler)
        result.error
          ? reject(new Error(result.error.message))
          : resolve(result.result)
      }
      socket.addEventListener('message', handler)
      socket.send(JSON.stringify({ id, method, params }))
    })
  const prefix = `/c/${collection.slug}`
  await page.goto(`${base}${prefix}/plants`)
  await page.waitForTimeout(500)
  const documentToken = await page.evaluate(() => {
    window.__memoryAuditDocument = Math.random()
    return window.__memoryAuditDocument
  })
  const rows = []
  const image = await sharp({
    create: { width: 1200, height: 800, channels: 3, background: '#407542' },
  })
    .png()
    .toBuffer()
  for (let cycle = 0; cycle < cycleCount; cycle++) {
    // Native Next links preserve the document; a full reload would hide lifecycle leaks.
    for (const route of [
      '/instances',
      '/care',
      '/gallery',
      '/graphs',
      '/plants',
    ]) {
      await page
        .locator(`a[href="${prefix}${route}"]`)
        .first()
        .evaluate((link) => link.click())
      await page.waitForURL(`${base}${prefix}${route}`)
      await page.waitForTimeout(200)
      assert.equal(
        await page.evaluate(() => window.__memoryAuditDocument),
        documentToken
      )
    }
    await page
      .locator('a[href="/server"]')
      .first()
      .evaluate((link) => link.click())
    await page.waitForURL(`${base}/server`)
    await page.getByText('Memory Diagnostics', { exact: true }).waitFor()
    await page
      .locator(`a[href="${prefix}/plants"]`)
      .first()
      .evaluate((link) => link.click())
    await page.waitForURL(`${base}${prefix}/plants`)
    await page
      .locator(`a[href="${prefix}/instances"]`)
      .first()
      .evaluate((link) => link.click())
    await page.waitForURL(`${base}${prefix}/instances`)
    await page
      .locator(`a[href="${prefix}/instances/${plant.id}"]`)
      .first()
      .evaluate((link) => link.click())
    await page.waitForURL(`${base}${prefix}/instances/${plant.id}`)
    for (let replacement = 0; replacement < 3; replacement++) {
      // Playwright 1.60's setInputFiles retains a retargeted ElementHandle in
      // Chromium (heap root: Global handles / DevTools console). Dispatch the
      // equivalent file events without creating a remote DOM handle.
      await page.evaluate((base64) => {
        const input = document.querySelector('input[type=file][name=photo]')
        const transfer = new DataTransfer()
        transfer.items.add(
          new File(
            [Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))],
            'preview.png',
            { type: 'image/png' }
          )
        )
        input.files = transfer.files
        input.dispatchEvent(
          new Event('input', { bubbles: true, composed: true })
        )
        input.dispatchEvent(new Event('change', { bubbles: true }))
      }, image.toString('base64'))
      await page.waitForTimeout(30)
      assert.equal(await page.evaluate(() => window.__memoryAuditUrls.size), 1)
    }
    await page
      .locator(`a[href="${prefix}/plants"]`)
      .first()
      .evaluate((link) => link.click())
    await page.waitForURL(`${base}${prefix}/plants`)
    await page.waitForTimeout(50)
    assert.equal(
      await page.evaluate(() => window.__memoryAuditUrls.size),
      0,
      'preview object URLs revoked on unmount'
    )
    if (cycle < 3) {
      const response = await ctx.request.post(`${base}/api/photos`, {
        maxRedirects: 0,
        multipart: {
          collectionSlug: collection.slug,
          entityType: 'PLANT_INSTANCE',
          entityId: plant.id,
          back: `${prefix}/instances/${plant.id}`,
          photo: {
            name: `memory-${stamp}-${cycle}.png`,
            mimeType: 'image/png',
            buffer: image,
          },
        },
      })
      assert.equal(response.status(), 303, await response.text())
      const photos = await db.photo.findMany({
        where: { collectionId: collection.id },
        select: { filename: true },
      })
      for (const photo of photos)
        if (!files.includes(photo.filename)) files.push(photo.filename)
      assert.equal(photos.length, cycle + 1, 'upload saved and transformed')
    }
    const exported = await ctx.request.get(
      `${base}/api/exports/plant-definitions?collectionSlug=${collection.slug}`
    )
    assert.equal(exported.status(), 200)
    const invalid = await ctx.request.post(`${base}/api/photos`, {
      maxRedirects: 0,
      multipart: {
        collectionSlug: collection.slug,
        entityType: 'PLANT_INSTANCE',
        entityId: plant.id,
        photo: {
          name: 'bad.png',
          mimeType: 'image/png',
          buffer: Buffer.from('invalid image'),
        },
      },
    })
    assert.equal(invalid.status(), 303, 'failed transform releases slot')
    await page.waitForTimeout(300)
    await cdp.send('HeapProfiler.collectGarbage')
    await nodeCall('HeapProfiler.collectGarbage')
    const metrics = await cdp.send('Performance.getMetrics'),
      dom = await cdp.send('Memory.getDOMCounters')
    const server = await nodeCall('Runtime.evaluate', {
      expression:
        'JSON.stringify({ ...process.memoryUsage(), uptime:process.uptime(), resources:process.getActiveResourcesInfo() })',
      returnByValue: true,
    })
    rows.push({
      cycle,
      browser: Object.fromEntries(
        metrics.metrics
          .filter((m) =>
            [
              'JSHeapUsedSize',
              'JSHeapTotalSize',
              'Documents',
              'Nodes',
              'JSEventListeners',
            ].includes(m.name)
          )
          .map((m) => [m.name, m.value])
      ),
      dom,
      liveElements: await page.evaluate(
        () => document.querySelectorAll('*').length
      ),
      server: JSON.parse(server.result.value),
    })
  }
  await writeFile(
    'docs/audits/memory-browser.json',
    JSON.stringify(rows, null, 2) + '\n'
  )
  if (process.env.AXILDB_MEMORY_SNAPSHOT) {
    const chunks = []
    cdp.on('HeapProfiler.addHeapSnapshotChunk', ({ chunk }) =>
      chunks.push(chunk)
    )
    await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false })
    await writeFile('/tmp/axildb-browser-memory.heapsnapshot', chunks.join(''))
  }
  assert.deepEqual(errors, [])
  // Detect runaway retention, without pretending V8/RSS must return to startup size.
  const warm = rows[2],
    end = rows.at(-1)
  assert(
    end.browser.JSHeapUsedSize < warm.browser.JSHeapUsedSize + 16 * 1024 * 1024
  )
  assert(end.dom.nodes < warm.dom.nodes + 2000)
  assert(end.dom.jsEventListeners < warm.dom.jsEventListeners + 200)
  assert(end.server.heapUsed < warm.server.heapUsed + 24 * 1024 * 1024)
  console.log(
    `${cycleCount} production-build SPA cycles passed: definitions, instances, queue, gallery, lineage, monitoring and photo preview replacement/unmount; successful/invalid uploads and CSV export. Browser and Node GC/DOM/resource measurements saved. No page errors.`
  )
} finally {
  socket?.close()
  await browser.close()
  if (collection)
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(186104, 1)`
      await tx.collection.delete({ where: { id: collection.id } })
    })
  if (user) await db.user.delete({ where: { id: user.id } })
  for (const file of files)
    await unlink(path.join(process.cwd(), 'public/uploads', file)).catch(
      () => {}
    )
  await db.$disconnect()
}
