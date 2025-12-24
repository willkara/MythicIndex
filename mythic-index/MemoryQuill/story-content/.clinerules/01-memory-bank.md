# AI_ASSISTANT.md — Unified Memory Bank & Narrative Style Guide

**READ FIRST EVERY SESSION.** This file bootstraps context for any AI coding/writing assistant (Cline, Claude Code, Gemini CLI, Copilot, etc.). It defines **what to load**, **how to work**, and **how to write** for _The Last Light Company_ project.

> **Canon Integrity:** Drafts and scratch ideas never modify canonical memory-bank files until explicitly promoted via `finalise chapter <slug>`.

---

## 0) Project Snapshot

A D\&D 5e/Forgotten Realms novelization project built as a structured Markdown repository and "memory bank." The repo tracks chapters, characters, locations, worldbuilding, and imagery while enforcing continuity and house style (mechanics → prose).

---

## 1) System Trigger Commands

**Use exact phrases to trigger workflows.**

| Command Type            | Trigger Phrase                       | AI Action                           | Scope                                             |
| ----------------------- | ------------------------------------ | ----------------------------------- | ------------------------------------------------- |
| **Context Loading**     | `slug:` token                        | Dynamic Context Loader              | Load all files related to chapter/scene slug      |
|                         | "Chapter/Ch/Scene" + number/name     | Dynamic Context Loader              | Same as slug                                      |
|                         | Character or location directory name | Dynamic Context Loader              | Load that context                                 |
| **Memory Bank Updates** | `finalise chapter <slug>`            | **Enhanced Scene Update Procedure** | Promote draft → canon; transactional log          |
|                         | `update memory bank`                 | Manual review pass                  | Review/refresh **all** memory bank files          |
| **Scratch Workflows**   | `enter scratch mode`                 | Scratch Workflow                    | Also load matching `scratch.md`                   |
|                         | `add to scratch <slug>`              | Scratch Workflow                    | Append incoming content to `scratch.md`           |
|                         | `promote scratch <slug>`             | Scratch Workflow                    | Move selected bullets from scratch → formal files |
|                         | `clean scratch <entity>`             | Scratch Workflow                    | Review unchecked bullets; keep/delete/promote     |
| **Consistency Audits**  | `run consistency audit`              | Automated audits                    | All available scripts                             |
|                         | `audit characters`                   | Character registry audit            | Names/dirs/registry sync                          |
|                         | `audit locations`                    | Location audit (future)             | Locations registry                                |
|                         | `validate memory bank`               | Full validation                     | Integrity check                                   |
|                         | `validate chapter <slug>`            | Chapter preflight validation        | Front-matter, fences, imagery.yaml, slugs         |
| **Chapter Pipeline**    | work in `chapters\scratch-ideas\`    | Scratch phase                       | Brainstorming only                                |
|                         | work in `chapters\drafts\`           | Draft phase                         | All WIP prose                                     |
|                         | content in `chapters\`               | Final phase                         | **Publish-ready only**                            |

### Canon Integrity Rule

- Memory bank files are updated **only** via `finalise chapter <slug>` after author approval.
- While drafting: read memory bank; record planned updates; never mutate canon.

---

## 2) Session Kick-off Checklist (Run in Order)

1. Open `core/00-system-philosophy.md`
2. Open `core/01-storyOverview.md`
3. Open `core/02-storyJournal.md` → skim most recent entries
4. Open `core/03-narrativePatterns.md`
5. Open `core/04-characterRegistry.md`
6. Open `core/05-worldBible.md`
7. Open `core/Gore/06-internalDynamics.md`
8. Open `core/08-travel-logistics-table.md`
9. Check `automated-fixes-log.md` for `[PENDING]`
10. Await user prompt → run **Dynamic Context Loader** or **Scratch Workflow** if triggered

---

## 3) Core Principles

1. **Read-before-write**: load the 7 core files, in order, every session.
2. **Context completeness**: any referenced slug/chapter/scene/character/location → load all linked files.
3. **Single source of truth**: reference by **slug**; never duplicate canon.
4. **Draft segregation**: _all_ new chapter writing lives in `chapters/drafts/`.
5. **Scratch discipline**: ideas → `scratch.md` until promoted.
6. **Mechanics → Prose**: never use rules jargon in narrative (see §8).

---

## 4) Directory Layout (Canonical)

```
story-memory-bank/
├─ core/
│  ├─ 00-system-philosophy.md
│  ├─ 01-storyOverview.md
│  ├─ 02-storyJournal.md
│  ├─ 03-narrativePatterns.md
│  ├─ 04-characterRegistry.md
│  ├─ 05-worldBible.md
│  ├─ 06-internalDynamics.md
│  └─ 08-travel-logistics-table.md
├─ chapters/
```

**Formatting:**

- Chapter headings end with `<!-- slug: ... -->` (e.g., `### Ch 1 – Arrival <!-- slug: ch1-arrival -->`).
- Filenames: lower‑case kebab case.

