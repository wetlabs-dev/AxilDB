# AxilDB Provenance Model

## Responsibilities

- `Source` identifies an upstream originator, breeder, hybridizer, propagator, grower, importer, laboratory, seed producer, or collector.
- `Seller` identifies the person or organization that actually sold or transferred the plant.
- `SellerStorefront` is retained as the internal model for a user-facing **Sales Channel**: the website, marketplace profile, shop, nursery, show booth, social account, auction, or physical store through which that seller transacted.
- `SalesChannelType` supplies reusable built-in and manager-defined channel labels.
- `Distributor` and `DistributorOutlet` remain compatibility records for historical links and are no longer presented during normal acquisition entry.
- `AcquisitionSource` gives an acquisition an ordered upstream source chain, relationship-specific role and notes, and at most one primary source.

Transaction date, price, currency, quantity, shipping, tax, order number, condition, and notes remain on the acquisition, batch, or observation. Plant Definitions remain botanical records and do not own commercial provenance.

## Common Shapes

Marketplace purchase:

```text
Seller: Aerial Roots
Sales channel: @AerialRootsFL (Palmstreet)
Display: Purchased from Aerial Roots
```

Traditional retail purchase:

```text
Seller: Lowe's
Sales channel: Glen Burnie Store (Retail Store)
```

Direct transfer:

```text
Seller: Jane Smith
Display: Received from Jane Smith
```

Every layer is optional. An acquisition can retain only the information actually known.

## Collection Boundaries And Permissions

Every structured provenance row carries `collectionId`. Server actions validate seller, sales channel, source, acquisition, observation, batch, and wishlist preference relationships before writing. A sales channel must belong to the selected seller. Its legacy distributor link, when present, is inferred rather than exposed in ordinary forms.

Loggers select structured records while recording acquisitions and observations. Gardeners maintain and archive sellers, sales channels, and sources. Managers also maintain channel types, merge duplicates, convert legacy outlets, permanently delete unused records, and configure public visibility. Run `npm run provenance:check` to audit collection and parent/child invariants against the deployed database.

## Privacy

Source, seller, and sales channel each have conservative collection visibility controls and default to private. Public exhibits render only fields explicitly enabled by a manager. Ratings, experience notes, internal channel notes, and personal addresses are always private.

Public wishlist projections do not expose preferred sellers or channels. Public observations must be explicitly marked public, and their seller/channel identity still follows the collection's separate provenance controls.

## Archive And Merge Rules

Archived records remain attached to historical acquisitions and disappear from new-record choices. Manager merge actions select a canonical seller, source, or sales channel, reassign compatible relationships, collapse exact relationship conflicts, and then remove the duplicate. Permanent deletion is allowed only when a record has no references. Similar names are suggested for review and are never merged automatically.

Sales channels are first-class identities rather than aliases. Lightweight seller/source aliases remain in `aliasesJson` for search and later normalization, but aliases do not replace channel records.

## Legacy Migration And Reconciliation

Legacy `source`, `distributor`, and `vendor` strings remain readable and are not erased. The original migration remains available:

```bash
npm run provenance:migrate -- --dry-run
npm run provenance:migrate
```

The sales-channel migration seeds the default channel types and adds seller/channel links to every legacy outlet-linked acquisition, observation, and batch. Original distributor/outlet IDs and relationships remain intact for audit compatibility. Managers can preview and explicitly convert any remaining active outlet from the Provenance cleanup panel.

The Prisma migration renames `DistributorLocation` to `DistributorOutlet` and its foreign-key columns in place. It does not drop and recreate outlet history.

## Reports And Search

Internal search understands seller and source names, websites, aliases, sales-channel names, types, and URLs. The Acquisition page begins with canonical purchase history; wishlist and research sections remain planning tools. Plant Instances have a dedicated acquisition editor that silently creates a linked canonical record for older specimens when needed.

## Future Shared Records

Collection-specific ratings, notes, transactions, and preferences are not embedded in a global identity layer. Normalized names and local aliases leave room for a later site-wide validated organization/seller directory, but cross-collection sharing and reputation scoring are intentionally outside this release.
