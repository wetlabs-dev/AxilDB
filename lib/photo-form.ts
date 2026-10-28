import { MAX_PHOTO_BYTES } from '@/lib/photo-upload'

/** Bound multipart parsing even when a sender omits Content-Length. */
export async function readPhotoForm(request: Request) {
  const reader = request.body?.getReader()
  if (!reader) return request.formData()
  let received = 0
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) { controller.close(); return }
        received += value.byteLength
        if (received > MAX_PHOTO_BYTES + 1024 * 1024) {
          await reader.cancel()
          controller.error(new Error('Photo request exceeds size limit.'))
          return
        }
        controller.enqueue(value)
      } catch (error) { controller.error(error) }
    },
    cancel(reason) { return reader.cancel(reason) },
  })
  try {
    return await new Request(request.url, { method: 'POST', headers: request.headers, body, duplex: 'half' } as RequestInit & { duplex: string }).formData()
  } finally { reader.releaseLock() }
}
