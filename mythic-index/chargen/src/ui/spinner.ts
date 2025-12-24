/**
 * Spinner wrapper for consistent progress display
 */

import ora, { type Ora } from 'ora';
import chalk from 'chalk';

/**
 * Spinner configuration options.
 */
export interface SpinnerOptions {
  /** The text to display next to the spinner. */
  readonly text: string;
  /** The color of the spinner. */
  readonly color?: 'cyan' | 'green' | 'yellow' | 'red' | 'blue' | 'magenta' | 'white';
}

let currentSpinner: Ora | null = null;

/**
 * Starts a new spinner with the given text or options.
 * If a spinner is already running, it will be stopped first.
 *
 * @param options - The text or options for the spinner.
 * @returns The Ora spinner instance.
 */
export function startSpinner(options: SpinnerOptions | string): Ora {
  // Stop any existing spinner
  if (currentSpinner) {
    currentSpinner.stop();
  }

  const opts = typeof options === 'string' ? { text: options } : options;

  currentSpinner = ora({
    text: opts.text,
    color: opts.color || 'cyan',
    spinner: 'dots',
  }).start();

  return currentSpinner;
}

/**
 * Updates the text of the currently running spinner.
 *
 * @param text - The new text to display.
 */
export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text;
  }
}

/**
 * Marks the currently running spinner as successful and clears it.
 *
 * @param text - Optional success message to display.
 */
export function succeedSpinner(text?: string): void {
  if (currentSpinner) {
    currentSpinner.succeed(text);
    currentSpinner = null;
  }
}

/**
 * Marks the currently running spinner as failed and clears it.
 *
 * @param text - Optional failure message to display.
 */
export function failSpinner(text?: string): void {
  if (currentSpinner) {
    currentSpinner.fail(text);
    currentSpinner = null;
  }
}

/**
 * Stops the currently running spinner without any status indicator and clears it.
 */
export function stopSpinner(): void {
  if (currentSpinner) {
    currentSpinner.stop();
    currentSpinner = null;
  }
}

/**
 * Executes an asynchronous task while displaying a progress spinner.
 *
 * @template T - The return type of the asynchronous task.
 * @param text - The initial text to display next to the spinner.
 * @param task - The asynchronous function to execute.
 * @param successText - Optional text or function to generate text when the task succeeds.
 * @param failText - Optional text or function to generate text when the task fails.
 * @returns A promise that resolves with the result of the task.
 * @throws Re-throws any error encountered during task execution.
 */
export async function withSpinner<T>(
  text: string,
  task: () => Promise<T>,
  successText?: string | ((result: T) => string),
  failText?: string | ((error: Error) => string)
): Promise<T> {
  const spinner = startSpinner(text);

  try {
    const result = await task();
    const successMsg = typeof successText === 'function' ? successText(result) : successText;
    spinner.succeed(successMsg || text);
    return result;
  } catch (error) {
    const errorMsg = typeof failText === 'function' ? failText(error as Error) : failText;
    spinner.fail(errorMsg || `${text} - ${chalk.red('failed')}`);
    throw error;
  } finally {
    if (currentSpinner === spinner) {
      currentSpinner = null;
    }
  }
}

/**
 * Shows progress through a list of items, displaying a spinner for each task.
 *
 * @template T - The type of items in the list.
 * @template R - The return type of the task for each item.
 * @param items - The list of items to process.
 * @param task - The asynchronous function to execute for each item.
 * @param getText - Function to generate the display text for each item.
 * @param getSuccessText - Optional function to generate the success text for each item.
 * @returns A promise that resolves with an array of results.
 * @throws Re-throws any error encountered during item processing.
 */
export async function withProgress<T, R>(
  items: T[],
  task: (item: T, index: number) => Promise<R>,
  getText: (item: T, index: number) => string,
  getSuccessText?: (item: T, result: R, index: number) => string
): Promise<R[]> {
  const results: R[] = [];
  const total = items.length;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const text = `[${i + 1}/${total}] ${getText(item, i)}`;
    const spinner = startSpinner(text);

    try {
      const result = await task(item, i);
      results.push(result);
      const successMsg = getSuccessText?.(item, result, i) || text;
      spinner.succeed(successMsg);
    } catch (error) {
      spinner.fail(`${text} - ${chalk.red('failed')}`);
      throw error;
    } finally {
      if (currentSpinner === spinner) {
        currentSpinner = null;
      }
    }
  }

  return results;
}
