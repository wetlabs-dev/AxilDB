/** Explicit presentation contexts, never canonical values, query syntax or input parsers. */
export const NBSP = '\u00a0'
const fractions: Record<string,string> = { '1/4':'¼','1/2':'½','3/4':'¾','1/3':'⅓','2/3':'⅔','1/8':'⅛','3/8':'⅜','5/8':'⅝','7/8':'⅞' }
const superDigits: Record<string,string> = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','-':'⁻','+':'⁺' }
export function formatScientificNumber(value: string) {
  return value.replace(/\b(\d+(?:\.\d+)?)\s*[x×]\s*10\^([+-]?\d+)\b/g, (_,a,b)=>`${a} × 10${Array.from(b as string).map(c=>superDigits[c]).join('')}`)
    .replace(/\b10\^([+-]?\d+)\b/g,(_,b)=>`10${Array.from(b as string).map(c=>superDigits[c]).join('')}`)
}
export function formatChemicalNotation(value: string): string {
  const chemicals: Record<string,string> = {CO2:'CO₂',H2O:'H₂O',O2:'O₂',NH3:'NH₃','NO3-':'NO₃⁻','PO4 3-':'PO₄³⁻','Ca2+':'Ca²⁺','Mg2+':'Mg²⁺'}
  return value.replace(/(?<![\p{L}\p{N}_])(?:PO4 3-|CO2|H2O|O2|NH3|NO3-|Ca2\+|Mg2\+)(?![\p{L}\p{N}_])/gu, token=>chemicals[token])
}
export function formatFraction(value: string) {
  return value.replace(/\b(\d+)\s+(1\/4|1\/2|3\/4|1\/3|2\/3|1\/8|3\/8|5\/8|7\/8)(?=\s|$)/g,(_,whole,fraction)=>`${whole}${fractions[fraction]}`)
    .replace(/(?<![\w/])(1\/4|1\/2|3\/4|1\/3|2\/3|1\/8|3\/8|5\/8|7\/8)(?![\w/])/g, f=>fractions[f])
}
export function formatDimensions(value: string) {
  return value.replace(/(\d(?:[\d.,]*\d)?[′″]?)\s+[xX]\s+(?=[\d])/g,'$1 × ')
}
export function formatUnitText(value: string) {
  return formatDimensions(formatScientificNumber(value))
    .replace(/\b(?:umol|μmol|µmol)\s*\/\s*m2\s*\/\s*s\b/g,'μmol·m⁻²·s⁻¹')
    .replace(/\bmol\s*\/\s*m2\s*\/\s*d\b/g,'mol·m⁻²·d⁻¹')
    .replace(/\b(cm|m)([23])\b/g,(_,u,p)=>u+(p==='2'?'²':'³'))
    .replace(/(\d)\s*(?:°\s*([CF])|([CF])\b)/g,(_,n,a,b)=>`${n}${NBSP}°${a||b}`)
    .replace(/(\d|[¼½¾⅓⅔⅛⅜⅝⅞])\s*(ml|mL|cm|mm|mg|kg|μm|um|µm|L|m|g|W|lux|fc|ppm|ppb|GiB|MiB|GB|MB|Mb|px|in|ft|m²|cm²|m³|μmol·m⁻²·s⁻¹|mol·m⁻²·d⁻¹)(?![\p{L}\p{N}_])/gu,(_,n,u)=>`${n}${NBSP}${u==='ml'?'mL':u==='um'||u==='µm'?'μm':u}`)
    .replace(/(^|[\s(–])-(?=\d)/g,'$1−')
}
/** Ranges only: dates, ratios and identifiers do not belong in this formatter. */
export function formatRangeText(value: string, allowBare = true) {
  // Keep grammatical from/to and between/and constructions; do not editorially rewrite them.
  if (/\b(?:from|between)\s/i.test(value)) return value
  return value.replace(/(?<![\p{L}\p{N}_/.-])(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)(?=\s*(?:°?[CF]|%|days?\b|weeks?\b|months?\b|years?\b|cm\b|mm\b|lux\b|$))/gu,(match,a,b,offset,source)=>!allowBare && !source.slice(offset+match.length).trim()?match:Number(a)<0||Number(b)<0?`${a.replace('-','−')} to ${b.replace('-','−')}`:`${a}–${b}`)
}
/** Conservative prose rules: only well-identified units/ranges/fractions, never bare ISO dates or ratios. */
export function formatEditorialProse(value: string) {
  return formatUnitText(formatRangeText(value,false))
    .replace(/(?<![\w./])\d+\s+(?:1\/2|1\/4|3\/4)(?=\s+cups?\b)/g,formatFraction)
    .replace(/\b(\d+)\s*-\s*(\d+)(?=\s+(?:days?|weeks?|months?|years?)\b)/g,'$1–$2')
    .replace(/(?<![\w./])(?:1\/2|1\/4|3\/4)(?=\s+(?:strength|teaspoons?|tablespoons?|cups?|inches?|inch)\b)/g,f=>fractions[f])
    .replace(/([¼½¾])\s+strength\b/g,'$1-strength')
    .replace(/(?<![\w./])\d+\s+(?:1\/2|1\/4|3\/4)(?=\s+cups?\b)/g,formatFraction)
    .replace(/(?<!\.)\.{3}(?!\.)/g,'…')
    .replace(/\b(\d+(?:\.\d+)?)\s+%/g,'$1%')
    .replace(/(\d|[¼½¾⅓⅔⅛⅜⅝⅞]) (days?|weeks?|months?|years?|teaspoons?|tablespoons?|cups?)\b/g,`$1${NBSP}$2`)
}
export function formatNumericRange(min: string, max: string, unit = '') {
  const a=min.replace(/^-/,'−'),b=max.replace(/^-/,'−')
  return `${a}${a.startsWith('−')||b.startsWith('−')?' to ':'–'}${b}${unit ? `${unit==='%'?'':NBSP}${unit}` : ''}`
}
export function formatPercentage(value: number | string, options: { fractionDigits?: number; scientificSpacing?: boolean } = {}) {
  const number=typeof value==='string'?value:options.fractionDigits==null?String(value):value.toFixed(options.fractionDigits)
  return `${number.replace(/^-/,'−')}${options.scientificSpacing?'\u202f':''}%`
}
export function formatCareInterval(interval: number, unit: string) {
  const lower=unit.toLowerCase().replace(/s$/,'')
  return interval===1?`Every ${lower}`:`Every ${interval}${NBSP}${lower}s`
}

/** Explicit mathematical text only; do not pass code, ratios or configuration. */
export function formatMathematicalNotation(value: string) {
  return value.replace(/\+\/-/g,'±').replace(/<=/g,'≤').replace(/>=/g,'≥').replace(/!=/g,'≠')
    .replace(/(\d)\s+\*\s+(?=\d)/g,'$1 × ').replace(/(\d)\s+\/\s+(?=\d)/g,'$1 ÷ ')
    .replace(/(\d)\s+-\s+(?=\d)/g,'$1 − ')
}
