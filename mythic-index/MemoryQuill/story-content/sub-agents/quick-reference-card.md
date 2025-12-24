# Mythic Index Narrative Assistant - Quick Reference

## 🚀 Quick Start Commands

### Starting a Writing Session
```
"I'm writing Chapter 47, Scene 3 - [brief description]"
→ Loads all context, assembles scene prep
```

### Getting Help with Prose
```
"Help me write the opening where Veyra arrives at dawn"
→ Drafts prose matching your style
```

### Checking Consistency
```
"Check Chapter 47 for continuity issues"
→ Systematic consistency review
```

### Problem Solving
```
"I'm stuck - how would Veyra react to Marcus's confession?"
→ Character-authentic options based on voice/state
```

---

## 📁 Files That Must Load Every Session

```
core/00-system-philosophy.md    # Memory as Foundation
core/01-storyOverview.md        # Story identity
core/03-narrativePatterns.md    # Voice patterns & motifs
core/04-characterRegistry.md    # Character catalog
```

**Why?** AI sessions reset. These files ARE the memory.

---

## 🔄 Content Pipeline Stages

| Stage | Location | Rules | Use When |
|-------|----------|-------|----------|
| **SCRATCH** | `chapters/scratch/` | No rules, pure experimentation | Trying ideas, unsure of approach |
| **DRAFT** | `chapters/drafts/` | Basic continuity, scene markers | Developing scenes seriously |
| **FINAL** | `chapters/{slug}/content.md` | Complete, canonical, protected | Ready to be single source of truth |

**⚠️ NEVER edit final files directly. Always go through draft stage.**

---

## 🎭 Character Voice Patterns (Quick Reference)

| Character | Voice | When Stressed | Key Words |
|-----------|-------|---------------|-----------|
| **Veyra** | Terse, practical | Drops pronouns | "Job's done" not "The job is done" |
| **Thorne** | Military precision | "Captain" address | "We hold the line" |
| **Aldwin** | Gentle questions | Soothing metaphors | "Shall we...?" |
| **Grimjaw** | Gruff affection | Clipped consonants | "Bah. City folk." |
| **Vera** | Cautious, observant | Nature metaphors | Questions that reveal |
| **Marcus** | Smooth diplomat | Strategic charm | Says much, reveals little |
| **Lyra** | Calculating, cynical | Dry wit | Blunt information delivery |

---

## 🎯 Three Core Motifs

### 1. The Eternal Lantern 🏮
- **Use:** Every 3-4 chapters, major decision points
- **Symbol:** Hope, guidance, company mission
- **Avoid:** Overuse (subtle, not neon)

### 2. Scars as Memory 🗡️
- **Use:** After trauma, intimate moments, reflection
- **Symbol:** Transformation, refusing to forget
- **Key:** Magic can't heal them (significant in D&D world)

### 3. "No One Left Behind" ⚔️
- **Use:** Major decisions, company identity, tested limits
- **Symbol:** Moral anchor, impossible promise
- **Tension:** Strength and vulnerability both

---

## 📝 Chapter Format Checklist

### YAML Frontmatter
```yaml
title: "Chapter Title"
chapter_number: 47
chapter_type: "regular"
word_count: 4500
chapter_slug: "ch47-slug"
status: "complete"
pov_character: "veyra-thornwake"
canon_level: "canonical"
key_characters: ["slug1", "slug2"]
key_locations: ["location-slug"]
timeline_anchor: "Description"
major_events: ["event-id"]
motifs: ["theme1", "theme2"]
```

### Scene Markers
```html
<!-- SCENE-START id:scn-47-03 title:"Descriptive Title"
        when:"1492-09-23T06:15:00Z"
        location:"location-slug"
        characters:["slug1","slug2"]
        tags:["tag1","tag2"]
        images:[]
-->

[Scene content]

<!-- SCENE-END id:scn-47-03 -->
```

---

## ✅ Pre-Writing Context Checklist

- [ ] Who's in this scene? (Load character profiles)
- [ ] Where does it take place? (Load location profile)
- [ ] When is this? (Timeline from previous chapter)
- [ ] What plot threads are active?
- [ ] What needs to happen?
- [ ] What constraints apply? (Injuries, knowledge states, travel times)

---

## 🎨 Prose Style Quick Rules

