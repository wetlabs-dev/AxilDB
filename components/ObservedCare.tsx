'use client'
import { formatTypography } from '@/lib/typography'
import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { requestCadenceCalibration } from '@/app/calibration-actions'
import { cadenceActivities } from '@/lib/care-cadences'
import type { CareEvidence } from '@/lib/cadence-calibration'
export type ObservedCareRow = {activity:string;outcome:string;lastAssessedAt:string|null;nextEligibleAt:string|null;statisticsAt:string;proposalId:string|null;evidence:Pick<CareEvidence,'summary'|'warnings'|'excluded'|'excludedInstances'|'timezone'|'current'>}
export function useObservedCare(collectionSlug:string, definitionId:string, enabled:boolean) {
  const [rows,setRows]=useState<ObservedCareRow[]>([]), [error,setError]=useState('')
  const load=useCallback(async(signal?:AbortSignal)=>{
    const response=await fetch(`/api/care/calibration?collectionSlug=${encodeURIComponent(collectionSlug)}&definitionId=${encodeURIComponent(definitionId)}`,{signal,cache:'no-store'})
    if (!response.ok) { setError('Observed statistics are unavailable. Collection membership is required.'); return }
    const result=await response.json(); if (!signal?.aborted) {setRows(result.summaries);setError('')}
  },[collectionSlug,definitionId])
  useEffect(()=>{
    if (!enabled) return
    const controller=new AbortController()
    const refresh=()=>{void load(controller.signal).catch(()=>{if(!controller.signal.aborted)setError('Unable to refresh observed care statistics.')})}
    refresh();window.addEventListener('focus',refresh);window.addEventListener('axildb:care-saved',refresh)
    return ()=>{controller.abort();window.removeEventListener('focus',refresh);window.removeEventListener('axildb:care-saved',refresh)}
  },[enabled,load])
  return {rows,error}
}
export function ObservedCareDetails({rows,error,collectionSlug,definitionId,canEdit}:{rows:ObservedCareRow[];error:string;collectionSlug:string;definitionId:string;canEdit:boolean}) {
  const [busy,start]=useTransition(),[message,setMessage]=useState('')
  return <details className="mt-3 text-sm"><summary>Observed care and cadence calibration</summary>
    <p className="mt-2 text-xs">Completed care describes observed practice, not proven optimal care. Statistics refresh on opening or focus with a one-minute cache; formal research has separate cooldowns.</p>
    {error && <p role="status">{formatTypography(error)}</p>}{message && <p role="status">{formatTypography(message)}</p>}
    <div className="mt-2 grid gap-2 md:grid-cols-2">{rows.map(row=><div key={row.activity} className="rounded border p-3">
      <b>{cadenceActivities.find(c=>c.activity===row.activity)?.label}</b> · {row.outcome.replaceAll('_',' ').toLowerCase()}
      <p>Observed mean: {row.evidence.summary.mean?.toFixed(1) ?? 'Insufficient history'}{row.evidence.summary.mean!=null?' days':''} · robust: {row.evidence.summary.robustEstimate?.toFixed(1) ?? '—'} days</p>
      <p className="text-xs">Weighted: {row.evidence.summary.weightedMean?.toFixed(1) ?? '—'} days · {row.evidence.summary.contributingInstances} specimens · {row.evidence.summary.intervalCount} completed intervals · {row.evidence.summary.spanDays} days of history · {row.evidence.summary.excluded} duplicate/invalid observations · {row.evidence.excludedInstances} excluded specimens</p>
      <p className="text-xs">Statistics: {new Date(row.statisticsAt).toLocaleString()} · {row.evidence.timezone}<br/>Last assessment: {row.lastAssessedAt?new Date(row.lastAssessedAt).toLocaleDateString():'Not yet assessed'} · Next: {row.nextEligibleAt?new Date(row.nextEligibleAt).toLocaleDateString():'Awaiting resolution or eligibility change'}</p>
      <details className="text-xs"><summary>Evidence limitations</summary><ul>{row.evidence.warnings.map(w=><li key={w}>{w}</li>)}{Object.entries(row.evidence.excluded).map(([reason,count])=><li key={reason}>{formatTypography(reason)}: {count}</li>)}</ul></details>
      {row.proposalId && <Link className="underline" href={`/server/care-cadence-research?tab=review&definition=${definitionId}&collection=${encodeURIComponent(collectionSlug)}`}>Review suggestion</Link>}
      {canEdit && <form onSubmit={event=>{event.preventDefault();const fd=new FormData(event.currentTarget);start(async()=>{try{setMessage((await requestCadenceCalibration(fd)).message)}catch(e){setMessage(e instanceof Error?e.message:'Could not enqueue assessment.')}})}}>
        <input type="hidden" name="collectionSlug" value={collectionSlug}/><input type="hidden" name="definitionId" value={definitionId}/><input type="hidden" name="activity" value={row.activity}/><button disabled={busy} className="mt-2 rounded border px-2 py-1">Reassess observed cadence</button>
      </form>}
    </div>)}</div>
  </details>
}
export function CalibrationEvidence({value}:{value:unknown}) {
  if (!value || typeof value!=='object') return null
  const e=value as {current?:{interval:number;unit:string};summary?:CareEvidence['summary'];confidence?:number;assessedAt?:string;warnings?:string[]}
  return <div className="rounded border border-green-200 bg-green-50 p-3 text-sm">
    <b>Cadence calibration</b> · Current: {e.current?.interval} {e.current?.unit?.toLowerCase()} · Observed mean: {e.summary?.mean?.toFixed(1)} days · Robust: {e.summary?.robustEstimate?.toFixed(1)} days
    <p>{e.summary?.contributingInstances} specimens · {e.summary?.intervalCount} completed intervals · {e.summary?.spanDays} days · heuristic confidence {Math.round((e.confidence || 0)*100)}%</p>
    <p>Approval starts the configured post-adjustment cooldown (30 days by default) and requires new completed history before another adjustment.</p>
    <details><summary>Limitations</summary>{e.warnings?.map(w=><p key={w}>{w}</p>)}</details>
  </div>
}
