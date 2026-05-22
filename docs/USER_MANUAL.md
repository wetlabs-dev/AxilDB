# AxilDB User Manual

This manual is generated from the same structured help content used by the in-app Help page. It covers AxilDB’s major workflows, permissions, warnings, and operational notes.

Screenshots are stored in `public/manual/screenshots`. Refresh them against a running app with:

```bash
AXILDB_DOCS_BASE_URL=https://app.axildb.com AXILDB_DOCS_COLLECTION_SLUG=axildb npm run docs:screenshots
```

## Contents

- [Getting Started](#getting-started)
- [Accounts, Email, and Security](#accounts-security)
- [Collections and Membership](#collections)
- [Plant Definitions](#plant-definitions)
- [Plant Instances](#plant-instances)
- [Photos and Gallery](#photos-gallery)
- [Plant Husbandry](#husbandry)
- [Propagations and Lineage Graphs](#propagation-lineage)
- [Bloom Tracker](#blooms)
- [Sport Review](#sports)
- [Search, Follows, and Reminders](#search-follows-reminders)
- [QR Labels and Bulk Tags](#labels)
- [Collection Transfers and Definition Sharing](#transfers)
- [Collection Tools, Governing Bodies, and Audit Log](#collection-tools)
- [Server Management](#server-management)

## Getting Started

AxilDB organizes botanical accession records into collections. Each collection keeps its own plant definitions, plant specimens, photos, propagation history, bloom records, husbandry, follows, reminders, transfers, and administrative history.

App route: `/`

![Getting Started](../public/manual/screenshots/dashboard.png)

### How It Is Used

- Sign in or create a viewer account from the app home page.
- Choose a collection from the collection switcher in the sidebar or mobile menu.
- Use Dashboard for recent activity, high-level counts, and quick links into the collection.
- Use Search when you know a plant ID, name, cultivar, alias, location, source, note, or other record text.

### Notes

- Public collections can be browsed without signing in, but following records requires collection membership.
- Private collections require an active membership before records are visible.

## Accounts, Email, and Security

Account settings manage your email address, password, email verification, two-factor authentication, recovery codes, and email preferences.

App route: `/account`

![Accounts, Email, and Security](../public/manual/screenshots/account.png)

### How It Is Used

- Open Account from the sidebar footer.
- Update your email or password from the Account page.
- Use Resend verification when your email status is not verified.
- Open Account Security to set up authenticator-app verification codes and recovery codes.
- Use Forgot password or Magic login from the login page when needed.

### Warnings

- Server admins, collection managers, and collection gardeners must complete two-factor authentication before using privileged tools.
- Store recovery codes somewhere safe. They are intended for account recovery when your authenticator is unavailable.

## Collections and Membership

Collections are tenant-like workspaces. Records in one collection are isolated from records, locations, suggestions, photos, search results, and usage stats in other collections.

App route: `/collections`

![Collections and Membership](../public/manual/screenshots/collections.png)

### How It Is Used

- Use Manage collections from the collection switcher to view collections available to you.
- Request access to a public or known collection when you need membership.
- Request a new collection if you need a workspace of your own. A server admin reviews and approves collection requests.
- Collection managers can edit collection settings, approve members, and invite users by email.

### Notes

- Collection roles are Viewer, Logger, Gardener, and Manager.
- Server admins manage sitewide settings, collections, users, backups, and health checks from Server Management.

## Plant Definitions

Plant definitions describe the taxon, cultivar, label interpretation, aliases, reference links, type image, and definition-level husbandry for a kind of plant.

App route: `/plants`

![Plant Definitions](../public/manual/screenshots/plant-definitions.png)

### How It Is Used

- Open Plant Definitions from the sidebar.
- Use Add plant definition to create a new definition.
- Enter genus, species, cultivar, author citation, governing body, reference URLs, aliases, description, and notes.
- Use AI draft for a short botanical description or Magic fill to draft taxonomy metadata and aliases when AI is enabled for the collection.
- Upload a plant definition type image when the representative image comes from a reference source rather than your collection.
- Use Copy on an existing definition to start a similar definition without copying cultivar-specific fields or images.

### Notes

- Species values are normalized to lowercase on submission.
- Author Citation records the formal botanical author citation, such as “(L.f.) R.Br.”
- Aliases are useful for old taxonomy, trade names, common names, shorthand, and misapplied labels.

### Warnings

- AI output is a draft. Review reference URLs, aliases, conservation notes, and toxicity before relying on them.

## Plant Instances

Plant instances are the actual specimens in a collection. Each instance receives a generated plant ID, status, location, acquisition details, source, notes, photos, bloom records, propagation relationships, sport review, reminders, and follows.

App route: `/instances`

![Plant Instances](../public/manual/screenshots/plant-instances.png)

### How It Is Used

- Open Plant Instances and choose Add plant instance.
- Select a plant definition and enter specimen details such as type, acquisition date, location, source, distributor, stock label, and notes.
- Open a specimen detail page to review identity, photos, husbandry summary, sport status, follows, children, notes, reminders, bloom tracker, and archive actions.
- Use the generated QR label to open the specimen record quickly from a printed label.

### Notes

- Plant IDs are generated from the plant definition and relevant date context, then made unique inside the collection.
- Locations and similar text fields autosuggest values already used in the current collection.

## Photos and Gallery

Photos provide visual evidence for specimens, blooms, and plant definitions. The gallery provides a collection-wide browser with full-screen viewing.

App route: `/gallery`

![Photos and Gallery](../public/manual/screenshots/gallery.png)

### How It Is Used

- Upload specimen photos from a plant instance detail page.
- Set a specimen cover photo to control list/card presentation.
- Set a specimen photo as type photo when it should represent the plant definition.
- Upload bloom photos from bloom records.
- Use Gallery to browse all collection images and open larger versions.

### Notes

- Uploads are resized to a maximum dimension to reduce storage use while preserving useful detail.
- Source and source URL fields help document reference images used for plant definition type images.

### Warnings

- Only use images you have rights to use. Record image source details when importing reference images.

## Plant Husbandry

Husbandry guides capture care guidance for plant definitions and allow specimen-specific local overrides where one plant needs special treatment.

App route: `/plants`

![Plant Husbandry](../public/manual/screenshots/husbandry.png)

### How It Is Used

- Open a plant definition and use the Husbandry panel to create, link, fork, edit, or delete a guide.
- Use Magic Fill husbandry to draft the structured care guide with one AI call when AI is enabled.
- Edit individual husbandry fields inline with the edit controls next to each field.
- Link a definition to another definition’s guide when care is identical, or make a local copy when it diverges.
- On a specimen detail page, use override controls next to inherited husbandry values for local adjustments.

### Notes

- Quick summary fields are standardized for consistent water, light, and toxicity badges.
- Full guides are grouped by care sections so future care sheets can include only selected topics.

### Warnings

- Husbandry is collection-local in this version. Linked guides cannot cross collections.

## Propagations and Lineage Graphs

Propagation records connect parent specimens to child specimens and preserve the context for divisions, cuttings, leaves, rhizomes, sport lines, and other propagation methods.

App route: `/propagations`

![Propagations and Lineage Graphs](../public/manual/screenshots/propagations.png)

### How It Is Used

- Open Propagations and use Add propagation to record a propagation event.
- Select parent and child specimens, propagation method, date, status, and notes.
- Use Lineage Graphs to search for a specimen and view its connected tree.
- Select nodes in the graph to change focus and follow ancestry and descendants.

### Notes

- Lineage graph connectors use different styles for propagation methods where possible.
- Transferred specimens preserve relevant transfer notes, but cross-collection lineage links are not created.

## Bloom Tracker

Bloom tracking records bloom starts, first bloom flags, peak dates, flower counts, closure dates, notes, and bloom photos.

App route: `/blooms`

![Bloom Tracker](../public/manual/screenshots/blooms.png)

### How It Is Used

- Open a plant instance and use Bloom tracker to open a new bloom event.
- Later, update the bloom record with peak date, flower count, closure date, notes, and photos.
- Open Bloom Tracker from the sidebar to browse bloom events as cards.

### Notes

- Bloom cards use selected bloom/specimen photos when available and placeholders otherwise.
- If a collection has no blooms yet, the Bloom Tracker shows an empty-state prompt instead of a blank page.

## Sport Review

Sport review tracks suspected mutations, candidate sport lines, reverted specimens, and stable sport evidence through propagation generations.

App route: `/sports`

![Sport Review](../public/manual/screenshots/sports.png)

### How It Is Used

- Open a plant instance and use Sport / mutation when a plant appears different from its expected cultivar or species.
- Mark suspected sports with observation notes.
- Review candidate and suspected sports from Sport Review.
- Mark descendants as propagated true, reverted, or stable as evidence accumulates.

### Notes

- Reverted status cancels a sport line for descendants that return to the original cultivar behavior.
- Stable sport workflows can create a new cultivar definition when evidence supports it.

## Search, Follows, and Reminders

Search finds collection records, follows send email updates for records you care about, and reminders create scheduled plant check-ins or other tasks.

App route: `/following`

![Search, Follows, and Reminders](../public/manual/screenshots/following.png)

### How It Is Used

- Use Search near the top of the sidebar to search plant IDs, names, aliases, locations, notes, sources, and husbandry text.
- Use Follow buttons on plant definitions, specimens, and lineage-related records to subscribe to updates.
- Create reminders from specimen pages or the Reminders section.
- Manage followed records from Following and reminder history from Reminders.

### Notes

- Following requires active membership in the collection, even for public collections.
- Email links route back into the relevant collection and record after login.

## QR Labels and Bulk Tags

Labels generate printable QR codes and plant IDs for specimen tags.

App route: `/labels`

![QR Labels and Bulk Tags](../public/manual/screenshots/labels.png)

### How It Is Used

- Open Bulk Tags to choose specimens or generate labels for active plants.
- Print labels on 2.25 × 1.25 inch label stock.
- Scan a label QR code to open the specimen detail page.

### Notes

- Labels show collection name, plant name, QR code, and plant ID.
- Private collection labels require sign-in before showing the specimen record.

## Collection Transfers and Definition Sharing

Transfers let connected collections share plant definitions and queue specimen transfers while preserving privacy boundaries.

App route: `/transfers`

![Collection Transfers and Definition Sharing](../public/manual/screenshots/transfers.png)

### How It Is Used

- Collection managers request a transfer connection by entering another collection slug.
- The target collection manager can allow, ignore, block, unblock, or remove the connection.
- Use Connect back to make a reciprocal connection when another collection has already connected to yours.
- Once a bidirectional connection exists, browse connected definitions and copy them into your collection.
- Gardeners and managers can request specimen transfers through active connections.
- Receivers review a summary, then accept or decline the transfer.

### Notes

- Specimen transfers copy the package into the receiving collection and archive the source specimen after acceptance.
- Pre-acceptance previews show summary/count information rather than full private data.

### Warnings

- Removing a transfer connection also removes pending transfer and definition-share requests attached to that connection.

## Collection Tools, Governing Bodies, and Audit Log

Collection tools help gardeners and managers maintain controlled vocabulary, demo data, governing bodies, audit visibility, and record cleanup inside one collection.

App route: `/admin-tools`

![Collection Tools, Governing Bodies, and Audit Log](../public/manual/screenshots/collection-tools.png)

### How It Is Used

- Use Governing Bodies to manage registration authorities and similar organizations.
- Use Collection Tools to seed demo data, run collection maintenance helpers, and review collection-only utilities.
- Use Audit Log to review changes made inside the current collection.

### Warnings

- Demo data tools should be used intentionally. They create realistic sample records in the current collection.

## Server Management

Server Management is restricted to server admins and covers sitewide users, collection creation and archival, AI availability, collection requests, backups, and health metrics.

App route: `/server`

![Server Management](../public/manual/screenshots/server-management.png)

### How It Is Used

- Open Server Management from the admin nav when signed in as a server admin.
- Review server health, collection usage, AI usage, pending collection requests, and backup status.
- Use Site Users to manage global roles and collection memberships.
- Use Server Collections to create, archive, restore, or permanently delete collections.
- Use backup controls to initiate sitewide backups.

### Notes

- Collection managers do not see the full site user list.
- AI availability can be toggled per collection by server admins, and collection managers can request AI access.

### Warnings

- Permanent collection deletion cascades collection-owned records. Archive first and verify backups before deleting.

