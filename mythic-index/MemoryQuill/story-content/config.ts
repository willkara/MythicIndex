import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

// Chapter collection schema - loads from processed-content directory
const chapters = defineCollection({
  loader: glob({ pattern: "*.md", base: "processed-content/chapters" }),
  schema: z.object({
    title: z.string(),
    chapter_number: z.union([z.number(), z.string()]).transform((val) => typeof val === 'string' ? parseFloat(val) : val),
    chapter_type: z.enum(['regular', 'interlude', 'side_story', 'vignette', 'full_chapter']).default('regular'),
    word_count: z.number().optional(),
    pov_character: z.string().optional(),
    canon_level: z.enum(['canonical', 'draft', 'concept', 'enhanced', 'canonical_vignette']).default('canonical'),
    key_characters: z.array(z.string()).default([]),
    key_locations: z.array(z.string()).default([]),
    auto_linking: z
      .union([
        z.boolean(),
        z.object({
          characters: z.boolean().optional(),
          locations: z.boolean().optional(),
        }),
      ])
      .optional(),
    timeline_anchor: z.string().optional(),
    major_events: z.array(z.string()).default([]),
    motifs: z.array(z.string()).default([]),
    published_date: z.date().optional(),
    updated_date: z.date().optional(),
    reading_time: z.number().optional(), // in minutes
    scene_breaks: z.array(z.string()).optional(), // for bookmark positions
  })
});

// Character collection schema - loads from processed-content directory
const characters = defineCollection({
  loader: glob({ pattern: "*.md", base: "processed-content/characters" }),
  schema: z.object({
    name: z.string(),
    aliases: z.array(z.string()).default([]),
    race: z.string().optional(),
    class: z.string().optional(),
    role: z.enum([
      'main',
      'supporting',
      'minor',
      'background',
      'black_hawks_elite',
      'city_watch_lieutenant',
      'company_archer',
      'company_cook',
      'company_engineer',
      'company_healer',
      'company_leader',
      'company_medic',
      'company_negotiator',
      'company_quartermaster',
      'company_scout',
      'company_soldier',
      'deputy_commander',
      'former_leader',
      'former_party_member',
      'infiltration_specialist',
      'inn_patron',
      'innkeeper',
      'lords_intelligence_officer',
      'magical_engineer',
      'magical_support',
      'senior_nco',
      'siege_engineer',
      'spiritual_specialist',
      'trauma_surgeon',
      'watch_captain',
    ]),
    status: z.enum(['active', 'deceased', 'missing', 'retired']).default('active'),
    first_appearance: z.number().optional(), // chapter number
    image_path: z.string().optional(),
    short_description: z.string().optional(),
    relationships: z.array(z.object({
      character: z.string(),
      type: z.string(),
      description: z.string().optional()
    })).default([]),
    chapters_appeared: z.array(z.number()).default([]),
  })
});

// Location collection schema - loads from processed-content directory
const locations = defineCollection({
  loader: glob({ pattern: "*.md", base: "processed-content/locations" }),
  schema: z.object({
    name: z.string(),
    type: z.enum(['city', 'building', 'natural', 'military_outpost', 'dungeon', 'other']),
    region: z.string(),
    significance: z.enum(['central', 'major', 'minor', 'background']),
    atmosphere: z.string().optional(),
    first_appearance: z.number().optional(), // chapter number
    image_path: z.string().optional(),
    short_description: z.string().optional(),
    canon_level: z.enum(['canonical', 'draft', 'concept', 'enhanced', 'canonical_vignette']).default('canonical'),
    inhabitants: z.array(z.string()).default([]),
    chapters_featured: z.array(z.number()).default([]),
  })
});

// News/Updates collection for new chapter announcements
const updates = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    type: z.enum(['new_chapter', 'character_update', 'location_update', 'announcement']),
    related_content: z.array(z.string()).default([]),
    featured: z.boolean().default(false),
  })
});

export const collections = {
  chapters,
  characters,
  locations,
  updates,
};