### Sentence Length
- **Action:** Short, punchy, one action per sentence
- **Reflection:** Longer, flowing, contemplative
- **Dialogue:** Rhythm matches emotion

### Sensory Details
- **Minimum:** 3+ senses per scene
- **Never:** Visual-only descriptions
- **Urban:** Salt, crowds, stone, noise, spices
- **Wilderness:** Pine, earth, wind, leaf litter, clean air
- **Combat:** Blood, metal, sweat, adrenaline, impact

### Show Don't Tell
- ❌ "Veyra was angry"
- ✅ "Veyra's hand drifted to her dagger"

### D&D Translation
- ❌ "Aldwin casts Cure Wounds"
- ✅ "Silver light pooled in Aldwin's palms, warmth spreading..."

---

## 🚫 Common Mistakes to Avoid

| Mistake | Fix |
|---------|-----|
| Info-dumps | Integrate through character interaction |
| Melodrama | Understate high emotions |
| Passive voice in action | Use active voice, one action per sentence |
| Modern language | Period-appropriate vocabulary |
| Filter words | Direct sensory immersion |
| Dialogue tag overuse | Action beats + "said" only |

---

## 🔍 Consistency Check Questions

Before finalizing any scene, ask:

**Timeline:**
- Does time passage make sense?
- Are timestamps accurate?

**Characters:**
- Do they sound like themselves?
- Do they know what they should know?
- Are injuries/states accurate?

**Location:**
- Does sensory detail match profile?
- Is current state consistent?

**Story:**
- Do plot threads advance logically?
- Are there continuity contradictions?
- Do slugs reference existing entities?

---

## 💡 When You're Stuck

### Character Reaction Unknown
"How would [character] react to [situation]?"
→ Get options based on personality, current state, voice patterns

### Scene Feels Flat
"Help me add sensory richness to this scene"
→ Get specific sensory details matching location/mood

### Dialogue Sounds Off
"Does this sound like [character]?"
→ Get voice analysis and corrections

### Pacing Issues
"This scene drags / rushes - how do I adjust?"
→ Get sentence structure and rhythm guidance

### Continuity Confusion
"What should [character] know at this point?"
→ Get knowledge state summary from previous chapters

---

## 📊 Session Workflow Template

1. **Start session** → Load core files (mandatory)
2. **Identify scene** → Chapter, scene ID, purpose
3. **Load context** → Characters, location, previous chapter
4. **Get scene prep** → Full context assembly
5. **Write in appropriate stage** → Scratch/Draft/Final
6. **Check consistency** → Before moving to next stage
7. **Update metadata** → Scene logs, character states
8. **Close session** → Save, note next session starting point

---

## 🎯 Three-Second Decision Tree

**Need to experiment?** → Write in `scratch/`  
**Ready to develop?** → Write in `drafts/`  
**Is it final?** → Promote to `chapters/{slug}/`  

**Character voice unclear?** → Check `core/03-narrativePatterns.md`  
**Location detail missing?** → Check `locations/{slug}/profile.md`  
**Continuity question?** → Check previous chapter  

**Scene feels wrong?** → Ask sub-agent for help  
**Character behavior questionable?** → Load character profile  
**Timeline confusing?** → Check chapter timestamps  

---

## 🏮 Remember

**Memory as Foundation** → Files are the only memory  
**Single Source of Truth** → One place for each fact  
**Content Pipeline** → Scratch → Draft → Final  
**Voice Authenticity** → Each character distinct  
**Sensory Immersion** → 3+ senses always  

---

**The Last Light Company depends on you to keep their story true.** ⚔️🏮

---

## 📞 Quick Command Reference

| Command | Result |
|---------|--------|
| "Load context for Chapter X" | Assembles all relevant context |
| "Help write [scene description]" | Drafts prose in your style |
| "Check [content] for consistency" | Systematic review |
| "How would [character] [action]?" | Character-authentic options |
| "Fix this dialogue - [character]" | Voice correction |
| "Add sensory detail to [scene]" | Enrichment suggestions |
| "Does this timeline make sense?" | Timeline validation |
| "What should [character] know?" | Knowledge state summary |

---

**Keep this handy while writing. The sub-agent is your creative partner for maintaining narrative integrity across 47 chapters.** 📚✨