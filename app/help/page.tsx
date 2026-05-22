import fs from 'node:fs'
import path from 'node:path'
import Link from 'next/link'
import { Card, LinkButton } from '@/components/ui'
import { collectionPath, getCollectionContext } from '@/lib/collections'
import { manualSections } from '@/lib/user-manual'

const globalRoutes = new Set(['/account', '/collections', '/server'])

function sectionHref(route: string | undefined, slug: string) {
  if (!route) return '#'
  if (globalRoutes.has(route)) {
    return route === '/server' ? route : `${route}?collection=${encodeURIComponent(slug)}`
  }
  return collectionPath(slug, route)
}

function screenshotExists(file?: string) {
  if (!file) return false
  return fs.existsSync(path.join(process.cwd(), 'public', 'manual', 'screenshots', file))
}

export default async function HelpPage() {
  const context = await getCollectionContext()
  const slug = context.collection.slug

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-4xl font-semibold">AxilDB User Manual</h1>
          <p className="mt-2 max-w-3xl text-stone-700">
            A guided reference for collection setup, accession records, photos, husbandry, transfers, server
            management, and everyday recordkeeping.
          </p>
        </div>
        <LinkButton href="/manual/USER_MANUAL.md" className="bg-[#3a7350]">
          Markdown manual
        </LinkButton>
      </div>

      <Card className="bg-[#f4f8ed]/80">
        <h2 className="font-serif text-2xl font-semibold">Contents</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {manualSections.map((section) => (
            <Link
              key={section.id}
              href={`#${section.id}`}
              className="rounded-md border border-stone-200 bg-white/55 px-3 py-2 text-sm font-medium text-stone-800 transition hover:border-[#8fa58f] hover:bg-[#e8efdd]"
            >
              {section.title}
            </Link>
          ))}
        </div>
      </Card>

      <div className="space-y-5">
        {manualSections.map((section) => {
          const hasScreenshot = screenshotExists(section.screenshot)
          return (
            <Card key={section.id} id={section.id} className="scroll-mt-24">
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)]">
                <div className="space-y-4">
                  <div>
                    <h2 className="font-serif text-2xl font-semibold">{section.title}</h2>
                    <p className="mt-2 text-stone-700">{section.purpose}</p>
                  </div>

                  {section.route && (
                    <Link
                      href={sectionHref(section.route, slug)}
                      className="inline-flex rounded-full border border-[#b7c7a9] bg-[#f4f8ed] px-3 py-1 text-sm font-medium text-[#2f6b45] transition hover:bg-[#dfead2]"
                    >
                      Open this area
                    </Link>
                  )}

                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">How it is used</h3>
                    <ul className="mt-2 grid gap-2 text-sm text-stone-700">
                      {section.howTo.map((item) => (
                        <li key={item} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2f6b45]" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {section.notes?.length ? (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-stone-500">Notes</h3>
                      <ul className="mt-2 grid gap-2 text-sm text-stone-700">
                        {section.notes.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#8fa58f]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {section.warnings?.length ? (
                    <div className="rounded-lg border border-[#e0b5a5] bg-[#fff3eb] p-3">
                      <h3 className="text-sm font-bold uppercase tracking-[0.12em] text-[#9a3f35]">Warnings</h3>
                      <ul className="mt-2 grid gap-2 text-sm text-stone-700">
                        {section.warnings.map((item) => (
                          <li key={item} className="flex gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9a3f35]" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0">
                  {hasScreenshot ? (
                    <img
                      src={`/manual/screenshots/${section.screenshot}`}
                      alt={`${section.title} screenshot`}
                      className="w-full rounded-lg border border-stone-200 bg-white object-cover shadow-sm"
                    />
                  ) : (
                    <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed border-stone-300 bg-white/50 p-5 text-center text-sm text-stone-600">
                      Screenshot pending. Run <code className="mx-1 rounded bg-stone-100 px-1">npm run docs:screenshots</code>{' '}
                      against a running app to populate this image.
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
