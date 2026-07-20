# Plant Definition Tags

Plant Tags are controlled, reusable metadata for traits that do not belong in taxonomy or husbandry fields. They are not freeform hashtags, notes, QR labels, or global validated-definition metadata.

## Ownership and schema

`PlantTag` owns the collection-local catalog. Its normalized `slug` is unique with `collectionId`; its optional `category`, curated icon key, color token, description, and `publicVisible` flag control organization and presentation. Archiving sets `active = false` and retains the row.

`PlantDefinitionTag` links one local Plant Definition to one tag in the same collection. The unique definition/tag index prevents duplicate assignment. `source` records `USER`, `MAGIC_FILL`, `IMPORT`, or `SYSTEM`, while optional confidence supports reviewed automation. Plant Instances inherit tags through `plantDefinitionId`; tags are never copied to instances.

Site-level Validated Plant Definitions are not tagged in v1. Assigning collection-owned metadata directly to a global definition could leak or couple collections, so a local definition is required for local tags.

## Categories and visuals

Categories are string-backed organizational values: appearance, leaf texture/pattern, color effect, growth habit, behavior, form, care trait, environment, pet safety, collection theme, and other. They do not trigger category-specific application behavior.

Icons use a curated set of Lucide keys and AxilDB color tokens. This keeps rendering stable across operating systems and avoids platform-dependent emoji. Unknown icon or color values fall back to the generic botanical tag treatment.

## Permissions and lifecycle

Collection gardeners and managers can create, edit, archive, restore, merge, and assign tags. Viewers can read tags available in their collection context. A merge moves assignments to the canonical tag, avoids duplicate links, then archives the duplicate. Referenced tags are never hard-deleted.

Archived tags remain visible on definitions that already used them. Pickers query active tags only, and definition updates preserve archived historical assignments.

## Search semantics

Definition search uses indexed relationship filters. **Match any** uses one `some` relationship query over selected tag IDs. **Match all** uses one scoped `some` predicate per selected ID joined with `AND`. Instance filtering follows `plantDefinition.tags`; no per-card query is used. Cards load assignments in the parent query.

## Public visibility

Internal collection views may show active and historical assigned tags as appropriate. Public wishlist, exhibit, and plant-preview output requires all of the following:

- the parent page/collection is publicly visible;
- the feature-specific tag display toggle is enabled where one exists;
- the tag is active;
- `publicVisible` is true.

Private descriptions and assignment provenance are not included in public output.

## Magic Fill

Magic Fill receives only the active collection tag ID, name, category, and description catalog. Existing tags are preferred. Suggestions include confidence and a short reason and appear in the review panel without changing the form.

Existing suggestions require an explicit apply action. Proposed tags require selection followed by a second confirmation; created tags default to private and are only selected on the still-unsaved definition form. Saving records new AI-origin assignments as `MAGIC_FILL`. Manual assignments are not removed by Magic Fill Replace All.

Safety tags such as pet safety require stronger support and cautious wording. The prompt must not infer subjective traits or treat weak evidence as proof.

## Extending a feature

When adding tags to another surface:

1. Query assignments in the parent list query to avoid N+1 loading.
2. Preserve `collectionId` in every relationship filter and mutation.
3. Use `PlantTagRow` or `PlantTagChip` for consistent icons and colors.
4. Apply active/public filters before serializing public data.
5. Keep tag relationships on definitions rather than instances.
6. Emit domain events for durable assignment changes.
