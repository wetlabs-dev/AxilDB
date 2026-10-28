import assert from 'node:assert/strict'
import { readPhotoForm } from '../lib/photo-form'
import { MAX_PHOTO_BYTES } from '../lib/photo-upload'

async function main() {
  const form = new FormData()
  form.set('caption', 'Retained metadata')
  form.set('photo', new File(['test'], 'test.png', { type: 'image/png' }))
  const parsed = await readPhotoForm(new Request('http://localhost/api/photos', { method: 'POST', body: form }))
  assert.equal(parsed.get('caption'), 'Retained metadata')
  assert.equal((parsed.get('photo') as File).size, 4)
  let cancelled = false, chunks = 0
  const boundary = 'bounded-photo-test'
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (chunks++ === 0) controller.enqueue(new TextEncoder().encode(`--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n`))
      else if (chunks < 40) controller.enqueue(new Uint8Array(1024 * 1024))
      else controller.close()
    },
    cancel() { cancelled = true },
  })
  const request = new Request('http://localhost/api/photos', { method: 'POST', headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` }, body: oversized, duplex: 'half' } as RequestInit & { duplex: string })
  await assert.rejects(readPhotoForm(request))
  assert.equal(cancelled, true)
  assert.ok(chunks < MAX_PHOTO_BYTES / (1024 * 1024) + 5, 'Parsing stops without buffering the unbounded body')
  console.log('Photo multipart: valid metadata/file retained; chunked requests without Content-Length stop and cancel at the bounded body limit.')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
