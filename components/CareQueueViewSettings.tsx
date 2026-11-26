'use client'
import {useEffect,useRef,useState} from 'react'
import {notifyCare} from '@/components/CareQueueFeedback'
import {SlidersHorizontal} from 'lucide-react'
import {careViewDefaults,groupingLabels,locationSortLabels,type CarePresentation,type CareViewPreference,type CareViewCommand} from '@/lib/care-view'
export function CareQueueViewSettings({collectionSlug,view,onChange,initialPreference,canRemember}:{collectionSlug:string;view:CarePresentation;onChange:(view:CarePresentation)=>void;initialPreference:CareViewPreference;canRemember:boolean}){
 const [preference,setPreference]=useState(initialPreference),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[failed,setFailed]=useState(false)
 const menu=useRef<HTMLDetailsElement>(null)
 function close(){if(menu.current){menu.current.open=false;menu.current.querySelector('summary')?.focus()}}
 useEffect(()=>{const outside=(event:PointerEvent)=>{if(menu.current?.open&&!menu.current.contains(event.target as Node))menu.current.open=false};document.addEventListener('pointerdown',outside);return()=>document.removeEventListener('pointerdown',outside)},[])
 const alive=useRef(true),running=useRef(false),pending=useRef<CareViewCommand|null>(null),retry=useRef<CareViewCommand|null>(null)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;pending.current=null}},[])
 useEffect(()=>setPreference(initialPreference),[initialPreference])
 async function persist(command:CareViewCommand){
  if(!canRemember)return
  pending.current=command;if(running.current)return
  running.current=true;setBusy(true);setNotice('Saving view…')
  while(pending.current&&alive.current){
   const next=pending.current;pending.current=null
   try{
    const response=await fetch('/api/care/view',{method:'POST',headers:{'Content-Type':'application/json'},keepalive:true,body:JSON.stringify({collectionSlug,...next})})
    const result=await response.json();if(!response.ok)throw new Error(result.error||'Could not save this view.')
    if(alive.current){setPreference(result.preference);setFailed(false);retry.current=null;if(next.action!=='remember'||!pending.current)notifyCare(next.action==='saveDefault'?'Default view saved.':next.action==='reset'?'View preferences reset.':next.action==='mode'?'Startup behavior saved.':'View saved.');setNotice('');if(next.action!=='remember')close();if(next.action==='reset')onChange({...careViewDefaults})}
   }catch{if(alive.current){if(menu.current)menu.current.open=true;setFailed(true);retry.current=next;setNotice('Could not save view. Your current view remains active.')}}
  }
  running.current=false;if(alive.current)setBusy(false)
 }
 function apply(next:CarePresentation){onChange(next);void persist({action:'remember',view:next})}
 return <div className="care-view-controls flex flex-wrap items-end gap-2">
  <details ref={menu} className="care-view-menu" onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();event.currentTarget.open=false;event.currentTarget.querySelector('summary')?.focus()}}}><summary aria-label="View settings" className="min-h-11 cursor-pointer rounded border px-3 py-2 text-sm"><SlidersHorizontal className="mr-1 inline h-4 w-4" aria-hidden="true"/>View<span className="hidden sm:inline"> · {groupingLabels[view.grouping]}</span></summary><div className="care-view-popover space-y-3 rounded border p-3 text-sm"><div className="flex items-center justify-between"><strong>View settings</strong><button type="button" className="min-h-11 px-2 underline" onClick={close}>Close</button></div>
   <div className="grid gap-2 sm:grid-cols-2">  <label className="grid gap-1 text-xs font-semibold">Grouping<select aria-label="Grouping" className="ax-control min-h-11 rounded border p-2 text-sm font-normal" value={view.grouping} onChange={e=>apply({...view,grouping:e.target.value as CarePresentation['grouping']})}>{Object.entries(groupingLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
  <label className="grid gap-1 text-xs font-semibold">Location order<select aria-label="Location order" className="ax-control min-h-11 rounded border p-2 text-sm font-normal" value={view.locationSort} onChange={e=>apply({...view,locationSort:e.target.value as CarePresentation['locationSort']})}>{Object.entries(locationSortLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
</div>
   <p>Current view: {groupingLabels[view.grouping]} · {locationSortLabels[view.locationSort]}</p>
   {canRemember?<><label className="grid gap-1">Startup behavior<select className="ax-control min-h-11 rounded border p-2" aria-label="Startup behavior" disabled={busy} value={preference.mode} onChange={e=>{const mode=e.target.value as 'last'|'default';setPreference(current=>({...current,mode}));void persist({action:'mode',mode})}}><option value="last">Remember last-used view</option><option value="default" disabled={!preference.saved}>Use saved default view</option></select></label>
   <p>Saved default: {preference.saved?`${groupingLabels[preference.saved.grouping]} · ${locationSortLabels[preference.saved.locationSort]}`:'None'}</p>
   <div className="flex flex-wrap gap-2"><button type="button" className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>void persist({action:'saveDefault',view})}>Save current view as default</button><button type="button" className="min-h-11 rounded border px-3" disabled={busy||!preference.saved} onClick={()=>preference.saved&&apply(preference.saved)}>Restore saved default</button><button type="button" className="min-h-11 rounded border px-3" disabled={busy} onClick={()=>void persist({action:'reset'})}>Reset to application defaults</button></div></>:<p>Sign in to remember a personal view.</p>}
   <span role="status" className="text-xs">{busy?'Saving view…':notice}</span>{failed&&!busy&&<button type="button" className="min-h-11 underline" onClick={()=>retry.current&&void persist(retry.current)}>Retry saving view</button>}
  </div></details>
 </div>
}
