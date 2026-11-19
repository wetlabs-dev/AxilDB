import path from 'node:path'
import { botanicalTextSegments } from '@/lib/botanical-typography'
const normal = 'AxilBotanicalUpright'
type Fonts = { normal:string; italic:string }
const labelFonts: Fonts = {normal:'Times-Roman',italic:'Times-Italic'}
const needsFallback = (text:string) => /[^\u0000-\u00ff\u2018-\u201d\u2013\u2014\u2026]/u.test(text)
function fontFor(part:{text:string;italic:boolean},fonts:Fonts){return needsFallback(part.text)?normal:part.italic&&!['Times-Italic','Helvetica-Oblique'].includes(fonts.italic)?fonts.italic:fonts.normal}
function slant(part:{text:string;italic:boolean},fonts:Fonts){return part.italic&&(needsFallback(part.text)||fonts.normal===fonts.italic||['Times-Italic','Helvetica-Oblique'].includes(fonts.italic))}
/** Existing bundled Inter covers all required scientific glyphs; no host font dependency. */
export function registerBotanicalPdfFont(doc: PDFKit.PDFDocument) {
  doc.registerFont(normal,path.join(process.cwd(),'public/fonts/Inter-400.ttf'))
}
export function botanicalLineWidth(doc:PDFKit.PDFDocument,text:string,size:number){
 return botanicalTextSegments(text).reduce((sum,part)=>sum+doc.font(fontFor(part,labelFonts)).fontSize(size).widthOfString(part.text,{oblique:slant(part,labelFonts)}),0)
}
/** Fixed label positions: never change MediaBox, margins, identifier text or QR geometry. */
export function drawBotanicalLine(doc:PDFKit.PDFDocument,text:string,x:number,y:number,width:number,size:number,center=false){
 registerBotanicalPdfFont(doc)
 const measured=botanicalLineWidth(doc,text,size)
 // Prefer the configured size, but never paint a long name over a QR code or off the paper.
 const actual=measured>width?size*width/measured:size
 let offset=x+(center?(width-botanicalLineWidth(doc,text,actual))/2:0)
 for(const part of botanicalTextSegments(text)){
  doc.font(fontFor(part,labelFonts)).fontSize(actual).text(part.text,offset,y,{lineBreak:false,oblique:slant(part,labelFonts)})
  offset+=doc.widthOfString(part.text,{oblique:slant(part,labelFonts)})
 }
}
/** Flowing report text: italic scientific runs and upright cultivar/rank/authority runs. */
export function writeBotanicalPdf(doc:PDFKit.PDFDocument,text:string,options:PDFKit.Mixins.TextOptions={},x?:number,y?:number,fonts:Fonts={normal:'Helvetica',italic:'Helvetica-Oblique'},affixes:{prefix?:string;suffix?:string}={}){
 registerBotanicalPdfFont(doc)
 const parts=[...(affixes.prefix?[{text:affixes.prefix,italic:false}]:[]),...botanicalTextSegments(text),...(affixes.suffix?[{text:affixes.suffix,italic:false}]:[])]
 parts.forEach((part,i)=>{
  doc.font(fontFor(part,fonts))
  const opts={...options,oblique:slant(part,fonts),continued:i<parts.length-1}
  if(i===0&&x!=null&&y!=null)doc.text(part.text,x,y,opts);else doc.text(part.text,opts)
 })
}