---

## 5) Dynamic Context Loader (Summary)

**Triggers:** `slug:` • "Chapter/Ch/Scene <id>" • any character/location dir name

**A. Locate/Create Heading** in `core/02-storyJournal.md` by slug/title.

- If absent: ask for `slug • title • characters • location`, then append a minimal entry.

**B. Read Metadata Lines**

- If Characters/Location missing: propose from registry; insert on approval.

**C. Load Working Context**

- Characters: open `characters/<name>/` (all except `scratch.md`); jump to headings containing slug.
- Locations: open `locations/<place>/` (all except `scratch.md`).
- Scratch mode: also open relevant `scratch.md`.
- Return a **one-paragraph session context summary**.

---

## 6) Chapter Pipeline & Scratch Workflow

### 6.1) Slug Rules (Canonical)

- Purpose: unify naming for reliable parsing and indexing.
- Chapter slug
  - Pattern: lower‑kebab, starts with chapter code
  - Regex: `^ch\d{1,2}(?:\.\d)?(?:-[a-z0-9-]+)?$`
  - Examples: `ch01-ash-and-compass`, `ch11.5-wayside-whispers`, `ch8-the-tracker-in-the-snow`
  - Directory: `chapters/<chapter_slug>/content.md`, `chapters/<chapter_slug>/imagery.yaml`
- Scene ID
  - Pattern: `scn-<chapter-number-or-decimal>-<two-digit-seq>`
  - Regex: `^scn-(\d{1,2}(?:\.\d)?)-(\d{2})$`
  - Examples: `scn-10-01`, `scn-11.5-03`
  - Sequence: strictly increasing within a chapter; no duplicates
- Entity slugs (characters, locations, events, motifs)
  - Pattern: lower‑kebab, ASCII only
  - Regex: `^[a-z0-9-]+$`
  - Examples: `thorn-heart`, `lantern-ward`, `silent-hand`, `found-family`
- Case and characters
  - Lowercase only; allowed `[a-z0-9-]`; use hyphens as separators
- Stability policy
  - Before promotion: you may renumber scenes to restore sequence.
  - After promotion: keep scene IDs stable; append new scenes with the next sequence.
  - Splits post‑promotion: assign a new next sequence; do not reuse IDs.
- Validation
  - `chapter_slug` in front‑matter must match the directory name.
  - All `<!-- SCENE-START ... -->` fences use valid `scene_id` patterns.
  - Characters/locations in fences also appear in front‑matter `key_*` arrays.
  - `imagery.yaml` entries reference existing fence `scene` IDs.

### A) Chapters (strict)

- **Scratch** → `chapters/scratch-ideas/` (outlines, snippets).
- **Drafts** → `chapters/drafts/<slug>-draft.md` (multiple versions allowed).
- **Final** → `chapters/<chapter_slug>/content.md` only via `finalise chapter <slug>`; keep `imagery.yaml` beside `content.md`.

### B) Scratch Workflow

