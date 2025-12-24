# Character Art Direction (Master)

This file is intended to be injected into the character image-generation pipeline as a **system/master style guide**.

## Non-Negotiable Art Style

All character images must match the locations' visual language:

- **Medium**: 19th-century oil painting merged with high-fidelity fantasy concept art
- **Surface**: visible brushwork, slight impasto texture, canvas tooth
- **Palette**: muted earth tones (ochre, sienna, burnt umber, olive, slate), desaturated accents
- **Lighting**: chiaroscuro / Rembrandt lighting, motivated sources, deep rich shadows
- **Atmosphere**: volumetric haze, smoke, fog, dust motes — air has presence
- **World**: grounded D&D / Forgotten Realms vibe (fantasy is normal, not spectacle)
- **Finish**: matte, no gloss/plastic sheen (shine only if narratively motivated: metal, wet stone, lantern glass)

## Fantasy Grounding (Avoid “Just Human”)

Even when the character is human and the scene is mundane, the image must still read as **fantasy**.

Every prompt must include *at least two* “world signifiers” such as:

- Practical magic infrastructure: ward-lanterns, rune-lamps, everwarm stones, evercool cellar runes
- Wards/sigils/glyphs used as tools (harbor-safety wards, anti-tamper seals, healing threshold sigils)
- Alchemical-ink stamps, guild seals, arcane paperwork details
- Faction/guild heraldry with stylized motifs (stitched patches, engraved buckles, stamped leather)
- Mixed-ancestry “normalcy” in background figures when crowds appear (dwarf/elf/tiefling/halfling/etc.)
- Period-accurate fantasy materials: weathered leather, bronze patina, salt-stained stone, tar-darkened timber

Keep it subtle and practical — **no neon rune glow**, no “big spell VFX” unless the scene is explicitly magical.

## Prompt Assembly Rules

When generating the final image prompt:

1. Start with the style declaration (oil painting + lighting + palette + finish).
2. Use the character’s **Golden Character Description** verbatim for identity.
3. Use the scene idea for pose/action/story.
4. Add 2+ fantasy grounding signifiers (above).
5. Add a short **avoid** clause derived from the negative prompt core (below).

## Mandatory Style Tokens (use by image type)

Choose the closest type for the scene and include these tokens near the end of the prompt.

### Portrait (character focus)

classical oil painting portrait, Rembrandt lighting, expressive brushwork,
American shot, detailed face and costume texture, muted earth palette,
matte finish, 19th century realism

### Interior (indoor scene)

Dutch Golden Age interior, storytelling composition, atmospheric depth,
candlelight chiaroscuro, visible brushstrokes, warm ochre and umber,
period-accurate detail, classical oil painting

### Exterior (outdoor/establishing)

historical landscape painting, epic matte painting style, gloomy atmosphere,
volumetric fog, gritty realism, muted desaturated palette,
classical oil painting, Hudson River School influence

### Action (combat/motion)

dynamic baroque composition, dramatic diagonal lines, Caravaggio lighting,
motion blur suggestion through brushwork, visceral realism,
oil painting texture, muted blood and steel palette

## Negative Prompt Core (always enforce)

Avoid: cartoon, anime, manga, cel-shaded, plastic, glossy, 3D render, CGI,
video game screenshot, neon colors, oversaturated, clean, pristine,
modern, futuristic, airbrushed, smooth skin, perfect studio lighting,
stock photo, photoreal camera aesthetics, digital art gloss, concept art polish

## Extra Prohibitions (anti-“photo” language)

Do not use: DSLR, 35mm, bokeh, 8k, studio portrait, rim-light beauty shot, fashion editorial.

