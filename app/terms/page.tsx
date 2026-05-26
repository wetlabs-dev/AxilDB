import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Use | AxilDB',
}

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="policy-page-eyebrow text-sm font-semibold uppercase tracking-[0.2em]">AxilDB policies</p>
      <h1 className="policy-page-title mt-2 font-serif text-4xl font-semibold sm:text-5xl">Terms of Use</h1>
      <p className="policy-page-intro mt-3 max-w-3xl text-lg">
        Last updated May 26, 2026. These terms describe acceptable use of this AxilDB installation. They are
        written for clarity and have not been reviewed as legal advice.
      </p>

      <section className="prose-policy policy-card mt-8 rounded-lg p-5 sm:p-7">
        <h2>Agreement</h2>
        <p>
          By using this AxilDB installation, you agree to use it responsibly and only for collection, plant,
          husbandry, accession, documentation, and related community workflows that the server operator permits.
          If you do not agree, do not use the service.
        </p>

        <h2>Accounts And Security</h2>
        <p>
          You are responsible for the activity that happens through your account. Use a valid email address,
          protect your password, keep two-factor authentication and recovery codes private, and do not share
          magic-login links, reset links, invitation links, or sitter links with people who should not have them.
        </p>

        <h2>Roles And Access</h2>
        <p>
          AxilDB uses collection roles such as viewer, logger, gardener, and manager, plus a server administrator
          role. Your abilities depend on your role and collection membership. Collection managers can manage their
          collection settings and members. Server administrators can manage users, collections, backups, and
          server-level features.
        </p>

        <h2>Your Content</h2>
        <p>
          You keep whatever rights you have in plant records, notes, photos, care sheets, and other content you
          add. By adding content, you give this AxilDB installation permission to store, process, resize, display,
          back up, and share that content as needed to run the service and honor the visibility, transfer, care
          sheet, sitter, and public collection settings you or your collection managers choose.
        </p>
        <p>
          Only upload content you have the right to use. Do not upload private information about other people
          unless it belongs in the collection record and you have permission to store it there.
        </p>

        <h2>Public Collections, Token Links, And Transfers</h2>
        <p>
          Public collections are browseable by visitors. Tokenized care sheets and sitter plans can be viewed by
          anyone with the link until the token expires or is revoked. Collection transfers and shared plant
          definitions can copy selected records into another collection after approval. Use these features
          carefully, especially for private collection data.
        </p>

        <h2>Plant Care, Taxonomy, And AI</h2>
        <p>
          AxilDB is a recordkeeping tool, not a professional care, medical, veterinary, legal, pesticide,
          conservation, or import/export advisory service. Plant descriptions, husbandry guides, Green Thumb
          notes, AI-generated drafts, toxicity labels, and conservation references are informational and may be
          incomplete or wrong. Verify important care, safety, pest treatment, and regulatory decisions with
          reliable sources.
        </p>

        <h2>Acceptable Use</h2>
        <p>You agree not to use AxilDB to:</p>
        <ul>
          <li>break the law or violate someone else&apos;s rights;</li>
          <li>attempt unauthorized access to accounts, collections, tokens, or server systems;</li>
          <li>upload malware or intentionally harmful content;</li>
          <li>spam, harass, or abuse other users;</li>
          <li>abuse email, AI, reminder, invitation, transfer, or token features;</li>
          <li>interfere with service availability or security.</li>
        </ul>

        <h2>Availability, Backups, And Data Loss</h2>
        <p>
          This is self-hosted software. The server operator is responsible for hosting, monitoring, backups,
          restores, SMTP, AI configuration, and upgrades. AxilDB may be unavailable, and data loss is possible if
          backups or server operations fail.
        </p>

        <h2>Software License And Branding</h2>
        <p>
          The AxilDB source code is released under the GNU AGPLv3 so users can study, fork, and improve the
          software under that license. The AxilDB name, WetLabs name, logos, and branding are reserved for the
          official project unless separately permitted.
        </p>

        <h2>Ending Access</h2>
        <p>
          Collection managers may remove collection memberships. Server administrators may disable or delete
          accounts, revoke tokens, archive or delete collections, and restrict access when needed for security,
          operations, abuse prevention, or policy enforcement.
        </p>

        <h2>Changes</h2>
        <p>
          These terms may be updated as AxilDB changes. Continued use of the service after changes means the
          updated terms apply. You should also review the <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </section>
    </main>
  )
}
