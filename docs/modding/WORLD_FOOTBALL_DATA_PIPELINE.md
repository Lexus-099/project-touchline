# World football data pipeline

This document describes the world-football database foundation and the first two season-stamped real-club data packages. The repository now contains two sourced top-flight pilots; it is not yet a complete worldwide database.

## Current project capabilities

The game already has a package-based world format. A package can author confederations, countries, clubs, players, staff, competitions, name pools and competition calendar metadata. Multiple packages can be composed. The package loader validates identifiers and cross references before a world is built.

The **worldDataManifest** schema adds source provenance and media-rights declarations to that format. It does not replace the existing entity schemas or create a second database model.

## First real-club packages

### England — Premier League 2026/27

Path: `world-packs/england-premier-league-2026-27/`

- England and the Premier League 2026/27 competition definition.
- 20 clubs in the 2026/27 Premier League.
- Stable in-game IDs, display names, cities, short names and simplified colour pairs.
- Source mappings and a CC0 1.0 source record for the OpenFootball 2026/27 England fixture data.

### Türkiye — Süper Lig 2026/27

Path: `world-packs/turkey-super-lig-2026-27/`

- Türkiye and the Trendyol Süper Lig 2026/27 competition definition.
- 18 clubs listed in the OpenFootball 2026/27 Turkey fixture dataset.
- Turkish display names, stable in-game IDs, cities, short names and simplified colour pairs.
- Source mappings preserve the upstream OpenFootball spellings as external IDs, even when the display name uses the current Turkish federation spelling.

Both packages are data-only real-club baselines. They do **not** include actual first-team player or staff rosters yet; unless another roster package is installed, the existing game generation path may create players. Those generated players must not be represented as the clubs' real-world 2026/27 squads.

OpenFootball publishes the relevant football dataset under CC0 1.0. CC0 applies to the contributed data; it does not grant trademark rights or image rights belonging to clubs, leagues, players or other rights holders. Neither package includes official crests, photos, copied kit artwork or sponsor marks. The colour pairs are simplified in-game metadata, not official kit artwork. These are not official federation, league or club licences.

## Import workflow

1. Choose a provider or federation source and read its data license, API terms and media terms.
2. Create or update the ordinary package entities using stable game IDs. Keep upstream IDs separate.
3. Add a worldDataManifest document that declares each source and maps package entity IDs to upstream IDs.
4. Add each included crest, portrait, kit or stadium image to the manifest with its asset type, owner, source, license and redistribution permission.
5. Run ofm-cli validate against the package directory before packaging. Validation rejects invalid source references, duplicate provider IDs, unknown entity targets, unsafe asset paths, missing licenses, missing redistribution permission and media references without matching declarations.
6. Package the validated world with ofm-cli pack.
7. Keep the package data date and provider retrieval dates current when issuing an update.

Every definition file is schema-tagged JSON or YAML. `worldDataManifest` may live anywhere below the package directory and can be split into multiple manifests when packages use independent providers.

## Identity matching

Provider IDs are not game IDs. An exact source + external ID pair identifies one record from one provider. Across providers, a candidate player is a strong match only when the normalized full name, full date of birth and nationality all agree. Incomplete identities are reported for manual review; conflicting birth dates are not merged.

This matcher is deliberately conservative. Similar names, namesakes, transliterations and dual-nationality cases require authoritative corroboration before records are combined.

## Media rights

The validator checks declarations, not legal facts. A URL being public, an API returning an image, or a crest appearing in a search result does not grant redistribution permission. Verify rights for each data source and each media category before setting redistributionAllowed to true.

When a package contains a world-data manifest, every team logo, player portrait and competition logo referenced by an entity must have a matching manifest asset entry. Existing packages with no world-data manifest continue to load for backward compatibility.

## Scope and limitations

The two packages cover two countries, two top-flight competitions and 38 clubs. The repository does not yet contain a 200+ country world, complete domestic league pyramids, real player/staff rosters, national-team squads or international tournament datasets. It does not call a paid provider, store API credentials, crawl websites or download media.

The worldwide target must be delivered in source-specific, season-stamped packages. Coverage should be reported per country and competition tier; the absence of a source for a lower amateur division must remain visible rather than being filled with invented real-world records.
