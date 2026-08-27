import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const route = readFileSync('app/api/labels/bulk/route.ts', 'utf8')

assert.match(route, /function isMobileRequest\(req: Request\)/, 'Bulk label PDFs should detect mobile requests.')
assert.match(route, /sec-ch-ua-mobile/, 'Mobile detection should honor client hints.')
assert.match(route, /iPhone\|iPad\|iPod\|Android\|Mobile/, 'Mobile detection should include common mobile user agents.')
assert.match(route, /function addOpenPrintAction\(doc: PDFKit\.PDFDocument\)/, 'Bulk label PDFs should add a PDF open-print action.')
assert.match(route, /addNamedJavaScript\?\.\('axildb-mobile-label-print'/, 'Mobile PDFs should include named print JavaScript for viewers that inspect document scripts.')
assert.match(route, /_root\.data\.OpenAction = action/, 'Mobile PDFs should include a catalog open action.')
assert.match(route, /bShrinkToFit: false/, 'Label print action should preserve exact label sizing.')
assert.match(route, /\$\{autoPrintOnOpen \? 'inline' : 'attachment'\}/, 'Mobile PDFs should load inline while desktop PDFs remain attachments.')

console.log('Label print checks passed.')
