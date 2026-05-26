import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy | AxilDB',
}

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <p className="policy-page-eyebrow text-sm font-semibold uppercase tracking-[0.2em]">AxilDB policies</p>
      <h1 className="policy-page-title mt-2 font-serif text-4xl font-semibold sm:text-5xl">Privacy Policy</h1>
      <p className="policy-page-intro mt-3 max-w-3xl text-lg">
        Last updated May 26, 2026. This page describes how this AxilDB installation handles account,
        collection, plant, photo, email, AI, and operational data. It is written in plain English and has
        not been reviewed as legal advice.
      </p>

      <section className="prose-policy policy-card mt-8 rounded-lg p-5 sm:p-7">
        <h2>Who Runs This Service</h2>
        <p>
          AxilDB is self-hosted software. The operator of this installation controls the server, database,
          file storage, SMTP email configuration, AI configuration, backups, and administrator access. If you
          have privacy questions, contact the server administrator for this installation.
        </p>

        <h2>Information Stored In AxilDB</h2>
        <p>AxilDB stores information needed to run a botanical accession and collection management system.</p>
        <ul>
          <li>
            <strong>Account and security data:</strong> email address, password hash, global role, collection
            memberships, session state, email verification, password reset and magic-login tokens, two-factor
            authentication settings, recovery code hashes, and user preferences.
          </li>
          <li>
            <strong>Collection and plant records:</strong> collection names, slugs, visibility, descriptions,
            plant definitions, author citations, aliases, source links, governing bodies, generated plant IDs,
            plant specimens, locations, acquisition details, sources, distributors, stock labels, propagations,
            blooms, sport observations, notes, labels, transfers, and archive history.
          </li>
          <li>
            <strong>Care and husbandry data:</strong> husbandry guides, local care overrides, care events,
            plant conditions, care queue data, reminders, care sheets, sitter plans, and follow settings.
          </li>
          <li>
            <strong>Photos and uploads:</strong> specimen photos, type images, bloom photos, captions, source
            names, source URLs, resized image files, and crop/framing metadata.
          </li>
          <li>
            <strong>Operational data:</strong> audit log entries, sign-in events, administrative actions,
            email delivery attempts, AI usage records, server health data, backup metadata, and error details.
          </li>
        </ul>

        <h2>How Information Is Used</h2>
        <p>
          Data is used to provide the application: authentication, collection access, plant browsing, record
          editing, search, photo display, QR labels, reminders, follow notifications, transfer workflows,
          care sheets, sitter plans, audit logging, backups, and server administration.
        </p>

        <h2>Visibility And Sharing</h2>
        <p>
          Private collections are intended to be visible only to active members and server administrators.
          Public collections can be browsed without registration, but following records requires an active
          membership. Token links for care sheets and sitter plans expose only the selected records and tasks
          to anyone who has the link until the token expires or is revoked.
        </p>
        <p>
          Collection transfers, shared plant definitions, care sheets, sitter plans, and public collections can
          intentionally copy or expose selected plant information outside the original collection. Collection
          managers and server administrators should review these actions before approving them.
        </p>

        <h2>Cookies And Local Storage</h2>
        <p>
          AxilDB uses session and security cookies to keep users signed in and to protect authentication flows.
          The app may also use browser local storage for theme choice, sort and filter preferences, scroll
          restoration, dismissed interface state, and other usability settings. AxilDB does not use advertising
          cookies or third-party ad tracking.
        </p>

        <h2>Email</h2>
        <p>
          AxilDB can send transactional and reminder emails, including welcome messages, verification links,
          password resets, magic-login links, reminders, follow notifications, invitations, transfer alerts, and
          collection request notices. These emails are sent through the SMTP provider configured by the server
          operator, such as Amazon SES. The email provider may process delivery metadata needed to send and
          troubleshoot mail.
        </p>

        <h2>AI Disclosure</h2>
        <p>
          If AI features are enabled for a collection, AxilDB may send relevant plant context to the configured
          OpenAI API account. This can include genus, species, cultivar, aliases, source links, husbandry, recent
          care history, user prompts, and optional selected photos. AI responses may be stored as drafts,
          descriptions, husbandry content, or Green Thumb care notes.
        </p>
        <p>
          AI output is informational and can be wrong. It should not be treated as authoritative botanical,
          medical, veterinary, pesticide, toxicity, conservation, import/export, or legal advice.
        </p>

        <h2>Service Providers</h2>
        <p>
          Depending on how the installation is configured, data may be processed by the server host, database
          storage, file storage, SMTP email provider, backup storage, and OpenAI for AI features. The server
          operator is responsible for choosing and configuring these providers.
        </p>

        <h2>Access, Correction, And Deletion</h2>
        <p>
          Users can edit many of their own account settings and collection records when their role allows it.
          Collection managers can manage collection memberships and collection records. Server administrators can
          manage users, collections, backups, and server-level settings.
        </p>
        <p>
          To request account deletion, export, correction, or removal of personal data, contact the server
          administrator. Some information may remain in backups, audit logs, email delivery logs, or security
          records until those systems rotate or are manually cleaned up. Archived or transferred plant records may
          also retain historical references needed for collection integrity.
        </p>

        <h2>Security</h2>
        <p>
          AxilDB uses password hashing, session controls, email verification, two-factor authentication,
          single-use tokens, role-based access, audit logging, and collection scoping to protect data. No web
          application can guarantee perfect security, so users should use strong passwords and protect their
          two-factor authentication and recovery codes.
        </p>

        <h2>Changes</h2>
        <p>
          This policy may be updated as AxilDB changes. Continued use of the service after changes means the
          updated policy applies. You should also review the <Link href="/terms">Terms of Use</Link>.
        </p>
      </section>
    </main>
  )
}
