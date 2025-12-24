import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';

/**
 * Workspace table - Multi-tenant workspace container for content organization.
 *
 * Workspaces provide isolated containers for different projects or narratives,
 * supporting multi-tenancy within the application. Each workspace has its own
 * content items, characters, locations, and other entities.
 */
export const workspace = sqliteTable(
  'workspace',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    plan: text('plan').notNull().default('standard'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_workspace_created_at').on(table.createdAt),
    index('ix_workspace_updated_at').on(table.updatedAt),
  ]
);

/**
 * Content item table - Base entity for all content types (chapters, characters, locations).
 *
 * This table serves as the primary container for content across the application.
 * The 'kind' field discriminates between different content types (chapter, character, location).
 * Content is versioned through revisions, with defaultRevisionId pointing to the active version.
 * Supports draft/published workflow via the status field.
 */
export const contentItem = sqliteTable(
  'content_item',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    kind: text('kind').notNull(),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    status: text('status').notNull().default('draft'),
    defaultRevisionId: text('default_revision_id'),
    metadataJson: text('metadata_json').notNull().default('{}'),
    wordCount: integer('word_count'),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_content_item_kind_slug').on(table.kind, table.slug),
    index('ix_content_item_kind_created').on(table.kind, table.createdAt),
    index('ix_content_item_status').on(table.status),
    index('ix_content_item_updated_at').on(table.updatedAt),
  ]
);

/**
 * Content revision table - Versioning system for content items.
 *
 * Each content item can have multiple revisions, enabling version history and
 * collaborative editing workflows. Revisions track their state (draft, published),
 * author, and can reference a base revision for branching/forking scenarios.
 * The revision system provides the foundation for content editing and approval workflows.
 */
