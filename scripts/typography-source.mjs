import ts from 'typescript'
import fs from 'node:fs'
import path from 'node:path'

export function sourceFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : []
  })
}
const copyProps = /^(?:title|label|placeholder|aria-label|alt|description|message|help|hint|summary|explanation|reason|reasoning|instructions|emptyText|confirmText|error|pendingMessage|successMessage|errorMessage|confirmLabel|pendingLabel)$/
const technical = /(?:https?:|\b(?:SELECT|INSERT|docker|npm|git |node |import |export |sh -c|process\.|JSON\.)|\$\{|<\/?[a-z]|=>|\\[bdsw]|\^)/
export function typographyCandidates(file, source) {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const found = []
  function literal(n) {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isJsxElement(p) && ['pre', 'code', 'script', 'style'].includes(p.openingElement.tagName.getText(sf))) return true
    }
    return false
  }
  function add(n, text, kind) {
    if (!technical.test(text) && /(?:\p{L}'\p{L}|\p{L}s'(?=\s|$)|&apos;|&#(?:39|x27);|&quot;|["'][\p{L}][^\n]*["']|\b(?:Loading|Saving|Searching|Researching|Preparing|Checking|Uploading|Copying|Working|Creating|Deleting|Sending|Generating|Processing)[^\n]*\.{3}|\b\d+(?:\.\d+)? [xX] \d)/u.test(text)) {
      const start = n.getStart(sf)
      const line = sf.getLineAndCharacterOfPosition(start).line + 1
      const preceding = source.split('\n').slice(Math.max(0, line - 3), line).join('\n')
      // A reviewed exception must explain why the literal characters matter.
      if (!/typography-literal:\s*\S/.test(preceding)) found.push({ file, start, end: n.end, text, kind, line })
    }
  }
  function visit(n) {
    if (!literal(n)) {
      if (ts.isJsxText(n)) add(n, n.getText(sf), 'jsx')
      else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
        if (file.endsWith('tsx')) add(n, n.text, 'template')
      }
      else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
        const p = n.parent
        const attr = ts.isJsxAttribute(p) ? p.name.getText(sf) : ''
        const prop = ts.isPropertyAssignment(p) ? p.name.getText(sf).replace(/^['"]|['"]$/g, '') : ''
        const direct = ts.isJsxExpression(p) && !ts.isJsxAttribute(p.parent)
        const eligible = attr ? copyProps.test(attr) : prop ? copyProps.test(prop) : direct || (file.endsWith('tsx') && !ts.isImportDeclaration(p) && !ts.isLiteralTypeNode(p) && !ts.isElementAccessExpression(p) && /\s/.test(n.text))
        if (eligible) add(n, n.text, 'string')
      }
    }
    ts.forEachChild(n, visit)
  }
  visit(sf)
  return found
}
