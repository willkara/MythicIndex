import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines and merges Tailwind CSS class names intelligently.
 *
 * Uses clsx for conditional class name construction and tailwind-merge
 * to properly merge conflicting Tailwind utility classes. This prevents
 * class conflicts like having both 'p-2' and 'p-4' in the output.
 *
 * @param inputs - Class names, arrays, objects, or conditional expressions
 * @returns Merged class name string with conflicts resolved
 *
 * @example
 * ```typescript
 * cn('px-2 py-1', isActive && 'bg-blue-500', { 'font-bold': isPrimary })
 * // Returns: "px-2 py-1 bg-blue-500 font-bold" (if conditions are true)
 * ```
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
