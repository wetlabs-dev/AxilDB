export type ManualSection = {
  id: string
  title: string
  route?: string
  screenshot?: string
  purpose: string
  howTo: string[]
  notes?: string[]
  warnings?: string[]
}

export const manualSections: ManualSection[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    route: '/',
    screenshot: 'dashboard.png',
    purpose: 'AxilDB organizes botanical accession records into collections. Each collection keeps its own plant definitions, plant specimens, photos, propagation history, bloom records, husbandry, follows, reminders, transfers, and administrative history.',
    howTo: [
      'Sign in or create a viewer account from the app home page.',
      'Choose a collection from the collection switcher in the sidebar or mobile menu.',
      'Use Dashboard for recent activity, high-level counts, and quick links into the collection.',
      'Use Search when you know a plant ID, name, cultivar, alias, location, source, note, or other record text.',
    ],
    notes: [
      'Public collections can be browsed without signing in, but following records requires collection membership.',
      'Private collections require an active membership before records are visible.',
    ],
  },
  {
    id: 'accounts-security',
    title: 'Accounts, Email, and Security',
    route: '/account',
    screenshot: 'account.png',
    purpose: 'Account settings manage your email address, password, email verification, two-factor authentication, recovery codes, and email preferences.',
    howTo: [
      'Open Account from the sidebar footer.',
      'Update your email or password from the Account page.',
      'Use Resend verification when your email status is not verified.',
      'Open Account Security to set up authenticator-app verification codes and recovery codes.',
      'Use Forgot password or Magic login from the login page when needed.',
    ],
    warnings: [
      'Server admins, collection managers, and collection gardeners must complete two-factor authentication before using privileged tools.',
      'Store recovery codes somewhere safe. They are intended for account recovery when your authenticator is unavailable.',
    ],
  },
  {
    id: 'collections',
    title: 'Collections and Membership',
    route: '/collections',
    screenshot: 'collections.png',
    purpose: 'Collections are tenant-like workspaces. Records in one collection are isolated from records, locations, suggestions, photos, search results, and usage stats in other collections.',
    howTo: [
      'Use Manage collections from the collection switcher to view collections available to you.',
      'Request access to a public or known collection when you need membership.',
      'Request a new collection if you need a workspace of your own. A server admin reviews and approves collection requests.',
      'Collection managers can edit collection settings, approve members, and invite users by email.',
    ],
    notes: [
      'Collection roles are Viewer, Logger, Gardener, and Manager.',
      'Server admins manage sitewide settings, collections, users, backups, and health checks from Server Management.',
    ],
  },
  {
    id: 'plant-definitions',
    title: 'Plant Definitions',
    route: '/plants',
    screenshot: 'plant-definitions.png',
    purpose: 'Plant definitions describe the taxon, cultivar, label interpretation, aliases, reference links, type image, and definition-level husbandry for a kind of plant.',
    howTo: [
      'Open Plant Definitions from the sidebar.',
      'Use Add plant definition to create a new definition.',
      'Enter genus, species, cultivar, author citation, governing body, reference URLs, aliases, description, and notes.',
      'Use AI draft for a short botanical description or Magic fill to draft taxonomy metadata and aliases when AI is enabled for the collection.',
      'Upload a plant definition type image when the representative image comes from a reference source rather than your collection.',
      'Use Copy on an existing definition to start a similar definition without copying cultivar-specific fields or images.',
    ],
    notes: [
      'Species values are normalized to lowercase on submission.',
      'Author Citation records the formal botanical author citation, such as “(L.f.) R.Br.”',
      'Aliases are useful for old taxonomy, trade names, common names, shorthand, and misapplied labels.',
    ],
    warnings: [
      'AI output is a draft. Review reference URLs, aliases, conservation notes, and toxicity before relying on them.',
    ],
  },
  {
    id: 'plant-instances',
    title: 'Plant Instances',
    route: '/instances',
    screenshot: 'plant-instances.png',
    purpose: 'Plant instances are the actual specimens in a collection. Each instance receives a generated plant ID, status, location, acquisition details, source, notes, photos, bloom records, propagation relationships, sport review, reminders, and follows.',
    howTo: [
      'Open Plant Instances and choose Add plant instance.',
      'Select a plant definition and enter specimen details such as type, acquisition date, location, source, distributor, stock label, and notes.',
      'Open a specimen detail page to review identity, photos, husbandry summary, sport status, follows, children, notes, reminders, bloom tracker, and archive actions.',
      'Use the generated QR label to open the specimen record quickly from a printed label.',
    ],
    notes: [
      'Plant IDs are generated from the plant definition and relevant date context, then made unique inside the collection.',
      'Locations and similar text fields autosuggest values already used in the current collection.',
    ],
  },
  {
    id: 'photos-gallery',
    title: 'Photos and Gallery',
    route: '/gallery',
    screenshot: 'gallery.png',
    purpose: 'Photos provide visual evidence for specimens, blooms, and plant definitions. The gallery provides a collection-wide browser with full-screen viewing.',
    howTo: [
      'Upload specimen photos from a plant instance detail page.',
      'Set a specimen cover photo to control list/card presentation.',
      'Set a specimen photo as type photo when it should represent the plant definition.',
      'Upload bloom photos from bloom records.',
      'Use Gallery to browse all collection images and open larger versions.',
    ],
    notes: [
      'Uploads are resized to a maximum dimension to reduce storage use while preserving useful detail.',
      'Source and source URL fields help document reference images used for plant definition type images.',
    ],
    warnings: [
      'Only use images you have rights to use. Record image source details when importing reference images.',
    ],
  },
  {
    id: 'husbandry',
    title: 'Plant Husbandry',
    route: '/plants',
    screenshot: 'husbandry.png',
    purpose: 'Husbandry guides capture care guidance for plant definitions and allow specimen-specific local overrides where one plant needs special treatment.',
    howTo: [
      'Open a plant definition and use the Husbandry panel to create, link, fork, edit, or delete a guide.',
      'Use Magic Fill husbandry to draft the structured care guide with one AI call when AI is enabled.',
      'Edit individual husbandry fields inline with the edit controls next to each field.',
      'Link a definition to another definition’s guide when care is identical, or make a local copy when it diverges.',
      'On a specimen detail page, use override controls next to inherited husbandry values for local adjustments.',
    ],
    notes: [
      'Quick summary fields are standardized for consistent water, light, and toxicity badges.',
      'Full guides are grouped by care sections so future care sheets can include only selected topics.',
    ],
    warnings: [
      'Husbandry is collection-local in this version. Linked guides cannot cross collections.',
    ],
  },
  {
    id: 'propagation-lineage',
    title: 'Propagations and Lineage Graphs',
    route: '/propagations',
    screenshot: 'propagations.png',
    purpose: 'Propagation records connect parent specimens to child specimens and preserve the context for divisions, cuttings, leaves, rhizomes, sport lines, and other propagation methods.',
    howTo: [
      'Open Propagations and use Add propagation to record a propagation event.',
      'Select parent and child specimens, propagation method, date, status, and notes.',
      'Use Lineage Graphs to search for a specimen and view its connected tree.',
      'Select nodes in the graph to change focus and follow ancestry and descendants.',
    ],
    notes: [
      'Lineage graph connectors use different styles for propagation methods where possible.',
      'Transferred specimens preserve relevant transfer notes, but cross-collection lineage links are not created.',
    ],
  },
  {
    id: 'blooms',
    title: 'Bloom Tracker',
    route: '/blooms',
    screenshot: 'blooms.png',
    purpose: 'Bloom tracking records bloom starts, first bloom flags, peak dates, flower counts, closure dates, notes, and bloom photos.',
    howTo: [
      'Open a plant instance and use Bloom tracker to open a new bloom event.',
      'Later, update the bloom record with peak date, flower count, closure date, notes, and photos.',
      'Open Bloom Tracker from the sidebar to browse bloom events as cards.',
    ],
    notes: [
      'Bloom cards use selected bloom/specimen photos when available and placeholders otherwise.',
      'If a collection has no blooms yet, the Bloom Tracker shows an empty-state prompt instead of a blank page.',
    ],
  },
  {
    id: 'sports',
    title: 'Sport Review',
    route: '/sports',
    screenshot: 'sports.png',
    purpose: 'Sport review tracks suspected mutations, candidate sport lines, reverted specimens, and stable sport evidence through propagation generations.',
    howTo: [
      'Open a plant instance and use Sport / mutation when a plant appears different from its expected cultivar or species.',
      'Mark suspected sports with observation notes.',
      'Review candidate and suspected sports from Sport Review.',
      'Mark descendants as propagated true, reverted, or stable as evidence accumulates.',
    ],
    notes: [
      'Reverted status cancels a sport line for descendants that return to the original cultivar behavior.',
      'Stable sport workflows can create a new cultivar definition when evidence supports it.',
    ],
  },
  {
    id: 'search-follows-reminders',
    title: 'Search, Follows, and Reminders',
    route: '/following',
    screenshot: 'following.png',
    purpose: 'Search finds collection records, follows send email updates for records you care about, and reminders create scheduled plant check-ins or other tasks.',
    howTo: [
      'Use Search near the top of the sidebar to search plant IDs, names, aliases, locations, notes, sources, and husbandry text.',
      'Use Follow buttons on plant definitions, specimens, and lineage-related records to subscribe to updates.',
      'Create reminders from specimen pages or the Reminders section.',
      'Manage followed records from Following and reminder history from Reminders.',
    ],
    notes: [
      'Following requires active membership in the collection, even for public collections.',
      'Email links route back into the relevant collection and record after login.',
    ],
  },
  {
    id: 'labels',
    title: 'QR Labels and Bulk Tags',
    route: '/labels',
    screenshot: 'labels.png',
    purpose: 'Labels generate printable QR codes and plant IDs for specimen tags.',
    howTo: [
      'Open Bulk Tags to choose specimens or generate labels for active plants.',
      'Print labels on 2.25 × 1.25 inch label stock.',
      'Scan a label QR code to open the specimen detail page.',
    ],
    notes: [
      'Labels show collection name, plant name, QR code, and plant ID.',
      'Private collection labels require sign-in before showing the specimen record.',
    ],
  },
  {
    id: 'transfers',
    title: 'Collection Transfers and Definition Sharing',
    route: '/transfers',
    screenshot: 'transfers.png',
    purpose: 'Transfers let connected collections share plant definitions and queue specimen transfers while preserving privacy boundaries.',
    howTo: [
      'Collection managers request a transfer connection by entering another collection slug.',
      'The target collection manager can allow, ignore, block, unblock, or remove the connection.',
      'Use Connect back to make a reciprocal connection when another collection has already connected to yours.',
      'Once a bidirectional connection exists, browse connected definitions and copy them into your collection.',
      'Gardeners and managers can request specimen transfers through active connections.',
      'Receivers review a summary, then accept or decline the transfer.',
    ],
    notes: [
      'Specimen transfers copy the package into the receiving collection and archive the source specimen after acceptance.',
      'Pre-acceptance previews show summary/count information rather than full private data.',
    ],
    warnings: [
      'Removing a transfer connection also removes pending transfer and definition-share requests attached to that connection.',
    ],
  },
  {
    id: 'collection-tools',
    title: 'Collection Tools, Governing Bodies, and Audit Log',
    route: '/admin-tools',
    screenshot: 'collection-tools.png',
    purpose: 'Collection tools help gardeners and managers maintain controlled vocabulary, demo data, governing bodies, audit visibility, and record cleanup inside one collection.',
    howTo: [
      'Use Governing Bodies to manage registration authorities and similar organizations.',
      'Use Collection Tools to seed demo data, run collection maintenance helpers, and review collection-only utilities.',
      'Use Audit Log to review changes made inside the current collection.',
    ],
    warnings: [
      'Demo data tools should be used intentionally. They create realistic sample records in the current collection.',
    ],
  },
  {
    id: 'server-management',
    title: 'Server Management',
    route: '/server',
    screenshot: 'server-management.png',
    purpose: 'Server Management is restricted to server admins and covers sitewide users, collection creation and archival, AI availability, collection requests, backups, and health metrics.',
    howTo: [
      'Open Server Management from the admin nav when signed in as a server admin.',
      'Review server health, collection usage, AI usage, pending collection requests, and backup status.',
      'Use Site Users to manage global roles and collection memberships.',
      'Use Server Collections to create, archive, restore, or permanently delete collections.',
      'Use backup controls to initiate sitewide backups.',
    ],
    notes: [
      'Collection managers do not see the full site user list.',
      'AI availability can be toggled per collection by server admins, and collection managers can request AI access.',
    ],
    warnings: [
      'Permanent collection deletion cascades collection-owned records. Archive first and verify backups before deleting.',
    ],
  },
]

export const manualScreenshotTargets = manualSections
  .filter((section) => section.route && section.screenshot)
  .map((section) => ({
    id: section.id,
    title: section.title,
    route: section.route!,
    screenshot: section.screenshot!,
  }))

