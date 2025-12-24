#!/usr/bin/env python3
"""
Link an image asset directly to content (character, location, chapter).

This script bypasses imagery.yaml and directly creates image_link records.

Usage:
  # Link to a character (profile image)
  python tools/link_image.py character maya-chen --asset <asset-id> --role profile

  # Link to a location (establishing shot)
  python tools/link_image.py location druid-grove --asset <asset-id> --role establishing

  # Link to a chapter scene
  python tools/link_image.py chapter awakening --asset <asset-id> --scene the-discovery

  # Find asset by filename pattern
  python tools/link_image.py character maya-chen --find "maya-portrait" --role gallery

  # List available assets
  python tools/link_image.py --list-assets

  # List content items
  python tools/link_image.py --list-content character

  # Dry run (show SQL without writing)
  python tools/link_image.py character maya-chen --asset <id> --role profile --dry-run
"""
from __future__ import annotations

import argparse
import sqlite3
import uuid
from pathlib import Path


def sql_literal(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    return "'" + text.replace("'", "''") + "'"


def get_connection(sqlite_path: Path) -> sqlite3.Connection:
    if not sqlite_path.exists():
        raise SystemExit(f"Database not found: {sqlite_path}")
    return sqlite3.connect(str(sqlite_path))


def list_assets(conn: sqlite3.Connection, search: str | None = None, limit: int = 50) -> None:
    """List available image assets."""
    query = """
        SELECT id, storage_path, cloudflare_image_id, cloudflare_base_url
        FROM image_asset
        ORDER BY created_at DESC
    """
    rows = conn.execute(query).fetchall()

    if search:
        search_lower = search.lower()
        rows = [r for r in rows if search_lower in (r[1] or "").lower()]

    print(f"\n{'ID':<40} {'Storage Path':<50} {'Cloudflare':<10}")
    print("=" * 100)

    for row in rows[:limit]:
        asset_id, storage_path, cf_id, cf_url = row
        has_cf = "Yes" if cf_id else "No"
        path_display = (storage_path or "")[-48:] if storage_path else "-"
        print(f"{asset_id:<40} {path_display:<50} {has_cf:<10}")

    if len(rows) > limit:
        print(f"\n... and {len(rows) - limit} more. Use --find to filter.")
    print(f"\nTotal: {len(rows)} assets")


def list_content(conn: sqlite3.Connection, kind: str | None = None) -> None:
    """List content items."""
    query = "SELECT id, kind, slug, title FROM content_item"
    if kind:
        query += f" WHERE kind = {sql_literal(kind)}"
    query += " ORDER BY kind, slug"

    rows = conn.execute(query).fetchall()

    print(f"\n{'Kind':<12} {'Slug':<40} {'Title':<40}")
    print("=" * 92)

    for content_id, k, slug, title in rows:
        title_display = (title or "")[:38]
        print(f"{k:<12} {slug:<40} {title_display:<40}")

    print(f"\nTotal: {len(rows)} items")


def list_scenes(conn: sqlite3.Connection, content_slug: str) -> None:
    """List scenes for a chapter."""
    query = """
        SELECT s.id, s.slug, s.title, s.scene_order
        FROM scene s
        JOIN content_item c ON s.content_id = c.id
        WHERE c.slug = ?
        ORDER BY s.scene_order
    """
    rows = conn.execute(query, (content_slug,)).fetchall()

    if not rows:
        print(f"\nNo scenes found for chapter '{content_slug}'")
        return

    print(f"\nScenes for '{content_slug}':")
    print(f"{'Order':<8} {'Slug':<40} {'Title':<40}")
    print("=" * 88)

    for scene_id, slug, title, order in rows:
        print(f"{order:<8} {slug:<40} {(title or '')[:38]:<40}")


def find_asset(conn: sqlite3.Connection, pattern: str) -> str | None:
    """Find an asset by filename pattern."""
    query = """
        SELECT id, storage_path
        FROM image_asset
        WHERE LOWER(storage_path) LIKE ?
        ORDER BY created_at DESC
    """
    rows = conn.execute(query, (f"%{pattern.lower()}%",)).fetchall()

    if not rows:
        print(f"No assets found matching '{pattern}'")
        return None

    if len(rows) > 1:
        print(f"Multiple assets match '{pattern}':")
        for asset_id, path in rows[:10]:
            print(f"  {asset_id}  {path}")
        print("\nPlease use --asset with a specific ID")
        return None

    return rows[0][0]


def get_content_id(conn: sqlite3.Connection, kind: str, slug: str) -> str | None:
    """Get content_item ID by kind and slug."""
    row = conn.execute(
        "SELECT id FROM content_item WHERE kind = ? AND slug = ?",
        (kind, slug)
    ).fetchone()
    return row[0] if row else None


def get_scene_id(conn: sqlite3.Connection, content_id: str, scene_slug: str) -> str | None:
    """Get scene ID by content_id and scene slug."""
    row = conn.execute(
        "SELECT id FROM scene WHERE content_id = ? AND slug = ?",
        (content_id, scene_slug)
    ).fetchone()
    return row[0] if row else None


def get_next_sort_order(conn: sqlite3.Connection, content_id: str, scene_id: str | None) -> int:
    """Get the next sort_order for this content/scene."""
    if scene_id:
        row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM image_link WHERE content_id = ? AND scene_id = ?",
            (content_id, scene_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM image_link WHERE content_id = ? AND scene_id IS NULL",
            (content_id,)
        ).fetchone()
    return row[0] if row else 0


def check_existing_link(conn: sqlite3.Connection, asset_id: str, content_id: str, scene_id: str | None) -> bool:
    """Check if a link already exists."""
    if scene_id:
        row = conn.execute(
            "SELECT 1 FROM image_link WHERE asset_id = ? AND content_id = ? AND scene_id = ?",
            (asset_id, content_id, scene_id)
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT 1 FROM image_link WHERE asset_id = ? AND content_id = ? AND scene_id IS NULL",
            (asset_id, content_id)
        ).fetchone()
    return row is not None


def create_link(
    conn: sqlite3.Connection,
    asset_id: str,
    content_id: str,
    role: str,
    scene_id: str | None = None,
    caption: str | None = None,
    alt_text: str | None = None,
    sort_order: int | None = None,
) -> str:
    """Create an image_link record and return the SQL."""
    if sort_order is None:
        sort_order = get_next_sort_order(conn, content_id, scene_id)

    link_id = str(uuid.uuid4())

    sql = (
        "INSERT INTO image_link (id, asset_id, content_id, scene_id, role, sort_order, caption, alt_text) "
        f"VALUES ({sql_literal(link_id)}, {sql_literal(asset_id)}, {sql_literal(content_id)}, "
        f"{sql_literal(scene_id)}, {sql_literal(role)}, {sql_literal(sort_order)}, "
        f"{sql_literal(caption)}, {sql_literal(alt_text)});"
    )

    return sql


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Link an image asset directly to content.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Roles by content type:
  character:  profile, gallery
  location:   hero, establishing, gallery
  chapter:    scene (requires --scene), hero, gallery

Examples:
  # Link profile image to character
  python tools/link_image.py character maya-chen --asset abc-123 --role profile

  # Link establishing shot to location
  python tools/link_image.py location druid-grove --find "grove-exterior" --role establishing

  # Link image to chapter scene
  python tools/link_image.py chapter awakening --asset abc-123 --scene the-discovery

  # List all character content
  python tools/link_image.py --list-content character

  # List scenes for a chapter
  python tools/link_image.py --list-scenes awakening

  # Search for assets by filename
  python tools/link_image.py --list-assets --find "maya"
        """
    )

    parser.add_argument("content_type", nargs="?", choices=["character", "location", "chapter"],
                        help="Content type to link to")
    parser.add_argument("content_slug", nargs="?", help="Content slug")

    parser.add_argument("--asset", "-a", help="Image asset ID")
    parser.add_argument("--find", "-f", help="Find asset by filename pattern")
    parser.add_argument("--role", "-r", default="gallery",
                        help="Image role (profile, gallery, hero, establishing, scene)")
    parser.add_argument("--scene", "-s", help="Scene slug (for chapter images)")
    parser.add_argument("--caption", "-c", help="Image caption")
    parser.add_argument("--alt", help="Alt text for accessibility")
    parser.add_argument("--sort-order", type=int, help="Sort order (auto-calculated if omitted)")

    parser.add_argument("--list-assets", action="store_true", help="List available image assets")
    parser.add_argument("--list-content", metavar="TYPE", nargs="?", const="",
                        help="List content items (optionally filter by type)")
    parser.add_argument("--list-scenes", metavar="CHAPTER", help="List scenes for a chapter")

    parser.add_argument("--sqlite", default="../ingestion/memoryquill.db",
                        help="SQLite database path")
    parser.add_argument("--out-sql", default="frontend/import/image_link_manual.sql",
                        help="Output SQL file")
    parser.add_argument("--dry-run", action="store_true", help="Show SQL without writing")
    parser.add_argument("--apply-local", action="store_true",
                        help="Also insert into local SQLite (for testing)")

    args = parser.parse_args()

    sqlite_path = Path(args.sqlite)
    conn = get_connection(sqlite_path)

    try:
        # Handle list commands
        if args.list_assets:
            list_assets(conn, args.find)
            return 0

        if args.list_content is not None:
            kind = args.list_content if args.list_content else None
            list_content(conn, kind)
            return 0

        if args.list_scenes:
            list_scenes(conn, args.list_scenes)
            return 0

        # Require content_type and content_slug for linking
        if not args.content_type or not args.content_slug:
            parser.print_help()
            return 1

        # Resolve asset ID
        asset_id = args.asset
        if args.find:
            asset_id = find_asset(conn, args.find)
            if not asset_id:
                return 1
            print(f"Found asset: {asset_id}")

        if not asset_id:
            print("Error: --asset or --find required")
            return 1

        # Verify asset exists
        asset_row = conn.execute(
            "SELECT storage_path, cloudflare_base_url FROM image_asset WHERE id = ?",
            (asset_id,)
        ).fetchone()
        if not asset_row:
            print(f"Error: Asset not found: {asset_id}")
            return 1

        storage_path, cf_url = asset_row
        if not cf_url:
            print(f"Warning: Asset not uploaded to Cloudflare yet: {storage_path}")

        # Get content ID
        content_id = get_content_id(conn, args.content_type, args.content_slug)
        if not content_id:
            print(f"Error: Content not found: {args.content_type}/{args.content_slug}")
            return 1

        # Handle scene for chapters
        scene_id = None
        if args.scene:
            if args.content_type != "chapter":
                print("Warning: --scene only applies to chapters, ignoring")
            else:
                scene_id = get_scene_id(conn, content_id, args.scene)
                if not scene_id:
                    print(f"Error: Scene not found: {args.scene}")
                    print(f"Use --list-scenes {args.content_slug} to see available scenes")
                    return 1

        # Check for existing link
        if check_existing_link(conn, asset_id, content_id, scene_id):
            print(f"Warning: Link already exists for this asset/content/scene combination")
            print("Continuing anyway (will create duplicate)...")

        # Determine role
        role = args.role
        if args.content_type == "chapter" and scene_id and role == "gallery":
            role = "scene"  # Default role for scene-linked images

        # Create the SQL
        sql = create_link(
            conn,
            asset_id=asset_id,
            content_id=content_id,
            role=role,
            scene_id=scene_id,
            caption=args.caption,
            alt_text=args.alt,
            sort_order=args.sort_order,
        )

        print(f"\nLinking image:")
        print(f"  Asset:   {asset_id}")
        print(f"  Path:    {storage_path}")
        print(f"  Content: {args.content_type}/{args.content_slug}")
        if scene_id:
            print(f"  Scene:   {args.scene}")
        print(f"  Role:    {role}")
        print(f"\nSQL:\n{sql}")

        if args.dry_run:
            print("\n[Dry run - no changes made]")
            return 0

        # Write SQL file
        out_path = Path(args.out_sql)
        out_path.parent.mkdir(parents=True, exist_ok=True)

        # Append to file if it exists
        mode = "a" if out_path.exists() else "w"
        with out_path.open(mode) as f:
            f.write(sql + "\n")

        print(f"\nAppended to: {out_path}")
        print(f"Apply to D1: wrangler d1 execute mythicindex-db --remote --file {out_path}")

        if args.apply_local:
            conn.execute(sql.rstrip(";"))
            conn.commit()
            print("Applied to local SQLite")

        return 0

    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
