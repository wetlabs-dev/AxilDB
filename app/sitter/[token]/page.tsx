import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { createHash } from 'crypto'
import { CareSheetView } from '@/components/CareSheetView'
import { Card } from '@/components/ui'
import { isCareSheetPubliclyUsable, resolveCareSheetToken } from '@/lib/care-sheets'
import { prisma } from '@/lib/prisma'

async function logAccess(sheet: any) {
  const requestHeaders = await headers()
  const ip = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() || requestHeaders.get('x-real-ip') || ''
  const ipHash = ip ? createHash('sha256').update(ip).digest('hex') : null
  await prisma.careSheetAccessLog.create({
    data: {
      careSheetId: sheet.id,
      collectionId: sheet.collectionId,
      ipHash,
      userAgent: requestHeaders.get('user-agent'),
      action: 'SITTER_VIEW',
    },
  })
}

export default async function SitterPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const sheet = await resolveCareSheetToken(prisma, token)
  if (!sheet || !isCareSheetPubliclyUsable(sheet) || sheet.mode !== 'SITTER_SESSION') notFound()
  await logAccess(sheet)

  return (
    <main className="min-h-screen bg-[#faf6ea] px-4 py-6 text-stone-900 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <Card className="mb-4 border-[#b9c8aa] bg-[#f5f8ed]">
          <h1 className="font-serif text-3xl font-bold">Plant Sitter Mode</h1>
          <p className="text-sm text-stone-600">This link is limited to the selected plants and tasks. It expires automatically and can be revoked by the collection.</p>
        </Card>
        <CareSheetView sheet={sheet} token={token} publicMode />
      </div>
    </main>
  )
}
