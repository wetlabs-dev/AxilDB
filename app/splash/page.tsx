import {
  BadgeCheck,
  Bell,
  Camera,
  GitBranch,
  Github,
  Heart,
  HeartPulse,
  IdCard,
  ListChecks,
  MapPinned,
  PanelsTopLeft,
  ScanQrCode,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sprout,
  Users,
} from 'lucide-react'
import { ForceLightTheme } from '@/components/ForceLightTheme'

const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'
const githubUrl = process.env.NEXT_PUBLIC_GITHUB_URL || 'https://github.com/wetlabs-dev/AxilDB'
const donateUrl = process.env.NEXT_PUBLIC_DONATE_URL || 'https://ko-fi.com/wetlabs'

const featureCards = [
  {
    group: 'Collection structure',
    title: 'Multi-collection workspaces',
    text: 'Run separate personal, greenhouse, club, or research collections with scoped members, privacy controls, roles, audit history, and collection-specific settings.',
    Icon: Users,
  },
  {
    group: 'Collection structure',
    title: 'Validated plant definitions',
    text: 'Reuse reviewed site-level definitions with taxonomy, aliases, type images, and husbandry while keeping local overrides for collection-specific care.',
    Icon: BadgeCheck,
  },
  {
    group: 'Collection structure',
    title: 'Locations and shelf QR labels',
    text: 'Model rooms, cabinets, shelves, benches, and nested locations with stable codes, move history, location filters, and scannable QR labels.',
    Icon: MapPinned,
  },
  {
    group: 'Collection structure',
    title: 'Collection Exhibits',
    text: 'Create curated read-only exhibit pages from selected specimens, grouped by plant definition, with configurable details, update subscriptions, and polished PDF export.',
    Icon: PanelsTopLeft,
  },
  {
    group: 'Daily plant work',
    title: 'Smart Care Queue',
    text: 'Prioritize watering, propagation checks, open issues, pest checks, bloom follow-ups, reminders, and weekly greenhouse work from one care engine.',
    Icon: Sprout,
  },
  {
    group: 'Daily plant work',
    title: 'Bulk care by location',
    text: 'Record watering, pest checks, repotting, health reviews, and other care events for selected plants in a location, with direct or nested scope.',
    Icon: ListChecks,
  },
  {
    group: 'Daily plant work',
    title: 'Quarantine workflow',
    text: 'Track new or risky plants with quarantine locations, risk levels, checklists, target release dates, care queue reviews, and release history.',
    Icon: ShieldAlert,
  },
  {
    group: 'Daily plant work',
    title: 'Plant Health Timeline',
    text: 'Scan the life history of each specimen across care, blooms, issues, photos, moves, notes, reminders, propagation, archive, and lineage events.',
    Icon: HeartPulse,
  },
  {
    group: 'Records and intelligence',
    title: 'Photo-backed records',
    text: 'Attach specimen, definition, bloom, and note photos with galleries, cover images, captions, plant-content checks, and moderation review states.',
    Icon: Camera,
  },
  {
    group: 'Records and intelligence',
    title: 'ID My Plant history',
    text: 'Use cautious AI identification from descriptions, known names, and optional images, then save results to personal and collection history or create a definition from a result.',
    Icon: IdCard,
  },
  {
    group: 'Records and intelligence',
    title: 'Review-first AI assists',
    text: 'Draft definitions, husbandry guides, aliases, descriptions, collection briefings, and Green Thumb care notes without saving generated text automatically.',
    Icon: Sparkles,
  },
  {
    group: 'Sharing and continuity',
    title: 'Labels, care sheets, and sitter links',
    text: 'Generate plant and location QR labels, printable care sheets, weekly checklists, and limited plant-sitter links that stay tied to the living record.',
    Icon: ScanQrCode,
  },
  {
    group: 'Sharing and continuity',
    title: 'Notifications that respect context',
    text: 'Send opt-out-aware email and Web Push reminders, care digests, exhibit updates, follows, sunshine notices, collection update digests, and server health alerts.',
    Icon: Bell,
  },
  {
    group: 'Sharing and continuity',
    title: 'Lineage, transfers, and shared definitions',
    text: 'Connect propagations, sport candidates, shared definitions, specimen transfers, and follower-visible updates without exposing private collection data.',
    Icon: GitBranch,
  },
  {
    group: 'Operations',
    title: 'Self-hosted server tools',
    text: 'Use 2FA, role boundaries, backups, storage estimates, image moderation queues, server incidents, health checks, and maintenance controls.',
    Icon: ShieldCheck,
  },
] as const

