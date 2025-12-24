#!/usr/bin/env python3
"""
Fantasyize location imagery specs (text-preserving edits).

Goal:
- Add stronger Faerûn/D&D flavor to each location's `location_visual_anchor.signature_elements`
  (dock-ward-style "practical magic infrastructure" cues).
- Soften legacy negative prompts that accidentally ban *all* fantasy (e.g. "magic effects",
  "glowing elements", "fantasy creatures"), translating them into "no overt spellcasting / no neon glow"
  while keeping the scene grounded.

This script performs line-based edits to avoid reformatting YAML.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
import re
import sys


ROOT = Path(__file__).resolve().parents[1]
LOCATIONS_DIR = ROOT / "MemoryQuill" / "story-content" / "locations"


NEGATIVE_REPLACEMENTS: list[tuple[re.Pattern[str], str]] = [
    # Note: many specs store negatives in quoted YAML strings with literal "\\n" escapes.
    # Avoid strict word-boundary matching so phrases like "\\nfantasy glow effects" still normalize.
    # Ban "all magic" -> ban only *overt spellcasting* / cheesy glow
    (re.compile(r"(?i)fantasy magic effects"), "overt spellcasting, big magical explosions"),
    (re.compile(r"(?i)fantasy magic"), "overt spellcasting, big magical explosions"),
    (re.compile(r"(?i)magic effects"), "overt spellcasting, big magical explosions"),
    (re.compile(r"(?i)magical elements"), "overt spellcasting, neon rune-glow"),
    (re.compile(r"(?i)glowing magical effects"), "neon rune-glow, excessive glow"),
    (re.compile(r"(?i)magical glowing elements"), "neon rune-glow, excessive glow"),
    (re.compile(r"(?i)glowing elements"), "neon rune-glow, excessive glow"),
    (re.compile(r"(?i)fantasy glow effects"), "neon rune-glow, excessive glow"),
    (re.compile(r"(?i)fantasy glow"), "neon rune-glow, excessive glow"),
    (re.compile(r"(?i)magic sparkles"), "sparkle shower, glittery magic"),
    (re.compile(r"(?i)supernatural elements visible"), "overt spellcasting"),
    # Keep D&D ancestries possible, ban only big monsters (term is often used to suppress all non-humans)
    (re.compile(r"(?i)fantasy creatures"), "giant monsters, dragons, demons"),
    # Avoid "crystal cave everywhere" but allow subtle enchanted lighting
    (re.compile(r"(?i)fantasy crystals"), "giant glowing crystals everywhere"),
]


FANTASY_SIGNATURE_ADDITIONS: dict[str, list[str]] = {
    "azure-pavilion": [
        "warded contract-dais with faint sigil tracery worked into marble",
        "anti-scrying lattice motifs in column capitals (subtle civic magic)",
        "everburning lantern flames that do not gutter in sea-wind",
        "a mixed Faerûn ceremonial crowd at the edges (elves, dwarves, tieflings, dragonborn)",
    ],
    "blackvein-lode": [
        "dwarven rune-lamps set into rock (steady light, no smoke)",
        "ore veins with faint arcane shimmer visible in cut faces",
        "mine lifts and winches guarded by lock-runes and anti-sabotage wards",
        "support arches carved with clan marks and safety glyphs",
    ],
    "brightstone-healers-hall": [
        "healing sigils inlaid in threshold stones and lintels (subtle, practical)",
        "ward-censers and alchemical incense that keep air clean and pain muted",
        "everwarm lantern-globes with steady golden light (not modern fixtures)",
        "patients and staff include mixed ancestries (human, elf, dwarf, tiefling)",
    ],
    "cids-workshop": [
        "safety ward-glyphs etched into bench edges and tool racks (practical magic)",
        "everbright magelight crystals hung to eliminate glare on delicate work",
    ],
    "city-watch-headquarters": [
        "glyph-locked iron gates and ward-stones at the entry",
        "message crystal board with shifting watch reports and postings",
        "truth-ward markings in an interview alcove (subtle, institutional magic)",
        "everburning braziers in storm-lantern housings along corridors",
    ],
    "dock-ward": [
        # Already hand-updated; keep mapping empty to avoid duplicate spam.
    ],
    "dock-ward-warehouse-complex": [
        "everburning ward-lanterns in bronze cages (warm amber arcane flame built for fog)",
        "customs wards and anti-tamper sigils on doors and crates (alchemical ink marks)",
        "pier-caps and bollards carved with sea-ward glyphs (harbor safety wards)",
        "mixed Dock Ward crowd in the periphery when people appear (dwarf, tiefling, dragonborn, halfling)",
    ],
    "druid-grove-healing-sanctuary": [
        "ancient standing stones with worn druidic runes (healing wards)",
        "faint fey-lights in mist pockets (subtle, not neon)",
        "living root-arches guided into paths and shelters (nature shaped by magic)",
        "unusual flora hints at leyline influence (silverleaf, luminous fungi)",
    ],
    "great-library-waterdeep": [
        "floating magelight globes and warded reading lamps in stacks",
        "animated quills and self-turning pages in quiet alcoves (subtle)",
        "anti-fire glyphwork and warded bookchains on rare tomes",
        "silence wards etched into arches (hushed air)",
    ],
    "korraths-office": [
        "fine rune-inlay along straightedges and drafting tools (precision wards)",
        "blueprint tubes sealed with faint anti-tamper sigils (family craft magic)",
        "a small scry-safe circle worked into the floor (privacy ward)",
        "everburning lamp lenses with steady warm light (no flicker)",
    ],
    "masons-guildhall": [
        "stone-shaping runes worked into chisels, mallets, and measuring rods (craft magic)",
        "guild seal wards on doors and contracts (anti-forgery)",
        "keystone arches marked with safety glyphs for load-bearing integrity (subtle, not neon)",
        "mixed craftsfolk with dwarves prominent among humans and gnomes",
    ],
    "merchants-rest-tavern": [
        "enchanted hanging sign that shifts subtly with wind and weather",
        "everwarm hearthstone and evercool cellar rune (practical comfort magic)",
        "ward-lanterns that resist smoke and spill (steady amber light)",
        "a mixed crowd (human, dwarf, halfling, tiefling) at tables and bar",
    ],
    "northern-road": [
        "weathered waystones with directional runes at intervals",
        "roadside shrine-posts with protective glyph knots",
        "old bridge beams marked with anti-troll ward sigils (practical, carved)",
        "mixed travelers on the road (dwarf merchant, elven ranger, halfling caravan)",
    ],
    "northern-sword-coast-wilderness": [
        "ancient half-buried ruins with worn runes (old empires)",
        "faint fey-lights or will-o-wisp glimmers in fog pockets (subtle)",
        "unusual flora suggests leyline influence (silverleaf, luminous fungi)",
        "standing stones marking a path that is older than the road",
    ],
    "salamander-hearth-tavern": [
        "hearthstones with faint heat-runes that keep fire steady through storms",
        "a mix of patrons beyond humans (dwarves, elves, tieflings) in the warm crowd",
    ],
    "shepherds-rest-inn": [
        "enchanted wayfinder sign (subtle glow only at dusk, not neon)",
        "warded threshold charm to keep vermin and ill-luck out",
        "a mixed traveler crowd (human, dwarf, halfling, elf) passing through",
    ],
    "silent-hand-facility": [
        "suppression wards disguised as decorative filigree (anti-mage infrastructure)",
        "arcane sensor housings worked into brass and stone (subtle, institutional)",
        "ward-stones at stream inlets (the poison delivery made magical and hidden)",
        "a faint anti-teleport lattice hinted in conservatory framing (concealed)",
    ],
    "silken-siren": [
        "glamour-warded lanterns and mirrored sconces (soft, flattering light)",
        "subtle privacy wards and hush-sigils worked into doorframes",
        "a mixed clientele in the background (human, elf, tiefling, half-orc)",
    ],
    "stonebridge": [
        "runic keystones and ward-stones set into the bridge arches (safety magic)",
        "everburning lamp-niches at intervals along the span (storm-safe light)",
        "toll plaques with guild sigils and anti-forgery marks (alchemical ink)",
    ],
    "the-spire-of-learning": [
        "floating magelight crystals spiraling up stairwells (quiet academic magic)",
        "glyph-warded doors and stair rails with rune-inlay (safety, not decoration)",
        "chalk-sigil boards and animated diagrams in study alcoves (subtle)",
    ],
    "the-wayward-compass": [
        "enchanted compass-rose sign that subtly shifts with the wind",
        "everwarm hearth and ward-lanterns that cut fog (practical travel magic)",
        "a mixed crowd of sailors and travelers (human, dwarf, halfling, tiefling)",
    ],
    "the-windborne-roost": [
        "skyship mooring rings with levitation glyphs and wind-ward runes",
        "sailcloth awnings stitched with ward patterns (storm resistance)",
        "signal beacons in crystal housings (arcane, not industrial)",
        "a mixed crew presence (air-sailors of many ancestries) in the periphery",
    ],
    "thornwood-forest": [
        "ancient trees with faintly face-like bark and rune-scars (old fey influence)",
        "motes of fey-light in deep shade (subtle, not neon)",
        "stone markers with worn druidic glyphs along game trails",
    ],
    "undershade-canyon": [
        "strange mineral veins that catch light with faint arcane iridescence",
        "wind-carved runestone pillars (old boundary markers) half-buried in scree",
        "occasional phosphorescent lichen tracing broken rune-shapes on rock",
    ],
    "westwall-watchpost": [
        "ward-beacons in rune-caged lantern housings (visible for miles)",
        "signal horns and message-rune plaques for rapid warnings",
        "arrow slits and parapets marked with protective glyphs (practical)",
        "a mixed garrison presence (humans with dwarven masons and elven scouts)",
    ],
}


@dataclass(frozen=True)
class SignatureBlock:
  key_line_index: int
  list_start_index: int
  list_end_index: int
  dash_indent: str
  quote_style: str | None  # '"' or "'" or None


def find_signature_elements_block(lines: list[str]) -> SignatureBlock | None:
  for i, line in enumerate(lines):
    if re.match(r"^\s*signature_elements:\s*$", line):
      # Find the first list item
      j = i + 1
      while j < len(lines) and (lines[j].strip() == "" or lines[j].strip().startswith("#")):
        j += 1
      if j >= len(lines):
        return None
      m = re.match(r"^(\s*)-\s+(.*)$", lines[j])
      if not m:
        return None
      dash_indent = m.group(1)
      rest = m.group(2).lstrip()
      quote_style: str | None = None
      if rest.startswith('"'):
        quote_style = '"'
      elif rest.startswith("'"):
        quote_style = "'"

      # Find contiguous list end
      k = j
      while k < len(lines):
        if re.match(r"^\s*-\s+.*$", lines[k]):
          k += 1
          continue
        if lines[k].strip() == "":
          # blank line ends list in these files (next key typically follows)
          break
        # if it's indented but not a dash, treat as end (we don't expect multi-line list items here)
        break
      return SignatureBlock(i, j, k, dash_indent, quote_style)
  return None


def format_list_item(text: str, dash_indent: str, quote_style: str | None) -> str:
  if quote_style is None:
    # Avoid YAML-breaking "key: value" patterns by quoting if a colon+space appears.
    if ": " in text:
      escaped = text.replace('"', '\\"')
      return f'{dash_indent}- "{escaped}"\n'
    return f"{dash_indent}- {text}\n"

  if quote_style == '"':
    escaped = text.replace('"', '\\"')
    return f'{dash_indent}- "{escaped}"\n'

  # Single quotes: escape by doubling
  escaped = text.replace("'", "''")
  return f"{dash_indent}- '{escaped}'\n"


def normalize_negative_prompts(text: str) -> tuple[str, bool]:
  changed = False
  out = text
  for pattern, replacement in NEGATIVE_REPLACEMENTS:
    new_out = pattern.sub(replacement, out)
    if new_out != out:
      changed = True
      out = new_out
  return out, changed


def update_file(path: Path) -> bool:
  original = path.read_text(encoding="utf-8")
  updated, neg_changed = normalize_negative_prompts(original)

  # slug comes from folder name
  slug = path.parent.name
  additions = FANTASY_SIGNATURE_ADDITIONS.get(slug)
  sig_changed = False

  if additions:
    lines = updated.splitlines(keepends=True)
    block = find_signature_elements_block(lines)
    if block:
      existing_items = set()
      for line in lines[block.list_start_index:block.list_end_index]:
        m = re.match(r"^\s*-\s+(.*)$", line.strip("\n"))
        if not m:
          continue
        existing_items.add(m.group(1).strip().strip('"').strip("'").lower())

      insert_lines: list[str] = []
      for item in additions:
        if item.lower() in existing_items:
          continue
        insert_lines.append(format_list_item(item, block.dash_indent, block.quote_style))

      if insert_lines:
        lines[block.list_end_index:block.list_end_index] = insert_lines
        updated = "".join(lines)
        sig_changed = True

  changed = (updated != original)
  if changed:
    path.write_text(updated, encoding="utf-8")
  return changed or neg_changed or sig_changed


def main() -> int:
  if not LOCATIONS_DIR.exists():
    print(f"Locations directory not found: {LOCATIONS_DIR}", file=sys.stderr)
    return 2

  imagery_files = sorted(LOCATIONS_DIR.glob("*/imagery.yaml"))
  if not imagery_files:
    print("No location imagery.yaml files found.", file=sys.stderr)
    return 1

  changed_files: list[Path] = []
  for path in imagery_files:
    try:
      if update_file(path):
        changed_files.append(path)
    except Exception as e:
      print(f"Failed to update {path}: {e}", file=sys.stderr)
      return 3

  print(f"Updated {len(changed_files)} file(s).")
  for p in changed_files:
    print(f"- {p.relative_to(ROOT)}")
  return 0


if __name__ == "__main__":
  raise SystemExit(main())
