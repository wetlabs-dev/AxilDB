'use client'
import {useEffect,useRef,useState} from 'react'
export function notifyCare(message:string){window.dispatchEvent(new CustomEvent('axildb:care-feedback',{detail:message}))}
export function CareQueueFeedback(){
 const [message,setMessage]=useState(''),timer=useRef<ReturnType<typeof setTimeout>|null>(null)
 useEffect(()=>{const show=(event:Event)=>{setMessage((event as CustomEvent<string>).detail);if(timer.current)clearTimeout(timer.current);timer.current=setTimeout(()=>setMessage(''),4000)};window.addEventListener('axildb:care-feedback',show);return()=>{window.removeEventListener('axildb:care-feedback',show);if(timer.current)clearTimeout(timer.current)}},[])
 return <span role="status" aria-live="polite" className={message?'care-transient-status':'sr-only'}>{message}</span>
}
