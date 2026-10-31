# World football data pipeline

This document describes the first implementation slice of the world-football database work. It is intentionally a data pipeline and validation foundation, not a bundled real-world database.

## Current project capabilities

The game already has a package-based world format. A package can author confederations, countries, clubs, players, staff, competitions, name pools and competition calendar metadata. Multiple packages can be composed. The package loader validates identifiers and cross references before a world is built.

The new **worldDataManifest** schema adds source provenance and media-rights declarations to that format. It does not replace the existing entity schemas or create a second database model.

## Import workflow

1. Choose a provider or federation source and read its data license, API terms and media terms.
2. Create or update the ordinary package entities using stable game IDs. Keep upstream IDs separate.
3. Add a worldDataManifest document that declares each source and maps package entity IDs to upstream IDs.
4. Add each included crest, portrait, kit or stadium image to the manifest with its asset type, owner, source, license and redistribution permission.
5. Run ofm-cli validate against the package directory before packaging. Validation rejects invalid source references, duplicate provider IDs, unknown entity targets, unsafe asset paths, missing licenses, missing redistribution permission and media references without matching declarations.
6. Package the validated world with ofm-cli pack.
7. Keep the package data date and provider retrieval dates current when issuing an update.

Example package layout:

    world-data/
      package.json
      world-data-sources.json
      countries/
        countries.json
      teams/
        teams.json
      players/
        players.json
      staff/
        staff.json
      competitions/
        competitions.json
      assets/
        crests/
        players/
        staff/
        kits/

Every definition file is schema-tagged JSON or YAML. worldDataManifest may live anywhere below the package directory and can be split into multiple manifests when packages use independent providers.

## Identity matching

Provider IDs are not game IDs. An exact source + external ID pair identifies one record from one provider. Across providers, a candidate player is a strong match only when the normalized full name, full date of birth and nationality all agree. Incomplete identities are reported for manual review; conflicting birth dates are not merged.

This matcher is deliberately conservative. Similar names, namesakes, transliterations and dual-nationality cases require authoritative corroboration before records are combined.

## Media rights

The validator checks declarations, not legal facts. A URL being public, an API returning an image, or a crest appearing in a search result does not grant redistribution permission. Verify rights for each data source and each media category before setting redistributionAllowed to true.

When a package contains a world-data manifest, every team logo, player portrait and competition logo referenced by an entity must have a matching manifest asset entry. Existing packages with no world-data manifest continue to load for backward compatibility.

## Scope and limitations of this slice

This implementation does not ship worldwide league tables, real club/player/staff records, national-team squads, photographs, crests or kits. It does not call a paid provider, store API credentials, crawl websites, or download media. It establishes the package-level provenance, identity and rights checks needed before adding sourced datasets.

The world-wide target must be delivered in source-specific, season-stamped packages. Coverage should be reported per country and competition tier; the absence of a source for a lower amateur division must remain visible rather than being filled with invented real-world records.
