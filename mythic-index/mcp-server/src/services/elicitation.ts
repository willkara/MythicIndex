/**
 * MCP Elicitation Service
 * Helper functions for prompting users to select from multiple options
 */

import { getMcpServer } from './mcp-context.js';
import { getLogger } from './logger.js';
import type { ContentItemKind } from './d1.js';

export type ElicitationAction = 'accept' | 'decline' | 'fallback';

export interface ElicitationResult<T> {
  success: boolean;
  selected?: T;
  action: ElicitationAction;
  error?: string;
}

export interface EntityOption {
  name: string;
  slug: string;
  description?: string;
}

/**
 * Present entity options to user via MCP elicitation
 * Returns the selected entity or a fallback result if elicitation is not supported
 */
export async function elicitEntitySelection<T extends EntityOption>(
  entityType: ContentItemKind,
  candidates: T[],
  originalQuery: string,
  formatOption: (entity: T) => string
): Promise<ElicitationResult<T>> {
  const logger = getLogger();
  const server = getMcpServer();

  if (!server || candidates.length === 0) {
    return {
      success: false,
      action: 'fallback',
      error: 'No server available or no candidates provided'
    };
  }

  // Build options for the elicitation form
  const options = candidates.map((c, idx) => ({
    value: idx.toString(),
    label: c.name,
    description: formatOption(c)
  }));

  const entityTypeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);

  try {
    // The MCP SDK elicitInput API
    const result = await server.server.elicitInput({
      message: `Multiple ${entityType}s match "${originalQuery}". Please select one:`,
      requestedSchema: {
        type: 'object',
        properties: {
          selectedIndex: {
            type: 'string',
            title: `Select ${entityTypeLabel}`,
            description: `Choose the ${entityType} you meant`,
            enum: options.map(o => o.value),
            enumNames: options.map(o => `${o.label} - ${o.description || 'no details'}`)
          }
        },
        required: ['selectedIndex']
      }
    });

    if (result.action === 'accept' && result.content?.selectedIndex !== undefined) {
      const idx = parseInt(result.content.selectedIndex as string, 10);
      if (idx >= 0 && idx < candidates.length) {
        logger.debug('User selected entity via elicitation', {
          module: 'elicitation',
          entityType,
          selectedIndex: idx,
          selectedSlug: candidates[idx].slug
        });
        return {
          success: true,
          selected: candidates[idx],
          action: 'accept'
        };
      }
    }

    logger.debug('User declined elicitation or made invalid selection', {
      module: 'elicitation',
      entityType,
      action: result.action
    });
    return {
      success: false,
      action: (result.action as ElicitationAction) || 'decline',
      error: 'User declined selection or made invalid choice'
    };

  } catch (error) {
    // Elicitation not supported by client - this is expected for most CLI clients
    logger.debug('Elicitation not supported, falling back to guidance', {
      module: 'elicitation',
      entityType,
      error: (error as Error).message
    });
    return {
      success: false,
      action: 'fallback',
      error: `Elicitation not supported: ${(error as Error).message}`
    };
  }
}

/**
 * Format a list of candidates for display when elicitation is not available
 */
export function formatCandidatesForGuidance<T extends EntityOption>(
  entityType: ContentItemKind,
  candidates: T[],
  originalQuery: string,
  formatOption: (entity: T) => string
): string {
  const entityTypeLabel = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  const lines = [
    `Multiple ${entityType}s match "${originalQuery}":`,
    ''
  ];

  candidates.forEach(c => {
    lines.push(`- **${c.name}** (\`${c.slug}\`) - ${formatOption(c)}`);
  });

  lines.push('');
  lines.push(`Please specify the exact ${entityType} name or slug.`);

  return lines.join('\n');
}
