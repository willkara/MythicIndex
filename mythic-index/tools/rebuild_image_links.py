#!/usr/bin/env python3
"""
Rebuild image_link associations from imagery.yaml files (source of truth).

This script:
- Extracts image metadata from imagery.yaml files
- Supports chapters (scenes structure), characters, and locations (zones structure)
- Infers entity_type and slug from directory path when not in YAML
- Maps scene slugs to actual scene UUIDs in the database
- Generates SQL to populate the image_link table
"""
from __future__ import annotations

import argparse
import re
import sqlite3
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class ImageryEntry:
    content_kind: str
    content_slug: str
    role: str
    sort_order: int
    storage_path: str
    scene_slug: str | None = None


def sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def find_imagery_yaml_files(story_content_root: Path) -> list[Path]:
    return sorted(story_content_root.rglob("imagery.yaml"))


_KEY_VALUE_RE = re.compile(r"^(?P<indent>\s*)(?P<key>[A-Za-z_]+)\s*:\s*(?P<value>.*)\s*$")
_LIST_ITEM_RE = re.compile(r"^(?P<indent>\s*)-\s*(?P<rest>.*)\s*$")


def _strip_quotes(value: str) -> str:
    value = value.strip()
    # Remove inline comments first (# ...)
    if '#' in value:
        value = value.split('#')[0].strip()
    if value.startswith(("'", '"')) and value.endswith(("'", '"')) and len(value) >= 2:
        return value[1:-1]
    return value


def _infer_entity_from_path(path: Path) -> tuple[str | None, str | None]:
    """
    Infer entity_type and slug from the directory structure.
    e.g., .../story-content/locations/druid-grove-healing-sanctuary/imagery.yaml
          -> entity_type="location", slug="druid-grove-healing-sanctuary"
    """
    parts = path.parts
    # Find the parent directory (entity slug) and grandparent (entity type plural)
    if len(parts) >= 2:
        entity_slug = parts[-2]  # e.g., "druid-grove-healing-sanctuary"
        type_plural = parts[-3] if len(parts) >= 3 else None  # e.g., "locations"
        # Convert plural to singular
        type_map = {
            "locations": "location",
            "characters": "character",
            "chapters": "chapter",
        }
        entity_type = type_map.get(type_plural) if type_plural else None
        return entity_type, entity_slug
    return None, None


def _find_scene_slugs(lines: list[str]) -> dict[int, str]:
    """
    Pre-scan to find scene slugs and associate them with their starting line indices.
    Returns a dict mapping scene start line index -> scene slug.
    """
    scene_slugs: dict[int, str] = {}
    in_scenes = False
    scene_list_indent: int | None = None  # Indentation level of scene list items
    current_scene_start: int | None = None

    for i, raw_line in enumerate(lines):
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue

        kv = _KEY_VALUE_RE.match(line)
        if kv:
            key = kv.group("key")
            value = _strip_quotes(kv.group("value"))

            if key == "scenes":
                in_scenes = True
                scene_list_indent = None  # Will be set on first list item
                continue
            if key == "zones" or key == "overview":
                in_scenes = False
                scene_list_indent = None
                continue
            if in_scenes and key == "slug":
                if current_scene_start is not None:
                    scene_slugs[current_scene_start] = value.strip()
                continue

        li = _LIST_ITEM_RE.match(line)
        if li and in_scenes:
            indent = len(li.group("indent"))
            # First list item sets the scene list indentation level
            if scene_list_indent is None:
                scene_list_indent = indent
            # Only count as new scene if at the scene list indent level
            if indent == scene_list_indent:
                current_scene_start = i
                rest = li.group("rest").strip()
                if rest.startswith("slug:"):
                    scene_slugs[i] = _strip_quotes(rest.split("slug:", 1)[1].strip())

    return scene_slugs


def _find_zone_slugs(lines: list[str]) -> dict[int, str]:
    """
    Pre-scan to find zone slugs and associate them with their starting line indices.
    Returns a dict mapping zone start line index -> zone slug.
    """
    zone_slugs: dict[int, str] = {}
    in_zones = False
    zone_list_indent: int | None = None  # Indentation level of zone list items
    current_zone_start: int | None = None

    for i, raw_line in enumerate(lines):
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue

        kv = _KEY_VALUE_RE.match(line)
        if kv:
            key = kv.group("key")
            value = _strip_quotes(kv.group("value"))

            if key == "zones":
                in_zones = True
                zone_list_indent = None  # Will be set on first list item
                continue
            if key == "scenes" or key == "overview":
                in_zones = False
                zone_list_indent = None
                continue
            if in_zones and key == "slug":
                if current_zone_start is not None:
                    zone_slugs[current_zone_start] = value.strip()
                continue

        li = _LIST_ITEM_RE.match(line)
        if li and in_zones:
            indent = len(li.group("indent"))
            # First list item sets the zone list indentation level
            if zone_list_indent is None:
                zone_list_indent = indent
            # Only count as new zone if at the zone list indent level
            if indent == zone_list_indent:
                current_zone_start = i
                rest = li.group("rest").strip()
                if rest.startswith("slug:"):
                    zone_slugs[i] = _strip_quotes(rest.split("slug:", 1)[1].strip())

    return zone_slugs


