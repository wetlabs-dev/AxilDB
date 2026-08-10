# Substrate System

AxilDB keeps substrate definitions collection-scoped. Each collection receives a curated starter library of 15 components and 12 recipes. Managers can archive starters, add local components, and create local recipes without changing another collection.

## Recipes And Versions

A recipe is a stable named record with one or more immutable versions. Draft versions can be edited and reordered. Activation requires components totaling exactly 100% by volume. Once activated, a version is historical evidence and cannot be edited in place; create a new version instead. Plants and care events retain their exact recipe-version links.

## Recommendations

Plant Definitions can rank multiple substrate recipe versions as Preferred, Recommended, Acceptable, or Special purpose. Recommendations may be entered manually or reviewed from a Magic Fill husbandry draft. Magic Fill sees only compact active recipe/component metadata from the current collection and never assigns a recipe automatically.

## Plant Substrate History

Every Plant Instance has an explicit current state: recipe version, Received Substrate, Custom / Unknown Mix, No Substrate, or Unknown. Acquisitions default to Received Substrate when the seller's mix is not known. Changing substrate writes an append-only history row, and repotting care events link to that history.

The Care Queue derives repot tasks when a parseable repotting interval is present in husbandry. Completing one requires the new substrate state and shows the plant's current substrate plus its top-ranked recommendation. Bulk repotting uses the same history path.

## Reports And Safety

The Substrates page exports recipe versions and plant substrate history as collection-scoped CSV files. Search and Plant Instance filters can find recipe, component, and Received Substrate records. Recipe percentages are formulation guidance, not inventory tracking or a chemical calculation.
