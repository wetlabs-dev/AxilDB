'use client'
import { useState, useTransition, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  approveAllCadences,
  cadenceApprovalPreview,
  researchMissingCadences,
  recoverCadenceData,
  reviewCadence,
} from '@/app/cadence-research-actions'

export function CadenceResearchRefresh({ active }: { active: boolean }) {
  const router = useRouter()
  const [pending, refresh] = useTransition()
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => {
      if (!pending && !document.hidden) refresh(() => router.refresh())
    }, 15000)
    return () => clearInterval(timer)
  }, [active, pending, router])
  return null
}
export function CadenceResearchControls() {
  const [busy, start] = useTransition()
  const [message, setMessage] = useState('')
  const [preview, setPreview] = useState<Awaited<
    ReturnType<typeof cadenceApprovalPreview>
  > | null>(null)
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (preview) dialogRef.current?.showModal()
    else dialogRef.current?.close()
  }, [preview])
  function run(work: () => Promise<void>) {
    start(async () => {
      try {
        await work()
        router.refresh()
      } catch (e) {
        setMessage(e instanceof Error ? e.message : 'Operation failed.')
      }
    })
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-3">
        <button
          disabled={busy}
          className="rounded-md bg-[#2f6b45] px-4 py-2 font-semibold text-white disabled:opacity-50"
          onClick={() =>
            run(async () => {
              const r = await researchMissingCadences(new FormData())
              setMessage(
                `${r.created} definitions queued. Existing active work is retained.`
              )
            })
          }
        >
          Research Missing Cadences
        </button>
        <button
          disabled={busy}
          className="rounded-md bg-[#2f6b45] px-4 py-2 font-semibold text-white disabled:opacity-50"
          onClick={() =>
            run(async () => {
              setPreview(await cadenceApprovalPreview())
            })
          }
        >
          Approve All Eligible
        </button>
        <button
          disabled={busy}
          className="rounded-md bg-[#2f6b45] px-4 py-2 font-semibold text-white disabled:opacity-50"
          onClick={() =>
            run(async () => {
              const r = await recoverCadenceData()
              setMessage(
                `${r.created} historical proposals recovered for review.`
              )
            })
          }
        >
          Recover previous cadence data
        </button>
      </div>
      <p role="status">{busy ? 'Working…' : message}</p>
      {preview && (
        <dialog
          ref={dialogRef}
          aria-labelledby="cadence-confirm"
          onCancel={() => setPreview(null)}
          className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl backdrop:bg-black/40"
        >
          <div className="space-y-4">
            <h3 id="cadence-confirm" className="text-xl font-bold">
              Approve {preview.count} care cadence recommendations across{' '}
              {preview.definitions} Plant Definitions?
            </h3>
            <p>
              Existing configured cadences and Plant Instance overrides will not
              be changed. Each recommendation will be checked again when
              approved.
            </p>
            <div className="flex gap-3">
              <button
                autoFocus
                disabled={busy}
                onClick={() => setPreview(null)}
              >
                Cancel
              </button>
              <button
                disabled={busy || !preview.count}
                onClick={() =>
                  run(async () => {
                    const result = await approveAllCadences(preview.ids)
                    setMessage(
                      Object.entries(result)
                        .map(
                          ([reason, count]) =>
                            `${count} ${reason === 'APPROVED' ? 'approved' : reason.startsWith('FAILED:') ? `failed: ${reason.slice(7)}` : `skipped: ${reason}`}`
                        )
                        .join('; ') || 'No eligible recommendations.'
                    )
                    setPreview(null)
                  })
                }
              >
                Approve All
              </button>
            </div>
          </div>
        </dialog>
      )}
    </div>
  )
}
export function CadenceProposalReview({
  id,
  interval,
  unit,
  actionable,
}: {
  id: string
  interval: number | null
  unit: string | null
  actionable: boolean
}) {
  const [busy, start] = useTransition()
  const [message, setMessage] = useState('')
  const router = useRouter()
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const fd = new FormData(event.currentTarget)
        const submitter = (event.nativeEvent as SubmitEvent)
          .submitter as HTMLButtonElement | null
        fd.set('decision', submitter?.value || '')
        start(async () => {
          try {
            const r = await reviewCadence(fd)
            setMessage(r.result)
            router.refresh()
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Review failed.')
          }
        })
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {actionable && (
        <>
          <label className="text-xs">
            Approved interval{' '}
            <input
              aria-label="Approved interval"
              name="interval"
              type="number"
              min="1"
              max="3650"
              defaultValue={interval || 1}
              className="w-20 rounded border p-1"
              required
            />
          </label>
          <select
            aria-label="Approved unit"
            name="unit"
            defaultValue={unit || 'DAY'}
            className="rounded border p-1"
          >
            {['DAY', 'WEEK', 'MONTH', 'YEAR'].map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
          <button disabled={busy} name="decision" value="approve">
            Approve
          </button>
        </>
      )}
      <button disabled={busy} name="decision" value="reject" formNoValidate>
        Reject
      </button>
      <span role="status">{message}</span>
    </form>
  )
}