const featureHighlights = [
  {
    title: 'Archive-quality photos',
    text: 'Keep specimen, bloom, and definition images close to the records they explain.',
    image: '/splash-photos.png',
    imageClassName: 'max-h-72 w-full object-contain mix-blend-multiply',
    Icon: Camera,
  },
  {
    title: 'Lineage at a glance',
    text: 'See propagation relationships and candidate sport lines without losing parent context.',
    image: '/splash-lineage-diagram.png',
    imageClassName: 'max-h-72 w-full object-contain mix-blend-multiply',
    Icon: GitBranch,
  },
  {
    title: 'Labels that travel',
    text: 'Print plant and location labels that lead back to the right record or shelf.',
    image: '/splash-plant-label.png',
    imageClassName: 'max-h-56 w-full object-contain',
    Icon: ScanQrCode,
  },
] as const

const workflow = [
  ['Create the collection', 'Start a scoped workspace, invite the right roles, and decide what stays private, public, or exhibit-ready.'],
  ['Define the plant', 'Use local or validated definitions, add aliases and references, and draft taxonomy or husbandry with review-first AI tools.'],
  ['Place the specimen', 'Accession the plant, assign a structured location, print labels, and keep acquisition, source, and photo context together.'],
  ['Care by queue or shelf', 'Work from due care, bulk-log tasks by location, manage quarantine, and keep plant-sitter or weekly checklists aligned.'],
  ['Read the life story', 'Use timelines, blooms, photos, notes, moves, conditions, propagation, and lineage records to understand what happened and why.'],
  ['Share carefully', 'Publish exhibits, generate PDFs, send update subscriptions, transfer specimens, or share care links without exposing private data.'],
] as const

export default function SplashPage() {
  return (
    <>
      <ForceLightTheme />
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
            <h1 className="text-5xl leading-[1.02] sm:text-6xl lg:text-7xl">A living database for collections with complicated plants.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-stone-700">
              AxilDB is a self-hosted botanical accession system for serious personal and small-collection work:
              structured locations, validated definitions, specimen history, care queues, exhibits, QR labels,
              cautious AI tools, notifications, and audit-friendly collaboration in one calm app.
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
        <div className="mb-8 max-w-3xl">
          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#2f6b45]">Built for living collections</p>
          <h2 className="text-3xl">Real accession work, without the recordkeeping sprawl</h2>
          <p className="mt-3 text-stone-700">
            AxilDB is designed around the steady work of identifying, placing, caring for, reviewing, and sharing living plants.
            The public page stays concise; the app keeps the detail where it belongs.
          </p>
        </div>

        <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
          {featureCards.map(({ group, title, text, Icon }) => (
            <article key={title} className="flex min-h-[228px] flex-col rounded-lg border border-stone-200 bg-white/65 p-5 shadow-[0_8px_30px_rgba(47,38,24,0.06)]">
              <div className="mb-5 flex items-center justify-between gap-3">
                <Icon className="h-6 w-6 shrink-0 text-[#2f6b45]" />
                <span className="rounded-md border border-[#d6dfc9] bg-[#fffdf7] px-2.5 py-1 text-xs font-medium text-[#2f6b45]">{group}</span>
              </div>
              <h3 className="font-serif text-xl leading-7">{title}</h3>
              <p className="mt-3 text-sm leading-6 text-stone-700">{text}</p>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {featureHighlights.map(({ title, text, image, imageClassName, Icon }) => (
            <article key={title} className="overflow-hidden rounded-lg border border-stone-200 bg-white/70 shadow-[0_8px_30px_rgba(47,38,24,0.06)]">
              <div className="flex h-64 items-center justify-center bg-[#fffdf7] p-5">
                <img src={image} alt="" className={imageClassName} />
              </div>
              <div className="p-5">
                <Icon className="mb-4 h-6 w-6 text-[#2f6b45]" />
                <h3 className="font-serif text-xl">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-stone-700">{text}</p>
              </div>
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
              <p>AxilDB - Botanical Accession System</p>
              <p className="text-xs">Made with love by WetLabs</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <a className="underline" href={appUrl}>App</a>
            <a className="underline" href={githubUrl}>GitHub</a>
            <a className="underline" href={donateUrl}>Ko-fi</a>
            <a className="underline" href="/privacy">Privacy</a>
            <a className="underline" href="/terms">Terms</a>
          </div>
        </div>
      </footer>
      </main>
    </>
  )
}
