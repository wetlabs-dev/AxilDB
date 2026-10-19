import React from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui'
import {
  summarizeReviewQueues,
  type OpenReviewItem,
} from '@/lib/dashboard-reviews'
import { cn } from '@/lib/utils'

export function OpenReviewItems({ items }: { items: OpenReviewItem[] }) {
  const summary = summarizeReviewQueues(items)
  // Preserve the dashboard's existing compact empty state: omit an empty panel.
  if (!summary.items.length) return null
  return (
    <Card id="open-review-items">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-serif text-xl font-semibold">
            Open review items
          </h3>
          <p className="mt-1 text-sm text-stone-600">
            {summary.count} {summary.unavailable ? 'known ' : ''}item
            {summary.count === 1 ? '' : 's'} waiting for a decision.
          </p>
          {summary.unavailable && (
            <p role="status" className="mt-1 text-sm text-amber-900">
              Some review counts are temporarily unavailable. Reload this page
              to retry.
            </p>
          )}
        </div>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
          {summary.queues}
          {summary.unavailable ? '+' : ''} queue
          {summary.queues === 1 && !summary.unavailable ? '' : 's'}
        </span>
      </div>
      <div
        className={cn(
          'mt-4 grid gap-3 md:grid-cols-2',
          summary.items.length === 1 && 'md:max-w-xl md:grid-cols-1',
          summary.items.length > 2 && 'xl:grid-cols-3'
        )}
      >
        {summary.items.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            aria-label={
              item.count === null
                ? `Open ${item.label}; count unavailable`
                : `${item.label}: review ${item.count} pending item${item.count === 1 ? '' : 's'}`
            }
            className="group min-w-0 rounded-lg border border-stone-200 bg-white/60 p-3 transition hover:border-[#8fa58f] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ax-focus)] focus-visible:ring-offset-2"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">{item.label}</p>
                <p className="mt-1 text-sm text-stone-600">
                  {item.description}
                </p>
              </div>
              <span className="shrink-0 rounded-md bg-[#d6dfc9]/70 px-2 py-1 text-sm font-bold text-[#2f6b45]">
                {item.count ?? 'Unavailable'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </Card>
  )
}
