import Link from 'next/link'
import { CareForecast } from '@/components/CareForecast'
import { collectionPath, requireCollectionManager } from '@/lib/collections'
import type { QuietDraft } from '@/lib/care-forecast-service'
export default async function QuietDayReview({ searchParams }: { searchParams: Promise<{ draft?: string }> }) {
  const context = await requireCollectionManager()
  const params = await searchParams
  let draft: QuietDraft | undefined
  try { if (params.draft && params.draft.length < 4096) draft = JSON.parse(params.draft) } catch { /* The preview endpoint validates the draft. */ }
  return <div className="space-y-4"><h2 className="text-2xl font-bold">Review Quiet Day scheduling</h2><Link className="underline" href={collectionPath(context.collection.slug, '/collection-settings')}>Collection settings</Link><CareForecast collectionSlug={context.collection.slug} initialDraft={draft} /></div>
}
