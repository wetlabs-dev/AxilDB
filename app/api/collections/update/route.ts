import { NextRequest, NextResponse } from 'next/server'
import { saveCollectionSettings } from '@/app/collection-actions'
import { collectionPath } from '@/lib/collections'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const { updated } = await saveCollectionSettings(formData)
  return NextResponse.redirect(new URL(collectionPath(updated.slug, '/collection-settings'), request.url), 303)
}
