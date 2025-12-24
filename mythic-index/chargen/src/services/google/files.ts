/**
 * Google Files API Integration
 *
 * Handles uploading files to Google's Files API for use in batch processing.
 * Files are retained for 48 hours before automatic deletion.
 */

import { GoogleGenAI } from '@google/genai';
import { readFile } from 'fs/promises';
import { basename } from 'path';

/** Information about an uploaded file */
export interface UploadedFile {
  /** The URI to reference this file in API calls */
  uri: string;
  /** Original file name */
  name: string;
  /** MIME type */
  mimeType: string;
  /** File size in bytes */
  sizeBytes: number;
  /** When the file will expire */
  expirationTime: string;
  /** File state */
  state: 'PROCESSING' | 'ACTIVE' | 'FAILED';
}

/** Options for file upload */
export interface UploadOptions {
  /** Display name for the file */
  displayName?: string;
  /** MIME type (auto-detected if not provided) */
  mimeType?: string;
}

/**
 * Google Files API service
 */
export class GoogleFilesService {
  private client: GoogleGenAI;
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.client = new GoogleGenAI({ apiKey });
  }

  /**
   * Download a file as a stream from Google's Files API
   *
   * Useful for large files that would exceed Node.js's string length limit.
   * Only supports batch output files (those containing 'batch-' in the name).
   */
  async downloadFileStream(fileName: string): Promise<ReadableStream<Uint8Array>> {
    const resourceName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;
    const isBatchOutput = resourceName.includes('batch-');

    if (isBatchOutput) {
      const url = `https://generativelanguage.googleapis.com/v1beta/${resourceName}:download?alt=media`;
      const response = await fetch(url, {
        headers: { 'x-goog-api-key': this.apiKey },
      });

      if (!response.ok) {
        throw new Error(
          `Failed to download stream from ${resourceName}: HTTP ${response.status} ${response.statusText}`
        );
      }

      if (!response.body) {
        throw new Error('No response body stream available');
      }

      return response.body;
    }

    throw new Error('Stream download only supported for batch output files');
  }

  /**
   * Download a file's content from Google's Files API
   *
   * Note: Batch output files use a workaround due to a known Google API bug
   * where batch file IDs exceed the 40-character limit enforced by the SDK.
   * See: https://github.com/googleapis/python-genai/issues/1759
   */
  async downloadFile(fileName: string): Promise<string> {
    // Ensure fileName includes the 'files/' prefix
    const resourceName = fileName.startsWith('files/') ? fileName : `files/${fileName}`;

    // Use direct fetch API - the SDK's download() method now requires downloadPath
    // and writes to disk, which doesn't fit our use case. Direct fetch works reliably.
    // See: https://github.com/googleapis/python-genai/issues/1759
    const url = `https://generativelanguage.googleapis.com/v1beta/${resourceName}:download?alt=media`;
    const response = await fetch(url, {
      headers: { 'x-goog-api-key': this.apiKey },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to download file ${resourceName}: HTTP ${response.status} ${response.statusText}`
      );
    }

    return await response.text();
  }

  /**
   * Upload a file to Google's Files API
   */
  async uploadFile(filePath: string, options?: UploadOptions): Promise<UploadedFile> {
    const fileBuffer = await readFile(filePath);
    const displayName = options?.displayName || basename(filePath);
    const mimeType = options?.mimeType || this.getMimeType(filePath);

    // Use the files API to upload
    const response = await this.client.files.upload({
      file: new Blob([fileBuffer], { type: mimeType }),
      config: {
        displayName,
        mimeType,
      },
    });

    if (!response.uri) {
      throw new Error('No URI returned from file upload');
    }

    return {
      uri: response.uri,
      name: response.name || displayName,
      mimeType: response.mimeType || mimeType,
      sizeBytes: Number(response.sizeBytes) || fileBuffer.length,
      expirationTime: response.expirationTime || this.getDefaultExpiration(),
      state: (response.state as UploadedFile['state']) || 'ACTIVE',
    };
  }

  /**
   * Get information about an uploaded file
   */
  async getFile(fileName: string): Promise<UploadedFile | null> {
    try {
      const response = await this.client.files.get({ name: fileName });

      if (!response) {
        return null;
      }

      return {
        uri: response.uri || '',
        name: response.name || fileName,
        mimeType: response.mimeType || 'application/octet-stream',
        sizeBytes: Number(response.sizeBytes) || 0,
        expirationTime: response.expirationTime || '',
        state: (response.state as UploadedFile['state']) || 'ACTIVE',
      };
    } catch {
      return null;
    }
  }

  /**
   * Delete an uploaded file
   */
  async deleteFile(fileName: string): Promise<boolean> {
    try {
      await this.client.files.delete({ name: fileName });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List all uploaded files
   */
  async listFiles(): Promise<UploadedFile[]> {
    try {
      const pager = await this.client.files.list();
      const files: UploadedFile[] = [];

      // SDK Pager is AsyncIterable - iterate directly over it
      for await (const file of pager) {
        files.push({
          uri: file.uri || '',
          name: file.name || '',
          mimeType: file.mimeType || 'application/octet-stream',
          sizeBytes: Number(file.sizeBytes) || 0,
          expirationTime: file.expirationTime || '',
          state: (file.state as UploadedFile['state']) || 'ACTIVE',
        });
      }

      return files;
    } catch {
      return [];
    }
  }

  /**
   * Wait for a file to become active (finish processing)
   */
  async waitForProcessing(
    fileName: string,
    maxWaitMs: number = 60000,
    pollIntervalMs: number = 1000
  ): Promise<UploadedFile> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const file = await this.getFile(fileName);

      if (!file) {
        throw new Error(`File ${fileName} not found`);
      }

      if (file.state === 'ACTIVE') {
        return file;
      }

      if (file.state === 'FAILED') {
        throw new Error(`File ${fileName} processing failed`);
      }

      // Still processing, wait and retry
      await this.sleep(pollIntervalMs);
    }

    throw new Error(`File ${fileName} processing timed out after ${maxWaitMs}ms`);
  }

  /**
   * Get MIME type from file path
   */
  private getMimeType(path: string): string {
    const ext = path.toLowerCase().split('.').pop();
    switch (ext) {
      case 'png':
        return 'image/png';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'json':
        return 'application/json';
      case 'jsonl':
        return 'application/jsonl';
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Get default expiration time (48 hours from now)
   */
  private getDefaultExpiration(): string {
    const expiration = new Date();
    expiration.setHours(expiration.getHours() + 48);
    return expiration.toISOString();
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
