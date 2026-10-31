//! Provenance, redistribution checks, and conservative identity matching for world databases.
//!
//! These types sit beside the existing .ofm package schemas. They deliberately keep provider IDs
//! separate from permanent game IDs, so provider changes cannot silently change career identities.

use std::collections::HashSet;

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

pub const WORLD_DATA_MANIFEST_SCHEMA: &str = "worldDataManifest";
pub const SUPPORTED_WORLD_DATA_MANIFEST_VERSION: u32 = 1;

/// Optional source and rights manifest shipped beside the football entities in a world package.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct WorldDataManifest {
    #[serde(default = "default_format_version")]
    pub format_version: u32,
    #[serde(default = "default_schema")]
    pub schema: String,
    #[serde(default)]
    pub data_as_of: Option<String>,
    #[serde(default)]
    pub sources: Vec<WorldDataSource>,
    #[serde(default)]
    pub entities: Vec<WorldDataEntitySource>,
    #[serde(default)]
    pub assets: Vec<WorldDataAsset>,
}

impl Default for WorldDataManifest {
    fn default() -> Self {
        Self {
            format_version: SUPPORTED_WORLD_DATA_MANIFEST_VERSION,
            schema: default_schema(),
            data_as_of: None,
            sources: Vec::new(),
            entities: Vec::new(),
            assets: Vec::new(),
        }
    }
}

fn default_format_version() -> u32 {
    SUPPORTED_WORLD_DATA_MANIFEST_VERSION
}

fn default_schema() -> String {
    WORLD_DATA_MANIFEST_SCHEMA.to_string()
}

/// A publisher, federation, data provider, or other source used by an imported dataset.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorldDataSource {
    pub id: String,
    pub provider: String,
    pub source_url: String,
    pub license: String,
    #[serde(default)]
    pub license_url: Option<String>,
    #[serde(default)]
    pub terms_url: Option<String>,
    #[serde(default)]
    pub attribution: Option<String>,
    #[serde(default)]
    pub retrieved_at: Option<String>,
    /// True only when the provider's terms permit the data to be redistributed in a game package.
    #[serde(default)]
    pub redistribution_allowed: bool,
}

/// Maps a stable in-game entity ID to an identifier supplied by an upstream source.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorldDataEntitySource {
    pub kind: WorldDataEntityKind,
    pub entity_id: String,
    pub source_id: String,
    pub external_id: String,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub enum WorldDataEntityKind {
    Confederation,
    Country,
    Club,
    Player,
    Staff,
    Competition,
    NationalTeam,
    Manager,
    Stadium,
}

impl Default for WorldDataEntityKind {
    fn default() -> Self {
        Self::Player
    }
}

/// Provenance and redistribution permission for one image or kit asset in a package.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct WorldDataAsset {
    pub path: String,
    pub kind: WorldDataAssetKind,
    pub owner_kind: WorldDataEntityKind,
    pub owner_id: String,
    pub source_id: String,
    pub license: String,
    #[serde(default)]
    pub attribution: Option<String>,
    #[serde(default)]
    pub redistribution_allowed: bool,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "camelCase")]
pub enum WorldDataAssetKind {
    ClubCrest,
    NationalTeamCrest,
    CompetitionLogo,
    PlayerPortrait,
    StaffPortrait,
    StadiumPhoto,
    HomeKit,
    AwayKit,
    ThirdKit,
}

