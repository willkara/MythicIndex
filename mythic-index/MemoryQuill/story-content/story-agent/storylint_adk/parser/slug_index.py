from __future__ import annotations

from dataclasses import dataclass
from typing import List

from .scene_parser import Chapter


@dataclass
class SlugIndex:
    chapter_slug: str
    characters: List[str]
    locations: List[str]
    images: List[str]


def build_slug_index(chapter: Chapter) -> SlugIndex:
    characters = set()
    locations = set()
    images = set()

    for scene in chapter.scenes:
        characters.update(scene.meta.characters)
        if scene.meta.location:
            locations.add(scene.meta.location)
        images.update(scene.meta.images)

    return SlugIndex(
        chapter_slug=chapter.slug,
        characters=sorted([c for c in characters if c]),
        locations=sorted([l for l in locations if l]),
        images=sorted([i for i in images if i]),
    )
