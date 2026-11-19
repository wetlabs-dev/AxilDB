import { formatEditorialProse, formatUnitText, formatFraction, formatChemicalNotation } from '@/lib/editorial-typography'
/** Display-only English punctuation. Never use for storage, identity, queries or payloads. */
export type TypographyMode = 'prose' | 'botanical-name' | 'measurement' | 'chemical' | 'literal'
export type TypographyOptions = { mode?: TypographyMode; locale?: string }

const word = (value: string) => /[\p{L}\p{M}\p{N}]/u.test(value)

/** Explicit measurement fields only: prose quotes after numbers are not assumed to be units. */
export function formatMeasurement(value: string): string {
  return formatUnitText(formatFraction(value)).replace(/([\d¼½¾⅓⅔⅛⅜⅝⅞])\s*(?:inches|inch)\b/g,'$1″').replace(/([\d¼½¾⅓⅔⅛⅜⅝⅞])\s*feet\b/g,'$1′').replace(/(\d(?:[\d.,]*\d)?)\s*''/g, '$1″')
    .replace(/(\d(?:[\d.,]*\d)?)\s*'/g, '$1′')
    .replace(/(\d(?:[\d.,]*\d)?)\s*"/g, '$1″')
    .replace(/\b([\p{L}])'''(?=\()/gu, '$1‴')
    .replace(/\b([\p{L}])''(?=\()/gu, '$1″').replace(/\b([\p{L}])'(?=\()/gu, '$1′')
}

function prose(value: string): string {
  const chars = Array.from(value)
  let single = false, double = false
  const lastSingle = chars.lastIndexOf("'"), lastDouble = chars.lastIndexOf('"')
  return chars.map((char, index) => {
    const prev = chars[index - 1] || '', next = chars[index + 1] || ''
    if (char === '‘') single = true
    if (char === '’' && !(word(prev) && word(next))) single = false
    if (char === '“') double = true
    if (char === '”') double = false
    if (char === "'") {
      if (word(prev) && word(next)) return '’'
      const rest = chars.slice(index + 1, index + 12).join('')
      const decade = /^\d{2}s\b(?!['’])/i.test(rest)
      const year = /^\d{2}\b(?!['’])/.test(rest) && index === lastSingle && /\b(?:in|since|from|of)\s+$/i.test(chars.slice(Math.max(0, index - 24), index).join(''))
      const elision = /^(?:tis|twas|twere|em|cause|round|bout|til)\b(?!['’])/i.test(rest) || /^n['’]\s+roll\b/i.test(rest)
      if (!word(prev) && (decade || year || elision)) return '’'
      if (single) { single = false; return '’' }
      // A trailing plural possessive is not a new opening quotation.
      if (word(prev) && !word(next)) return /[sS]/.test(prev) || (prev === 'n' && chars[index - 2] === '’') || (prev === 'n' && chars[index - 2] === "'" && /\s/.test(chars[index - 3] || ' ')) ? '’' : char
      if (next && !/\s/.test(next) && index < lastSingle) { single = true; return '‘' }
      return char // Ambiguous lone quotation marks retain their literal meaning.
    }
    if (char === '"') {
      if (double) { double = false; return '”' }
      if ((!prev || /[\s([{—–]/u.test(prev)) && next && !/\s/.test(next) && index < lastDouble) { double = true; return '“' }
    }
    return char
  }).join('')
}

// Protect literal spans before processing prose. This is not an HTML renderer/sanitizer.
// Markdown link destinations, code fences/spans, URLs, emails and HTML tags stay exact.
const literalSpan = /(?<![\w])(?:\.{1,2}\/|\/|[A-Za-z]:\\)[^\s<>]+|\b\d{4}-\d{2}-\d{2}(?:T[\d:.+Z-]+)?\b|\b[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)+\b|\b[A-Za-z]+\d+[A-Za-z0-9]*\b|(`{3,}|~{3,})[^\n]*\n[\s\S]*?(?:\1[^\n]*(?:\n|$)|$)|(`+)[^`]*?\2|!?\[[^\]\n]*\]\([^\n]*?\)|<[^>\n]*>|(?:https?:\/\/|www\.)[^\s<>]+|[\w.!#$%&'*+/=?^`{|}~-]+@[\w.-]+\.[a-z]{2,}/gi

export function formatTypography(value: string | null | undefined, options: TypographyOptions = {}): string {
  if (!value) return value || ''
  if (options.mode === 'literal' || (options.locale && !/^en(?:-|$)/i.test(options.locale))) return value
  if (options.mode === 'measurement') return formatMeasurement(value)
  if (options.mode === 'botanical-name') return prose(value)
  // Mask protected spans so quotation context can continue across a link/code token.
  // Choose a marker absent from the source, including user-supplied private-use text.
  let marker = '\uE000'
  while (value.includes(marker)) marker += '\uE000'
  const protectedText: string[] = []
  const prepared = value.replace(literalSpan, (token, ...args) => {
    const offset = args[args.length - 2] as number
    if (/^(?:cm|m)[23]$/.test(token) && /(?:\d\s*|[uµμ]?mol\/)$/.test(value.slice(Math.max(0,offset-20),offset))) return token
    if (options.mode === 'chemical' && /^(CO2|H2O|O2|NH3|NO3|PO4|Ca2|Mg2)$/.test(token)) return token
    const link = token.match(/^(!?\[)([^\]]*)(\]\([\s\S]*\))$/)
    protectedText.push(link ? `${link[1]}${prose(link[2])}${link[3]}` : token)
    return `${marker}${protectedText.length - 1}${marker}`
  })
  const formatted = formatEditorialProse(prose(prepared))
  return (options.mode === 'chemical' ? formatChemicalNotation(formatted) : formatted).replace(new RegExp(`${marker}(\\d+)${marker}`, 'g'), (_, index) => protectedText[Number(index)])
}

/** Only recognized paired outer delimiters are removed; internal apostrophes survive. */
export function formatCultivar(value: string | null | undefined): string {
  let cultivar = value?.trim() || ''
  const pairs: Record<string, string> = { "'": "'", '"': '"', '‘': '’', '“': '”' }
  if (cultivar.length > 1 && pairs[cultivar[0]] === cultivar.at(-1)) cultivar = cultivar.slice(1, -1).trim()
  return cultivar ? `‘${prose(cultivar)}’` : ''
}

/** Human-readable search comparisons only; never normalize stored identities. */
export function normalizeTypographySearch(value: string): string {
  const fractions: Record<string,string> = {'¼':'1/4','½':'1/2','¾':'3/4','⅓':'1/3','⅔':'2/3','⅛':'1/8','⅜':'3/8','⅝':'5/8','⅞':'7/8'}
  const digits: Record<string,string> = {'²':'2','³':'3','₀':'0','₁':'1','₂':'2','₃':'3','₄':'4','₅':'5','₆':'6','₇':'7','₈':'8','₉':'9','⁰':'0','¹':'1','⁴':'4','⁵':'5','⁶':'6','⁷':'7','⁸':'8','⁹':'9','⁻':'-','⁺':'+'}
  return value.replace(/μmol·m⁻²·s⁻¹/g,'umol/m2/s').replace(/mol·m⁻²·d⁻¹/g,'mol/m2/d')
    .replace(/×/g,'x').replace(/−/g,'-').replace(/(\d)–(?=\d)/g,'$1-').replace(/\u00a0|\u202f/g,' ')
    .replace(/(\d)([¼½¾⅓⅔⅛⅜⅝⅞])/g,'$1 $2').replace(/[¼½¾⅓⅔⅛⅜⅝⅞]/g,c=>fractions[c])
    .replace(/[²³₀₁₂₃₄₅₆₇₈₉⁰¹⁴⁵⁶⁷⁸⁹⁻⁺]/g,c=>digits[c]).replace(/[‘’]/g,"'").replace(/[“”]/g,'"')
}
