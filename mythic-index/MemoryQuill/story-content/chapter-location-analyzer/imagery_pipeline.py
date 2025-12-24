#!/usr/bin/env python3
"""
Imagery Pipeline Orchestrator
=============================

Parallel processing pipeline for generating imagery specifications from story content.

Pipelines:
- Chapter Pipeline: content.md → moment_candidates.yaml → imagery.yaml
- Location Pipeline: overview.md + description.md + inhabitants.md → location_analysis.yaml → imagery.yaml

Usage:
    # Process all chapters
    python imagery_pipeline.py chapters --all

    # Process specific chapters
    python imagery_pipeline.py chapters --slugs ch01-ash-and-compass ch02-broken-shield

    # Process all locations
    python imagery_pipeline.py locations --all

    # Analyst stage only (for review before art direction)
    python imagery_pipeline.py chapters --all --stage analyst

    # Force reprocessing (ignore existing outputs)
    python imagery_pipeline.py chapters --all --force
"""

import asyncio
import re
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Optional

import anthropic
import typer
import yaml
from loguru import logger

# ============================================================================
# Configuration
# ============================================================================

# Default paths (relative to this script's location)
SCRIPT_DIR = Path(__file__).parent
DEFAULT_STORY_CONTENT_DIR = SCRIPT_DIR.parent


class Stage(str, Enum):
    ANALYST = "analyst"
    ART_DIRECTOR = "art-director"
    FULL = "full"


class PipelineType(str, Enum):
    CHAPTER = "chapter"
    LOCATION = "location"


@dataclass
class PipelineConfig:
    """Global pipeline configuration."""

    # Paths
    story_content_dir: Path = field(default_factory=lambda: DEFAULT_STORY_CONTENT_DIR)

    # API settings
    model: str = "claude-opus-4-5-20251101"
    max_tokens: int = 32000
    thinking_budget: int = 16000  # Token budget for extended thinking
    effort: str = "high"  # Effort level: low, medium, high (Opus 4.5 only)

    # Concurrency
    max_concurrent: int = 5

    # Retry settings
    max_retries: int = 3
    retry_base_delay: float = 1.0  # Exponential backoff base

    # Processing options
    force_reprocess: bool = False
    continue_on_error: bool = True

    @property
    def chapters_dir(self) -> Path:
        return self.story_content_dir / "chapters"

    @property
    def characters_dir(self) -> Path:
        return self.story_content_dir / "characters"

    @property
    def locations_dir(self) -> Path:
        return self.story_content_dir / "locations"


@dataclass
class ChapterContext:
    """All context needed to process a chapter."""

    slug: str
    path: Path
    content: str
    frontmatter: dict
    character_refs: list[dict] = field(default_factory=list)
    location_refs: list[dict] = field(default_factory=list)


@dataclass
class LocationContext:
    """All context needed to process a location."""

    slug: str
    path: Path
    overview: str
    description: str
    inhabitants: str
    chapter_excerpts: list[dict] = field(default_factory=list)


# ============================================================================
# Frontmatter Parsing
# ============================================================================


def parse_frontmatter(content: str) -> tuple[dict, str]:
    """
    Extract YAML frontmatter and body from markdown content.

    Returns:
        Tuple of (frontmatter_dict, body_text)
    """
    frontmatter = {}
    body = content

    # Match YAML frontmatter between --- delimiters
    pattern = r"^---\s*\n(.*?)\n---\s*\n(.*)$"
    match = re.match(pattern, content, re.DOTALL)

    if match:
        try:
            frontmatter = yaml.safe_load(match.group(1)) or {}
            body = match.group(2)
        except yaml.YAMLError as e:
            logger.warning(f"Failed to parse frontmatter: {e}")

    return frontmatter, body


# ============================================================================
# File Discovery & Loading
# ============================================================================


def discover_chapters(config: PipelineConfig) -> list[Path]:
    """Find all chapter directories with content.md files."""
    chapters = []

    for item in sorted(config.chapters_dir.iterdir()):
        # Skip non-directories and special folders
        if not item.is_dir():
            continue
        if item.name in ("drafts", "scratch", "scratch-ideas", "templates"):
            continue

        content_file = item / "content.md"
        if content_file.exists():
            chapters.append(item)

    return chapters


def discover_locations(config: PipelineConfig) -> list[Path]:
    """Find all location directories with required files."""
    locations = []

    for item in sorted(config.locations_dir.iterdir()):
        # Skip non-directories and templates
        if not item.is_dir():
            continue
        if item.name == "location-template":
            continue

        # Check for required files
        overview = item / "overview.md"
        description = item / "description.md"

        if overview.exists() and description.exists():
            locations.append(item)

    return locations


def load_chapter_context(chapter_path: Path, config: PipelineConfig) -> ChapterContext:
    """Load all context for a chapter including character references."""
    content_file = chapter_path / "content.md"
    content = content_file.read_text(encoding="utf-8")

    frontmatter, body = parse_frontmatter(content)

    # Build context
    ctx = ChapterContext(
        slug=chapter_path.name,
        path=chapter_path,
        content=content,
        frontmatter=frontmatter,
    )

    # Load character references
    key_characters = frontmatter.get("key_characters", [])
    ctx.character_refs = load_character_refs(key_characters, config)

    # Load location references
    key_locations = frontmatter.get("key_locations", [])
    ctx.location_refs = load_location_refs(key_locations, config)

    logger.debug(
        f"Loaded chapter {ctx.slug}: "
        f"{len(ctx.character_refs)} characters, "
        f"{len(ctx.location_refs)} locations"
    )

    return ctx