def parse_imagery_yaml_minimal(path: Path) -> tuple[str | None, str | None, list[ImageryEntry]]:
    """
    Minimal, dependency-free extraction from imagery.yaml.

    We extract:
      - entity_type (from YAML or inferred from path)
      - slug (from YAML or inferred from path)
      - generated_images[].file_path (top-level)
      - scenes[].slug + scenes[].generated_images[].file_path (chapter scenes)
      - zones[].generated_images[].file_path (location zones)
    """

    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()

    # Pre-scan to find all scene and zone slugs
    scene_slugs = _find_scene_slugs(lines)
    zone_slugs = _find_zone_slugs(lines)

    # Start with values inferred from path, YAML can override
    inferred_type, inferred_slug = _infer_entity_from_path(path)
    entity_type: str | None = inferred_type
    entity_slug: str | None = inferred_slug
    entries: list[ImageryEntry] = []

    current_scene_slug: str | None = None
    current_zone_slug: str | None = None
    current_images_context: str | None = None  # 'entity' | 'scene' | 'zone' | None
    current_image_role: str | None = None  # Role specified in the image entry
    entity_image_index = 0
    scene_image_index: dict[str, int] = {}
    zone_image_index: dict[str, int] = {}

    in_scenes = False
    in_zones = False
    in_overview = False
    scene_list_indent: int | None = None
    zone_list_indent: int | None = None

    for line_idx, raw_line in enumerate(lines):
        line = raw_line.rstrip()
        if not line or line.lstrip().startswith("#"):
            continue

        kv = _KEY_VALUE_RE.match(line)
        if kv:
            key = kv.group("key")
            value = _strip_quotes(kv.group("value"))
            indent_len = len(kv.group("indent"))

            if key == "entity_type" and entity_type is None:
                entity_type = value.strip().lower()
                continue

            # Top-level slug (before scenes/zones)
            if key == "slug" and entity_slug is None and not in_scenes and not in_zones and not in_overview:
                entity_slug = value.strip()
                continue

            # Handle overview section (for locations)
            if key == "overview" and indent_len == 0:
                in_overview = True
                in_scenes = False
                in_zones = False
                current_scene_slug = None
                current_zone_slug = None
                current_images_context = None
                continue

            if key == "scenes":
                in_scenes = True
                in_zones = False
                in_overview = False
                scene_list_indent = None
                current_scene_slug = None
                current_zone_slug = None
                current_images_context = None
                continue

            if key == "zones":
                in_zones = True
                in_scenes = False
                in_overview = False
                zone_list_indent = None
                current_scene_slug = None
                current_zone_slug = None
                current_images_context = None
                continue

            if key == "generated_images":
                # Decide context based on current state
                if in_scenes and current_scene_slug:
                    current_images_context = "scene"
                elif in_zones and current_zone_slug:
                    current_images_context = "zone"
                else:
                    current_images_context = "entity"
                current_image_role = None  # Reset role for new image block
                continue

            # Capture role from image entry (e.g., role: "establishing")
            if key == "role" and current_images_context:
                current_image_role = value.strip().strip('"').strip("'")
                continue

            if key == "file_path" and current_images_context in ("entity", "scene", "zone"):
                file_path = value.strip()
                if not file_path:
                    continue

                if not entity_type or not entity_slug:
                    continue

                kind = entity_type
                storage_path = file_path.replace("\\", "/")

                if current_images_context == "scene" and current_scene_slug:
                    idx = scene_image_index.get(current_scene_slug, 0)
                    scene_image_index[current_scene_slug] = idx + 1
                    entries.append(
                        ImageryEntry(
                            content_kind=kind,
                            content_slug=entity_slug,
                            role="scene",
                            sort_order=idx,
                            storage_path=storage_path,
                            scene_slug=current_scene_slug,
                        )
                    )
                elif current_images_context == "zone" and current_zone_slug:
                    idx = zone_image_index.get(current_zone_slug, 0)
                    zone_image_index[current_zone_slug] = idx + 1
                    # Use role from YAML if present, otherwise default
                    if current_image_role:
                        role = current_image_role
                    elif idx == 0:
                        role = "hero"
                    else:
                        role = "gallery"
                    entries.append(
                        ImageryEntry(
                            content_kind=kind,
                            content_slug=entity_slug,
                            role=role,
                            sort_order=entity_image_index,
                            storage_path=storage_path,
                        )
                    )
                    entity_image_index += 1
                else:
                    # Entity-level images: profile/hero first, then gallery.
                    if current_image_role:
                        role = current_image_role
                    elif kind == "character":
                        role = "profile" if entity_image_index == 0 else "gallery"
                    elif kind == "location":
                        role = "hero" if entity_image_index == 0 else "gallery"
                    elif kind == "chapter":
                        role = "hero" if entity_image_index == 0 else "gallery"
                    else:
                        role = "gallery"
                    entries.append(
                        ImageryEntry(
                            content_kind=kind,
                            content_slug=entity_slug,
                            role=role,
                            sort_order=entity_image_index,
                            storage_path=storage_path,
                        )
                    )
                    entity_image_index += 1
                current_image_role = None  # Reset after use
                continue

        li = _LIST_ITEM_RE.match(line)
        if li:
            rest = li.group("rest").strip()
            indent = len(li.group("indent"))

            # Check if this list item is a scene/zone entry (starts with slug:)
            # vs an image entry (starts with custom_id:, file_path:, etc.)
            is_scene_or_zone_entry = rest.startswith("slug:") or line_idx in scene_slugs or line_idx in zone_slugs

            if in_scenes and is_scene_or_zone_entry:
                # Set scene list indent on first list item
                if scene_list_indent is None:
                    scene_list_indent = indent
                # Only process if at scene list indent level
                if indent == scene_list_indent:
                    # New scene item - look up pre-scanned slug
                    if line_idx in scene_slugs:
                        current_scene_slug = scene_slugs[line_idx]
                    else:
                        current_scene_slug = None  # Will be set when we find it
                    current_images_context = None
                    current_image_role = None
                continue

            if in_zones and is_scene_or_zone_entry:
                # Set zone list indent on first list item
                if zone_list_indent is None:
                    zone_list_indent = indent
                # Only process if at zone list indent level
                if indent == zone_list_indent:
                    # New zone item - look up pre-scanned slug
                    if line_idx in zone_slugs:
                        current_zone_slug = zone_slugs[line_idx]
                    else:
                        current_zone_slug = None  # Will be set when we find it
                    current_images_context = None
                    current_image_role = None
                continue

        # Catch slug: within scene/zone mapping (updates if not found in pre-scan)
        if kv and kv.group("key") == "slug":
            slug_val = _strip_quotes(kv.group("value").strip())
            if in_scenes and not current_scene_slug:
                current_scene_slug = slug_val
            elif in_zones and not current_zone_slug:
                current_zone_slug = slug_val

    return entity_type, entity_slug, entries


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Rebuild image_link associations from imagery.yaml files (source of truth)."
    )
    parser.add_argument(
        "--sqlite",
        default=str(Path("..") / "ingestion" / "memoryquill.db"),
        help="Source SQLite DB (used for ID lookups).",
    )
    parser.add_argument(
        "--story-content",
        default=str(Path("MemoryQuill") / "story-content"),
        help="Story content root containing imagery.yaml files.",
    )
    parser.add_argument(
        "--out-sql",
        default=str(Path("frontend") / "import" / "image_link_from_imagery.sql"),
        help="Output SQL file to apply to D1.",
    )
    parser.add_argument(
        "--wipe-first",
        action="store_true",
        help="If set, emits DELETE FROM image_link before inserts.",
    )
    parser.add_argument(
        "--transaction",
        dest="use_transaction",
        action="store_true",
        default=False,
        help="Wrap output in BEGIN/COMMIT (off by default; Wrangler/D1 rejects explicit transactions).",
    )
    parser.add_argument(
        "--no-transaction",
        dest="use_transaction",
        action="store_false",
        help="Alias for the default behavior (no explicit BEGIN/COMMIT).",
    )
    parser.add_argument(
        "--report",
        default=str(Path("frontend") / "import" / "image_link_rebuild_report.txt"),
        help="Write a small report of missing mappings.",
    )

    args = parser.parse_args()
    sqlite_path = Path(args.sqlite)
    story_root = Path(args.story_content)
    out_path = Path(args.out_sql)
    report_path = Path(args.report)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)

    if not sqlite_path.exists() or sqlite_path.stat().st_size == 0:
        raise SystemExit(f"SQLite DB not found or empty: {sqlite_path}")
    if not story_root.exists():
        raise SystemExit(f"Story content root not found: {story_root}")

    conn = sqlite3.connect(str(sqlite_path))
    try:
        content_rows = conn.execute(
            "SELECT id, kind, slug FROM content_item"
        ).fetchall()
        content_id_by_kind_slug = {
            (str(kind).lower(), str(slug)): str(content_id)
            for (content_id, kind, slug) in content_rows
        }

        asset_rows = conn.execute("SELECT id, storage_path FROM image_asset").fetchall()
        asset_id_by_storage_path: dict[str, str] = {}
        asset_ids_by_basename: dict[str, list[str]] = {}
        for (asset_id, storage_path) in asset_rows:
            sp = str(storage_path).replace("\\", "/")
            asset_id_by_storage_path[sp] = str(asset_id)
            base = sp.split("/")[-1]
            asset_ids_by_basename.setdefault(base, []).append(str(asset_id))

        # Load scene mappings: (content_id, scene_slug) -> scene_id
        scene_rows = conn.execute(
            "SELECT id, content_id, slug FROM scene"
        ).fetchall()
        scene_id_by_content_slug: dict[tuple[str, str], str] = {}
        for (scene_id, content_id, scene_slug) in scene_rows:
            scene_id_by_content_slug[(str(content_id), str(scene_slug))] = str(scene_id)
    finally:
        conn.close()

    all_entries: list[ImageryEntry] = []
    for yaml_path in find_imagery_yaml_files(story_root):
        _etype, _slug, entries = parse_imagery_yaml_minimal(yaml_path)
        all_entries.extend(entries)

    missing_content = 0
    missing_asset = 0
    missing_scene = 0
    missing_details: list[str] = []
    inserts: list[str] = []

    for entry in all_entries:
        content_id = content_id_by_kind_slug.get((entry.content_kind, entry.content_slug))
        if not content_id:
            missing_content += 1
            missing_details.append(
                f"missing content_id for {entry.content_kind}/{entry.content_slug} (storage_path={entry.storage_path})"
            )
            continue
        storage_key = entry.storage_path.lstrip("./")
        asset_id = asset_id_by_storage_path.get(storage_key)
        if not asset_id:
            base = storage_key.split("/")[-1]
            candidates = asset_ids_by_basename.get(base, [])
            if len(candidates) == 1:
                asset_id = candidates[0]
        if not asset_id:
            missing_asset += 1
            missing_details.append(
                f"missing asset_id for {entry.content_kind}/{entry.content_slug} role={entry.role} scene={entry.scene_slug or '-'} storage_path={storage_key}"
            )
            continue

        # Resolve scene_slug to actual scene UUID
        scene_id: str | None = None
        if entry.scene_slug:
            scene_id = scene_id_by_content_slug.get((content_id, entry.scene_slug))
            if not scene_id:
                missing_scene += 1
                missing_details.append(
                    f"missing scene_id for {entry.content_kind}/{entry.content_slug} scene_slug={entry.scene_slug}"
                )
                # Continue anyway - we'll store NULL for scene_id

        insert_id = str(uuid.uuid4())
        inserts.append(
            "INSERT INTO image_link (id, asset_id, content_id, scene_id, role, sort_order, caption, alt_text) VALUES ("
            + ", ".join(
                [
                    sql_literal(insert_id),
                    sql_literal(asset_id),
                    sql_literal(content_id),
                    sql_literal(scene_id) if scene_id else "NULL",
                    sql_literal(entry.role),
                    sql_literal(entry.sort_order),
                    "NULL",
                    "NULL",
                ]
            )
            + ");"
        )

    with out_path.open("w", encoding="utf-8") as f:
        f.write("PRAGMA foreign_keys=ON;\n")
        if args.use_transaction:
            f.write("BEGIN;\n")
        if args.wipe_first:
            f.write("DELETE FROM image_link;\n")
        for stmt in inserts:
            f.write(stmt + "\n")
        if args.use_transaction:
            f.write("COMMIT;\n")

    with report_path.open("w", encoding="utf-8") as f:
        f.write(f"inserts={len(inserts)}\n")
        f.write(f"missing_content={missing_content}\n")
        f.write(f"missing_asset={missing_asset}\n")
        f.write(f"missing_scene={missing_scene}\n")
        for line in missing_details[:5000]:
            f.write(line + "\n")

    print(f"Wrote: {out_path} (inserts={len(inserts)}, missing_content={missing_content}, missing_asset={missing_asset}, missing_scene={missing_scene})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
