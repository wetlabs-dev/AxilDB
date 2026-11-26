'use client'
import {useEffect,useRef,useState} from 'react'
import {notifyCare} from '@/components/CareQueueFeedback'
import {BotanicalText} from '@/components/BotanicalName'
import {CareCategoryBadge} from '@/components/CareCategoryBadge'
import {useCareQueue} from '@/components/CareQueueOptimistic'
import {formatDate} from '@/lib/time'
import {formatTypography} from '@/lib/typography'
import {visibleCareLimit,type VisibleCareReview,type VisibleCareEntry} from '@/lib/visible-care'
import type {CareQueueItem} from '@/lib/care-queue'
export function CompleteVisibleCare({items,label,collectionSlug,timezone,substrateVersions}:{items:CareQueueItem[];label:string;collectionSlug:string;timezone?:string;substrateVersions:{id:string;label:string}[]}){
 const dialog=useRef<HTMLDialogElement>(null),trigger=useRef<HTMLButtonElement>(null),request=useRef<AbortController|null>(null)
 useEffect(()=>()=>request.current?.abort(),[])
 const {store}=useCareQueue(),[review,setReview]=useState<VisibleCareReview[]>([]),[selected,setSelected]=useState<string[]>([]),[data,setData]=useState<Record<string,Record<string,string>>>({}),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const attempt=useRef<{entries:VisibleCareEntry[];sharedNote:string;operationId:string;issuedAt:number}|null>(null)
 async function post(body:object){
  const controller=new AbortController();request.current=controller;const timeout=setTimeout(()=>controller.abort(),45000)
  try{const response=await fetch('/api/care/complete-visible',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({collectionSlug,...body})});const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not confirm care. Retry safely.');return result}finally{clearTimeout(timeout);if(request.current===controller)request.current=null}
 }
 async function open(preserve=false){dialog.current?.showModal();setBusy(true);setError('');setReview([]);attempt.current=null
  try{const result=await post({action:'review',keys:items.map(i=>i.key)});setReview(result.review);setSelected(current=>result.review.filter((r:VisibleCareReview)=>!r.unavailable&&(!preserve||current.includes(r.item.key))).map((r:VisibleCareReview)=>r.item.key));setData(current=>Object.fromEntries(result.review.map((r:VisibleCareReview)=>[r.item.key,preserve&&current[r.item.key]?current[r.item.key]:{fertilizerStrength:r.item.fertilizerStrength||''}])));if(!preserve)setNote('')}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 function close(){if(busy)return;dialog.current?.close();trigger.current?.focus()}
 async function complete(){setBusy(true);setError('')
  const payload=attempt.current||{entries:review.filter(r=>selected.includes(r.item.key)).map(r=>({key:r.item.key,occurrence:r.occurrence,fields:data[r.item.key]||{}})),sharedNote:note,operationId:crypto.randomUUID(),issuedAt:Date.now()};attempt.current=payload
  try{const {result}=await post({action:'complete',...payload});notifyCare(`${result.completed} care task${result.completed===1?'':'s'} completed across ${result.plants} plant${result.plants===1?'':'s'}.${result.alreadyCompleted?` ${result.alreadyCompleted} already recorded today.`:''}`);dialog.current?.close();trigger.current?.focus();await store.reconcile();attempt.current=null}catch(e){setError(`${(e as Error).message} Care is recorded all together, with no partial batch. Retry the same selection safely.`)}finally{setBusy(false)}
 }
 const chosen=review.filter(r=>selected.includes(r.item.key)),plants=new Set(chosen.map(r=>r.item.plantInstanceId).filter(Boolean)).size
 const missingDetails=chosen.some(({item})=>item.taskType==='REPOT'&&(!data[item.key]?.substrateMode||data[item.key]?.substrateMode==='RECIPE'&&!data[item.key]?.substrateRecipeVersionId))
 const counts=new Map<string,number>();chosen.forEach(r=>counts.set(r.item.taskType,(counts.get(r.item.taskType)||0)+1))
 const field=(key:string,name:string,value:string)=>setData(current=>({...current,[key]:{...current[key],[name]:value}}))
 return <><button ref={trigger} type="button" className="min-h-11 rounded border px-2 text-xs font-semibold" onClick={()=>void open()}>Complete visible care</button>

 <dialog ref={dialog} className="care-cadence-dialog visible-care-dialog" aria-label={`Complete visible care for ${label}`} onCancel={e=>{if(busy)e.preventDefault()}} onClick={e=>{if(e.target===e.currentTarget)close()}} onClose={()=>trigger.current?.focus()}>
 <div className="flex items-start justify-between gap-2"><div><h3 className="font-serif text-xl font-bold">Complete visible care</h3><p className="break-words">{formatTypography(label)}</p></div><button type="button" className="min-h-11 px-3" onClick={close} disabled={busy} aria-label="Close care review">Close</button></div>
 <p className="my-2 text-sm">Only select care you actually performed. Check substrate moisture before watering. Treatment, condition and quarantine decisions use their individual workflows.</p>
 {busy&&!review.length&&<p role="status">Reviewing current care…</p>}
 {items.length>visibleCareLimit&&<p>Select a smaller filtered group of up to {visibleCareLimit} tasks.</p>}
 {error&&<p role="alert" className="my-2 rounded border p-2 ax-status-warning">{error}</p>}
 <fieldset disabled={busy||Boolean(attempt.current)} className="space-y-2">
 <p aria-live="polite">{selected.length} selected task{selected.length===1?'':'s'} across {plants} plant{plants===1?'':'s'}</p><div className="flex flex-wrap gap-2">{[...counts].map(([type,count])=><span key={type}><CareCategoryBadge type={type} className="text-xs"/> {count}</span>)}<span className="sr-only">{[...counts].map(([type,count])=>`${type}: ${count}`).join(', ')}</span></div>
 <div className="flex gap-3"><button type="button" className="min-h-11 underline" onClick={()=>setSelected(review.filter(r=>!r.unavailable).map(r=>r.item.key))}>Select all</button><button type="button" className="min-h-11 underline" onClick={()=>setSelected([])}>Deselect all</button></div>
 {review.map(({item,unavailable})=><div key={item.key} className="rounded border p-3 space-y-2" data-review-key={item.key}>
 <label className="flex items-start gap-3"><input type="checkbox" className="mt-2 h-5 w-5" checked={selected.includes(item.key)} disabled={Boolean(unavailable)} onChange={e=>setSelected(current=>e.target.checked?[...current,item.key]:current.filter(k=>k!==item.key))}/><span className="min-w-0"><CareCategoryBadge type={item.taskType} className="text-xs"/><span className="block"><BotanicalText text={item.plantName}/></span><span className="block break-all text-xs">{item.plantId||formatTypography(item.title)}</span><span className="block text-xs">{formatDate(item.dueAt,timezone)} · {formatTypography(item.locationPath||'No location')}</span></span></label>
 {unavailable?<p className="text-sm">{unavailable} <a className="underline" href={item.href}>Open task</a></p>:selected.includes(item.key)&&<div className="grid gap-2 text-sm sm:grid-cols-2">
 {item.taskType==='FERTILIZE'&&<><p className="sm:col-span-2">{formatTypography(item.fertilizerRecipeName||'Assigned fertilizer')}</p>{['fertilizerStrength','fertilizerDose','fertilizerWaterVolume'].map((name,i)=><label key={name}>{['Strength','Dose','Water volume'][i]}<input className="ax-control w-full min-h-11 border rounded p-2" value={data[item.key]?.[name]||''} onChange={e=>field(item.key,name,e.target.value)}/></label>)}</>}
 {item.taskType==='REPOT'&&<><label>New substrate<select required className="ax-control w-full min-h-11 border rounded p-2" value={data[item.key]?.substrateMode||''} onChange={e=>field(item.key,'substrateMode',e.target.value)}><option value="">Choose…</option><option value="RECIPE">Recipe</option><option value="RECEIVED_SUBSTRATE">Received substrate</option><option value="CUSTOM_UNKNOWN">Custom / Unknown Mix</option><option value="NO_SUBSTRATE">No substrate</option><option value="UNKNOWN">Unknown</option></select></label>{data[item.key]?.substrateMode==='RECIPE'&&<label>Substrate recipe<select required className="ax-control w-full min-h-11 border rounded p-2" value={data[item.key]?.substrateRecipeVersionId||''} onChange={e=>field(item.key,'substrateRecipeVersionId',e.target.value)}><option value="">Choose…</option>{substrateVersions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}</select></label>}<label>Substrate description<input className="ax-control w-full border rounded p-2" value={data[item.key]?.receivedSubstrateDescription||''} onChange={e=>field(item.key,'receivedSubstrateDescription',e.target.value)}/></label></>}
 <label className="sm:col-span-2">Task note<input maxLength={4000} className="ax-control w-full min-h-11 border rounded p-2" value={data[item.key]?.notes||''} onChange={e=>field(item.key,'notes',e.target.value)}/></label>
 </div>}
 </div>)}
 <label className="block text-sm">Shared note<textarea maxLength={4000} className="ax-control block w-full rounded border p-2" value={note} onChange={e=>setNote(e.target.value)}/></label>
 </fieldset>
 {missingDetails&&<p role="status">Choose the new substrate for each selected repotting task before completing care.</p>}
 <div className="care-cadence-dialog-actions"><button type="button" className="min-h-11 rounded border px-3" disabled={busy||!selected.length||missingDetails} onClick={()=>void complete()}>{busy?'Recording care…':attempt.current?'Retry same selection':`Complete ${selected.length} task${selected.length===1?'':'s'}`}</button>{attempt.current&&!busy&&<button type="button" className="min-h-11 underline" onClick={()=>void open(true)}>Refresh review</button>}</div>
 </dialog></>
}