def load_character_refs(
    character_slugs: list[str], config: PipelineConfig
) -> list[dict]:
    """Load character reference data for a list of character slugs."""
    refs = []

    for slug in character_slugs:
        # Check published characters first, then drafts
        char_path = config.characters_dir / slug
        is_draft = False

        if not char_path.exists():
            char_path = config.characters_dir / "drafts" / slug
            is_draft = True

        if not char_path.exists():
            logger.warning(f"Character not found: {slug}")
            continue

        ref = {
            "slug": slug,
            "status": "draft" if is_draft else "published",
            "has_imagery_yaml": False,
            "profile": None,
            "imagery": None,
            "development": None,
            "relationships": None,
        }

        # Load profile.md (required)
        profile_path = char_path / "profile.md"
        if profile_path.exists():
            ref["profile"] = profile_path.read_text(encoding="utf-8")
        else:
            logger.warning(f"Character {slug} missing profile.md")
            continue

        # Load imagery.yaml (optional but preferred)
        imagery_path = char_path / "imagery.yaml"
        if imagery_path.exists():
            ref["has_imagery_yaml"] = True
            ref["imagery"] = imagery_path.read_text(encoding="utf-8")

        # Load development.md (optional)
        dev_path = char_path / "development.md"
        if dev_path.exists():
            ref["development"] = dev_path.read_text(encoding="utf-8")

        # Load relationships.md (optional)
        rel_path = char_path / "relationships.md"
        if rel_path.exists():
            ref["relationships"] = rel_path.read_text(encoding="utf-8")

        refs.append(ref)

    return refs


def load_location_refs(location_slugs: list[str], config: PipelineConfig) -> list[dict]:
    """Load location reference data for a list of location slugs."""
    refs = []

    for slug in location_slugs:
        loc_path = config.locations_dir / slug

        if not loc_path.exists():
            logger.warning(f"Location not found: {slug}")
            continue

        ref = {
            "slug": slug,
            "overview": None,
            "description": None,
        }

        # Load overview.md
        overview_path = loc_path / "overview.md"
        if overview_path.exists():
            ref["overview"] = overview_path.read_text(encoding="utf-8")

        # Load description.md
        desc_path = loc_path / "description.md"
        if desc_path.exists():
            ref["description"] = desc_path.read_text(encoding="utf-8")

        refs.append(ref)

    return refs


def load_location_context(
    location_path: Path, config: PipelineConfig
) -> LocationContext:
    """Load all context for a location."""
    ctx = LocationContext(
        slug=location_path.name,
        path=location_path,
        overview="",
        description="",
        inhabitants="",
    )

    # Load required files
    overview_path = location_path / "overview.md"
    if overview_path.exists():
        ctx.overview = overview_path.read_text(encoding="utf-8")

    description_path = location_path / "description.md"
    if description_path.exists():
        ctx.description = description_path.read_text(encoding="utf-8")

    # Load optional files
    inhabitants_path = location_path / "inhabitants.md"
    if inhabitants_path.exists():
        ctx.inhabitants = inhabitants_path.read_text(encoding="utf-8")

    logger.debug(f"Loaded location {ctx.slug}")

    return ctx


# ============================================================================
# Prompt Construction
# ============================================================================


def load_system_prompt(prompt_name: str) -> str:
    """Load a system prompt from the same directory as this script."""
    script_dir = Path(__file__).parent
    prompt_path = script_dir / f"{prompt_name}.md"

    if not prompt_path.exists():
        raise FileNotFoundError(f"Prompt file not found: {prompt_path}")

    return prompt_path.read_text(encoding="utf-8")


def build_chapter_analyst_message(ctx: ChapterContext) -> str:
    """Build the user message for the chapter analyst stage."""
    parts = [
        "# Chapter Analysis Request",
        "",
        f"## Chapter: {ctx.slug}",
        f"- Title: {ctx.frontmatter.get('title', 'Unknown')}",
        f"- Chapter Number: {ctx.frontmatter.get('chapter_number', 'Unknown')}",
        f"- POV Character: {ctx.frontmatter.get('pov_character', 'Unknown')}",
        "",
        "---",
        "",
        "## Chapter Content",
        "",
        ctx.content,
        "",
    ]

    # Add character references
    if ctx.character_refs:
        parts.extend(
            [
                "---",
                "",
                "## Character References",
                "",
            ]
        )

        for char in ctx.character_refs:
            parts.append(f"### {char['slug']} ({char['status']})")
            parts.append(f"Has canonical imagery.yaml: {char['has_imagery_yaml']}")
            parts.append("")

            if char.get("imagery"):
                parts.append("#### Canonical Visual Anchors (from imagery.yaml)")
                parts.append("```yaml")
                parts.append(char["imagery"])
                parts.append("```")
                parts.append("")

            if char.get("profile"):
                parts.append("#### Profile")
                parts.append(char["profile"])
                parts.append("")

            if char.get("development"):
                parts.append("#### Development Notes")
                parts.append(char["development"])
                parts.append("")

    # Add location references (brief context)
    if ctx.location_refs:
        parts.extend(
            [
                "---",
                "",
                "## Location References",
                "",
            ]
        )

        for loc in ctx.location_refs:
            parts.append(f"### {loc['slug']}")
            if loc.get("overview"):
                parts.append(loc["overview"])
            parts.append("")

    return "\n".join(parts)


def build_chapter_art_director_message(
    ctx: ChapterContext,
    analyst_output: str,
) -> str:
    """Build the user message for the chapter art director stage."""
    parts = [
        "# Art Direction Request",
        "",
        f"## Chapter: {ctx.slug}",
        "",
        "---",
        "",
        "## Analyst Output (moment_candidates.yaml)",
        "",
        "```yaml",
        analyst_output,
        "```",
        "",
    ]

    # Add character references for canonical visuals
    if ctx.character_refs:
        parts.extend(
            [
                "---",
                "",
                "## Character Visual References",
                "",
                "Use these canonical sources for character visuals. COPY visual_anchors, do not invent.",
                "",
            ]
        )

        for char in ctx.character_refs:
            parts.append(f"### {char['slug']}")
            parts.append(f"- Status: {char['status']}")
            parts.append(f"- Has canonical imagery.yaml: {char['has_imagery_yaml']}")
            parts.append("")

            if char.get("imagery"):
                parts.append("#### Canonical Visual Anchors (USE THESE)")
                parts.append("```yaml")
                parts.append(char["imagery"])
                parts.append("```")
            elif char.get("profile"):
                parts.append("#### Profile (extract visuals from here)")
                parts.append(char["profile"])

            parts.append("")

    return "\n".join(parts)


