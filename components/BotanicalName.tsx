import React from 'react'
import { botanicalSegments, botanicalTextSegments, type BotanicalIdentity } from '@/lib/botanical-typography'
export function BotanicalName({value,includeAuthority=false,accepted=false}:{value:BotanicalIdentity;includeAuthority?:boolean;accepted?:boolean}){
 return <span className="ax-botanical-name">{botanicalSegments(accepted?{...value,identificationStatus:'IDENTIFIED'}:value,includeAuthority).map((part,i)=>part.italic?<i key={i}>{part.text}</i>:<span key={i} className="not-italic">{part.text}</span>)}</span>
}
export function BotanicalText({text}:{text:string|null|undefined}){
 if(!text)return null
 return <span className="ax-botanical-name">{botanicalTextSegments(text).map((part,i)=>part.italic?<i key={i}>{part.text}</i>:<span key={i} className="not-italic">{part.text}</span>)}</span>
}
