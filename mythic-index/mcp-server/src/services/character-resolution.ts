/**
 * Character Resolution Service
 *
 * Provides fuzzy matching and elicitation for character name resolution.
 * Used by image generation tools and other tools that need to resolve
 * partial character names to canonical slugs.
 */

import type { Character } from '../types/index.js';
import * as d1 from './d1.js';
import { getLogger } from './logger.js';
import { elicitEntitySelection, formatCandidatesForGuidance } from './elicitation.js';
import { getStorage } from './storage.js';
import { getConfig } from './config.js';
import { characterRowToCharacter } from '../tools/characters.js';

export interface CharacterResolutionOptions {
  /** Whether to attempt elicitation if multiple matches */
  allowElicitation?: boolean;
  /** Maximum fuzzy match candidates to return */
  maxCandidates?: number;
}

export interface CharacterResolutionResult {
  success: boolean;
  character?: Character;
  candidates?: Character[];
  matchType?: 'exact' | 'fuzzy-single' | 'fuzzy-multiple' | 'none';
  guidanceMessage?: string;
}

/**
 * Format a character for elicitation display
 */
function formatCharacterOption(character: Character): string {
  const parts: string[] = [];
  if (character.role) parts.push(character.role);
  if (character.faction) parts.push(character.faction);
  if (character.occupation) parts.push(character.occupation);
  return parts.length > 0 ? parts.join(' • ') : 'no details';
}

/**
 * Resolve a character name/slug to a canonical Character object
 *
 * Resolution process:
 * 1. Try exact match first (fast path)
 * 2. Fuzzy search if no exact match
 * 3. Auto-select if single fuzzy match
 * 4. Elicit user selection if multiple matches (optional)
 * 5. Return candidates with guidance if elicitation disabled/declined
 *
 * @param searchTerm - User-provided character name or slug (e.g., "Veyra", "veyra-thornwake")
 * @param options - Resolution options
 * @returns Resolution result with character, candidates, and guidance
 */
export async function resolveCharacter(
  searchTerm: string,
  options: CharacterResolutionOptions = {}
): Promise<CharacterResolutionResult> {
  const { allowElicitation = true, maxCandidates = 5 } = options;
  const logger = getLogger();
  const trimmedTerm = searchTerm.trim();

  // Try D1 first if available
  if (d1.isD1Available()) {
    try {
      // 1. Try exact match first (fast path)
      const exactMatch = await d1.getCharacter(trimmedTerm);
      if (exactMatch) {
        logger.debug('Exact character match found', {
          module: 'character-resolution',
          query: trimmedTerm,
          slug: exactMatch.slug
        });
        return {
          success: true,
          character: characterRowToCharacter(exactMatch),
          matchType: 'exact'
        };
      }

      // 2. Fuzzy search
      const fuzzyResults = await d1.searchCharacters(trimmedTerm, {
        limit: maxCandidates
      });

      if (fuzzyResults.length === 0) {
        // No matches at all
        logger.debug('No character matches found', {
          module: 'character-resolution',
          query: trimmedTerm
        });
        return {
          success: false,
          matchType: 'none',
          guidanceMessage: `No character found matching "${trimmedTerm}". Use the \`list_characters\` tool to see all available characters.`
        };
      }

      const candidates = fuzzyResults.map(characterRowToCharacter);

      // 3. Single fuzzy match - auto-select
      if (fuzzyResults.length === 1) {
        logger.debug('Single fuzzy character match found', {
          module: 'character-resolution',
          query: trimmedTerm,
          matchedSlug: fuzzyResults[0].slug
        });
        return {
          success: true,
          character: candidates[0],
          matchType: 'fuzzy-single'
        };
      }

      // 4. Multiple matches - try elicitation
      if (allowElicitation) {
        logger.debug('Multiple character matches found, attempting elicitation', {
          module: 'character-resolution',
          query: trimmedTerm,
          candidateCount: candidates.length
        });

        const elicitResult = await elicitEntitySelection(
          'character',
          candidates,
          trimmedTerm,
          formatCharacterOption
        );

        if (elicitResult.success && elicitResult.selected) {
          logger.debug('Character selected via elicitation', {
            module: 'character-resolution',
            query: trimmedTerm,
            selectedSlug: elicitResult.selected.slug
          });
          return {
            success: true,
            character: elicitResult.selected,
            matchType: 'fuzzy-multiple'
          };
        }
      }

      // 5. Fallback: return candidates with guidance
      const guidanceMessage = formatCandidatesForGuidance(
        'character',
        candidates,
        trimmedTerm,
        formatCharacterOption
      );

      logger.debug('Character resolution ambiguous, returning guidance', {
        module: 'character-resolution',
        query: trimmedTerm,
        candidateCount: candidates.length
      });

      return {
        success: false,
        candidates,
        matchType: 'fuzzy-multiple',
        guidanceMessage
      };

    } catch (error) {
      logger.warn('D1 character resolution failed, falling back to storage', {
        module: 'character-resolution',
        error: (error as Error).message
      });
      // Fall through to storage fallback
    }
  }

  // Fallback to local storage (exact match only)
  const config = getConfig();
  const storage = getStorage();
  const character = storage.getCharacter(config.workspace.id, trimmedTerm);

  if (character) {
    logger.debug('Character found in local storage', {
      module: 'character-resolution',
      query: trimmedTerm,
      slug: character.slug
    });
    return {
      success: true,
      character,
      matchType: 'exact'
    };
  }

  return {
    success: false,
    matchType: 'none',
    guidanceMessage: `Character not found: ${trimmedTerm}`
  };
}
