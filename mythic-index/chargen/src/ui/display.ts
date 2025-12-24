/**
 * Display utilities for consistent CLI output formatting
 */

import chalk from 'chalk';

/**
 * Displays the application header in a box.
 */
export function showHeader(): void {
  console.log();
  console.log(chalk.cyan('╭─────────────────────────────────────────╮'));
  console.log(chalk.cyan('│   chargen - Character Image Generator   │'));
  console.log(chalk.cyan('╰─────────────────────────────────────────╯'));
}

/**
 * Displays a section header with horizontal lines.
 *
 * @param title - The title of the section.
 */
export function showSection(title: string): void {
  console.log();
  console.log(chalk.cyan.bold(`─── ${title} ───`));
  console.log();
}

/**
 * Displays a list item with optional subtitle and bullet color.
 *
 * @param title - The main text of the list item.
 * @param subtitle - Optional secondary text to display below the title.
 * @param bulletColor - Optional function to color the bullet point.
 */
export function showListItem(
  title: string,
  subtitle?: string,
  bulletColor: (text: string) => string = chalk.cyan
): void {
  console.log(`  ${bulletColor('●')} ${chalk.bold(title)}`);
  if (subtitle) {
    console.log(`    ${chalk.dim(subtitle)}`);
  }
}

/**
 * Displays a success message with a green checkmark.
 *
 * @param message - The message to display.
 */
export function showSuccess(message: string): void {
  console.log(chalk.green('✓'), message);
}

/**
 * Displays an error message with a red cross.
 *
 * @param message - The message to display.
 */
export function showError(message: string): void {
  console.log(chalk.red('✗'), message);
}

/**
 * Displays a warning message with a yellow triangle.
 *
 * @param message - The message to display.
 */
export function showWarning(message: string): void {
  console.log(chalk.yellow('⚠'), message);
}

/**
 * Displays an info message with a blue icon.
 *
 * @param message - The message to display.
 */
export function showInfo(message: string): void {
  console.log(chalk.blue('ℹ'), message);
}

/**
 * Displays a dimmed/secondary message.
 *
 * @param message - The message to display.
 */
export function showDim(message: string): void {
  console.log(chalk.dim(message));
}

/**
 * Displays a key-value pair with the key dimmed.
 *
 * @param key - The key to display.
 * @param value - The value to display.
 */
export function showKeyValue(key: string, value: string): void {
  console.log(`  ${chalk.dim(key + ':')} ${value}`);
}

/**
 * Displays a list of items with bullets.
 *
 * @param items - The array of items to display.
 * @param bullet - The bullet character to use.
 */
export function showList(items: string[], bullet = '•'): void {
  for (const item of items) {
    console.log(`  ${chalk.dim(bullet)} ${item}`);
  }
}

/**
 * Displays a numbered list of items.
 *
 * @param items - The array of items to display.
 */
export function showNumberedList(items: string[]): void {
  items.forEach((item, index) => {
    console.log(`  ${chalk.dim(`${index + 1}.`)} ${item}`);
  });
}

/**
 * Displays provider availability status.
 *
 * @param name - The name of the provider.
 * @param available - Whether the provider is available.
 * @param model - Optional model name.
 */
export function showProviderStatus(name: string, available: boolean, model?: string): void {
  const status = available ? chalk.green('✓') : chalk.red('✗');
  const modelInfo = model ? chalk.dim(` (${model})`) : '';
  const availText = available ? 'available' : chalk.dim('not configured');
  console.log(`  ${status} ${name}${modelInfo} - ${availText}`);
}

/**
 * Displays a separator line.
 */
export function showSeparator(): void {
  console.log(chalk.dim('─'.repeat(45)));
}

/**
 * Displays an empty line.
 */
export function newLine(): void {
  console.log();
}

/**
 * Clears the terminal and shows the application header.
 */
export function clearAndShowHeader(): void {
  console.clear();
  showHeader();
}

