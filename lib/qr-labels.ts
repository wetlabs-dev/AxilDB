import { collectionPath } from '@/lib/collection-path'
/** Existing printed-label payload, shared by PDFs, label previews and instance QR images. */
export function recordQrUrl(kind: 'plant' | 'location', collectionSlug: string, id: string, origin = process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com') {
  return `${origin}${collectionPath(collectionSlug, `/${kind === 'plant' ? 'instances' : 'locations'}/${id}`)}`
}
