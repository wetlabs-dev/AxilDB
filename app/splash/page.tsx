import {
  BadgeCheck,
  Camera,
  ClipboardCheck,
  Flower2,
  GitBranch,
  Github,
  Heart,
  Search,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
} from 'lucide-react'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'
const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/wetlabs-dev/AxilDB'
const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL || 'https://ko-fi.com/wetlabs'

const features = [
  ['Multi-collection workspaces', 'Keep accession records separated by collection, with public or private visibility and collection-scoped membership.', Users],
  ['Accession and taxonomy records', 'Trace living specimens, generated plant IDs, accepted names, author citations, aliases, source details, and confidence levels without losing the story.', BadgeCheck],
  ['Structured husbandry guides', 'Keep water, light, toxicity, soil, pest, propagation, bloom, and conservation guidance close to each definition and specimen.', Sprout],
  ['AI-assisted records', 'Draft concise descriptions, taxonomy metadata, aliases, reference links, and structured husbandry guides with review-first AI tools.', Sparkles],
  ['Care sheets and sitter plans', 'Generate printable care sheets, weekly greenhouse checklists, and limited plant-sitter links from husbandry and care queue data.', ClipboardCheck],
  ['Transfers and shared definitions', 'Connect collections, share plant definitions, and queue specimen transfers while keeping private data behind review gates.', GitBranch],
  ['Secure roles and server tools', 'Use viewer, logger, gardener, manager, and server-admin boundaries with 2FA, backups, audit history, and health checks.', ShieldCheck],
  ['Useful odds and ends', 'Search, follows, reminder emails, activity timelines, gallery browsing, AI access controls, documentation, and QR labels all stay close at hand.', Search],
] as const

const workflow = [
  ['Create a collection', 'Start with a private workspace, invite members when ready, or make a public collection browseable without exposing other data.'],
  ['Define the plant', 'Capture the accepted identity, aliases, reference links, registration context, and confidence level, with optional AI assistance.'],
  ['Grow the accession', 'Track specimens, locations, acquisition history, generated plant IDs, photos, husbandry, and propagation batches.'],
  ['Care and observe', 'Use the Care Queue, notes, blooms, conditions, reminders, Green Thumb notes, and weekly checklists to keep attention where it matters.'],
  ['Resolve and share', 'Confirm sport traits, promote stable lines, share definitions, transfer specimens, generate care sheets, or create a sitter plan.'],
  ['Keep tending', 'Use the timeline, care history, reminders, photos, and documentation to build steady habits around plants that are quietly doing well.'],
] as const

