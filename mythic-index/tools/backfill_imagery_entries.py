import argparse
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Set

import yaml


STORY_ROOT = Path("mythic-index/MemoryQuill/story-content/characters")
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}


@dataclass
class ImageryFileSet:
	file_names: Set[str]
	referenced: Set[str]


def load_imagery_yaml(yaml_path: Path) -> Dict:
	if not yaml_path.exists():
		return {}
	with yaml_path.open("r", encoding="utf-8") as fh:
		return yaml.safe_load(fh) or {}


def collect_file_sets(character_dir: Path) -> ImageryFileSet:
	images_dir = character_dir / "images"
	if not images_dir.exists():
		return ImageryFileSet(set(), set())

	file_names = {
		f.name for f in images_dir.iterdir() if f.is_file() and f.suffix.lower() in IMAGE_EXTS
	}

	yaml_path = character_dir / "imagery.yaml"
	data = load_imagery_yaml(yaml_path)
	referenced: Set[str] = set()

	for entry in data.get("generated_images") or []:
		if not isinstance(entry, dict):
			continue
		for key in ("file_name", "file_path"):
			val = entry.get(key)
			if isinstance(val, str):
				referenced.add(Path(val).name)

	return ImageryFileSet(file_names=file_names, referenced=referenced)


def build_placeholder_entry(slug: str, filename: str) -> Dict:
	stem = Path(filename).stem
	# Keep keys ordered to match existing imagery.yaml conventions so downstream tools stay happy.
	return {
		"custom_id": f"{slug}-{stem}",
		"file_name": filename,
		"prompt_index": None,
		"generated_at": "TODO",
		"file_path": f"images/{filename}",
		"prompt_used": f"TODO: add prompt for {slug}/{filename}",
		"provider": "unknown",
		"model": "unknown",
		"size": "unknown",
		"aspect_ratio": "unknown",
		"provider_metadata": {},
	}


def backfill_character(character_dir: Path, write: bool, verbose: bool) -> List[str]:
	yaml_path = character_dir / "imagery.yaml"
	data = load_imagery_yaml(yaml_path)

	entity_type = data.get("entity_type")
	slug = data.get("slug") or character_dir.name
	if entity_type not in (None, "character"):
		return []

	file_sets = collect_file_sets(character_dir)
	missing = sorted(file_sets.file_names - file_sets.referenced)
	if not missing:
		return []

	if verbose:
		print(f"[{slug}] missing {len(missing)}: {', '.join(missing)}")

	if not write:
		return missing

	generated = data.get("generated_images") or []
	for filename in missing:
		generated.append(build_placeholder_entry(slug, filename))

	data["generated_images"] = generated
	data.setdefault("entity_type", "character")
	data.setdefault("slug", slug)

	with yaml_path.open("w", encoding="utf-8") as fh:
		yaml.safe_dump(data, fh, sort_keys=False, allow_unicode=False)

	return missing


def scan_all(write: bool, verbose: bool) -> Dict[str, List[str]]:
	results: Dict[str, List[str]] = {}
	for character_dir in sorted(STORY_ROOT.iterdir()):
		if not character_dir.is_dir():
			continue
		yaml_path = character_dir / "imagery.yaml"
		if not yaml_path.exists():
			continue
		missing = backfill_character(character_dir, write=write, verbose=verbose)
		if missing:
			results[character_dir.name] = missing
	return results


def main() -> None:
	parser = argparse.ArgumentParser(
		description=(
			"Scan character imagery.yaml files and backfill missing image entries. "
			"Defaults to dry-run; use --write to update files."
		)
	)
	parser.add_argument(
		"--write",
		action="store_true",
		help="Apply updates to imagery.yaml files.",
	)
	parser.add_argument(
		"--verbose",
		action="store_true",
		help="Print per-character details.",
	)
	args = parser.parse_args()

	results = scan_all(write=args.write, verbose=args.verbose)

	missing_total = sum(len(v) for v in results.values())
	print(f"Characters with missing entries: {len(results)}; missing images: {missing_total}")
	for slug, files in results.items():
		print(f"- {slug}: {len(files)} missing")

	if not args.write:
		print("Dry-run only. Re-run with --write to update imagery.yaml files.")


if __name__ == "__main__":
	main()
