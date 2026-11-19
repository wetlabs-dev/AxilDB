import { formatCultivar, formatTypography } from '@/lib/typography'
export type BotanicalIdentity = { genus?:string|null; species?:string|null; hybridNotation?:string|null; cultivarName?:string|null; authority?:string|null; provisionalTaxon?:string|null; identificationStatus?:string|null }
export type BotanicalSegment = { text:string; italic:boolean }
const upright = /^(?:×|subsp\.|ssp\.|var\.|f\.|sp\.|spp\.|cf\.|aff\.|notho\w*\.|[A-Z]\.)$/iu
/** x is meaningful only as a complete botanical operator. Never expand parentage. */
export function formatHybridNotation(value: string) { return value.replace(/(^|\s)[xX](?=\s|$)/g,'$1×') }
export function scientificSegments(value:string): BotanicalSegment[] {
  return formatHybridNotation(value).split(/(\s+|×)/u).filter(Boolean).map(text=>({text,italic:!/^\s+$/.test(text)&&!upright.test(text)}))
}
export function botanicalSegments(p:BotanicalIdentity, includeAuthority=false):BotanicalSegment[] {
  if(p.identificationStatus==='PROVISIONAL'&&p.provisionalTaxon?.trim())return scientificSegments(formatTypography(p.provisionalTaxon,{mode:'botanical-name'}))
  const genus=formatHybridNotation(p.genus?.trim()||'').replace(/\p{L}/u,c=>c.toLocaleUpperCase('en'))
  // Preserve explicitly written parent genera; lowercase epithets rather than whole formulas.
  let afterOperator=false
  const species=scientificSegments(p.species?.trim()||'').map(s=>{
    if(s.text==='×'){afterOperator=true;return s}
    if(!s.italic||/^\s+$/.test(s.text))return s
    const text=afterOperator&&/^\p{Lu}/u.test(s.text)?s.text:s.text.toLocaleLowerCase('en');afterOperator=false;return {...s,text}
  })
  const parts=[scientificSegments(genus),scientificSegments(p.hybridNotation?.trim()||''),species].filter(s=>s.length)
  const out:BotanicalSegment[]=[]
  for(const part of parts){if(out.length)out.push({text:' ',italic:false});out.push(...part)}
  const cultivar=formatCultivar(p.cultivarName)
  if(cultivar)out.push({text:(out.length?' ':'')+cultivar,italic:false})
  if(includeAuthority&&p.authority?.trim())out.push({text:(out.length?' ':'')+p.authority.trim(),italic:false})
  return out
}
export function botanicalPlainName(p:BotanicalIdentity,includeAuthority=false){return botanicalSegments(p,includeAuthority).map(s=>s.text).join('')}
/** For display-only payloads which already contain an assembled name (never raw evidence). */
export function botanicalTextSegments(text:string):BotanicalSegment[]{
 const split=text.indexOf('‘')
 return split<0?scientificSegments(text):[...scientificSegments(text.slice(0,split)),{text:text.slice(split),italic:false}]
}
