import {
  BadgeCheck,
  Flower2,
  GitBranch,
  Github,
  Heart,
  Leaf,
  LockKeyhole,
  QrCode,
  Search,
  ShieldCheck,
} from 'lucide-react'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'
const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/wetlabs-dev/AxilDB'
const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL || 'https://ko-fi.com/axildb'

const features = [
  ['Plant lineage', 'Trace parent plants, propagations, sport candidates, and stable cultivar lines without losing the story.', GitBranch],
  ['Taxonomy confidence', 'Record accepted names, provisional labels, acquisition names, aliases, sources, and uncertainty.', BadgeCheck],
  ['Bloom history', 'Log bloom starts, peaks, closures, flower counts, first blooms, notes, and photos over time.', Flower2],
  ['QR plant tags', 'Generate printable QR labels that link directly to each plant record in the app.', QrCode],
  ['Role-aware access', 'Let visitors browse, loggers add records, and admins edit, delete, manage users, and review audit logs.', LockKeyhole],
  ['Collection search', 'Search plants by IDs, cultivars, aliases, old taxonomy, common names, notes, and sources.', Search],
] as const

const workflow = [
  ['Define', 'Capture the accepted identity and any messy synonym or trade-name context.'],
  ['Grow', 'Track instances, locations, acquisition history, propagations, and plant status.'],
  ['Observe', 'Record blooms, photos, notes, sports, and lineage evidence as the collection changes.'],
  ['Share', 'Use QR tags and read-only browsing to make the collection easier to explore.'],
] as const

export default function SplashPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fffaf0] text-stone-900">
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#fffaf0]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-2">
            <Leaf className="h-7 w-7 text-[#2f6b45]" />
            <span className="font-serif text-2xl font-semibold">AxilDB</span>
          </a>
          <nav className="flex items-center gap-2 text-sm">
            <a className="hidden rounded-md px-3 py-2 text-stone-700 transition hover:bg-[#d6dfc9]/70 sm:inline-block" href={githubUrl}>
              GitHub
            </a>
            <a className="hidden rounded-md px-3 py-2 text-stone-700 transition hover:bg-[#d6dfc9]/70 sm:inline-block" href={donateUrl}>
              Donate
            </a>
            <a className="rounded-md bg-[#2f6b45] px-4 py-2 font-medium text-white shadow-sm transition hover:bg-[#255537]" href={appUrl}>
              Open App
            </a>
          </nav>
        </div>
      </header>

      <section className="border-b border-stone-200/80">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-md border border-[#8fa58f]/40 bg-white/60 px-3 py-1 text-sm font-medium text-[#2f6b45]">
              Plant Lineage and Collection Database
            </p>
            <h1 className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">A living database for plants with complicated names.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
              AxilDB tracks plant definitions, collection instances, propagations, blooms, taxonomy uncertainty,
              aliases, photos, QR tags, and audit history in one self-hosted app.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <a className="inline-flex items-center justify-center rounded-md bg-[#2f6b45] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#255537]" href={appUrl}>
                Open the app
              </a>
              <a className="inline-flex items-center justify-center gap-2 rounded-md border border-stone-300 bg-white/70 px-5 py-3 text-sm font-semibold text-stone-900 shadow-sm transition hover:bg-white" href={githubUrl}>
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white/60 p-4 shadow-[0_18px_60px_rgba(47,38,24,0.10)]">
            <div className="rounded-md border border-stone-200 bg-[#fffdf7] p-5">
              <div className="flex items-start justify-between gap-4 border-b border-stone-200 pb-4">
                <div>
                  <p className="text-sm text-stone-600">Accepted name</p>
                  <h2 className="mt-1 font-serif text-3xl">Dracaena trifasciata</h2>
                </div>
                <span className="rounded-md bg-[#d6dfc9] px-3 py-1 text-sm text-[#2f6b45]">probable</span>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                <p><span className="font-medium">Acquired as:</span> Sansevieria zeylanica</p>
                <p><span className="font-medium">Provisional taxon:</span> Dracaena zeylanica</p>
                <p><span className="font-medium">Aliases:</span> Snake Plant, Mother-in-law&apos;s Tongue, Sansevieria trifasciata</p>
                <p><span className="font-medium">Notes:</span> Awaiting morphological confirmation from bloom and leaf traits.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="mb-8 max-w-2xl">
          <h2 className="text-3xl">Built for real collection work</h2>
          <p className="mt-3 text-stone-700">The app is designed around the day-to-day messiness of horticultural records, not just a flat list of names.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {features.map(([title, text, Icon]) => (
            <article key={title} className="rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)]">
              <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-200/80 bg-white/45">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:px-8">
          <div>
            <h2 className="text-3xl">From label to lineage</h2>
            <p className="mt-3 text-stone-700">
              Keep the seller&apos;s label, your current interpretation, the evidence, and the propagation history together.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {workflow.map(([title, text], index) => (
              <div key={title} className="rounded-lg border border-stone-200 bg-[#fffaf0]/80 p-5">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-[#2f6b45] text-sm font-semibold text-white">{index + 1}</div>
                <h3 className="font-serif text-xl">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-lg border border-stone-200 bg-white/65 p-6 lg:col-span-2">
            <ShieldCheck className="mb-4 h-7 w-7 text-[#2f6b45]" />
            <h2 className="text-3xl">Self-hosted and branch-friendly</h2>
            <p className="mt-3 leading-7 text-stone-700">
              AxilDB is licensed under the GNU AGPLv3 so people can study, fork, and improve it while keeping network-hosted changes available to users.
              The AxilDB name and branding remain reserved for the official project.
            </p>
            <a className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#2f6b45] underline" href={githubUrl}>
              <Github className="h-4 w-4" />
              Read the source
            </a>
          </div>
          <div className="rounded-lg border border-[#c47a5a]/30 bg-[#fff7ed] p-6">
            <Heart className="mb-4 h-7 w-7 text-[#c47a5a]" />
            <h2 className="text-2xl">Support development</h2>
            <p className="mt-3 text-sm leading-6 text-stone-700">
              If AxilDB helps your collection, a Ko-fi contribution helps cover hosting, testing, and the next round of careful features.
            </p>
            <a className="mt-5 inline-flex rounded-md bg-[#c47a5a] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#a96343]" href={donateUrl}>
              Donate on Ko-fi
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-stone-200 px-5 py-8 text-sm text-stone-600 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p>AxilDB — Plant Lineage Tracker</p>
          <div className="flex gap-4">
            <a className="underline" href={appUrl}>App</a>
            <a className="underline" href={githubUrl}>GitHub</a>
            <a className="underline" href={donateUrl}>Ko-fi</a>
          </div>
        </div>
      </footer>
    </main>
  )
}
