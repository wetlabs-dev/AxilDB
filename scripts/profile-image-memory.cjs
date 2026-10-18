// Isolated native-memory exercise; no uploaded or production data.
const sharp = require('sharp')
if (!global.gc)
  throw new Error('Run with node --expose-gc in a disposable test process.')
;(async () => {
  const image = await sharp({
    create: { width: 3000, height: 4000, channels: 3, background: '#407542' },
  })
    .png()
    .toBuffer()
  const rows = []
  for (let cycle = 0; cycle < 6; cycle++) {
    const before = process.memoryUsage()
    for (let batch = 0; batch < 3; batch++)
      await Promise.all(
        [0, 1].map(async () => {
          const result = await sharp(image)
            .rotate()
            .resize({
              width: 2000,
              height: 2000,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .jpeg({ quality: 84, mozjpeg: true })
            .toBuffer()
          if (!result.length) throw new Error('Empty image')
        })
      )
    global.gc()
    rows.push({
      cycle,
      before,
      after: process.memoryUsage(),
      uptime: process.uptime(),
      resources: process.getActiveResourcesInfo(),
      cache: sharp.cache(),
      concurrency: sharp.concurrency(),
    })
  }
  console.log(JSON.stringify(rows, null, 2))
})().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
