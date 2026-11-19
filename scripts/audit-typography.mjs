import fs from 'node:fs'
import { sourceFiles, typographyCandidates } from './typography-source.mjs'
const candidates = ['app', 'components', 'lib'].flatMap(sourceFiles).flatMap(file => typographyCandidates(file, fs.readFileSync(file, 'utf8')))
for (const item of candidates) console.error(`${item.file}:${item.line}: Review ASCII punctuation in UI copy: ${JSON.stringify(item.text.trim()).slice(0, 200)}`)
if (candidates.length) process.exitCode = 1
else console.log('Typography source audit passed (JSX text, display attributes and static UI strings).')
