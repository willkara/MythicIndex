/**
 * Batch Run Reporting
 *
 * Generates summary reports for batch runs including
 * timing, success/failure counts, and detailed error logs.
 */

import { writeFile } from 'fs/promises';
import { join } from 'path';
import type {
  BatchRunState,
  BatchPlan,
  BatchRunReport,
  BatchTaskResult,
  DLQEntry,
} from '../../types/batch.js';
import { calculateDuration } from './state.js';
import { summarizeResults } from './apply.js';

/**
 * Generate a batch run report
 */
export function generateReport(
  plan: BatchPlan,
  state: BatchRunState,
  results: BatchTaskResult[],
  _dlq: DLQEntry[]
): BatchRunReport {
  const summary = summarizeResults(results);

  // Calculate timing
  const timing = {
    planningDurationMs: calculateDuration(state.timestamps.created, state.timestamps.planned),
    stagingDurationMs: calculateDuration(state.timestamps.stagingStarted, state.timestamps.staged),
    executionDurationMs: calculateDuration(
      state.timestamps.submitted,
      state.timestamps.downloadingStarted
    ),
    applyingDurationMs: calculateDuration(
      state.timestamps.applyingStarted,
      state.timestamps.completed || state.timestamps.failed
    ),
    totalDurationMs:
      calculateDuration(
        state.timestamps.created,
        state.timestamps.completed || state.timestamps.failed || new Date().toISOString()
      ) || 0,
  };

  // Collect failures
  const failures = results
    .filter((r) => r.status === 'failed')
    .map((r) => ({
      taskKey: r.taskKey,
      error: r.error?.message || 'Unknown error',
    }));

  return {
    runId: state.runId,
    phase: state.phase,
    totalTasks: plan.summary.totalTasks,
    successCount: summary.success,
    failCount: summary.failed,
    skipCount: summary.skipped + plan.summary.skippedAlreadyGenerated,
    timing,
    failures,
    jobs: state.jobs,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Save report to disk
 */
export async function saveReport(report: BatchRunReport, artifactDir: string): Promise<string> {
  const reportPath = join(artifactDir, 'report.json');
  await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  return reportPath;
}

/**
 * Format report for console display
 */
export function formatReportForConsole(report: BatchRunReport): string {
  const lines: string[] = [
    '',
    '╭─────────────────────────────────────────────────────────────╮',
    '│              BATCH GENERATION REPORT                        │',
    `│              Run ID: ${report.runId.padEnd(43)}│`,
    '╰─────────────────────────────────────────────────────────────╯',
    '',
    `Status: ${report.phase === 'completed' ? '✓ COMPLETED' : report.phase === 'failed' ? '✗ FAILED' : '⟳ ' + report.phase.toUpperCase()}`,
    '',
  ];

  // Summary with progress bar
  lines.push('Generation Results:');
  const successRate = report.totalTasks > 0 ? (report.successCount / report.totalTasks) * 100 : 0;
  const barLength = 20;
  const filledLength = Math.round((successRate / 100) * barLength);
  const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);
  lines.push(`  ${bar} ${successRate.toFixed(0)}% (${report.successCount}/${report.totalTasks} tasks)`);
  lines.push('');
  lines.push(`  • Total tasks: ${report.totalTasks}`);
  lines.push(`  • Successful: ${report.successCount} (${successRate.toFixed(1)}%)`);
  lines.push(`  • Failed: ${report.failCount}`);
  lines.push(`  • Skipped: ${report.skipCount}`);
  lines.push('');

  // Performance section
  lines.push('Performance:');
  if (report.timing.totalDurationMs) {
    const totalSeconds = report.timing.totalDurationMs / 1000;
    const avgTimePerTask = report.successCount > 0 ? totalSeconds / report.successCount : 0;
    lines.push(`  • Total duration: ${formatDuration(report.timing.totalDurationMs)}`);
    if (report.timing.planningDurationMs) {
      lines.push(`  • Planning: ${formatDuration(report.timing.planningDurationMs)}`);
    }
    if (report.timing.stagingDurationMs) {
      lines.push(`  • Staging: ${formatDuration(report.timing.stagingDurationMs)}`);
    }
    if (report.timing.executionDurationMs) {
      lines.push(`  • Execution: ${formatDuration(report.timing.executionDurationMs)}`);
    }
    if (report.timing.applyingDurationMs) {
      lines.push(`  • Applying: ${formatDuration(report.timing.applyingDurationMs)}`);
    }
    if (report.successCount > 0) {
      lines.push(`  • Avg per image: ${avgTimePerTask.toFixed(1)}s`);
      lines.push(`  • Throughput: ${(report.successCount / (totalSeconds / 60)).toFixed(2)} tasks/min`);
    }
  }
  lines.push('');

  // Cost breakdown
  const costInfo = estimateCost(report);
  lines.push('Cost Breakdown:');
  lines.push(`  • Model: gemini-3-pro-image-preview`);
  lines.push(`  • Tasks completed: ${report.successCount}`);
  lines.push(`  • Standard pricing: ~$${(report.successCount * 0.134).toFixed(2)} ($0.134/image)`);
  lines.push(`  • Batch pricing: ${costInfo.breakdown} ✓`);
  lines.push(`  • Savings: ~$${(report.successCount * (0.134 - 0.067)).toFixed(2)} (50% discount applied)`);
  lines.push('');

  // Jobs
  if (report.jobs.length > 0) {
    lines.push('Jobs:');
    lines.push('');

    for (const job of report.jobs) {
      const stateIcon = getStateIcon(job.state || 'JOB_STATE_PENDING');
      lines.push(`${stateIcon} ${job.jobId}`);
      lines.push(`   Tasks: ${job.taskCount}, Submitted: ${job.submittedAt}`);
    }
    lines.push('');
  }

  // Failures
  if (report.failures.length > 0) {
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('                        FAILURES');
    lines.push('───────────────────────────────────────────────────────────────');
    lines.push('');

    const maxToShow = 10;
    const showCount = Math.min(report.failures.length, maxToShow);

    for (let i = 0; i < showCount; i++) {
      const failure = report.failures[i];
      lines.push(`✗ ${failure.taskKey}`);
      lines.push(`  Error: ${failure.error}`);
    }

    if (report.failures.length > maxToShow) {
      lines.push(`  ... and ${report.failures.length - maxToShow} more failures`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return `${minutes}m ${remainingSeconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/**
 * Get icon for job state
 */
function getStateIcon(state: string): string {
  switch (state) {
    case 'JOB_STATE_SUCCEEDED':
      return '✓';
    case 'JOB_STATE_FAILED':
      return '✗';
    case 'JOB_STATE_CANCELLED':
      return '⊘';
    case 'JOB_STATE_RUNNING':
      return '⟳';
    case 'JOB_STATE_PENDING':
    default:
      return '○';
  }
}

/**
 * Generate a quick summary line
 */
export function getQuickSummary(report: BatchRunReport): string {
  const rate =
    report.totalTasks > 0 ? ((report.successCount / report.totalTasks) * 100).toFixed(0) : '0';
  return `${report.successCount}/${report.totalTasks} tasks completed (${rate}%) in ${formatDuration(report.timing.totalDurationMs)}`;
}

/**
 * Calculate estimated cost
 */
export function estimateCost(report: BatchRunReport): {
  estimated: number;
  currency: string;
  breakdown: string;
} {
  // Google Batch API pricing with 50% discount
  // Standard: ~$0.134 per image
  // Batch: ~$0.067 per image (50% savings)
  const costPerImage = 0.067; // Batch pricing
  const estimated = report.successCount * costPerImage;

  return {
    estimated,
    currency: 'USD',
    breakdown: `${report.successCount} images × $${costPerImage.toFixed(3)} = $${estimated.toFixed(2)}`,
  };
}