def build_location_analyst_message(ctx: LocationContext) -> str:
    """Build the user message for the location analyst stage."""
    parts = [
        "# Location Analysis Request",
        "",
        f"## Location: {ctx.slug}",
        "",
        "---",
        "",
        "## Overview",
        "",
        ctx.overview,
        "",
        "---",
        "",
        "## Description",
        "",
        ctx.description,
        "",
    ]

    if ctx.inhabitants:
        parts.extend(
            [
                "---",
                "",
                "## Inhabitants",
                "",
                ctx.inhabitants,
                "",
            ]
        )

    return "\n".join(parts)


def build_location_art_director_message(
    ctx: LocationContext,
    analyst_output: str,
) -> str:
    """Build the user message for the location art director stage."""
    parts = [
        "# Location Art Direction Request",
        "",
        f"## Location: {ctx.slug}",
        "",
        "---",
        "",
        "## Analyst Output (location_analysis.yaml)",
        "",
        "```yaml",
        analyst_output,
        "```",
        "",
        "---",
        "",
        "## Source Files for Canon Verification",
        "",
        "### Overview",
        ctx.overview,
        "",
        "### Description",
        ctx.description,
        "",
    ]

    return "\n".join(parts)


# ============================================================================
# API Interaction
# ============================================================================


async def call_claude_with_retry(
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    user_message: str,
    config: PipelineConfig,
    context_name: str,
) -> tuple[str, str]:
    """Make API call with exponential backoff retry using effort-based extended thinking.

    Returns:
        Tuple of (text_content, thinking_content)
    """
    last_error = None

    for attempt in range(config.max_retries):
        try:
            logger.debug(
                f"[{context_name}] API call attempt {attempt + 1}/{config.max_retries} "
                f"(model={config.model}, effort={config.effort}, thinking_budget={config.thinking_budget})"
            )

            # Use beta API with effort parameter for maximum analysis quality
            # Stream the response to show thinking in real-time
            text_content = ""
            thinking_content = ""
            current_thinking_block = ""

            async with client.beta.messages.stream(
                model=config.model,
                max_tokens=config.max_tokens,
                betas=["effort-2025-11-24"],
                system=system_prompt,
                messages=[{"role": "user", "content": user_message}],
                thinking={"type": "enabled", "budget_tokens": config.thinking_budget},
                output_config={"effort": config.effort},
            ) as stream:
                async for event in stream:
                    # Handle thinking content (stream in real-time)
                    if event.type == "content_block_start":
                        if event.content_block.type == "thinking":
                            logger.info(f"[{context_name}] 💭 Thinking...")
                            current_thinking_block = ""

                    elif event.type == "content_block_delta":
                        if event.delta.type == "thinking_delta":
                            # Stream thinking to console in real-time
                            chunk = event.delta.thinking
                            current_thinking_block += chunk
                            # Print without newline to show streaming
                            print(chunk, end="", flush=True)
                        elif event.delta.type == "text_delta":
                            text_content += event.delta.text

                    elif event.type == "content_block_stop":
                        if current_thinking_block:
                            # Thinking block finished, add newline and save
                            print()  # Newline after thinking stream
                            thinking_content += current_thinking_block + "\n\n"
                            current_thinking_block = ""

                response = await stream.get_final_message()

            # Log token usage
            logger.info(
                f"[{context_name}] API complete: "
                f"{response.usage.input_tokens} in, "
                f"{response.usage.output_tokens} out"
            )

            return text_content, thinking_content

        except anthropic.RateLimitError as e:
            last_error = e
            delay = config.retry_base_delay * (2**attempt)
            logger.warning(f"[{context_name}] Rate limited, waiting {delay:.1f}s...")
            await asyncio.sleep(delay)

        except anthropic.APIError as e:
            last_error = e
            delay = config.retry_base_delay * (2**attempt)
            logger.warning(
                f"[{context_name}] API error: {e}, retrying in {delay:.1f}s..."
            )
            await asyncio.sleep(delay)

    raise RuntimeError(f"Failed after {config.max_retries} attempts: {last_error}")


# ============================================================================
# Pipeline Stages
# ============================================================================


async def run_chapter_analyst(
    ctx: ChapterContext,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
) -> str:
    """Run Visual Story Analyst on a chapter."""
    async with semaphore:
        logger.info(f"[{ctx.slug}] 📖 Starting analyst stage")

        # Check for existing output
        output_path = ctx.path / "moment_candidates.yaml"
        if output_path.exists() and not config.force_reprocess:
            logger.info(f"[{ctx.slug}] ⏭️  Analyst output exists, skipping")
            return output_path.read_text(encoding="utf-8")

        # Load system prompt
        system_prompt = load_system_prompt("visual-story-analyst")

        # Build user message
        user_message = build_chapter_analyst_message(ctx)
        logger.debug(f"[{ctx.slug}] Analyst message: {len(user_message)} chars")

        # Call API
        result, thinking = await call_claude_with_retry(
            client,
            system_prompt,
            user_message,
            config,
            context_name=f"{ctx.slug}/analyst",
        )

        # Clean up result (remove markdown fences if present)
        result = clean_yaml_output(result)

        # Save output
        output_path.write_text(result, encoding="utf-8")
        logger.info(f"[{ctx.slug}] ✅ Analyst complete → {output_path.name}")

        # Save thinking if present
        if thinking:
            thinking_path = ctx.path / "moment_candidates.thinking.txt"
            thinking_path.write_text(thinking, encoding="utf-8")
            logger.debug(f"[{ctx.slug}] 💭 Saved thinking → {thinking_path.name}")

        return result


