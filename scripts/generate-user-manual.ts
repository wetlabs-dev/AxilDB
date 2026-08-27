import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { manualSections } from '../lib/user-manual'

function list(items: string[] = []) {
  if (items.length === 0) return '_None._'
  return items.map((item) => `- ${item}`).join('\n')
}

function screenshotMarkdown(title: string, file?: string) {
  if (!file) return ''
  return `![${title}](../public/manual/screenshots/${file})`
}

async function main() {
  const docsDir = path.join(process.cwd(), 'docs')
  const publicManualDir = path.join(process.cwd(), 'public', 'manual')
  await mkdir(docsDir, { recursive: true })
  await mkdir(publicManualDir, { recursive: true })

  const lines: string[] = [
    '# AxilDB User Manual',
    '',
    'This manual is generated from the same structured help content used by the in-app Help page. It covers AxilDB’s major workflows, permissions, warnings, and operational notes.',
    '',
    'Screenshots are stored in `public/manual/screenshots`. Refresh them against a running app with:',
    '',
    '```bash',
    'AXILDB_DOCS_BASE_URL=https://app.axildb.com AXILDB_DOCS_COLLECTION_SLUG=axildb npm run docs:screenshots',
    '```',
    '',
    '## Contents',
    '',
    ...manualSections.map((section) => `- [${section.title}](#${section.id})`),
    '',
  ]

  for (const section of manualSections) {
    lines.push(`## ${section.title}`, '')
    lines.push(section.purpose, '')
    if (section.route) lines.push(`App route: \`${section.route}\``, '')
    const image = screenshotMarkdown(section.title, section.screenshot)
    if (image) lines.push(image, '')
    lines.push('### How It Is Used', '', list(section.howTo), '')
    if (section.notes?.length) lines.push('### Notes', '', list(section.notes), '')
    if (section.warnings?.length) lines.push('### Warnings', '', list(section.warnings), '')
  }

  const markdown = `${lines.join('\n').trimEnd()}\n`
  await writeFile(path.join(docsDir, 'USER_MANUAL.md'), markdown)
  await writeFile(path.join(publicManualDir, 'USER_MANUAL.md'), markdown)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
