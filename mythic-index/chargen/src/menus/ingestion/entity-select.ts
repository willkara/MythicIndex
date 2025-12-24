/**
 * Multi-select entity picker using checkboxes
 */

import { checkbox } from '@inquirer/prompts';

export interface SelectableEntity {
  slug: string;
  name: string;
  description?: string;
}

/**
 * Run a checkbox multi-select for entities
 */
export async function runEntitySelect(
  entities: SelectableEntity[],
  message: string
): Promise<string[]> {
  if (entities.length === 0) {
    return [];
  }

  const selected = await checkbox<string>({
    message,
    choices: entities.map((entity) => ({
      name: entity.name,
      value: entity.slug,
      description: entity.description,
    })),
    pageSize: 15,
  });

  return selected;
}