async def run_chapter_art_director(
    ctx: ChapterContext,
    analyst_output: str,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
) -> str:
    """Run Illustration Art Director on a chapter."""
    async with semaphore:
        logger.info(f"[{ctx.slug}] 🎨 Starting art director stage")

        # Check for existing output
        output_path = ctx.path / "imagery.yaml"
        if output_path.exists() and not config.force_reprocess:
            logger.info(f"[{ctx.slug}] ⏭️  Art director output exists, skipping")
            return output_path.read_text(encoding="utf-8")

        # Load system prompt
        system_prompt = load_system_prompt("illustration-art-director")

        # Build user message
        user_message = build_chapter_art_director_message(ctx, analyst_output)
        logger.debug(f"[{ctx.slug}] Art director message: {len(user_message)} chars")

        # Call API
        result, thinking = await call_claude_with_retry(
            client,
            system_prompt,
            user_message,
            config,
            context_name=f"{ctx.slug}/art-director",
        )

        # Clean up result
        result = clean_yaml_output(result)

        # Save output
        output_path.write_text(result, encoding="utf-8")
        logger.info(f"[{ctx.slug}] ✅ Art director complete → {output_path.name}")

        # Save thinking if present
        if thinking:
            thinking_path = ctx.path / "imagery.thinking.txt"
            thinking_path.write_text(thinking, encoding="utf-8")
            logger.debug(f"[{ctx.slug}] 💭 Saved thinking → {thinking_path.name}")

        return result


async def run_location_analyst(
    ctx: LocationContext,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
) -> str:
    """Run Location Story Analyst on a location."""
    async with semaphore:
        logger.info(f"[{ctx.slug}] 🏛️  Starting location analyst stage")

        # Check for existing output
        output_path = ctx.path / "location_analysis.yaml"
        if output_path.exists() and not config.force_reprocess:
            logger.info(f"[{ctx.slug}] ⏭️  Location analyst output exists, skipping")
            return output_path.read_text(encoding="utf-8")

        # Load system prompt
        system_prompt = load_system_prompt("location-story-analyst")

        # Build user message
        user_message = build_location_analyst_message(ctx)
        logger.debug(
            f"[{ctx.slug}] Location analyst message: {len(user_message)} chars"
        )

        # Call API
        result, thinking = await call_claude_with_retry(
            client,
            system_prompt,
            user_message,
            config,
            context_name=f"{ctx.slug}/location-analyst",
        )

        # Clean up result
        result = clean_yaml_output(result)

        # Save output
        output_path.write_text(result, encoding="utf-8")
        logger.info(f"[{ctx.slug}] ✅ Location analyst complete → {output_path.name}")

        # Save thinking if present
        if thinking:
            thinking_path = ctx.path / "location_analysis.thinking.txt"
            thinking_path.write_text(thinking, encoding="utf-8")
            logger.debug(f"[{ctx.slug}] 💭 Saved thinking → {thinking_path.name}")

        return result


async def run_location_art_director(
    ctx: LocationContext,
    analyst_output: str,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
) -> str:
    """Run Location Art Director on a location."""
    async with semaphore:
        logger.info(f"[{ctx.slug}] 🎨 Starting location art director stage")

        # Check for existing output
        output_path = ctx.path / "imagery.yaml"
        if output_path.exists() and not config.force_reprocess:
            logger.info(
                f"[{ctx.slug}] ⏭️  Location art director output exists, skipping"
            )
            return output_path.read_text(encoding="utf-8")

        # Load system prompt
        system_prompt = load_system_prompt("location-art-director")

        # Build user message
        user_message = build_location_art_director_message(ctx, analyst_output)
        logger.debug(
            f"[{ctx.slug}] Location art director message: {len(user_message)} chars"
        )

        # Call API
        result, thinking = await call_claude_with_retry(
            client,
            system_prompt,
            user_message,
            config,
            context_name=f"{ctx.slug}/location-art-director",
        )

        # Clean up result
        result = clean_yaml_output(result)

        # Save output
        output_path.write_text(result, encoding="utf-8")
        logger.info(
            f"[{ctx.slug}] ✅ Location art director complete → {output_path.name}"
        )

        # Save thinking if present
        if thinking:
            thinking_path = ctx.path / "imagery.thinking.txt"
            thinking_path.write_text(thinking, encoding="utf-8")
            logger.debug(f"[{ctx.slug}] 💭 Saved thinking → {thinking_path.name}")

        return result


def clean_yaml_output(text: str) -> str:
    """Remove markdown code fences from YAML output if present."""
    # Remove ```yaml ... ``` wrapping
    text = text.strip()

    if text.startswith("```yaml"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]

    if text.endswith("```"):
        text = text[:-3]

    return text.strip()


# ============================================================================
# Pipeline Orchestration
# ============================================================================


async def process_chapter(
    chapter_path: Path,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
    stage: Stage,
) -> dict:
    """Process a single chapter through the pipeline."""
    slug = chapter_path.name
    start_time = datetime.now()

    try:
        # Load context
        ctx = load_chapter_context(chapter_path, config)

        # Run analyst stage
        analyst_output = ""
        if stage in (Stage.ANALYST, Stage.FULL):
            analyst_output = await run_chapter_analyst(ctx, client, config, semaphore)
        elif stage == Stage.ART_DIRECTOR:
            # Load existing analyst output
            analyst_path = chapter_path / "moment_candidates.yaml"
            if not analyst_path.exists():
                raise FileNotFoundError(f"Analyst output required: {analyst_path}")
            analyst_output = analyst_path.read_text(encoding="utf-8")

        # Run art director stage
        if stage in (Stage.ART_DIRECTOR, Stage.FULL):
            await run_chapter_art_director(
                ctx, analyst_output, client, config, semaphore
            )

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"[{slug}] ✅ Pipeline complete in {duration:.1f}s")

        return {"slug": slug, "status": "success", "duration": duration}

    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"[{slug}] ❌ Pipeline failed: {e}")

        if not config.continue_on_error:
            raise

        return {"slug": slug, "status": "error", "error": str(e), "duration": duration}