/**
 * Formats a file path for display, truncating it if it's too long.
 *
 * @param path - The file path to format.
 * @param maxLength - The maximum length of the formatted path.
 * @returns The formatted path string.
 */
export function formatPath(path: string, maxLength = 50): string {
  if (path.length <= maxLength) return path;
  const parts = path.split('/');
  const filename = parts.pop() || '';
  if (filename.length >= maxLength - 3) {
    return '...' + filename.slice(-(maxLength - 3));
  }
  return '...' + path.slice(-(maxLength - 3));
}

/**
 * Formats a character name with a role indicator in color.
 *
 * @param name - The character name.
 * @param role - The character role.
 * @returns The formatted character name string.
 */
export function formatCharacterName(name: string, role?: string): string {
  if (!role) return name;
  const roleColors: Record<string, typeof chalk.green> = {
    protagonist: chalk.green,
    antagonist: chalk.red,
    supporting: chalk.yellow,
    minor: chalk.dim,
  };
  const colorFn = roleColors[role] || chalk.white;
  return `${name} ${colorFn(`(${role})`)}`;
}

/**
 * Displays a box with a title and multiple lines of content.
 *
 * @param title - The title of the box.
 * @param lines - The lines of content to display inside the box.
 */
export function showBox(title: string, lines: string[]): void {
  const maxLen = Math.max(title.length, ...lines.map((l) => l.length));
  const width = Math.min(maxLen + 4, 60);
  const border = '─'.repeat(width - 2);

  console.log(chalk.cyan(`╭${border}╮`));
  console.log(chalk.cyan('│') + ` ${title}`.padEnd(width - 2) + chalk.cyan('│'));
  console.log(chalk.cyan(`├${border}┤`));
  for (const line of lines) {
    console.log(chalk.cyan('│') + ` ${line}`.padEnd(width - 2) + chalk.cyan('│'));
  }
  console.log(chalk.cyan(`╰${border}╯`));
}

/**
 * Displays a section header in a box format.
 *
 * @param title - The title of the section.
 */
export function showSectionBox(title: string): void {
  const width = Math.min(Math.max(title.length + 4, 50), 60);
  const padding = Math.floor((width - 2 - title.length) / 2);
  const paddedTitle = ' '.repeat(padding) + title + ' '.repeat(width - 2 - padding - title.length);
  const border = '─'.repeat(width - 2);

  console.log(chalk.cyan(`╭${border}╮`));
  console.log(chalk.cyan('│') + paddedTitle + chalk.cyan('│'));
  console.log(chalk.cyan(`╰${border}╯`));
  console.log();
}

/**
 * Displays a progress bar.
 *
 * @param current - Current progress (0-100).
 * @param total - Total items (optional, for display).
 * @returns The progress bar string.
 */
export function createProgressBar(current: number, total: number = 100, width: number = 20): string {
  const percentage = Math.min(100, Math.round((current / total) * 100));
  const filled = Math.round((percentage / 100) * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `${bar} ${percentage}% (${current}/${total})`;
}

/**
 * Displays a cost breakdown with savings calculation.
 *
 * @param standardCost - Cost at standard pricing.
 * @param batchCost - Cost with batch pricing (50% discount).
 */
export function showCostEstimate(standardCost: number, batchCost: number): void {
  const savings = standardCost - batchCost;
  console.log(`  ${chalk.dim('•')} Standard cost: ${chalk.yellow(`$${standardCost.toFixed(2)}`)}`);
  console.log(`  ${chalk.dim('•')} Batch cost: ${chalk.green(`$${batchCost.toFixed(2)}`)} ${chalk.green('✓')} 50% savings`);
  console.log(`  ${chalk.dim('•')} You save: ${chalk.cyan(`$${savings.toFixed(2)}`)}`);
}

/**
 * Displays a formatted stat line.
 *
 * @param label - The label for the stat.
 * @param value - The value to display.
 */
export function showStat(label: string, value: string | number): void {
  console.log(`  ${chalk.dim('•')} ${label}: ${chalk.cyan(String(value))}`);
}
