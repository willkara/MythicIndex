/**
 * Batch Results Downloader
 *
 * Handles downloading and validating result JSONL files
 * from completed batch jobs.
 */

import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import type { BatchJSONLResponse } from '../../types/batch.js';

/** Download result */
export interface DownloadResult {
  /** Path to downloaded file */
  path: string;
  /** Number of responses */
  responseCount: number;
  /** Number of successful responses */
  successCount: number;
  /** Number of failed responses */
  failCount: number;
}

/** Response statistics */
export interface ResponseStats {
  total: number;
  success: number;
  failed: number;
  byError: Record<string, number>;
}

/**
 * Parse a results JSONL file
 */
export async function parseResultsJSONL(filePath: string): Promise<BatchJSONLResponse[]> {
  if (!existsSync(filePath)) {
    throw new Error(`Results file not found: ${filePath}`);
  }

  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim());
  const responses: BatchJSONLResponse[] = [];

  for (const line of lines) {
    try {
      const response = JSON.parse(line) as BatchJSONLResponse;
      responses.push(response);
    } catch (_error) {
      console.error(`Failed to parse line: ${line.slice(0, 100)}...`);
    }
  }

  return responses;
}

/**
 * Stream parse a large results file (memory efficient)
 */
export async function* streamParseResultsJSONL(
  filePath: string
): AsyncGenerator<BatchJSONLResponse> {
  const { createReadStream } = await import('fs');
  const { createInterface } = await import('readline');

  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        yield JSON.parse(line) as BatchJSONLResponse;
      } catch {
        // Skip invalid lines
      }
    }
  }
}

/**
 * Get statistics from a results file
 */
export async function getResponseStats(filePath: string): Promise<ResponseStats> {
  const stats: ResponseStats = {
    total: 0,
    success: 0,
    failed: 0,
    byError: {},
  };

  for await (const response of streamParseResultsJSONL(filePath)) {
    stats.total++;

    if (response.error) {
      stats.failed++;
      const errorKey = response.error.status || `code_${response.error.code}`;
      stats.byError[errorKey] = (stats.byError[errorKey] || 0) + 1;
    } else if (response.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
      stats.success++;
    } else {
      stats.failed++;
      stats.byError['no_image_data'] = (stats.byError['no_image_data'] || 0) + 1;
    }
  }

  return stats;
}

/**
 * Extract a specific response by custom_id
 */
export async function getResponseById(
  filePath: string,
  customId: string
): Promise<BatchJSONLResponse | null> {
  for await (const response of streamParseResultsJSONL(filePath)) {
    if (response.custom_id === customId) {
      return response;
    }
  }
  return null;
}

/**
 * Extract all successful responses with image data
 */
export async function getSuccessfulResponses(filePath: string): Promise<
  Array<{
    customId: string;
    imageData: string;
    mimeType: string;
  }>
> {
  const results: Array<{
    customId: string;
    imageData: string;
    mimeType: string;
  }> = [];

  for await (const response of streamParseResultsJSONL(filePath)) {
    const inlineData = response.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    if (inlineData?.data) {
      results.push({
        customId: response.custom_id,
        imageData: inlineData.data,
        mimeType: inlineData.mimeType || 'image/png',
      });
    }
  }

  return results;
}

/**
 * Extract all failed responses
 */
export async function getFailedResponses(filePath: string): Promise<
  Array<{
    customId: string;
    error: {
      code: number;
      message: string;
      status: string;
    };
  }>
> {
  const results: Array<{
    customId: string;
    error: {
      code: number;
      message: string;
      status: string;
    };
  }> = [];

  for await (const response of streamParseResultsJSONL(filePath)) {
    if (response.error) {
      results.push({
        customId: response.custom_id,
        error: response.error,
      });
    }
  }

  return results;
}

/**
 * Merge multiple result files into one
 */
export async function mergeResultFiles(
  inputPaths: string[],
  outputPath: string
): Promise<{ total: number }> {
  let total = 0;
  const lines: string[] = [];

  for (const inputPath of inputPaths) {
    for await (const response of streamParseResultsJSONL(inputPath)) {
      lines.push(JSON.stringify(response));
      total++;
    }
  }

  await writeFile(outputPath, lines.join('\n'), 'utf-8');
  return { total };
}

/**
 * Validate results file integrity
 */
export async function validateResultsFile(
  filePath: string,
  expectedIds: string[]
): Promise<{
  valid: boolean;
  missing: string[];
  extra: string[];
  errors: string[];
}> {
  const expectedSet = new Set(expectedIds);
  const foundSet = new Set<string>();
  const errors: string[] = [];

  for await (const response of streamParseResultsJSONL(filePath)) {
    if (!response.custom_id) {
      errors.push('Response missing custom_id');
      continue;
    }

    foundSet.add(response.custom_id);
  }

  const missing = expectedIds.filter((id) => !foundSet.has(id));
  const extra = Array.from(foundSet).filter((id) => !expectedSet.has(id));

  return {
    valid: missing.length === 0 && extra.length === 0 && errors.length === 0,
    missing,
    extra,
    errors,
  };
}