export const contentRevision = sqliteTable(
  'content_revision',
  {
    id: text('id').primaryKey(),
    contentId: text('content_id').notNull(),
    revisionNumber: integer('revision_number').notNull(),
    state: text('state').notNull(),
    authorId: text('author_id').notNull(),
    basedOnRevisionId: text('based_on_revision_id'),
    note: text('note'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_content_revision_state').on(table.state),
    index('ix_content_revision_created_at').on(table.createdAt),
    index('ix_content_revision_updated_at').on(table.updatedAt),
  ]
);

/**
 * Content section table - Hierarchical content organization within revisions.
 *
 * Sections provide structural organization within a content revision, such as
 * chapters, sections, or thematic groupings. Each section has a type and position
 * for ordering, and can contain multiple content blocks. Metadata JSON allows for
 * flexible per-section configuration.
 */
export const contentSection = sqliteTable(
  'content_section',
  {
    id: text('id').primaryKey(),
    revisionId: text('revision_id').notNull(),
    sectionType: text('section_type').notNull(),
    title: text('title'),
    position: integer('position').notNull(),
    metadataJson: text('metadata_json').notNull().default('{}'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_content_section_type').on(table.sectionType),
    // Optimize retrieval by revision ordered by position
    index('ix_content_section_revision').on(table.revisionId, table.position),
  ]
);

/**
 * Content block table - Individual content blocks with typed payloads.
 *
 * Blocks are the atomic units of content, representing paragraphs, dialogue,
 * scene headers, or other block-level elements. Each block has a type (prose,
 * dialogue, scene_header) and contains either text or rich structured content.
 * Blocks can be marked as scene anchors for navigation and scene boundary detection.
 */
export const contentBlock = sqliteTable(
  'content_block',
  {
    id: text('id').primaryKey(),
    sectionId: text('section_id').notNull(),
    blockType: text('block_type').notNull(),
    position: integer('position').notNull(),
    textPayload: text('text_payload'),
    richPayload: text('rich_payload'),
    wordCount: integer('word_count'),
    isSceneAnchor: integer('is_scene_anchor').notNull().default(0),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_content_block_type').on(table.blockType),
    // Optimize retrieval by section ordered by position
    index('ix_content_block_section').on(table.sectionId, table.position),
    index('ix_content_block_scene_anchor').on(table.isSceneAnchor),
  ]
);

/**
 * Scene table - Scene-level metadata and organization for narrative content.
 *
 * Scenes represent narrative units within chapters, containing metadata like
 * title, synopsis, location, POV character, and temporal information. Each scene
 * is linked to specific content blocks through scene_segment. Scenes enable
 * navigation, search, and analysis at the scene level.
 */
export const scene = sqliteTable(
  'scene',
  {
    id: text('id').primaryKey(),
    contentId: text('content_id').notNull(),
    revisionId: text('revision_id').notNull(),
    slug: text('slug').notNull(),
    title: text('title'),
    sequenceOrder: integer('sequence_order').notNull(),
    synopsis: text('synopsis'),
    sceneWhen: text('scene_when'),
    primaryLocationId: text('primary_location_id'),
    povEntityId: text('pov_entity_id'),
    estReadSeconds: integer('est_read_seconds'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_scene_revision').on(table.revisionId),
    index('ix_scene_sequence').on(table.contentId, table.sequenceOrder),
  ]
);

/**
 * Scene segment table - Junction table linking scenes to content blocks.
 *
 * Scene segments define which content blocks belong to which scene, supporting
 * scenarios where a single scene may span multiple blocks or where blocks need
 * to be grouped into scenes. The spanOrder provides ordering within a scene,
 * and inlineRange allows for partial block inclusion.
 */
export const sceneSegment = sqliteTable(
  'scene_segment',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id').notNull(),
    blockId: text('block_id').notNull(),
    spanOrder: integer('span_order').notNull(),
    inlineRange: text('inline_range'),
    narrationTone: text('narration_tone'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    // Optimize retrieval by scene ordered by span order
    index('ix_scene_segment_scene').on(table.sceneId, table.spanOrder),
    index('ix_scene_segment_block').on(table.blockId),
  ]
);

/**
 * Unified content view - Simplified view combining content items with their markdown.
 *
 * This table provides a flattened view of content for simpler queries where the
 * full revision/section/block hierarchy is not needed. It aggregates content data
 * into a single row per item with the rendered markdown. Used primarily for
 * listing, search, and display scenarios.
 */
export const unifiedContent = sqliteTable('unified_content', {
  id: text('id').primaryKey(),
  kind: text('kind'),
  type: text('type'),
  slug: text('slug').notNull(),
  title: text('title').notNull(),
  summary: text('summary'),
  wordCount: integer('word_count'),
  markdownContent: text('markdown_content'),
  createdAt: text('created_at'),
  updatedAt: text('updated_at'),
});

/**
 * Lore entity table - Legacy entity system for characters and locations.
 *
 * This table represents the original entity system before the dedicated character
 * and location tables were introduced. It provides a flexible entity type system
 * for any kind of lore element. New development should use the dedicated character
 * and location tables instead.
 */
export const loreEntity = sqliteTable(
  'lore_entity',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    contentId: text('content_id'),
    entityType: text('entity_type').notNull(),
    slug: text('slug').notNull().unique(),
    displayName: text('display_name').notNull(),
    shortBlurb: text('short_blurb'),
    portraitAssetId: text('portrait_asset_id'),
    originSceneId: text('origin_scene_id'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_lore_entity_type').on(table.entityType),
    index('ix_lore_entity_workspace').on(table.workspaceId),
  ]
);

/**
 * Entity link table - Relationships between lore entities.
 *
 * Defines directed relationships between entities in the legacy lore entity system.
 * Each link has a relationship type (e.g., ally, rival, family) and optional
 * strength indicator. For new character relationships, use characterRelationship instead.
 */
export const entityLink = sqliteTable(
  'entity_link',
  {
    id: text('id').primaryKey(),
    sourceEntityId: text('source_entity_id').notNull(),
    targetEntityId: text('target_entity_id').notNull(),
    relationship: text('relationship').notNull(),
    strength: integer('strength'),
    notes: text('notes'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_entity_link_source').on(table.sourceEntityId),
    index('ix_entity_link_target').on(table.targetEntityId),
    index('ix_entity_link_relationship').on(table.relationship),
  ]
);

/**
 * Entity table - Generic entity metadata linked to content items.
 *
 * Provides a lightweight entity layer on top of content items, storing entity-specific
 * metadata like type, name, and aliases. This table bridges the gap between content
 * items and the more specialized character/location tables.
 */
export const entity = sqliteTable('entity', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id').notNull(),
  entityType: text('entity_type').notNull(),
  name: text('name').notNull(),
  aliases: text('aliases'),
  metadataJson: text('metadata_json').notNull().default('{}'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Embedding table - Vector embeddings for semantic search and AI features.
 *
 * Stores vector embeddings generated from content blocks for semantic search,
 * similarity matching, and AI-powered features. Each embedding is linked to a
 * specific content block and tracks the model used for generation.
 */
export const embedding = sqliteTable('embedding', {
  id: text('id').primaryKey(),
  blockId: text('block_id').notNull(),
  embeddingVector: text('embedding_vector').notNull(),
  model: text('model').notNull(),
  createdAt: text('created_at').notNull(),
});

/**
 * Image table - Legacy image storage system.
 *
 * Original image storage table used before the imageAsset/imageLink pipeline.
 * Directly links images to content items via Cloudflare Images IDs.
 * New development should use imageAsset and imageLink tables instead.
 */
export const image = sqliteTable('image', {
  id: text('id').primaryKey(),
  contentItemId: text('content_item_id'),
  cloudflareId: text('cloudflare_id').notNull(),
  filename: text('filename').notNull(),
  altText: text('alt_text'),
  width: integer('width'),
  height: integer('height'),
  createdAt: text('created_at').notNull(),
});

/**
 * Image asset table - Primary image storage for the new imagery pipeline.
 *
 * Centralized image asset management with Cloudflare Images integration.
 * Stores image metadata including source paths, file hashes for deduplication,
 * dimensions, and Cloudflare-specific fields (image ID, variants, URLs).
 * Supports both uploaded and AI-generated images with provider tracking.
 */
export const imageAsset = sqliteTable(
  'image_asset',
  {
    id: text('id').primaryKey(),
    sourcePath: text('source_path').notNull(),
    storagePath: text('storage_path').notNull(),
    fileHash: text('file_hash').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    generatedByProvider: text('generated_by_provider'),
    generatedPrompt: text('generated_prompt'),
    metadataJson: text('metadata_json'),
    cloudflareImageId: text('cloudflare_image_id'),
    cloudflareBaseUrl: text('cloudflare_base_url'),
    cloudflareVariantNames: text('cloudflare_variant_names'),
    cloudflareDefaultVariant: text('cloudflare_default_variant'),
    cloudflareUploadedAt: text('cloudflare_uploaded_at'),
    createdAt: text('created_at'),
    updatedAt: text('updated_at'),
  },
  table => [
    index('ix_image_asset_cloudflare').on(table.cloudflareImageId),
    index('ix_image_asset_hash').on(table.fileHash),
  ]
);

/**
 * Image derivative table - Optimized image variants and thumbnails.
 *
 * Stores metadata for resized/optimized versions of image assets. Each derivative
 * references a parent asset and includes format, dimensions, file size, and quality.
 * Supports LQIP (Low Quality Image Placeholder) for progressive loading.
 * Note: Cloudflare Images handles variant generation, so this may be used for
 * locally generated derivatives or additional formats.
 */
export const imageDerivative = sqliteTable(
  'image_derivative',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull(),
    format: text('format').notNull(),
    width: integer('width'),
    height: integer('height'),
    fileSizeBytes: integer('file_size_bytes'),
    storagePath: text('storage_path').notNull(),
    quality: integer('quality'),
    lqip: text('lqip'),
    createdAt: text('created_at'),
  },
  table => [index('ix_image_derivative_asset').on(table.assetId)]
);

/**
 * Image link table - Junction table connecting images to content.
 *
 * Manages many-to-many relationships between image assets and content items/scenes.
 * Each link defines a role (e.g., 'portrait', 'banner', 'inline'), display style
 * (float or centered), and ordering. Supports captions and alt text for accessibility.
 * This separation allows images to be reused across multiple content items.
 */
export const imageLink = sqliteTable(
  'image_link',
  {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull(),
    contentId: text('content_id').notNull(),
    sceneId: text('scene_id'),
    zoneId: text('zone_id'), // Link images to specific zones within locations
    role: text('role').notNull(),
    sortOrder: integer('sort_order').default(0),
    caption: text('caption'),
    altText: text('alt_text'),
    displayStyle: text('display_style').default('float'), // 'float' or 'centered'
    createdAt: text('created_at'),
  },
  table => [
    // Optimize retrieval by content ordered by sort order
    index('ix_image_link_content').on(table.contentId, table.sortOrder),
    index('ix_image_link_asset').on(table.assetId),
    index('ix_image_link_scene').on(table.sceneId),
    index('ix_image_link_zone').on(table.zoneId),
  ]
);

// ============================================================================
// NEW DEDICATED ENTITY TABLES (Schema Redesign)
// ============================================================================

/**
 * Character table - Comprehensive character entity with typed fields.
 *
 * Dedicated table for character entities with structured fields for all aspects
 * of character definition: basic info, physical appearance, personality, background,
 * combat abilities, voice/speech patterns, and story integration. Replaces the
 * generic loreEntity approach with strongly-typed columns. Links to content_item
 * for detailed prose descriptions and supports YAML frontmatter ingestion.
 */
export const character = sqliteTable(
  'character',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    slug: text('slug').notNull().unique(),
    contentItemId: text('content_item_id'), // Link to prose content blocks

    // Basic Info (from YAML frontmatter)
    name: text('name').notNull(),
    aliases: text('aliases'), // JSON array
    race: text('race'),
    characterClass: text('character_class'), // 'class' is reserved
    role: text('role'), // protagonist/antagonist/supporting/minor
    status: text('status').default('alive'),
    firstAppearance: text('first_appearance'),

    // Appearance (from ## Physical Description)
    appearanceAge: text('appearance_age'),
    appearanceHeight: text('appearance_height'),
    appearanceBuild: text('appearance_build'),
    appearanceHair: text('appearance_hair'),
    appearanceEyes: text('appearance_eyes'),
    appearanceDistinguishingFeatures: text('appearance_distinguishing_features'), // JSON array
    appearanceClothing: text('appearance_clothing'),
    visualSummary: text('visual_summary'),

    // Personality
    personalityArchetype: text('personality_archetype'),
    personalityTemperament: text('personality_temperament'),
    personalityPositiveTraits: text('personality_positive_traits'), // JSON array
    personalityNegativeTraits: text('personality_negative_traits'), // JSON array
    personalityMoralAlignment: text('personality_moral_alignment'),

    // Background & Psychology
    background: text('background'),
    motivations: text('motivations'), // JSON array
    fears: text('fears'), // JSON array
    secrets: text('secrets'), // JSON array

    // Combat
    primaryWeapons: text('primary_weapons'),
    fightingStyle: text('fighting_style'),
    tacticalRole: text('tactical_role'),

    // Voice
    speechStyle: text('speech_style'),
    signaturePhrases: text('signature_phrases'), // JSON array

    // Story
    faction: text('faction'),
    occupation: text('occupation'),
    notes: text('notes'),

    // Media
    portraitImageId: text('portrait_image_id'),

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_character_workspace').on(table.workspaceId),
    index('ix_character_role').on(table.role),
    index('ix_character_status').on(table.status),
    index('ix_character_faction').on(table.faction),
    // Optimize join with content_item table
    index('ix_character_content_item').on(table.contentItemId),
  ]
);

/**
 * Location table - Comprehensive location entity with typed fields.
 *
 * Dedicated table for location/place entities with fields for type classification,
 * hierarchical relationships (parent/child locations), atmosphere, history, and
 * story significance. Supports rich location content including landmarks, personnel,
 * hazards, and accessibility information. Links to content_item for detailed
 * prose descriptions.
 */
export const location = sqliteTable(
  'location',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    slug: text('slug').notNull().unique(),
    contentItemId: text('content_item_id'), // Link to prose content blocks

    name: text('name').notNull(),
    locationType: text('location_type'), // city/town/village/building/room/region/landmark/natural
    region: text('region'),
    parentLocationId: text('parent_location_id'),

    quickDescription: text('quick_description'),
    visualSummary: text('visual_summary'),
    atmosphere: text('atmosphere'),
    history: text('history'),

    notableLandmarks: text('notable_landmarks'), // JSON array
    keyPersonnel: text('key_personnel'), // JSON array of character slugs

    // Extended fields for rich location content
    storyRole: text('story_role'), // Plot relevance, symbolic meaning - prose
    hazardsDangers: text('hazards_dangers'), // JSON array of hazards
    connections: text('connections'), // JSON array of connected location slugs/names
    accessibility: text('accessibility'), // Access restrictions, hidden paths - prose
    significanceLevel: text('significance_level'), // High/Medium/Low
    firstAppearance: text('first_appearance'), // Chapter slug reference

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_location_workspace').on(table.workspaceId),
    index('ix_location_type').on(table.locationType),
    index('ix_location_parent').on(table.parentLocationId),
    // Optimize join with content_item table
    index('ix_location_content_item').on(table.contentItemId),
  ]
);

/**
 * Location zone table - Zones within locations for spatial organization.
 *
 * Tracks zones as first-class entities within locations, enabling detailed spatial
 * organization and scene-zone associations. Zones can be hierarchical (parent_zone_id)
 * and include rich metadata for narrative function, atmosphere, and visual characteristics.
 * Zones consolidate information from location_analysis.yaml and imagery.yaml files.
 */
export const locationZone = sqliteTable(
  'location_zone',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    locationId: text('location_id').notNull(),

    slug: text('slug').notNull(),
    name: text('name').notNull(),
    zoneType: text('zone_type'), // perimeter|threshold|heart|forge|liminal|sanctuary

    locationWithin: text('location_within'),
    parentZoneId: text('parent_zone_id'), // FK to self for hierarchical zones

    physicalDescription: text('physical_description'),
    narrativeFunction: text('narrative_function'),
    emotionalRegister: text('emotional_register'),

    signatureDetails: text('signature_details'), // JSON array
    moodAffinity: text('mood_affinity'), // JSON array
    characterAssociations: text('character_associations'), // JSON array
    lightConditions: text('light_conditions'), // JSON object

    firstAppearance: text('first_appearance'), // Chapter slug where zone first appears
    storySignificance: text('story_significance'), // high|medium|low

    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_location_zone_location_slug').on(table.locationId, table.slug),
    index('ix_location_zone_type').on(table.zoneType),
    index('ix_location_zone_parent').on(table.parentZoneId),
  ]
);

/**
 * Scene-zone junction table - Tracks zone appearances in scenes.
 *
 * Many-to-many relationship between scenes and zones, recording which zones
 * appear in which scenes. The role field distinguishes between primary zones
 * (main setting), secondary zones (visible/mentioned), and mentioned zones
 * (referenced but not directly shown). Enables precise spatial tracking and
 * zone-based scene filtering.
 */
export const sceneZone = sqliteTable(
  'scene_zone',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id').notNull(),
    zoneId: text('zone_id').notNull(),
    role: text('role').notNull(), // 'primary' | 'secondary' | 'mentioned'
    createdAt: text('created_at').notNull(),
  },
  table => [
    index('ix_scene_zone_scene').on(table.sceneId),
    index('ix_scene_zone_zone').on(table.zoneId),
  ]
);

/**
 * Character relationship table - Directed relationships between characters.
 *
 * Defines typed relationships between character entities (ally, rival, mentor,
 * family, romantic, enemy, neutral). Relationships are directional with source
 * and target, allowing for asymmetric relationship dynamics. Includes optional
 * strength indicator and descriptive notes.
 */
export const characterRelationship = sqliteTable(
  'character_relationship',
  {
    id: text('id').primaryKey(),
    sourceCharacterId: text('source_character_id').notNull(),
    targetCharacterId: text('target_character_id').notNull(),
    relationshipType: text('relationship_type').notNull(), // ally/rival/mentor/student/family/romantic/enemy/neutral
    description: text('description'),
    strength: integer('strength'),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  table => [
    index('ix_char_rel_source').on(table.sourceCharacterId),
    index('ix_char_rel_target').on(table.targetCharacterId),
    index('ix_char_rel_type').on(table.relationshipType),
  ]
);

/**
 * Scene-character junction table - Tracks character appearances in scenes.
 *
 * Many-to-many relationship between scenes and characters, recording which
 * characters appear in which scenes. The role field distinguishes between
 * POV characters, major participants, minor roles, and mentions. Enables
 * character appearance tracking and scene filtering by character.
 */
export const sceneCharacter = sqliteTable(
  'scene_character',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id').notNull(),
    characterId: text('character_id').notNull(),
    role: text('role'), // 'pov', 'major', 'minor', 'mentioned'
    createdAt: text('created_at').notNull(),
  },
  table => [
    index('ix_scene_char_scene').on(table.sceneId),
    index('ix_scene_char_character').on(table.characterId),
  ]
);

/**
 * Scene tag table - Flexible tagging system for scenes.
 *
 * Allows arbitrary tags to be attached to scenes for categorization, search,
 * and filtering. Tags can represent themes, moods, plot points, or any other
 * classification useful for organizing and discovering scenes.
 */
export const sceneTag = sqliteTable(
  'scene_tag',
  {
    id: text('id').primaryKey(),
    sceneId: text('scene_id').notNull(),
    tag: text('tag').notNull(),
    createdAt: text('created_at').notNull(),
  },
  table => [index('ix_scene_tag_scene').on(table.sceneId), index('ix_scene_tag_tag').on(table.tag)]
);

// ============================================================================
// RELATIONS
// ============================================================================

/**
 * Content item relations - Defines the relationship to the default revision.
 *
 * Establishes the one-to-one relationship between a content item and its
 * currently active/published revision via the defaultRevisionId field.
 */
export const contentItemRelations = relations(contentItem, ({ one }) => ({
  defaultRevision: one(contentRevision, {
    fields: [contentItem.defaultRevisionId],
    references: [contentRevision.id],
  }),
}));

/**
 * Content revision relations - Defines parent content item and child sections.
 *
 * Establishes the many-to-one relationship back to the parent content item
 * and the one-to-many relationship to content sections within this revision.
 */
export const contentRevisionRelations = relations(contentRevision, ({ one, many }) => ({
  content: one(contentItem, {
    fields: [contentRevision.contentId],
    references: [contentItem.id],
  }),
  sections: many(contentSection),
}));

/**
 * Content section relations - Defines parent revision and child blocks.
 *
 * Establishes the many-to-one relationship back to the parent revision
 * and the one-to-many relationship to content blocks within this section.
 */
export const contentSectionRelations = relations(contentSection, ({ one, many }) => ({
  revision: one(contentRevision, {
    fields: [contentSection.revisionId],
    references: [contentRevision.id],
  }),
  blocks: many(contentBlock),
}));

/**
 * Content block relations - Defines parent section relationship.
 *
 * Establishes the many-to-one relationship back to the parent section
 * that contains this block.
 */
export const contentBlockRelations = relations(contentBlock, ({ one }) => ({
  section: one(contentSection, {
    fields: [contentBlock.sectionId],
    references: [contentSection.id],
  }),
}));

/**
 * Character relations - Defines character entity relationships and associations.
 *
 * Establishes relationships for:
 * - Link to content item (prose descriptions)
 * - Portrait image asset
 * - Outgoing and incoming character relationships
 * - Scene appearances via junction table
 */
export const characterRelations = relations(character, ({ one, many }) => ({
  contentItem: one(contentItem, {
    fields: [character.contentItemId],
    references: [contentItem.id],
  }),
  portraitImage: one(imageAsset, {
    fields: [character.portraitImageId],
    references: [imageAsset.id],
  }),
  outgoingRelationships: many(characterRelationship, { relationName: 'sourceCharacter' }),
  incomingRelationships: many(characterRelationship, { relationName: 'targetCharacter' }),
  sceneAppearances: many(sceneCharacter),
}));

/**
 * Location relations - Defines location entity relationships, hierarchy, and zones.
 *
 * Establishes relationships for:
 * - Link to content item (prose descriptions)
 * - Parent location for hierarchical organization
 * - Child locations for hierarchical organization
 * - Zones within this location
 */
export const locationRelations = relations(location, ({ one, many }) => ({
  contentItem: one(contentItem, {
    fields: [location.contentItemId],
    references: [contentItem.id],
  }),
  parentLocation: one(location, {
    fields: [location.parentLocationId],
    references: [location.id],
    relationName: 'parentChild',
  }),
  childLocations: many(location, { relationName: 'parentChild' }),
  zones: many(locationZone),
}));

/**
 * Character relationship relations - Defines source and target character links.
 *
 * Establishes bidirectional relationships between the relationship record
 * and the source/target character entities.
 */
export const characterRelationshipRelations = relations(characterRelationship, ({ one }) => ({
  sourceCharacter: one(character, {
    fields: [characterRelationship.sourceCharacterId],
    references: [character.id],
    relationName: 'sourceCharacter',
  }),
  targetCharacter: one(character, {
    fields: [characterRelationship.targetCharacterId],
    references: [character.id],
    relationName: 'targetCharacter',
  }),
}));

/**
 * Scene-character junction relations - Links junction records to scenes and characters.
 *
 * Establishes the many-to-one relationships from the junction table back to
 * the scene and character entities.
 */
export const sceneCharacterRelations = relations(sceneCharacter, ({ one }) => ({
  scene: one(scene, {
    fields: [sceneCharacter.sceneId],
    references: [scene.id],
  }),
  character: one(character, {
    fields: [sceneCharacter.characterId],
    references: [character.id],
  }),
}));

/**
 * Scene tag relations - Links tag records back to scenes.
 *
 * Establishes the many-to-one relationship from tag records back to
 * the parent scene.
 */
export const sceneTagRelations = relations(sceneTag, ({ one }) => ({
  scene: one(scene, {
    fields: [sceneTag.sceneId],
    references: [scene.id],
  }),
}));

/**
 * Scene relations - Defines scene associations with content, locations, characters, and zones.
 *
 * Establishes relationships for:
 * - Parent content item (chapter)
 * - Primary location where scene takes place
 * - POV character for the scene
 * - All characters appearing in the scene
 * - All zones where the scene takes place
 * - Tags for categorization
 */
export const sceneRelations = relations(scene, ({ one, many }) => ({
  content: one(contentItem, {
    fields: [scene.contentId],
    references: [contentItem.id],
  }),
  primaryLocation: one(location, {
    fields: [scene.primaryLocationId],
    references: [location.id],
  }),
  povCharacter: one(character, {
    fields: [scene.povEntityId],
    references: [character.id],
  }),
  characters: many(sceneCharacter),
  zones: many(sceneZone),
  tags: many(sceneTag),
}));

/**
 * Location zone relations - Defines zone relationships and hierarchy.
 *
 * Establishes relationships for:
 * - Parent location that contains the zone
 * - Parent zone for hierarchical organization
 * - Child zones for hierarchical organization
 * - Scene appearances via junction table
 */
export const locationZoneRelations = relations(locationZone, ({ one, many }) => ({
  location: one(location, {
    fields: [locationZone.locationId],
    references: [location.id],
  }),
  parentZone: one(locationZone, {
    fields: [locationZone.parentZoneId],
    references: [locationZone.id],
    relationName: 'zoneHierarchy',
  }),
  childZones: many(locationZone, { relationName: 'zoneHierarchy' }),
  sceneAppearances: many(sceneZone),
}));

/**
 * Scene-zone junction relations - Links junction records to scenes and zones.
 *
 * Establishes the many-to-one relationships from the junction table back to
 * the scene and zone entities.
 */
export const sceneZoneRelations = relations(sceneZone, ({ one }) => ({
  scene: one(scene, {
    fields: [sceneZone.sceneId],
    references: [scene.id],
  }),
  zone: one(locationZone, {
    fields: [sceneZone.zoneId],
    references: [locationZone.id],
  }),
}));
