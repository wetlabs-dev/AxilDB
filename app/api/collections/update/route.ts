import { NextRequest, NextResponse } from 'next/server'
import { saveCollectionSettings } from '@/app/collection-actions'
import { collectionPath } from '@/lib/collections'
import { appUrl } from '@/lib/email'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const { updated } = await saveCollectionSettings(formData)
  return NextResponse.redirect(appUrl(collectionPath(updated.slug, '/collection-settings')), 303)
}