export default function SplashPage() {
  return (
    <main
      className="min-h-screen overflow-hidden bg-[#fffaf0] bg-cover bg-top text-stone-900"
      style={{ backgroundImage: "linear-gradient(rgba(255,250,240,.88), rgba(255,250,240,.94)), url('/splash-bg-wash.png')" }}
    >
      <header className="sticky top-0 z-30 border-b border-stone-200/70 bg-[#fffaf0]/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <img src="/axildb-logo.png" alt="" className="h-10 w-10 shrink-0 object-contain" />
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
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:px-8 lg:py-24">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-md border border-[#8fa58f]/40 bg-white/60 px-3 py-1 text-sm font-medium text-[#2f6b45]">
              Botanical Accession System
            </p>
            <h1 className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">A living database for plants with complicated names.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
              AxilDB tracks collection workspaces, plant definitions, accessioned specimens, propagations, blooms,
              taxonomy uncertainty, aliases, generated plant IDs, photos, QR tags, sport stability, husbandry,
              care queues, care sheets, sitter plans, reminders, follower notifications, transfers, and audit history in one self-hosted app.
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

          <div className="relative grid gap-4 lg:min-h-[430px]">
            <img
              src="/splash-hero-botanical-cluster.png"
              alt=""
              className="mx-auto w-full max-w-[520px] object-contain drop-shadow-[0_18px_36px_rgba(47,38,24,0.13)] sm:max-w-[600px] lg:absolute lg:inset-x-0 lg:top-0 lg:max-w-[680px]"
            />
            <div className="mx-auto w-full max-w-md rounded-lg border border-stone-200 bg-white/80 p-4 shadow-[0_18px_60px_rgba(47,38,24,0.14)] backdrop-blur lg:absolute lg:bottom-0 lg:left-0 lg:right-0">
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
          <p className="mt-3 text-stone-700">The app is designed around the day-to-day messiness of horticultural records, care, collaboration, and long-lived accession history.</p>
        </div>
        <div className="grid grid-flow-dense gap-4 md:grid-cols-2 xl:grid-cols-6">
          {features.slice(0, 3).map(([title, text, Icon]) => (
            <article key={title} className="rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)] xl:col-span-2">
              <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)] md:col-span-2 xl:col-span-4">
            <div className="grid h-full min-h-[260px] gap-4 md:grid-cols-[1fr_1.1fr]">
              <div className="flex items-center justify-center bg-[#fffdf7] p-4">
                <img src="/splash-photos.png" alt="" className="max-h-72 w-full object-contain mix-blend-multiply" />
              </div>
              <div className="flex flex-col justify-center p-5">
                <Camera className="mb-4 h-6 w-6 text-[#2f6b45]" />
                <h3 className="font-serif text-xl">Photo-backed records</h3>
                <p className="mt-2 text-sm leading-6 text-stone-700">Choose specimen cover photos, type images for definitions, and browse the collection gallery in a full-screen viewer.</p>
              </div>
            </div>
          </article>
          {features.slice(3, 4).map(([title, text, Icon]) => (
            <article key={title} className="rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)] xl:col-span-2">
              <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
          <article className="rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)] xl:col-span-2">
            <ClipboardCheck className="mb-4 h-6 w-6 text-[#2f6b45]" />
            <h3 className="font-serif text-xl">Smart Care Queue</h3>
            <p className="mt-2 text-sm leading-6 text-stone-700">Turn husbandry, watering history, propagation stage, open conditions, blooms, and manual reminders into a prioritized daily worklist.</p>
          </article>
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)] md:col-span-2 xl:col-span-4">
            <div className="grid h-full min-h-[260px] gap-4 md:grid-cols-[1.1fr_1fr]">
              <div className="flex flex-col justify-center p-5">
                <Flower2 className="mb-4 h-6 w-6 text-[#2f6b45]" />
                <h3 className="font-serif text-xl">Bloom history without guesswork</h3>
                <p className="mt-2 text-sm leading-6 text-stone-700">Log bloom starts, peaks, closures, flower counts, first blooms, notes, photos, and reminders as each bloom moves through its cycle.</p>
              </div>
              <div className="flex items-center justify-center bg-[#fffdf7]">
                <img src="/splash-bloom.png" alt="" className="h-full max-h-80 w-full object-cover object-center mix-blend-multiply" />
              </div>
            </div>
          </article>
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)] md:col-span-2 xl:col-span-4">
            <div className="grid h-full min-h-[280px] gap-4 md:grid-cols-[1fr_1fr]">
              <div className="flex items-center justify-center bg-[#fffdf7]">
                <img src="/splash-green-thumb.png" alt="" className="h-full max-h-96 w-full object-cover object-center" />
              </div>
              <div className="flex flex-col justify-center p-5">
                <Sprout className="mb-4 h-6 w-6 text-[#2f6b45]" />
                <h3 className="font-serif text-xl">Green Thumb care assist</h3>
                <p className="mt-2 text-sm leading-6 text-stone-700">
                  Ask one focused care question per specimen per day. AxilDB includes plant identity, husbandry, recent care history, and optional photo context, then saves the concise answer as a care note.
                </p>
              </div>
            </div>
          </article>
          {features.slice(4, 5).map(([title, text, Icon]) => (
            <article key={title} className="rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)] xl:col-span-2">
              <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)] md:col-span-2 xl:col-span-3">
            <div className="flex h-56 items-center justify-center bg-[#fffdf7] p-4">
              <img src="/splash-plant-label.png" alt="" className="max-h-full w-full object-contain" />
            </div>
            <div className="p-5">
              <h3 className="font-serif text-xl">Readable plant tags and QR labels</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">Connect physical labels, generated plant IDs, and scannable QR codes back to the living record.</p>
            </div>
          </article>
          <article className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)] md:col-span-2 xl:col-span-3">
            <div className="grid h-full min-h-56 items-center gap-4 bg-[#fffdf7] p-5">
              <div>
                <h3 className="font-serif text-2xl">Lineage you can see</h3>
                <p className="mt-3 text-sm leading-6 text-stone-700">Propagations inherit their parent context, while suspected sports become candidate lines only when observations justify it.</p>
              </div>
              <img src="/splash-lineage-diagram.png" alt="" className="max-h-72 w-full object-contain mix-blend-multiply" />
            </div>
          </article>
          {features.slice(5).map(([title, text, Icon], index) => (
            <article key={title} className={`rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)] ${index === 2 ? 'md:col-span-2 xl:col-span-4' : 'xl:col-span-2'}`}>
              <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
              <h3 className="font-serif text-xl">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-stone-200/80 bg-white/45">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
          <div className="mb-8 max-w-3xl">
            <h2 className="text-3xl">From label to accession</h2>
            <p className="mt-3 text-stone-700">
              Keep the seller&apos;s label, your current interpretation, photos, notes, reminders, sport evidence, and propagation history together.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
        <div className="grid overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_12px_40px_rgba(47,38,24,0.08)] lg:grid-cols-[.9fr_1.1fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#2f6b45]">A tiny botany wink</p>
            <h2 className="text-3xl">Named for the place new growth begins</h2>
            <p className="mt-4 leading-7 text-stone-700">
              An axil is the little junction where a leaf meets a stem, the tucked-away spot where buds, blooms, and branches often start.
              AxilDB borrows that idea for collection records: a small point of context where the next part of the plant&apos;s story can emerge.
            </p>
          </div>
          <div className="flex min-h-80 items-center justify-center bg-[#fffdf7] p-4">
            <img src="/splash-axil.png" alt="Botanical illustration pointing out the axil of a plant" className="max-h-[460px] w-full object-contain" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="overflow-hidden rounded-lg border border-stone-200 bg-white/65 lg:col-span-2">
            <div className="grid gap-4 lg:grid-cols-[.95fr_1.05fr]">
              <div className="p-6">
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
              <img src="/splash-audit.png" alt="" className="h-full min-h-72 w-full object-cover" />
            </div>
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
        <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md border border-stone-200 bg-white/70 p-1.5">
              <img src="/wetlabs-logo.png" alt="WetLabs" className="h-full w-full object-contain" />
            </div>
            <div>
              <p>AxilDB — Botanical Accession System</p>
              <p className="text-xs">Made with love by WetLabs</p>
            </div>
          </div>
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