impl Default for WorldDataAssetKind {
    fn default() -> Self {
        Self::PlayerPortrait
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorldDataIssueSeverity {
    Error,
    Warning,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WorldDataIssue {
    pub severity: WorldDataIssueSeverity,
    pub code: &'static str,
    pub entity_kind: Option<WorldDataEntityKind>,
    pub entity_id: Option<String>,
    pub message: String,
}

/// Inventory supplied by a package loader, used to verify source-map targets and coverage.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct KnownWorldEntity {
    pub kind: WorldDataEntityKind,
    pub id: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorldDataInventory {
    pub source_count: usize,
    pub sourced_entity_count: usize,
    pub asset_count: usize,
    pub redistributable_asset_count: usize,
    pub entities_without_source_count: usize,
    pub assets_without_redistribution_rights: usize,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorldDataAudit {
    pub inventory: WorldDataInventory,
    pub issues: Vec<WorldDataIssue>,
}

impl WorldDataAudit {
    pub fn error_count(&self) -> usize {
        self.issues
            .iter()
            .filter(|issue| issue.severity == WorldDataIssueSeverity::Error)
            .count()
    }

    pub fn warning_count(&self) -> usize {
        self.issues
            .iter()
            .filter(|issue| issue.severity == WorldDataIssueSeverity::Warning)
            .count()
    }

    pub fn has_errors(&self) -> bool {
        self.error_count() > 0
    }
}

/// Validate a manifest against the entities actually present in a package.
///
/// An absent provenance entry is a warning because older packages have no manifest. A declared
/// but invalid source, mapping, or asset is an error because it could misrepresent redistribution
/// rights or point an imported record at the wrong game entity.
pub fn audit_world_data(
    manifest: Option<&WorldDataManifest>,
    entities: &[KnownWorldEntity],
) -> WorldDataAudit {
    let Some(manifest) = manifest else {
        return WorldDataAudit {
            issues: vec![issue(
                WorldDataIssueSeverity::Warning,
                "world-data-manifest-missing",
                "No provenance manifest is attached; source and media rights cannot be audited.",
                None,
                None,
            )],
            ..WorldDataAudit::default()
        };
    };

    let mut audit = WorldDataAudit::default();
    audit.inventory.source_count = manifest.sources.len();
    audit.inventory.asset_count = manifest.assets.len();

    validate_manifest_header(manifest, &mut audit);
    let source_ids = validate_sources(manifest, &mut audit);
    let known_entities = known_entity_ids(entities);
    let mappings = validate_entity_mappings(manifest, &source_ids, &known_entities, &mut audit);
    validate_unmapped_entities(entities, &mappings, &mut audit);
    validate_assets(manifest, &source_ids, &known_entities, &mut audit);
    audit
}

fn validate_manifest_header(manifest: &WorldDataManifest, audit: &mut WorldDataAudit) {
    if manifest.schema != WORLD_DATA_MANIFEST_SCHEMA {
        audit.push_error(
            "world-data-manifest-schema-invalid",
            "The manifest schema discriminator is not recognized.",
            None,
            None,
        );
    }
    if manifest.format_version != SUPPORTED_WORLD_DATA_MANIFEST_VERSION {
        audit.push_error(
            "world-data-manifest-version-unsupported",
            &format!(
                "Manifest format {} is unsupported; this build supports {}.",
                manifest.format_version, SUPPORTED_WORLD_DATA_MANIFEST_VERSION
            ),
            None,
            None,
        );
    }
    match manifest.data_as_of.as_deref() {
        Some(date) if !is_valid_date(date) => audit.push_error(
            "world-data-date-invalid",
            "dataAsOf must be an ISO date in YYYY-MM-DD format.",
            None,
            None,
        ),
        None => audit.push_warning(
            "world-data-date-missing",
            "The manifest does not state the date represented by this dataset.",
            None,
            None,
        ),
        _ => {}
    }
    if manifest.sources.is_empty() {
        audit.push_error(
            "world-data-sources-missing",
            "A populated world-data manifest must declare at least one source.",
            None,
            None,
        );
    }
}

fn validate_sources(
    manifest: &WorldDataManifest,
    audit: &mut WorldDataAudit,
) -> HashSet<String> {
    let mut source_ids = HashSet::new();
    for source in &manifest.sources {
        if !is_slug(&source.id) {
            audit.push_error(
                "world-data-source-id-invalid",
                &format!("Source ID '{}' must be a lowercase slug.", source.id),
                None,
                None,
            );
        }
        if !source_ids.insert(source.id.clone()) {
            audit.push_error(
                "world-data-source-id-duplicate",
                &format!("Source ID '{}' is declared more than once.", source.id),
                None,
                None,
            );
        }
        validate_source_details(source, audit);
    }
    source_ids
}

fn validate_source_details(source: &WorldDataSource, audit: &mut WorldDataAudit) {
    if source.provider.trim().is_empty() {
        audit.push_error(
            "world-data-source-provider-missing",
            &format!("Source '{}' has no provider name.", source.id),
            None,
            None,
        );
    }
    if !is_https_url(&source.source_url) {
        audit.push_error(
            "world-data-source-url-invalid",
            &format!("Source '{}' must use an absolute HTTPS URL.", source.id),
            None,
            None,
        );
    }
    if source.license.trim().is_empty() {
        audit.push_error(
            "world-data-source-license-missing",
            &format!("Source '{}' has no declared license.", source.id),
            None,
            None,
        );
    }
    if !source.redistribution_allowed {
        audit.push_error(
            "world-data-source-redistribution-not-authorized",
            &format!("Source '{}' is not marked as redistributable.", source.id),
            None,
            None,
        );
    }
    if source.license_url.as_deref().is_some_and(|url| !is_https_url(url))
        || source.terms_url.as_deref().is_some_and(|url| !is_https_url(url))
    {
        audit.push_error(
            "world-data-source-terms-url-invalid",
            &format!("License and terms links for '{}' must use HTTPS.", source.id),
            None,
            None,
        );
    }
    if source.retrieved_at.as_deref().is_some_and(|date| !is_valid_date(date)) {
        audit.push_error(
            "world-data-source-retrieval-date-invalid",
            &format!("Source '{}' has an invalid retrievedAt date.", source.id),
            None,
            None,
        );
    }
}

fn known_entity_ids(
    entities: &[KnownWorldEntity],
) -> HashSet<(WorldDataEntityKind, String)> {
    entities
        .iter()
        .map(|entity| (entity.kind, entity.id.clone()))
        .collect()
}

fn validate_entity_mappings(
    manifest: &WorldDataManifest,
    source_ids: &HashSet<String>,
    known_entities: &HashSet<(WorldDataEntityKind, String)>,
    audit: &mut WorldDataAudit,
) -> HashSet<(WorldDataEntityKind, String)> {
    let mut mappings = HashSet::new();
    let mut upstream_ids = HashSet::new();

    for mapping in &manifest.entities {
        validate_entity_mapping(mapping, source_ids, known_entities, audit);
        if !mappings.insert((mapping.kind, mapping.entity_id.clone())) {
            audit.push_error(
                "world-data-entity-mapping-duplicate",
                &format!("Entity '{}' has more than one mapping entry.", mapping.entity_id),
                Some(mapping.kind),
                Some(mapping.entity_id.clone()),
            );
        }
        if !upstream_ids.insert((
            mapping.kind,
            mapping.source_id.clone(),
            mapping.external_id.clone(),
        )) {
            audit.push_error(
                "world-data-external-id-duplicate",
                &format!(
                    "External ID '{}' is mapped more than once for source '{}'.",
                    mapping.external_id, mapping.source_id
                ),
                Some(mapping.kind),
                Some(mapping.entity_id.clone()),
            );
        }
    }
    audit.inventory.sourced_entity_count = mappings.len();
    mappings
}

fn validate_entity_mapping(
    mapping: &WorldDataEntitySource,
    source_ids: &HashSet<String>,
    known_entities: &HashSet<(WorldDataEntityKind, String)>,
    audit: &mut WorldDataAudit,
) {
    if mapping.entity_id.trim().is_empty() || mapping.external_id.trim().is_empty() {
        audit.push_error(
            "world-data-entity-identity-incomplete",
            "Every source mapping needs both entityId and externalId.",
            Some(mapping.kind),
            Some(mapping.entity_id.clone()),
        );
    }
    if !source_ids.contains(&mapping.source_id) {
        audit.push_error(
            "world-data-entity-source-unknown",
            &format!("Entity mapping references unknown source '{}'.", mapping.source_id),
            Some(mapping.kind),
            Some(mapping.entity_id.clone()),
        );
    }
    if !known_entities.contains(&(mapping.kind, mapping.entity_id.clone())) {
        audit.push_error(
            "world-data-entity-target-unknown",
            &format!("Source mapping targets missing entity '{}'.", mapping.entity_id),
            Some(mapping.kind),
            Some(mapping.entity_id.clone()),
        );
    }
}

fn validate_unmapped_entities(
    entities: &[KnownWorldEntity],
    mappings: &HashSet<(WorldDataEntityKind, String)>,
    audit: &mut WorldDataAudit,
) {
    audit.inventory.entities_without_source_count = entities
        .iter()
        .filter(|entity| !mappings.contains(&(entity.kind, entity.id.clone())))
        .count();

    if audit.inventory.entities_without_source_count > 0 {
        audit.push_warning(
            "world-data-entity-provenance-incomplete",
            &format!(
                "{} entity record(s) have no source mapping.",
                audit.inventory.entities_without_source_count
            ),
            None,
            None,
        );
    }
}

fn validate_assets(
    manifest: &WorldDataManifest,
    source_ids: &HashSet<String>,
    known_entities: &HashSet<(WorldDataEntityKind, String)>,
    audit: &mut WorldDataAudit,
) {
    let mut asset_paths = HashSet::new();
    for asset in &manifest.assets {
        validate_asset(asset, source_ids, known_entities, audit);
        if !asset_paths.insert(asset.path.clone()) {
            audit.push_error(
                "world-data-asset-path-duplicate",
                &format!("Asset path '{}' is declared more than once.", asset.path),
                Some(asset.owner_kind),
                Some(asset.owner_id.clone()),
            );
        }
        if asset.redistribution_allowed && !asset.license.trim().is_empty() {
            audit.inventory.redistributable_asset_count += 1;
        }
        if !asset.redistribution_allowed {
            audit.inventory.assets_without_redistribution_rights += 1;
        }
    }
}

fn validate_asset(
    asset: &WorldDataAsset,
    source_ids: &HashSet<String>,
    known_entities: &HashSet<(WorldDataEntityKind, String)>,
    audit: &mut WorldDataAudit,
) {
    if !is_safe_relative_path(&asset.path) {
        audit.push_error(
            "world-data-asset-path-unsafe",
            &format!("Asset path '{}' is not a safe package-relative path.", asset.path),
            Some(asset.owner_kind),
            Some(asset.owner_id.clone()),
        );
    }
    if !source_ids.contains(&asset.source_id) {
        audit.push_error(
            "world-data-asset-source-unknown",
            &format!("Asset '{}' references unknown source '{}'.", asset.path, asset.source_id),
            Some(asset.owner_kind),
            Some(asset.owner_id.clone()),
        );
    }
    if asset.license.trim().is_empty() {
        audit.push_error(
            "world-data-asset-license-missing",
            &format!("Asset '{}' has no declared license.", asset.path),
            Some(asset.owner_kind),
            Some(asset.owner_id.clone()),
        );
    }
    if !asset.redistribution_allowed {
        audit.push_error(
            "world-data-asset-redistribution-not-authorized",
            &format!("Asset '{}' is not marked as redistributable.", asset.path),
            Some(asset.owner_kind),
            Some(asset.owner_id.clone()),
        );
    }
    if asset.owner_id.trim().is_empty()
        || !known_entities.contains(&(asset.owner_kind, asset.owner_id.clone()))
    {
        audit.push_error(
            "world-data-asset-owner-unknown",
            &format!("Asset '{}' points to an unknown entity.", asset.path),
            Some(asset.owner_kind),
            Some(asset.owner_id.clone()),
        );
    }
}

impl WorldDataAudit {
    fn push_error(
        &mut self,
        code: &'static str,
        message: &str,
        entity_kind: Option<WorldDataEntityKind>,
        entity_id: Option<String>,
    ) {
        self.issues.push(issue(
            WorldDataIssueSeverity::Error,
            code,
            message,
            entity_kind,
            entity_id,
        ));
    }

    fn push_warning(
        &mut self,
        code: &'static str,
        message: &str,
        entity_kind: Option<WorldDataEntityKind>,
        entity_id: Option<String>,
    ) {
        self.issues.push(issue(
            WorldDataIssueSeverity::Warning,
            code,
            message,
            entity_kind,
            entity_id,
        ));
    }
}

fn issue(
    severity: WorldDataIssueSeverity,
    code: &'static str,
    message: &str,
    entity_kind: Option<WorldDataEntityKind>,
    entity_id: Option<String>,
) -> WorldDataIssue {
    WorldDataIssue {
        severity,
        code,
        entity_kind,
        entity_id,
        message: message.to_string(),
    }
}

fn is_slug(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('-')
        && !value.ends_with('-')
        && value.chars().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == '-'
        })
}

fn is_https_url(value: &str) -> bool {
    let Some(remainder) = value.strip_prefix("https://") else {
        return false;
    };
    let host = remainder.split('/').next().unwrap_or_default();
    !host.is_empty() && !value.chars().any(char::is_whitespace)
}

fn is_valid_date(value: &str) -> bool {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").is_ok()
}

fn is_safe_relative_path(value: &str) -> bool {
    !value.is_empty()
        && !value.starts_with('/')
        && !value.contains('\\')
        && !value.contains(':')
        && !value.chars().any(char::is_control)
        && value
            .split('/')
            .all(|part| !part.is_empty() && part != "." && part != "..")
}

/// Provider identifiers are stored for traceability, never used as permanent game identifiers.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct PlayerIdentity {
    pub source_id: String,
    pub external_id: String,
    pub full_name: String,
    pub date_of_birth: Option<String>,
    pub nationality: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayerIdentityMatch {
    SameProviderRecord,
    StrongIdentityMatch,
    NeedsReview,
    ConflictingNationality,
    NoMatch,
}

/// Match only on a stable provider ID, or on name + full birth date + nationality.
/// Ambiguous records are sent for review rather than being silently merged.
pub fn compare_player_identity(
    incoming: &PlayerIdentity,
    existing: &PlayerIdentity,
) -> PlayerIdentityMatch {
    if !incoming.source_id.is_empty()
        && incoming.source_id == existing.source_id
        && !incoming.external_id.is_empty()
        && incoming.external_id == existing.external_id
    {
        return PlayerIdentityMatch::SameProviderRecord;
    }

    let incoming_name = normalize_person_name(&incoming.full_name);
    let existing_name = normalize_person_name(&existing.full_name);
    if incoming_name.is_empty() || incoming_name != existing_name {
        return PlayerIdentityMatch::NoMatch;
    }

    match (
        incoming.date_of_birth.as_deref(),
        existing.date_of_birth.as_deref(),
    ) {
        (Some(incoming_date), Some(existing_date)) if incoming_date != existing_date => {
            PlayerIdentityMatch::NoMatch
        }
        (Some(_), Some(_)) => match_nationality(incoming, existing, true),
        _ => PlayerIdentityMatch::NeedsReview,
    }
}

fn match_nationality(
    incoming: &PlayerIdentity,
    existing: &PlayerIdentity,
    birth_date_matches: bool,
) -> PlayerIdentityMatch {
    match (
        incoming.nationality.as_deref().map(str::to_ascii_uppercase),
        existing.nationality.as_deref().map(str::to_ascii_uppercase),
    ) {
        (Some(incoming), Some(existing)) if incoming != existing => {
            PlayerIdentityMatch::ConflictingNationality
        }
        (Some(_), Some(_)) if birth_date_matches => PlayerIdentityMatch::StrongIdentityMatch,
        _ => PlayerIdentityMatch::NeedsReview,
    }
}

fn normalize_person_name(value: &str) -> String {
    let mut normalized = String::new();
    let mut pending_space = false;
    for character in value.chars() {
        if character.is_alphanumeric() {
            if pending_space && !normalized.is_empty() {
                normalized.push(' ');
            }
            normalized.extend(character.to_lowercase());
            pending_space = false;
        } else {
            pending_space = true;
        }
    }
    normalized
}

/// Run the same conservative player match over a batch and return possible duplicate pairs.
pub fn find_possible_player_duplicates(
    incoming: &[PlayerIdentity],
    existing: &[PlayerIdentity],
) -> Vec<(usize, usize, PlayerIdentityMatch)> {
    let mut matches = Vec::new();
    for (incoming_index, candidate) in incoming.iter().enumerate() {
        for (existing_index, current) in existing.iter().enumerate() {
            let result = compare_player_identity(candidate, current);
            if result != PlayerIdentityMatch::NoMatch {
                matches.push((incoming_index, existing_index, result));
            }
        }
    }
    matches
}

#[cfg(test)]
mod tests {
    use super::*;

    fn known_player(id: &str) -> KnownWorldEntity {
        KnownWorldEntity {
            kind: WorldDataEntityKind::Player,
            id: id.to_string(),
        }
    }

    fn source() -> WorldDataSource {
        WorldDataSource {
            id: "open-data".to_string(),
            provider: "Example Federation".to_string(),
            source_url: "https://example.org/players".to_string(),
            license: "CC-BY-4.0".to_string(),
            redistribution_allowed: true,
            ..WorldDataSource::default()
        }
    }

    #[test]
    fn accepts_a_manifest_with_valid_source_mapping_and_media_rights() {
        let manifest = WorldDataManifest {
            data_as_of: Some("2026-10-31".to_string()),
            sources: vec![source()],
            entities: vec![WorldDataEntitySource {
                kind: WorldDataEntityKind::Player,
                entity_id: "player-1".to_string(),
                source_id: "open-data".to_string(),
                external_id: "external-42".to_string(),
            }],
            assets: vec![WorldDataAsset {
                path: "assets/players/player-1.webp".to_string(),
                kind: WorldDataAssetKind::PlayerPortrait,
                owner_kind: WorldDataEntityKind::Player,
                owner_id: "player-1".to_string(),
                source_id: "open-data".to_string(),
                license: "CC-BY-4.0".to_string(),
                redistribution_allowed: true,
                ..WorldDataAsset::default()
            }],
            ..WorldDataManifest::default()
        };

        let audit = audit_world_data(Some(&manifest), &[known_player("player-1")]);

        assert!(!audit.has_errors());
        assert_eq!(audit.inventory.sourced_entity_count, 1);
        assert_eq!(audit.inventory.redistributable_asset_count, 1);
        assert_eq!(audit.inventory.entities_without_source_count, 0);
    }

    #[test]
    fn reports_missing_manifest_as_a_legacy_compatibility_warning() {
        let audit = audit_world_data(None, &[]);

        assert_eq!(audit.error_count(), 0);
        assert_eq!(audit.warning_count(), 1);
        assert_eq!(audit.issues[0].code, "world-data-manifest-missing");
    }

    #[test]
    fn refuses_media_without_permission_and_rejects_unsafe_paths() {
        let manifest = WorldDataManifest {
            sources: vec![source()],
            assets: vec![WorldDataAsset {
                path: "../../outside/player.webp".to_string(),
                kind: WorldDataAssetKind::PlayerPortrait,
                owner_kind: WorldDataEntityKind::Player,
                owner_id: "player-1".to_string(),
                source_id: "open-data".to_string(),
                license: "Unknown".to_string(),
                redistribution_allowed: false,
                ..WorldDataAsset::default()
            }],
            ..WorldDataManifest::default()
        };

        let audit = audit_world_data(Some(&manifest), &[known_player("player-1")]);
        let codes: HashSet<&str> = audit.issues.iter().map(|item| item.code).collect();

        assert!(codes.contains("world-data-asset-path-unsafe"));
        assert!(codes.contains("world-data-asset-redistribution-not-authorized"));
        assert!(audit.has_errors());
    }

    #[test]
    fn reports_unknown_source_ids_and_duplicate_upstream_ids() {
        let manifest = WorldDataManifest {
            sources: vec![source()],
            entities: vec![
                WorldDataEntitySource {
                    kind: WorldDataEntityKind::Player,
                    entity_id: "player-1".to_string(),
                    source_id: "open-data".to_string(),
                    external_id: "same-id".to_string(),
                },
                WorldDataEntitySource {
                    kind: WorldDataEntityKind::Player,
                    entity_id: "player-2".to_string(),
                    source_id: "missing-source".to_string(),
                    external_id: "same-id".to_string(),
                },
            ],
            ..WorldDataManifest::default()
        };

        let audit = audit_world_data(
            Some(&manifest),
            &[known_player("player-1"), known_player("player-2")],
        );
        let codes: HashSet<&str> = audit.issues.iter().map(|item| item.code).collect();

        assert!(codes.contains("world-data-entity-source-unknown"));
        assert!(codes.contains("world-data-external-id-duplicate"));
    }

    #[test]
    fn does_not_merge_same_named_players_with_different_birth_dates() {
        let first = PlayerIdentity {
            full_name: "Alex Smith".to_string(),
            date_of_birth: Some("2000-01-01".to_string()),
            nationality: Some("ENG".to_string()),
            ..PlayerIdentity::default()
        };
        let second = PlayerIdentity {
            full_name: "Alex Smith".to_string(),
            date_of_birth: Some("2001-01-01".to_string()),
            nationality: Some("ENG".to_string()),
            ..PlayerIdentity::default()
        };

        assert_eq!(
            compare_player_identity(&first, &second),
            PlayerIdentityMatch::NoMatch
        );
    }

    #[test]
    fn matches_players_from_different_sources_only_with_full_identity_evidence() {
        let incoming = PlayerIdentity {
            source_id: "provider-a".to_string(),
            external_id: "123".to_string(),
            full_name: " João   Félix ".to_string(),
            date_of_birth: Some("1999-11-10".to_string()),
            nationality: Some("por".to_string()),
        };
        let existing = PlayerIdentity {
            source_id: "provider-b".to_string(),
            external_id: "987".to_string(),
            full_name: "João Félix".to_string(),
            date_of_birth: Some("1999-11-10".to_string()),
            nationality: Some("POR".to_string()),
        };

        assert_eq!(
            compare_player_identity(&incoming, &existing),
            PlayerIdentityMatch::StrongIdentityMatch
        );
    }

    #[test]
    fn sends_records_with_incomplete_identity_to_manual_review() {
        let incoming = PlayerIdentity {
            full_name: "Jordan Example".to_string(),
            date_of_birth: Some("2000-02-02".to_string()),
            ..PlayerIdentity::default()
        };
        let existing = incoming.clone();

        assert_eq!(
            compare_player_identity(&incoming, &existing),
            PlayerIdentityMatch::NeedsReview
        );
    }

    #[test]
    fn validates_package_relative_media_paths() {
        assert!(is_safe_relative_path("assets/players/player-1.webp"));
        assert!(!is_safe_relative_path("../../player.webp"));
        assert!(!is_safe_relative_path("C:/players/player.webp"));
        assert!(!is_safe_relative_path("assets\\players\\player.webp"));
    }

    #[test]
    fn finds_duplicate_candidates_without_auto_merging_them() {
        let incoming = vec![PlayerIdentity {
            full_name: "Player Example".to_string(),
            date_of_birth: Some("2000-01-01".to_string()),
            nationality: Some("ENG".to_string()),
            ..PlayerIdentity::default()
        }];
        let existing = vec![incoming[0].clone()];

        let possible = find_possible_player_duplicates(&incoming, &existing);

        assert_eq!(possible.len(), 1);
        assert_eq!(possible[0].2, PlayerIdentityMatch::StrongIdentityMatch);
    }
}