| User Command             | Action                                                           |
| ------------------------ | ---------------------------------------------------------------- |
| `enter scratch mode`     | Load matching scratch files + normal context                     |
| `add to scratch <slug>`  | Append following content to entity scratch                       |
| `promote scratch <slug>` | Select bullets → copy/move into formal files; mark ✔ in scratch |
| `clean scratch <entity>` | Surface unchecked items; keep/delete/promote                     |

**Rules:** Never edit formal files from scratch without explicit promotion.

---

## 7) Enhanced Scene Update Procedure (only via `finalise chapter <slug>`)

**Transactional logging enabled** to avoid desync.

0. Begin log: append a `[PENDING] SCENE_UPDATE` entry for `<slug>` to `logs/promotion-ledger.md` with ISO8601 timestamp and target file list. If a `[PENDING]` entry already exists for the same slug, abort with `[ABORTED]` and reason.
1. Confirm slug.
2. Append a 1-paragraph scene summary under slug in `core/02-storyJournal.md`.
3. Run the **Chapter Formatter & Imagery Curator** pass on `chapters/<slug>/content.md` and its sibling files using the exact prompt below (copy/paste verbatim when delegating). See Slug Rules in §6.1 for allowed patterns and stability policies:

   > You are the Chapter Formatter & Imagery Curator for a fantasy novel project.
   > Your responsibility is to ensure every chapter in @/MemoryQuill/story-content/chapters/ is fully structured, synchronized, and visually enriched.
   > 
   > 1. **Front-Matter**
   > 
   >    At the top of each `content.md` file, verify or create a YAML front-matter block with the following fields:
   > 
   >    ```yaml
   >    ---
   >    title: "<Chapter Title>"
   >    chapter_number: <number or decimal>
   >    chapter_type: "regular" | "interlude" | "flashback"
   >    word_count: <integer>
   >    chapter_slug: "chXX-slug"
   >    status: "complete" | "draft" | "in-progress"
   >    pov_character: "<primary pov character slug>" | "multiple"
   >    canon_level: "canonical" | "apocryphal"
   >    key_characters: [list of character slugs appearing in chapter]
   >    key_locations: [list of location slugs appearing in chapter]
   >    timeline_anchor: "<continuity reference>"
   >    l_events: [list of event slugs]
   >    motifs: [list of thematic motifs]
   >    antagonists: [list of antagonist slugs or []]
   >    ---
   >    ```
   > 
   >    **Rules:** Keep `key_characters` and `key_locations` synchronized with every scene; if a character/location appears in any scene, make sure it is listed. Preserve existing metadata unless correction is required. Use `TBD` placeholders only when the information is genuinely unknown. On successful promotion, set `status: complete` and `canon_level: canonical`.
   > 
   > 2. **Scene Fences**
   > 
   >    Every scene must be wrapped with start/end fences:
   > 
   >    ```markdown
   >    <!-- SCENE-START id:scn-XX-YY title:"<Scene Title>"
   >         when:"YYYY-MM-DDTHH:MM:SSZ or TBD"
   >         location:"<location-slug>"
   >         characters:["<character-slug>", "<character-slug>"]
   >         tags:["event-slug", "theme-slug"]
   >         images:[]
   >    -->
   >    [prose of scene here]
   >    <!-- SCENE-END id:scn-XX-YY -->
   >    ```
   > 
   >    **Rules:**
   >    - `id` must be unique and sequential per chapter (`scn-10-01`, `scn-10-02`, …).
   >    - `title` is a short descriptive label.
   >    - `when` is a precise timestamp when known, otherwise `TBD`.
   >    - `location` uses the canonical slug.
   >    - `characters` lists every character slug present in the scene.
   >    - `tags` capture major events, motifs, or themes (1–3 items).
   >    - `images` lists imagery slugs that must exist in `imagery.yaml` for the chapter (use `[]` if none).
   >    - Do **not** modify or rephrase the prose itself.
   >    - Ensure fence metadata stays in lockstep with chapter front matter.
   > 
   > 3. **Imagery Files (`imagery.yaml`)**
   > 
   >    Each chapter keeps an `imagery.yaml` alongside `content.md` describing 1–3 key visuals per scene. Example entry:
   > 
   >    ```yaml
   >    - slug: ch10-scene-visual
   >      title: Lanterns In The Mire
   >      chapter: 10
   >      scene: scn-10-02
   >      category: ["Atmosphere", "Symbolic Imagery"]
   >      visual_description: Gray swamp gas haloing the party's swinging lanterns as mist curls around their boots.
   >      composition_notes: Eye-level framing; leading lines from the boardwalk planks; high-contrast lantern glow versus deep shadows.
   >      character_focus: thorn-heart
   >      narrative_significance: Signals the party's entry into cursed territory and foreshadows the spectral encounter.
   >      symbolic_elements: Lanterns mirroring dwindling hope; encroaching fog as looming danger.
   >      base_prompt: |
   >        Cinematic fantasy illustration of {{thorn-heart}} leading companions through a fog-soaked swamp boardwalk, lantern light cutting through mist, tension and foreboding.
   >      references:
   >        - placeholder: thorn-heart
   >          file: characters/thorn-heart/profile.md
   >          section: visual-keys
   >      generated_images: []
   >    ```
   > 
   >    **Rules:**
   >    - Reference the correct `scene` ID for each visual.
   >    - Pull `references` from characters, locations, or worldbuilding files to reinforce continuity.
   >    - Focus on moments, environments, or symbols that best sell the scene visually.
   > 
   > 4. **Constraints**
   > 
   >    - Apply edits directly to `content.md` and `imagery.yaml` (no commentary output).
   >    - Preserve all prose and metadata unless accuracy requires change.
   >    - If uncertain, surface placeholders (`TBD`) and flag for follow-up.
   > 
   > ✅ Following this workflow ensures every chapter is properly structured, scene-fenced, and supported by imagery artifacts.
