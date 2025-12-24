import argparse
import hashlib
import json
import sqlite3
import subprocess
import sys
import uuid
from pathlib import Path

# Configuration
DB_PATH = Path("mythic-index/tools/ingestion/memoryquill.db")
STORY_CONTENT_PATH = Path("mythic-index/MemoryQuill/story-content")
WRANGLER_DIR = Path("mythic-index/frontend")
DB_NAME = "mythicindex-db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS content_item (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    slug TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scene (
    id TEXT PRIMARY KEY,
    content_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    FOREIGN KEY(content_id) REFERENCES content_item(id)
);

CREATE TABLE IF NOT EXISTS image_asset (
    id TEXT PRIMARY KEY,
    source_path TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    file_hash TEXT NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    generated_by_provider TEXT,
    generated_prompt TEXT,
    metadata_json TEXT,
    cloudflare_image_id TEXT,
    cloudflare_base_url TEXT,
    cloudflare_variant_names TEXT DEFAULT '[]',
    cloudflare_default_variant TEXT,
    cloudflare_uploaded_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
"""

def init_db():
    print(f"Initializing database at {DB_PATH}...")
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(SCHEMA)
    conn.close()

def run_wrangler_query(query):
    cmd = [
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote", "--json",
        "--command", query
    ]
    print(f"Running D1 query: {query}")
    result = subprocess.run(cmd, cwd=WRANGLER_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running wrangler: {result.stderr}")
        return []
    
    try:
        # Wrangler output is a JSON list of results. 
        # For a single command, it's usually [ { "results": [...], ... } ]
        data = json.loads(result.stdout)
        if isinstance(data, list) and len(data) > 0:
            return data[0].get("results", [])
        return []
    except json.JSONDecodeError:
        print(f"Failed to parse wrangler output: {result.stdout}")
        return []

def sync_content():
    conn = sqlite3.connect(DB_PATH)
    
    # 1. Content Items
    print("Syncing Content Items from D1...")
    items = run_wrangler_query("SELECT id, kind, slug FROM content_item")
    conn.execute("DELETE FROM content_item")
    conn.executemany(
        "INSERT INTO content_item (id, kind, slug) VALUES (:id, :kind, :slug)",
        items
    )
    print(f"Synced {len(items)} content items.")

    # 2. Scenes
    print("Syncing Scenes from D1...")
    scenes = run_wrangler_query("SELECT id, content_id, slug FROM scene")
    conn.execute("DELETE FROM scene")
    conn.executemany(
        "INSERT INTO scene (id, content_id, slug) VALUES (:id, :content_id, :slug)",
        scenes
    )
    print(f"Synced {len(scenes)} scenes.")
    
    conn.commit()
    conn.close()

def hash_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()

def scan_images():
    import os
    print(f"Scanning for images in {STORY_CONTENT_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    
    image_extensions = { ".png", ".jpg", ".jpeg", ".webp", ".gif"}
    image_files = []
    
    for p in STORY_CONTENT_PATH.rglob("*"):
        if p.suffix.lower() in image_extensions:
            image_files.append(p)
            
    print(f"Found {len(image_files)} image files.")
    
    conn.execute("DELETE FROM image_asset")
    
    assets = []
    for p in image_files:
        try:
            h = hash_file(p)
            size_bytes = os.path.getsize(p)
            rel_path = p.relative_to(STORY_CONTENT_PATH).as_posix()
            
            mime_type = "image/png"
            if p.suffix.lower() in [".jpg", ".jpeg"]:
                mime_type = "image/jpeg"
            elif p.suffix.lower() == ".webp":
                mime_type = "image/webp"
                
            assets.append((
                str(uuid.uuid4()),
                rel_path, # source_path
                rel_path, # storage_path
                h,
                size_bytes,
                mime_type,
                1024, # width (dummy)
                1024  # height (dummy)
            ))
        except Exception as e:
            print(f"Error processing {p}: {e}")

    conn.executemany(
        "INSERT INTO image_asset (id, source_path, storage_path, file_hash, file_size_bytes, mime_type, width, height) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        assets
    )
    print(f"Registered {len(assets)} image assets.")
    conn.commit()
    conn.close()

if __name__ == "__main__":
    init_db()
    sync_content()
    scan_images()
    print("Database seeding complete.")
