import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { formatTypography as f, normalizeTypographySearch } from '@/lib/typography'
import { formatChemicalNotation,formatFraction,formatScientificNumber,formatRangeText,formatCareInterval,formatPercentage,formatMathematicalNotation } from '@/lib/editorial-typography'
import { botanicalPlainName, botanicalSegments } from '@/lib/botanical-typography'
import { BotanicalName } from '@/components/BotanicalName'
import { plantName } from '@/lib/utils'
import { formatTemperatureRange,temperatureInputValue } from '@/lib/units'
const cases=[['Researching...','Researching…'],['7-10 days','7–10\u00a0days'],['2.25 x 1.25 in','2.25 × 1.25\u00a0in'],['-5 °C','−5\u00a0°C'],['25°C','25\u00a0°C'],['250ml','250\u00a0mL'],['1/2 teaspoon','½\u00a0teaspoon'],['1/2 strength fertilizer','½-strength fertilizer'],['12 m2','12\u00a0m²'],['150 umol/m2/s','150\u00a0μmol·m⁻²·s⁻¹'],['50-70%','50–70%'],['-10 to -5 °C','−10 to −5\u00a0°C']]
for(const [raw,expected]of cases){assert.equal(f(raw),expected,raw);assert.equal(f(f(raw)),expected,'Idempotence: '+raw)}
for(const raw of ['2026-11-19','2026-11-19T18:02:21.551Z','HOYA-2026-001','https://example.test/1/2/250ml',"`npm run build -- --foo='a'`",'20:20:20','1/2/2026','NPK 10-10-10'])assert.equal(f(raw),raw,raw)
assert.equal(formatRangeText('-10--5 °C'),'−10 to −5 °C')
assert.equal(formatFraction('1 1/2 cups'),'1½ cups')
assert.equal(formatScientificNumber('3 x 10^5'),'3 × 10⁵')
assert.equal(formatChemicalNotation('CO2 H2O NO3- Ca2+ PO4 3-'),'CO₂ H₂O NO₃⁻ Ca²⁺ PO₄³⁻')
assert.equal(f('CO2 and NO3-',{mode:'chemical'}),'CO₂ and NO₃⁻')
assert.equal(f('`CO2` A-CO2-001',{mode:'chemical'}),'`CO2` A-CO2-001')
assert.equal(formatCareInterval(1,'WEEK'),'Every week');assert.equal(formatCareInterval(3,'WEEK'),'Every 3\u00a0weeks')
assert.equal(formatPercentage('21.0'),'21.0%');assert.equal(formatPercentage(-2.4),'−2.4%')
assert.equal(formatTemperatureRange(18,24,'CELSIUS'),'18–24\u00a0°C');assert.equal(temperatureInputValue(-5,'CELSIUS'),'-5')
const identity=Object.freeze({genus:'hoya',species:'fungii x Hoya pubicalyx',cultivarName:"N'Joy",authority:'L.'})
assert.equal(plantName(identity),"hoya fungii x Hoya pubicalyx 'N'Joy'")
assert.equal(botanicalPlainName(identity,true),'Hoya fungii × Hoya pubicalyx ‘N’Joy’ L.')
const parts=botanicalSegments({...identity,species:'cf. carnosa var. picta'},true)
for(const p of parts)if(['cf.','var.','×'].includes(p.text))assert.equal(p.italic,false)
assert.equal(parts.at(-1)?.italic,false)
assert.match(renderToStaticMarkup(createElement(BotanicalName,{value:identity,includeAuthority:true})),/<i>Hoya<\/i>/)
assert.equal(normalizeTypographySearch('Hoya fungii × Hoya pubicalyx'),'Hoya fungii x Hoya pubicalyx')
console.log('Editorial prose, scientific contexts, canonical data, botanical markup, numerical precision and input compatibility passed.')

assert.equal(formatMathematicalNotation('10 - 3 = 7; <= 30; 10 / 2'),'10 − 3 = 7; ≤ 30; 10 ÷ 2')
assert.equal(f('3/4 inch',{mode:'measurement'}),'¾″')
assert.equal(f('1 1/2 cups'),'1½\u00a0cups')
assert.equal(f('/opt/server/25C/foo... ../1/2/data'),'/opt/server/25C/foo... ../1/2/data')

assert.equal(normalizeTypographySearch('1½ cups; CO₂; NO₃⁻'),'1 1/2 cups; CO2; NO3-')

assert.equal(f('Accession 123-456'),'Accession 123-456')
