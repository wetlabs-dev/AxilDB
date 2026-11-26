'use client'
import {useRef} from 'react'
import {Info} from 'lucide-react'
export function AttentionHelp({count}:{count:number}){
 const dialog=useRef<HTMLDialogElement>(null)
 return <><button type="button" className="rounded border px-1 py-1 min-h-11" aria-label={`About Attention: ${count} tasks`} onClick={()=>dialog.current?.showModal()}><b className="block text-base">{count}</b><span className="inline-flex whitespace-nowrap items-center gap-1">attention <Info className="hidden min-[360px]:block h-3 w-3 shrink-0" aria-hidden="true"/></span></button><dialog ref={dialog} className="care-cadence-dialog text-left text-sm" aria-label="About Attention" onClick={e=>{if(e.target===e.currentTarget)dialog.current?.close()}}><h3 className="font-serif text-xl font-bold">About Attention</h3><p className="my-3">Outstanding health checks and quarantine reviews across this collection, including future dates. Counts tasks, not unique plants; routine inspections and condition follow-ups are included. Filters do not change this total. Some tasks also count as due or overdue.</p><p>Use Health to review these tasks. This is not a count of unhealthy plants or missing configuration.</p><button type="button" className="min-h-11 mt-3 rounded border px-3" onClick={()=>dialog.current?.close()}>Close</button></dialog></>
}
