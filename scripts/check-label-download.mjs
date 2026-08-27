import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const labelsPage = readFileSync('app/labels/page.tsx', 'utf8')
const locationListPage = readFileSync('app/locations/page.tsx', 'utf8')
const locationDetailPage = readFileSync('app/locations/[id]/page.tsx', 'utf8')
const route = readFileSync('app/api/labels/bulk/route.ts', 'utf8')

assert.match(labelsPage, /name="download" value="1"/, 'Bulk label exports should request forced download mode.')
assert.match(locationListPage, /target=locations&download=1&id=/, 'Location list QR label links should request forced download mode.')
assert.match(locationDetailPage, /target=locations&download=1&id=/, 'Location detail QR label links should request forced download mode.')
assert.match(route, /const forceDownload = url\.searchParams\.get\('download'\) === '1'/, 'Bulk label PDFs should expose an explicit forced-download mode.')
assert.match(route, /forceDownload \? 'application\/octet-stream' : 'application\/pdf'/, 'Forced downloads should use a generic binary content type so iOS does not render the PDF inside the PWA.')
assert.match(route, /'Content-Disposition': `attachment; filename="\$\{filename\}"`/, 'Label PDFs should remain attachment downloads.')
assert.match(route, /'X-Content-Type-Options': 'nosniff'/, 'Forced downloads should ask the browser not to sniff the PDF back into an inline viewer.')
assert.doesNotMatch(route, /OpenAction|addNamedJavaScript|this\.print/, 'Label PDFs should not attempt automatic PDF printing.')

console.log('Label download checks passed.')