4. If relationships changed → edit affected `relationships.md` files.
5. **Travel check** against `core/08-travel-logistics-table.md` (timing/routes; flag conflicts).
6. **Internal dynamics** updates per `core/06-internalDynamics.md` (topic sensitivities, evolution notes).
7. Complete log: flip `[PENDING]` → `[COMPLETE]` in `logs/promotion-ledger.md` with final file list. On failure at any step, flip to `[ABORTED]`, record `error`, and revert any new files created during this run (e.g., remove a newly created `imagery.yaml`).
8. Reply: **"Memory bank updated."**

---

### Promotion Ledger (Location & Format)

- Location: `logs/promotion-ledger.md` (create if missing).
- Lifecycle: write `PENDING` at start; flip to `COMPLETE` on success or `ABORTED` on failure (include `error`).
- Concurrency: one `PENDING` per slug at a time; new runs abort if a prior `PENDING` exists.
- Entry format (machine‑parsable YAML payload under a dated heading):

```
## 2025-10-01T12:34:56Z ch10-the-wayward-compass

```yaml
type: SCENE_UPDATE
status: PENDING
slug: ch10-the-wayward-compass
started_at: 2025-10-01T12:34:56Z
steps:
  - front_matter
  - scene_fences
  - imagery_yaml
  - relationships
  - travel_check
  - internal_dynamics
files:
  - chapters/ch10-the-wayward-compass/content.md
  - chapters/ch10-the-wayward-compass/imagery.yaml
actor: system
notes: []
files_changed: []
summary: {}
```

On failure, instead write:

```yaml
status: ABORTED
ended_at: 2025-10-01T12:35:10Z
error: <reason>
partial_changes:
  reverted: true
  details:
    - <file> removed
action_required:
  - <next step>
