# AxilDB Provenance Model

## Responsibilities

- `Source` identifies an upstream originator, breeder, hybridizer, propagator, grower, importer, laboratory, seed producer, or collector.
- `Seller` identifies the person or organization that actually sold or transferred the plant.
- `SellerStorefront` identifies that seller's reusable account, shop, or profile on a particular sales channel. One seller may have storefronts on several platforms.
- `Distributor` identifies the retailer, marketplace, nursery, auction platform, society sale, or other channel through which the transaction occurred.
- `DistributorOutlet` identifies a branch, distributor-operated online store, mail-order operation, show booth, or other outlet operated by the distributor itself. Independent marketplace sellers are storefronts, not outlets.
- `AcquisitionSource` gives an acquisition an ordered upstream source chain, relationship-specific role and notes, and at most one primary source.

Transaction date, price, currency, quantity, shipping, tax, order number, condition, and notes remain on the acquisition, batch, or observation. Plant Definitions remain botanical records and do not own commercial provenance.

## Common Shapes

Marketplace purchase:

```text
Seller: Aerial Roots
Storefront: @AerialRootsFL
Distributor: Palmstreet
Display: Purchased from Aerial Roots via Palmstreet
```

Traditional retail purchase:

```text
Distributor: Lowe's
Outlet: Glen Burnie Store
Display: Purchased from Lowe's - Glen Burnie
```

Direct transfer:

```text
Seller: Jane Smith
Display: Received from Jane Smith
```

Every layer is optional. An acquisition can retain only the information actually known.

## Collection Boundaries And Permissions

Every structured provenance row carries `collectionId`. Server actions validate seller, storefront, distributor, outlet, source, acquisition, observation, batch, and wishlist preference relationships before writing. A storefront must belong to the selected seller; an outlet must belong to the selected distributor; a platform-linked storefront must agree with the selected distributor.

Loggers select structured records while recording acquisitions and observations. Gardeners maintain and archive sellers, storefronts, distributors, outlets, and sources. Managers also merge duplicates, resolve reconciliation items, and configure public visibility. Run `npm run provenance:check` to audit collection and parent/child invariants against the deployed database.

## Privacy

Source, seller, seller storefront, distributor/platform, and distributor outlet each have conservative collection visibility controls and default to private. Public exhibits render only fields explicitly enabled by a manager. Seller/distributor ratings, experience notes, internal storefront/outlet notes, and personal addresses are always private in this version.

Public wishlist projections do not expose preferred sellers or channels. Public observations must be explicitly marked public, and their seller/channel identity still follows the collection's separate provenance controls.

## Archive And Merge Rules

Archived records remain attached to historical acquisitions and disappear from new-record choices. Manager merge actions select a canonical seller, source, or distributor, reassign compatible relationships, collapse exact relationship conflicts, preserve storefront/outlet history, and then remove the duplicate. Similar names are never merged automatically.

Seller storefronts are first-class identities rather than aliases. Lightweight aliases may remain in `aliasesJson` for search and later normalization, but aliases do not replace storefront records.

## Legacy Migration And Reconciliation

Legacy `source`, `distributor`, and `vendor` strings remain readable and are not erased. The original migration remains available:

```bash
npm run provenance:migrate -- --dry-run
npm run provenance:migrate
```

After deploying the normalized seller/storefront migration, inspect legacy marketplace outlets first:

```bash
npm run provenance:marketplace-migrate -- --dry-run
npm run provenance:marketplace-migrate
npm run provenance:check
```

The marketplace migration is collection-scoped with optional `--collection=slug`, idempotent, and non-destructive. It automatically converts only unambiguous seller handles or online profiles under marketplace/auction distributors when no physical address evidence exists. It creates or reuses a seller and storefront, reassigns acquisitions/observations/batches, and archives the old outlet while preserving its ID and notes. Ambiguous names enter `ProvenanceReconciliationItem`; original values remain intact until a gardener resolves or dismisses them.

The Prisma migration renames `DistributorLocation` to `DistributorOutlet` and its foreign-key columns in place. It does not drop and recreate outlet history.

## Reports And Search

Internal acquisition search understands seller names, storefront handles, distributors/platforms, outlets, and upstream sources. The acquisition provenance CSV includes both reusable record IDs and human-readable fields plus a natural-language summary. Wishlist CSV/PDF includes structured preferred sellers, storefronts, and distributors for authorized members only.

## Future Shared Records

Collection-specific ratings, notes, transactions, and preferences are not embedded in a global identity layer. Normalized names and local aliases leave room for a later site-wide validated organization/seller directory, but cross-collection sharing and reputation scoring are intentionally outside this release.
