/**
 * JSONL Builder for Batch Requests
 *
 * Constructs JSONL files for Google Batch API submission.
 * Each line is a GenerateContentRequest with proper formatting.
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import type { BatchTask, BatchJSONLRequest, BatchConfig as _BatchConfig } from '../../types/batch.js';

/** Options for JSONL building */
export interface JSONLBuildOptions {
  /** Maximum tasks per JSONL file (for chunking) */
  maxTasksPerFile: number;
  /** Safety settings to apply */
  safetySettings?: Array<{
    category: string;
    threshold: string;
  }>;
  /** Response modalities (default: ['IMAGE']) */
  responseModalities?: string[];
}

const DEFAULT_OPTIONS: JSONLBuildOptions = {
  maxTasksPerFile: 500,
  safetySettings: [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  ],
  responseModalities: ['IMAGE'],
};

/** Result from JSONL building */
export interface JSONLBuildResult {
  /** Paths to generated JSONL files */
  files: string[];
  /** Number of tasks per file */
  tasksPerFile: number[];
  /** Total requests written */
  totalRequests: number;
}

/**
 * Build JSONL files from batch tasks
 */
export async function buildJSONL(
  tasks: BatchTask[],
  artifactDir: string,
  options: Partial<JSONLBuildOptions> = {}
): Promise<JSONLBuildResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const files: string[] = [];
  const tasksPerFile: number[] = [];

  // Chunk tasks if needed
  const chunks = chunkArray(tasks, opts.maxTasksPerFile);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const fileName = chunks.length > 1 ? `requests-${i + 1}.jsonl` : 'requests.jsonl';
    const filePath = join(artifactDir, fileName);

    // Build JSONL content
    const lines: string[] = [];
    for (const task of chunk) {
      const request = buildRequest(task, opts);
      lines.push(JSON.stringify(request));
    }

    // Write file
    await writeFile(filePath, lines.join('\n'), 'utf-8');

    files.push(filePath);
    tasksPerFile.push(chunk.length);
  }

  return {
    files,
    tasksPerFile,
    totalRequests: tasks.length,
  };
}

/**
 * Build a single JSONL request from a task
 */
function buildRequest(task: BatchTask, options: JSONLBuildOptions): BatchJSONLRequest {
  // Build content parts
  const parts: Array<{ text: string } | { fileData: { fileUri: string; mimeType: string } }> = [];

  // Add reference images first (if using fileData URIs)
  for (const ref of task.referenceImages) {
    if (ref.uploadedUri) {
      parts.push({
        fileData: {
          fileUri: ref.uploadedUri,
          mimeType: ref.mime,
        },
      });
    }
  }

  // Build the prompt text
  let promptText = task.prompt;

  // Add negative prompt as "Avoid:" section (Gemini style)
  if (task.negativePrompt) {
    promptText = `${promptText}\n\nAvoid: ${task.negativePrompt}`;
  }

  parts.push({ text: promptText });

  // Build generation config
  const generationConfig: Record<string, unknown> = {};

  if (task.config.temperature !== undefined) {
    generationConfig.temperature = task.config.temperature;
  }

  // Build image config
  const imageConfig: Record<string, unknown> = {};
  if (task.config.aspectRatio) {
    imageConfig.aspectRatio = task.config.aspectRatio;
  }
  if (task.config.size) {
    imageConfig.imageSize = task.config.size;
  }

  // Build the full request
  const request: BatchJSONLRequest = {
    custom_id: task.key,
    request: {
      contents: [
        {
          role: 'user',
          parts,
        },
      ],
    },
  };

  // Add generation config if non-empty
  if (Object.keys(generationConfig).length > 0) {
    request.request.generationConfig = generationConfig;
  }

  // Add safety settings
  if (options.safetySettings && options.safetySettings.length > 0) {
    request.request.safetySettings = options.safetySettings;
  }

  return request;
}

/**
 * Parse a JSONL file into requests
 */
export async function parseJSONL(filePath: string): Promise<BatchJSONLRequest[]> {
  const { readFile } = await import('fs/promises');
  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());

  return lines.map((line) => JSON.parse(line) as BatchJSONLRequest);
}

/**
 * Chunk an array into smaller arrays
 */
function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Estimate token count for a request (rough approximation)
 */
export function estimateTokens(request: BatchJSONLRequest): number {
  let tokens = 0;

  for (const content of request.request.contents) {
    for (const part of content.parts) {
      if ('text' in part) {
        // Rough estimate: 1 token per 4 characters
        tokens += Math.ceil(part.text.length / 4);
      }
      if ('fileData' in part) {
        // Images contribute ~258 tokens (256 image tokens + overhead)
        tokens += 258;
      }
    }
  }

  return tokens;
}

/**
 * Estimate total tokens for all tasks
 */
export function estimateTotalTokens(tasks: BatchTask[]): number {
  let total = 0;

  for (const task of tasks) {
    // Text tokens
    total += Math.ceil(task.prompt.length / 4);
    if (task.negativePrompt) {
      total += Math.ceil(task.negativePrompt.length / 4);
    }

    // Image tokens
    total += task.referenceImages.length * 258;
  }

  return total;
}