async def process_location(
    location_path: Path,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
    stage: Stage,
) -> dict:
    """Process a single location through the pipeline."""
    slug = location_path.name
    start_time = datetime.now()

    try:
        # Load context
        ctx = load_location_context(location_path, config)

        # Run analyst stage
        analyst_output = ""
        if stage in (Stage.ANALYST, Stage.FULL):
            analyst_output = await run_location_analyst(ctx, client, config, semaphore)
        elif stage == Stage.ART_DIRECTOR:
            # Load existing analyst output
            analyst_path = location_path / "location_analysis.yaml"
            if not analyst_path.exists():
                raise FileNotFoundError(
                    f"Location analyst output required: {analyst_path}"
                )
            analyst_output = analyst_path.read_text(encoding="utf-8")

        # Run art director stage
        if stage in (Stage.ART_DIRECTOR, Stage.FULL):
            await run_location_art_director(
                ctx, analyst_output, client, config, semaphore
            )

        duration = (datetime.now() - start_time).total_seconds()
        logger.info(f"[{slug}] ✅ Location pipeline complete in {duration:.1f}s")

        return {"slug": slug, "status": "success", "duration": duration}

    except Exception as e:
        duration = (datetime.now() - start_time).total_seconds()
        logger.error(f"[{slug}] ❌ Location pipeline failed: {e}")

        if not config.continue_on_error:
            raise

        return {"slug": slug, "status": "error", "error": str(e), "duration": duration}


