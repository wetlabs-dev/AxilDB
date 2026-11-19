import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import PDFDocument from 'pdfkit'
import {formatTypography} from '@/lib/typography'
import {botanicalPlainName} from '@/lib/botanical-typography'
import {writeBotanicalPdf} from '@/lib/pdf-botanical'
const fontkit = require('fontkit') as {openSync:(path:string)=>{hasGlyphForCodePoint:(code:number)=>boolean;availableFeatures:string[]}}
async function main(){
 const font=fontkit.openSync('public/fonts/Inter-400.ttf'),required='×’‘“”′″‴–—−…°μ½²³₀₁₂₃₄⁻⁺⁶'
 for(const char of required)assert(font.hasGlyphForCodePoint(char.codePointAt(0)!),'Missing glyph '+char)
 const out='/tmp/axildb-editorial-after';await fs.mkdir(out,{recursive:true})
 const doc=new PDFDocument({size:'LETTER',margin:48}),chunks:Buffer[]=[]
 doc.on('data',c=>chunks.push(c));const done=new Promise<Buffer>(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))))
 doc.registerFont('Body',path.resolve('public/fonts/Inter-400.ttf'))
 doc.font('Body').fontSize(18).text('Scientific typography — isolated fixture')
 doc.moveDown();doc.fontSize(12)
 writeBotanicalPdf(doc,botanicalPlainName({genus:'Hoya',species:'fungii x Hoya pubicalyx',cultivarName:"N'Joy",authority:'L.'},true))
 doc.moveDown()
 for(const line of ['18-24°C; 50-70% humidity','Apply 1/2 strength every 7-10 days.','150 umol/m2/s','12 m2; 250ml; -5 °C','CO2 H2O O2 NH3 NO3- PO4 3- Ca2+ Mg2+'])doc.font('Body').text(formatTypography(line,{mode:line.startsWith('CO2')?'chemical':'prose'})).moveDown(.5)
 doc.text(required).moveDown()
 doc.font('Courier').fontSize(9).text('Literal: git status --porcelain; {"recipe":"NPK 10-10-10"}')
 doc.end();await fs.writeFile(out+'/scientific-specimen.pdf',await done)
 console.log('Required scientific glyphs present in bundled Inter; mixed scientific/upright PDF fixture generated.')
}
main().catch(error=>{console.error(error);process.exitCode=1})