```

Rollback: on failure, revert any new files created in this run and restore prior canon.

## 8) Narrative Style & Mechanics Translation (D\&D → Prose)

**Prime Directive:** In prose, **describe effects, causes, and sensations**—never rules or numbers.

**Prohibited Mechanics Language (examples):** “roll initiative,” “+2 AC,” “3d6,” “spell slot,” “saving throw,” “bonus action,” etc.

**Quick Translation Patterns:**

- **Defense/AC** → _why it missed or deflected_: "blow glances off plate," "shield soaks the impact," "you weave aside by a breath."
- **Hit/Crit** → _where & why it mattered_: "finds the gap at the gorget," "perfect timing, rib‑space opens."
- **Advantage/Disadvantage** → _state/context_: "while it’s fixated on Thorne…", "poison makes your hands tremble."
- **HP/Resilience** → _stamina & luck_: "winded but steady," "vision tunneling; running on grit."
- **Saves** → _resistance or overwhelm_: "you steel your mind against the vampire’s will" / "alien memories flood you."
- **Spells** → _Weave, cost, focus_: "a shimmer of force flares and turns the arrow"; "holding the pattern hurts; pain frays the spell."
- **Resources** → _fatigue/expenditure_: "her reserves run dry; only embers remain."
- **Class Signatures** → _identity markers_: "primal fury dulls pain" (barbarian), "words slot a perfect opening" (bard), "inner ki snaps the nerve‑point" (monk), "oath‑light erupts on impact" (paladin), "shadow finds the seam" (rogue), etc.

**One‑Line Examples:**

- _Shield spell_: "A translucent plane of force blossoms; the shaft skitters harmlessly aside."
- _Sneak Attack_: "From the blind side, your dagger finds the unarmored seam."
- _Concentration check_: "The club’s impact scatters the lattice in your mind; the barrier stutters and dies."
- _Healing potion_: "Copper‑herbed warmth spreads; torn flesh puckers closed."

> Keep prose kinetic (visuals & cause/effect), grounded in sensation (sound, weight, heat, breath), and anchored to **character intent** and **stakes**.

---

## 9) Tone Lenses & Sentence Craft (Concise)

- **Dragonlance (Tactical Ensemble):** clear spatial staging; rotating limited POV; medium‑length balanced sentences; session‑break hooks.
- **Drizzt (Kinetic Immersion):** choreography; staccato fragments for action; reflective interludes for philosophy.
- **Modern/Meta (Conversational Energy):** overlapping banter; interruptions; self‑aware humor; fast compression for travel.

**Sentence/Paragraph Tactics**

- Action: shorten clauses; vary rhythm; prefer concrete verbs; chain with “as/while” sparingly.
- Reflection: lengthen, metaphorize; modulate cadence to slow time.
- Paragraph pacing: white‑space for beats; 1–2 sentence bursts to accelerate; longer blocks to decelerate.

---

## 10) Internal Dynamics & Visual Mapping (Summary)

**When 2+ characters share a scene:**

1. List who’s present + emotional state.
2. Review `core/06-internalDynamics.md` for current ties/triangles.
3. Lean into established dyads/triads (e.g., Command Dyad; Moral Triangle) and note any evolutions in §7.

**Mermaid Diagram Rules (when updating):**

- Use standardized verbs: _Trusts, Respects, Protects, Mentors, Allied With, Loves, Distrusts, Rivals, Fears, Manipulates, Hates, Opposes, Works With, Owes Debt To, Is Wary Of, Acquaintance, Mediates Between._
- Subgraphs for teams; `-->` strong positives; `-.->` complex/tension lines.
- Prefer clarity over cleverness; decompose complex labels into simple edges.

---

## 11) Travel & Logistics (Auto‑Check)

When travel/location change appears:

- Identify **from → to**, group size, mounts/method, urgency, terrain/weather.
- Cross‑check `core/08-travel-logistics-table.md` for base time + modifiers.
- Validate timeline continuity with recent journal entries.

**Messaging heuristics:** mounted courier (−25% time), ravens (regional 1–2h), caravans (schedule‑bound).

---

## 12) Audits & Maintenance (Ops)

- User: `run consistency audit` → execute scripts; report: (a) unregistered mentions, (b) dirs w/o registry, (c) registry w/o dirs; propose fixes.
- User: `audit characters` → character registry audit.
- User: `validate memory bank` → end‑to‑end integrity pass.

_(Scripts exist in `scripts/`; PowerShell and Python variants supported.)_

---

## 13) Emergency Continuity Protocol

On conflict detection:

1. Halt generation.
2. Quote conflicting passages.
3. Ask for ruling.
4. After resolution: run §7 update to normalize canon.

---

## 14) Quick Reference Banks (Compact)

### Combat & Checks (swap in details)

- **Armor miss:** _glances off plate; shield drinks the blow; sparks skid from mail._
- **Dodge miss:** _sidestep by a breath; roll under the arc; weave through wild swings._
- **Hit/Crit:** _finds the gap; perfect timing; shock up the arm; breath leaves lungs._
- **Advantage:** _from higher ground / distracted foe / pinned stance._
- **Disadvantage:** _poison shakes; darkness blinds; footing betrays._
- **Skill—Stealth:** _heel‑to‑toe, breath shallow; cloth‑muffled gear; you’re a rumor._
- **Athletics/Acrobatics:** _three points of contact; rope sways, you balance with open arms._

### Spells & Resources

- **Cantrip:** _as easy as a whisper._
- **Low tier:** _draw lightly on reserves; weave, set, release._
- **Mid tier:** _taxing pull; leaves you magically winded._
- **High tier:** _reality groans; power leaves you hollow._
- **Concentration:** _hold the pattern; pain frays the threads._

### Conditions

- **Blinded:** _world detonates into white, then void._
- **Frightened:** _terror’s cold hand closes around your heart._
- **Grappled/Restrained:** _crushing grip / vines cinch tight; motion reduced to struggle._
- **Exhaustion (rising):** _functional → faltering → staggering → barely upright → collapse looming._

### Environment & Hazards

- **Difficult terrain:** _bog sucks at boots; rubble insists on careful steps; ice threatens every footfall._
- **Heat/Cold:** _sweat flashes to vapor; breath crystallizes; skin knives in the wind._
- **Traps cues:** _soft ‘thwick’; rune‑flare; dust sift before the ceiling groans._

### Magic Items

- **+1 weapon:** _balance perfect; steel seems to seek the weak seam._
- **Bag of holding:** _arm disappears into cloth‑framed elsewhere._
- **Cloak of invisibility:** _light bends; you see the floor through your own fading outline._

### Pacing Tools

- **Time skip:** _Days blur into…_ / _By the next dawn…_
- **Montage:** _The journey compresses into snapshots: \[X], \[Y], \[Z]._
- **Scene shift:** _The forest gives way to…_

### Party Dynamics

- **Protective:** _instinctively steps between and threat._
- **Rivalry:** _trading tallies mid‑fight._
- **Mentor:** _hand over hand, teaching the track’s language._
- **Comic relief:** _a bad joke that lands when morale doesn’t._

### Villain (Strahd Principle)

- Early presence; recurring non‑combat encounters; readable motive; lair reflects psyche; history discoverable.

---

## 15) Minimal Ops Cheats (Windows‑friendly)

- Summaries: `python scripts/create_summaries.py`
- Content sanity: search for `slug:` / headings / TODOs via `Select-String` or `findstr`.
- Draft hygiene: ensure **no** non‑final chapters live in `chapters/` root.

---

## 16) Templates (where to find)

- Characters → `characters/character-template/` (profile/background/relationships/development/dialogue/scenes/scratch)
- Locations → `locations/location-template/` (overview/description/history/inhabitants/scenes)

> Use auto‑create snippets when a **new** character/location appears; keep drafts under `characters/drafts/` until promoted.

---

## 17) House Style Recap (TL;DR)

- **Mechanics → Prose** always.
- **Continuity > Cleverness**: verify against registry, dynamics, journal, travel.
- **Kinetic over clinical**: strong verbs, sensory hooks, cause→effect clarity.
- **Character‑first camera**: intent, choice, consequence in frame.
- **Draft → Final discipline**: promote through commands; log every canon touch.

**Save edits to this file last so it remains the first rule read.**