async def run_chapters_pipeline(
    chapter_paths: list[Path],
    config: PipelineConfig,
    stage: Stage,
) -> list[dict]:
    """Process multiple chapters in parallel."""
    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(config.max_concurrent)

    logger.info(
        f"🚀 Starting chapters pipeline: "
        f"{len(chapter_paths)} chapters, "
        f"{config.max_concurrent} workers, "
        f"stage={stage.value}"
    )

    tasks = [
        process_chapter(path, client, config, semaphore, stage)
        for path in chapter_paths
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to error results
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append(
                {
                    "slug": chapter_paths[i].name,
                    "status": "error",
                    "error": str(result),
                }
            )
        else:
            processed_results.append(result)

    return processed_results


async def run_locations_pipeline(
    location_paths: list[Path],
    config: PipelineConfig,
    stage: Stage,
) -> list[dict]:
    """Process multiple locations in parallel."""
    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(config.max_concurrent)

    logger.info(
        f"🚀 Starting locations pipeline: "
        f"{len(location_paths)} locations, "
        f"{config.max_concurrent} workers, "
        f"stage={stage.value}"
    )

    tasks = [
        process_location(path, client, config, semaphore, stage)
        for path in location_paths
    ]

    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to error results
    processed_results = []
    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append(
                {
                    "slug": location_paths[i].name,
                    "status": "error",
                    "error": str(result),
                }
            )
        else:
            processed_results.append(result)

    return processed_results


def print_summary(results: list[dict], pipeline_type: str):
    """Print a summary of pipeline results."""
    successes = [r for r in results if r.get("status") == "success"]
    failures = [r for r in results if r.get("status") == "error"]

    total_duration = sum(r.get("duration", 0) for r in results)

    logger.info("")
    logger.info("=" * 60)
    logger.info(f"📊 {pipeline_type.upper()} PIPELINE SUMMARY")
    logger.info("=" * 60)
    logger.info(f"✅ Successful: {len(successes)}")
    logger.info(f"❌ Failed: {len(failures)}")
    logger.info(f"⏱️  Total time: {total_duration:.1f}s")

    if successes:
        avg_duration = sum(r.get("duration", 0) for r in successes) / len(successes)
        logger.info(f"📈 Avg time per item: {avg_duration:.1f}s")

    if failures:
        logger.info("")
        logger.info("Failed items:")
        for f in failures:
            logger.error(f"  - {f['slug']}: {f.get('error', 'Unknown error')}")


# ============================================================================
# Reference Validation (Dry-Run Mode)
# ============================================================================


def validate_entity_references(
    items: list[Path], config: PipelineConfig, pipeline_type: PipelineType
) -> dict:
    """
    Validate entity references without running the full pipeline.

    Returns:
        {
            "type": "chapters|locations",
            "total_items": int,
            "items_with_refs": list[dict],  # Items that have missing refs
            "missing_characters": dict,  # {slug: [items]}
            "missing_locations": dict,   # {slug: [items]}
            "found_characters": set,
            "found_locations": set,
            "total_refs_checked": int,
            "total_refs_found": int,
        }
    """
    missing_chars = {}
    missing_locs = {}
    found_chars = set()
    found_locs = set()
    items_with_missing = []
    total_refs = 0
    total_found = 0

    for item_path in items:
        if pipeline_type == PipelineType.CHAPTER:
            ctx = load_chapter_context(item_path, config)
            char_refs = [(s, "character") for s in ctx.frontmatter.get("key_characters", [])]
            loc_refs = [(s, "location") for s in ctx.frontmatter.get("key_locations", [])]
            all_refs = char_refs + loc_refs
        else:  # LOCATION
            ctx = load_location_context(item_path, config)
            # Locations don't typically reference other locations in the same way
            all_refs = []

        item_missing = False
        item_info = {"slug": ctx.slug}

        # Track characters
        for ref_name, ref_type in all_refs:
            if ref_type == "character":
                total_refs += 1
                if any(
                    r["slug"] == ref_name for r in ctx.character_refs
                ):  # Check if loaded successfully
                    found_chars.add(ref_name)
                    total_found += 1
                else:
                    if ref_name not in missing_chars:
                        missing_chars[ref_name] = []
                    missing_chars[ref_name].append(ctx.slug)
                    item_missing = True

            elif ref_type == "location":
                total_refs += 1
                if any(r["slug"] == ref_name for r in ctx.location_refs):
                    found_locs.add(ref_name)
                    total_found += 1
                else:
                    if ref_name not in missing_locs:
                        missing_locs[ref_name] = []
                    missing_locs[ref_name].append(ctx.slug)
                    item_missing = True

        if item_missing:
            items_with_missing.append(item_info)

    return {
        "type": pipeline_type.value,
        "total_items": len(items),
        "items_with_missing": items_with_missing,
        "missing_characters": missing_chars,
        "missing_locations": missing_locs,
        "found_characters": found_chars,
        "found_locations": found_locs,
        "total_refs_checked": total_refs,
        "total_refs_found": total_found,
    }


def print_validation_report(results: dict):
    """Print a formatted validation report."""
    logger.info("")
    logger.info("=" * 70)
    logger.info("✅ ENTITY REFERENCE VALIDATION REPORT")
    logger.info("=" * 70)

    pipeline_type = results["type"]
    total_items = results["total_items"]
    missing_chars = results["missing_characters"]
    missing_locs = results["missing_locations"]
    total_refs = results["total_refs_checked"]
    total_found = results["total_refs_found"]
    items_with_missing = results["items_with_missing"]

    logger.info(f"📚 Processed: {total_items} {pipeline_type}")

    if total_refs > 0:
        pct_found = (total_found / total_refs) * 100
        logger.info(f"\n📊 Reference Resolution:")
        logger.info(f"   Total references checked: {total_refs}")
        logger.info(f"   Successfully resolved:   {total_found} ({pct_found:.1f}%)")
        logger.info(f"   Missing/Invalid:         {total_refs - total_found} ({100-pct_found:.1f}%)")

    if missing_chars:
        logger.warning(f"\n❌ MISSING CHARACTERS ({len(missing_chars)}):")
        for char_slug in sorted(missing_chars.keys()):
            chapters_list = ", ".join(missing_chars[char_slug][:2])
            if len(missing_chars[char_slug]) > 2:
                chapters_list += f", +{len(missing_chars[char_slug]) - 2} more"
            logger.warning(f"   {char_slug:<40} → {chapters_list}")

    if missing_locs:
        logger.warning(f"\n❌ MISSING LOCATIONS ({len(missing_locs)}):")
        for loc_slug in sorted(missing_locs.keys()):
            chapters_list = ", ".join(missing_locs[loc_slug][:2])
            if len(missing_locs[loc_slug]) > 2:
                chapters_list += f", +{len(missing_locs[loc_slug]) - 2} more"
            logger.warning(f"   {loc_slug:<40} → {chapters_list}")

    logger.info("")
    logger.info("=" * 70)

    if missing_chars or missing_locs:
        total_missing = len(missing_chars) + len(missing_locs)
        logger.warning(
            f"⚠️  Found {total_missing} missing entity references. "
            "See missing-entity-mappings.md for details."
        )
        return False
    else:
        logger.info("✅ All entity references resolved successfully!")
        return True


# ============================================================================
# CLI
# ============================================================================

app = typer.Typer(
    name="imagery-pipeline",
    help="Parallel imagery generation pipeline for story content",
)


def configure_logging(verbose: bool):
    """Configure loguru logging."""
    logger.remove()  # Remove default handler

    if verbose:
        logger.add(
            lambda msg: typer.echo(msg, nl=False),
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
            level="DEBUG",
            colorize=True,
        )
    else:
        logger.add(
            lambda msg: typer.echo(msg, nl=False),
            format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | {message}",
            level="INFO",
            colorize=True,
        )


@app.command()
def chapters(
    all_chapters: bool = typer.Option(False, "--all", help="Process all chapters"),
    slugs: Optional[list[str]] = typer.Option(
        None, "--slugs", help="Specific chapter slugs"
    ),
    stage: Stage = typer.Option(Stage.FULL, "--stage", help="Pipeline stage to run"),
    workers: int = typer.Option(5, "--workers", "-w", help="Max concurrent workers"),
    force: bool = typer.Option(False, "--force", "-f", help="Force reprocessing"),
    validate_refs_only: bool = typer.Option(
        False, "--validate-refs-only", help="Validate entity references without running pipeline"
    ),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
    thinking_budget: int = typer.Option(
        16000, "--thinking-budget", "-t", help="Token budget for extended thinking"
    ),
    effort: str = typer.Option(
        "high", "--effort", "-e", help="Effort level: low, medium, high (Opus only)"
    ),
    story_content: Path = typer.Option(
        DEFAULT_STORY_CONTENT_DIR, "--story-content", help="Story content directory"
    ),
):
    """Process chapters through the imagery pipeline."""
    configure_logging(verbose)

    config = PipelineConfig(
        story_content_dir=story_content,
        max_concurrent=workers,
        force_reprocess=force,
        thinking_budget=thinking_budget,
        effort=effort,
    )

    # Discover or filter chapters
    all_chapter_paths = discover_chapters(config)
    logger.info(f"📚 Found {len(all_chapter_paths)} chapters in {config.chapters_dir}")

    if all_chapters:
        chapter_paths = all_chapter_paths
    elif slugs:
        chapter_paths = [
            config.chapters_dir / slug
            for slug in slugs
            if (config.chapters_dir / slug).exists()
        ]
        if len(chapter_paths) != len(slugs):
            missing = set(slugs) - {p.name for p in chapter_paths}
            logger.warning(f"Chapters not found: {missing}")
    else:
        logger.error("Specify --all or --slugs")
        raise typer.Exit(1)

    if not chapter_paths:
        logger.error("No chapters to process")
        raise typer.Exit(1)

    # Validate references only (no pipeline)
    if validate_refs_only:
        results = validate_entity_references(chapter_paths, config, PipelineType.CHAPTER)
        validation_ok = print_validation_report(results)
        raise typer.Exit(0 if validation_ok else 1)

    # Run pipeline
    results = asyncio.run(run_chapters_pipeline(chapter_paths, config, stage))

    # Print summary
    print_summary(results, "chapters")

    # Exit with error code if any failures
    if any(r.get("status") == "error" for r in results):
        raise typer.Exit(1)


@app.command()
def locations(
    all_locations: bool = typer.Option(False, "--all", help="Process all locations"),
    slugs: Optional[list[str]] = typer.Option(
        None, "--slugs", help="Specific location slugs"
    ),
    stage: Stage = typer.Option(Stage.FULL, "--stage", help="Pipeline stage to run"),
    workers: int = typer.Option(5, "--workers", "-w", help="Max concurrent workers"),
    force: bool = typer.Option(False, "--force", "-f", help="Force reprocessing"),
    validate_refs_only: bool = typer.Option(
        False, "--validate-refs-only", help="Validate entity references without running pipeline"
    ),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
    thinking_budget: int = typer.Option(
        16000, "--thinking-budget", "-t", help="Token budget for extended thinking"
    ),
    effort: str = typer.Option(
        "high", "--effort", "-e", help="Effort level: low, medium, high (Opus only)"
    ),
    story_content: Path = typer.Option(
        DEFAULT_STORY_CONTENT_DIR, "--story-content", help="Story content directory"
    ),
):
    """Process locations through the imagery pipeline."""
    configure_logging(verbose)

    config = PipelineConfig(
        story_content_dir=story_content,
        max_concurrent=workers,
        force_reprocess=force,
        thinking_budget=thinking_budget,
        effort=effort,
    )

    # Discover or filter locations
    all_location_paths = discover_locations(config)
    logger.info(
        f"🏛️  Found {len(all_location_paths)} locations in {config.locations_dir}"
    )

    if all_locations:
        location_paths = all_location_paths
    elif slugs:
        location_paths = [
            config.locations_dir / slug
            for slug in slugs
            if (config.locations_dir / slug).exists()
        ]
        if len(location_paths) != len(slugs):
            missing = set(slugs) - {p.name for p in location_paths}
            logger.warning(f"Locations not found: {missing}")
    else:
        logger.error("Specify --all or --slugs")
        raise typer.Exit(1)

    if not location_paths:
        logger.error("No locations to process")
        raise typer.Exit(1)

    # Validate references only (no pipeline)
    if validate_refs_only:
        results = validate_entity_references(location_paths, config, PipelineType.LOCATION)
        validation_ok = print_validation_report(results)
        raise typer.Exit(0 if validation_ok else 1)

    # Run pipeline
    results = asyncio.run(run_locations_pipeline(location_paths, config, stage))

    # Print summary
    print_summary(results, "locations")

    # Exit with error code if any failures
    if any(r.get("status") == "error" for r in results):
        raise typer.Exit(1)


@app.command()
def status(
    story_content: Path = typer.Option(
        DEFAULT_STORY_CONTENT_DIR, "--story-content", help="Story content directory"
    ),
):
    """Show pipeline status for all content."""
    configure_logging(verbose=False)

    config = PipelineConfig(story_content_dir=story_content)

    # Check chapters
    chapters = discover_chapters(config)
    logger.info(f"📚 Chapters: {len(chapters)}")

    chapter_stats = {"complete": 0, "analyst_only": 0, "pending": 0}
    for chapter_path in chapters:
        has_analyst = (chapter_path / "moment_candidates.yaml").exists()
        has_art = (chapter_path / "imagery.yaml").exists()

        if has_analyst and has_art:
            chapter_stats["complete"] += 1
        elif has_analyst:
            chapter_stats["analyst_only"] += 1
        else:
            chapter_stats["pending"] += 1

    logger.info(f"   ✅ Complete: {chapter_stats['complete']}")
    logger.info(f"   🔶 Analyst only: {chapter_stats['analyst_only']}")
    logger.info(f"   ⏳ Pending: {chapter_stats['pending']}")

    # Check locations
    locations_list = discover_locations(config)
    logger.info(f"🏛️  Locations: {len(locations_list)}")

    location_stats = {"complete": 0, "analyst_only": 0, "pending": 0}
    for location_path in locations_list:
        has_analyst = (location_path / "location_analysis.yaml").exists()
        has_art = (location_path / "imagery.yaml").exists()

        if has_analyst and has_art:
            location_stats["complete"] += 1
        elif has_analyst:
            location_stats["analyst_only"] += 1
        else:
            location_stats["pending"] += 1

    logger.info(f"   ✅ Complete: {location_stats['complete']}")
    logger.info(f"   🔶 Analyst only: {location_stats['analyst_only']}")
    logger.info(f"   ⏳ Pending: {location_stats['pending']}")


@app.command(name="all")
def process_all(
    stage: Stage = typer.Option(Stage.FULL, "--stage", help="Pipeline stage to run"),
    workers: int = typer.Option(5, "--workers", "-w", help="Max concurrent workers"),
    force: bool = typer.Option(False, "--force", "-f", help="Force reprocessing"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
    thinking_budget: int = typer.Option(
        16000, "--thinking-budget", "-t", help="Token budget for extended thinking"
    ),
    effort: str = typer.Option(
        "high", "--effort", "-e", help="Effort level: low, medium, high (Opus only)"
    ),
    chapters_only: bool = typer.Option(
        False, "--chapters-only", help="Only process chapters"
    ),
    locations_only: bool = typer.Option(
        False, "--locations-only", help="Only process locations"
    ),
    story_content: Path = typer.Option(
        DEFAULT_STORY_CONTENT_DIR, "--story-content", help="Story content directory"
    ),
):
    """Process ALL chapters and locations through the imagery pipeline."""
    configure_logging(verbose)

    config = PipelineConfig(
        story_content_dir=story_content,
        max_concurrent=workers,
        force_reprocess=force,
        thinking_budget=thinking_budget,
        effort=effort,
    )

    # Determine what to process
    process_chapters = not locations_only
    process_locations = not chapters_only

    # Discover content
    chapter_paths = []
    location_paths = []

    if process_chapters:
        chapter_paths = discover_chapters(config)
        logger.info(f"📚 Found {len(chapter_paths)} chapters")

    if process_locations:
        location_paths = discover_locations(config)
        logger.info(f"🏛️  Found {len(location_paths)} locations")

    total_items = len(chapter_paths) + len(location_paths)
    if total_items == 0:
        logger.error("No content found to process")
        raise typer.Exit(1)

    logger.info(f"🚀 Processing {total_items} total items with {workers} workers")

    # Run combined pipeline
    all_results = asyncio.run(
        run_combined_pipeline(chapter_paths, location_paths, config, stage)
    )

    # Split results for reporting
    chapter_results = [r for r in all_results if r.get("type") == "chapter"]
    location_results = [r for r in all_results if r.get("type") == "location"]

    # Print summaries
    if chapter_results:
        print_summary(chapter_results, "chapters")
    if location_results:
        print_summary(location_results, "locations")

    # Print combined summary
    total_success = sum(1 for r in all_results if r.get("status") == "success")
    total_failed = sum(1 for r in all_results if r.get("status") == "error")
    total_duration = sum(r.get("duration", 0) for r in all_results)

    logger.info("")
    logger.info("=" * 60)
    logger.info("📊 COMBINED PIPELINE SUMMARY")
    logger.info("=" * 60)
    logger.info(f"✅ Total successful: {total_success}/{total_items}")
    logger.info(f"❌ Total failed: {total_failed}/{total_items}")
    logger.info(f"⏱️  Total time: {total_duration:.1f}s")

    if any(r.get("status") == "error" for r in all_results):
        raise typer.Exit(1)


@app.command()
def batch(
    targets: list[str] = typer.Argument(
        ...,
        help="Targets to process. Prefix locations with 'loc:' (e.g., ch01-ash loc:dock-ward-warehouse)",
    ),
    stage: Stage = typer.Option(Stage.FULL, "--stage", help="Pipeline stage to run"),
    workers: int = typer.Option(5, "--workers", "-w", help="Max concurrent workers"),
    force: bool = typer.Option(False, "--force", "-f", help="Force reprocessing"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Verbose logging"),
    thinking_budget: int = typer.Option(
        16000, "--thinking-budget", "-t", help="Token budget for extended thinking"
    ),
    effort: str = typer.Option(
        "high", "--effort", "-e", help="Effort level: low, medium, high (Opus only)"
    ),
    story_content: Path = typer.Option(
        DEFAULT_STORY_CONTENT_DIR, "--story-content", help="Story content directory"
    ),
):
    """
    Process a mixed batch of chapters and locations.

    Prefix locations with 'loc:' to distinguish from chapters.

    Examples:

        # Mix of chapters and locations
        python imagery_pipeline.py batch ch01-ash ch02-broken loc:dock-ward-warehouse

        # Just chapters (no prefix needed)
        python imagery_pipeline.py batch ch01-ash ch02-broken ch03-flame

        # Just locations
        python imagery_pipeline.py batch loc:dock-ward loc:wayward-compass
    """
    configure_logging(verbose)

    config = PipelineConfig(
        story_content_dir=story_content,
        max_concurrent=workers,
        force_reprocess=force,
        thinking_budget=thinking_budget,
        effort=effort,
    )

    # Parse targets into chapters and locations
    chapter_paths = []
    location_paths = []

    for target in targets:
        if target.startswith("loc:"):
            # Location
            slug = target[4:]  # Remove "loc:" prefix
            loc_path = config.locations_dir / slug
            if loc_path.exists():
                location_paths.append(loc_path)
            else:
                logger.warning(f"Location not found: {slug}")
        else:
            # Chapter
            chapter_path = config.chapters_dir / target
            if chapter_path.exists():
                chapter_paths.append(chapter_path)
            else:
                logger.warning(f"Chapter not found: {target}")

    total_items = len(chapter_paths) + len(location_paths)
    if total_items == 0:
        logger.error("No valid targets found")
        raise typer.Exit(1)

    logger.info(f"📚 Chapters: {len(chapter_paths)}")
    logger.info(f"🏛️  Locations: {len(location_paths)}")
    logger.info(f"🚀 Processing {total_items} items with {workers} workers")

    # Run combined pipeline
    all_results = asyncio.run(
        run_combined_pipeline(chapter_paths, location_paths, config, stage)
    )

    # Split and report
    chapter_results = [r for r in all_results if r.get("type") == "chapter"]
    location_results = [r for r in all_results if r.get("type") == "location"]

    if chapter_results:
        print_summary(chapter_results, "chapters")
    if location_results:
        print_summary(location_results, "locations")

    if any(r.get("status") == "error" for r in all_results):
        raise typer.Exit(1)


async def run_combined_pipeline(
    chapter_paths: list[Path],
    location_paths: list[Path],
    config: PipelineConfig,
    stage: Stage,
) -> list[dict]:
    """Process both chapters and locations in parallel."""
    client = anthropic.AsyncAnthropic()
    semaphore = asyncio.Semaphore(config.max_concurrent)

    total = len(chapter_paths) + len(location_paths)
    logger.info(
        f"🚀 Starting combined pipeline: "
        f"{len(chapter_paths)} chapters + {len(location_paths)} locations = {total} items, "
        f"{config.max_concurrent} workers, "
        f"stage={stage.value}"
    )

    # Create tasks for both types
    tasks = []

    for path in chapter_paths:
        tasks.append(process_chapter_with_type(path, client, config, semaphore, stage))

    for path in location_paths:
        tasks.append(process_location_with_type(path, client, config, semaphore, stage))

    # Run all tasks
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Convert exceptions to error results
    processed_results = []
    all_paths = chapter_paths + location_paths
    all_types = ["chapter"] * len(chapter_paths) + ["location"] * len(location_paths)

    for i, result in enumerate(results):
        if isinstance(result, Exception):
            processed_results.append(
                {
                    "slug": all_paths[i].name,
                    "type": all_types[i],
                    "status": "error",
                    "error": str(result),
                    "duration": 0,
                }
            )
        else:
            processed_results.append(result)

    return processed_results


async def process_chapter_with_type(
    chapter_path: Path,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
    stage: Stage,
) -> dict:
    """Process a chapter and tag result with type."""
    result = await process_chapter(chapter_path, client, config, semaphore, stage)
    result["type"] = "chapter"
    return result


async def process_location_with_type(
    location_path: Path,
    client: anthropic.AsyncAnthropic,
    config: PipelineConfig,
    semaphore: asyncio.Semaphore,
    stage: Stage,
) -> dict:
    """Process a location and tag result with type."""
    result = await process_location(location_path, client, config, semaphore, stage)
    result["type"] = "location"
    return result


if __name__ == "__main__":
    app()
