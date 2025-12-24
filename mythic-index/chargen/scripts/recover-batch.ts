#!/usr/bin/env tsx

/**
 * Batch Results Recovery Script
 *
 * Recovers and applies results from a completed batch run that failed
 * to download or apply results.
 */

import { GoogleFilesService } from '../src/services/google/files.js';
import { GoogleBatchesService } from '../src/services/google/batches.js';
import { applyResults } from '../src/services/batch/apply.js';
import { loadRunState } from '../src/services/batch/state.js';
import {
  generateReport,
  saveReport,
  formatReportForConsole,
} from '../src/services/batch/report.js';
import { createWriteStream } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import type { BatchPlan } from '../src/types/batch.js';

const RUN_ID = '2025-12-21T04-47-38-899';

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('❌ GOOGLE_API_KEY not set');
    process.exit(1);
  }

  console.log('╭────────────────────────────────────────────╮');
  console.log('│    Batch Results Recovery Script          │');
  console.log('╰────────────────────────────────────────────╯\n');
  console.log(`Run ID: ${RUN_ID}\n`);

  // Load state and plan
  const artifactDir = `.chargen/batch/${RUN_ID}`;
  console.log('📁 Loading run state and plan...');
  const state = await loadRunState(artifactDir);
  const planContent = await readFile(join(artifactDir, 'plan.json'), 'utf-8');
  const plan = JSON.parse(planContent) as BatchPlan;

  console.log(`   Jobs: ${state.jobs.length}`);
  console.log(`   Total tasks: ${plan.summary.totalTasks}\n`);

  const filesService = new GoogleFilesService(apiKey);
  const batchesService = new GoogleBatchesService(apiKey);
  const resultFiles: string[] = [];

  // Download results for each job
  for (const job of state.jobs) {
    console.log(`📥 Downloading results for job ${job.jobId}...`);

    try {
      // Get job details to find output URI
      const jobStatus = await batchesService.getJob(job.jobId);

      if (!jobStatus.outputUri) {
        console.error(`   ❌ No output URI for job ${job.jobId}`);
        continue;
      }

      console.log(`   Output URI: ${jobStatus.outputUri}`);

      // Download using streaming (fixed in previous commit)
      const stream = await filesService.downloadFileStream(jobStatus.outputUri);
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      const resultFileName =
        job.chunkIndex > 0 ? `results-${job.chunkIndex + 1}.jsonl` : 'results.jsonl';
      const resultPath = join(artifactDir, resultFileName);

      console.log(`   Writing to: ${resultFileName}`);

      const writeStream = createWriteStream(resultPath, { encoding: 'utf-8' });
      let totalBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        writeStream.write(chunk);
        totalBytes += value.length;

        if (totalBytes % (50 * 1024 * 1024) < value.length) {
          process.stdout.write(
            `   Downloaded ${(totalBytes / (1024 * 1024)).toFixed(0)}MB...\r`
          );
        }
      }

      await new Promise<void>((resolve, reject) => {
        writeStream.end((error) => {
          if (error) reject(error);
          else resolve();
        });
      });

      console.log(`   ✅ Downloaded ${(totalBytes / (1024 * 1024)).toFixed(1)}MB\n`);
      resultFiles.push(resultPath);
    } catch (error) {
      console.error(`   ❌ Error: ${(error as Error).message}\n`);
    }
  }

  if (resultFiles.length === 0) {
    console.error('❌ No result files downloaded');
    process.exit(1);
  }

  // Apply results
  console.log('🎨 Applying results...\n');
  const applyOptions = {
    createBackup: true,
    skipExisting: false,
  };

  const { results, dlq } = await applyResults(plan, resultFiles, state, applyOptions);

  // Generate report
  const report = generateReport(plan, state, results, dlq);
  await saveReport(report, artifactDir);

  console.log('\n' + formatReportForConsole(report));

  console.log('\n✅ Recovery complete!');
  console.log(`📊 Report saved to: ${artifactDir}/report.json\n`);
}

main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
