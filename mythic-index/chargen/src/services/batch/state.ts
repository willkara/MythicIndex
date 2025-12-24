/**
 * Batch Run State Persistence
 *
 * Manages persistent state for batch runs, enabling resumability
 * after interruptions. State is stored in the artifact directory
 * as state.json.
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname as _dirname } from 'path';
import type {
  BatchRunState,
  BatchRunPhase,
  BatchConfig,
  BatchJobInfo,
  BatchEntityType,
  BatchTaskKind,
  DEFAULT_BATCH_CONFIG as _DEFAULT_BATCH_CONFIG,
} from '../../types/batch.js';

/** Generate a unique run ID based on current timestamp */
export function generateRunId(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

/** Get the artifact directory path for a run */
export function getArtifactDir(baseDir: string, runId: string): string {
  return join(baseDir, runId);
}

/** Get the state file path for a run */
export function getStateFilePath(artifactDir: string): string {
  return join(artifactDir, 'state.json');
}

/** Create a new run state */
export function createRunState(
  runId: string,
  scope: {
    entityTypes: BatchEntityType[];
    entityFilter?: string[];
    kinds: BatchTaskKind[];
  },
  config: BatchConfig
): BatchRunState {
  return {
    runId,
    phase: 'planned',
    scope,
    timestamps: {
      created: new Date().toISOString(),
    },
    jobs: [],
    configSnapshot: config,
  };
}

/** Load run state from disk */
export async function loadRunState(artifactDir: string): Promise<BatchRunState | null> {
  const statePath = getStateFilePath(artifactDir);

  if (!existsSync(statePath)) {
    return null;
  }

  try {
    const content = await readFile(statePath, 'utf-8');
    return JSON.parse(content) as BatchRunState;
  } catch (error) {
    console.error(`Failed to load run state from ${statePath}:`, error);
    return null;
  }
}

/** Save run state to disk */
export async function saveRunState(artifactDir: string, state: BatchRunState): Promise<void> {
  // Ensure artifact directory exists
  if (!existsSync(artifactDir)) {
    await mkdir(artifactDir, { recursive: true });
  }

  const statePath = getStateFilePath(artifactDir);
  const content = JSON.stringify(state, null, 2);
  await writeFile(statePath, content, 'utf-8');
}

/** Update run state phase with timestamp */
export function updatePhase(state: BatchRunState, phase: BatchRunPhase): BatchRunState {
  const now = new Date().toISOString();
  const timestamps = { ...state.timestamps };

  // Set appropriate timestamp based on phase
  switch (phase) {
    case 'planned':
      timestamps.planned = now;
      break;
    case 'staging':
      timestamps.stagingStarted = now;
      break;
    case 'staged':
      timestamps.staged = now;
      break;
    case 'submitted':
      timestamps.submitted = now;
      break;
    case 'running':
      timestamps.running = now;
      break;
    case 'downloading':
      timestamps.downloadingStarted = now;
      break;
    case 'applying':
      timestamps.applyingStarted = now;
      break;
    case 'completed':
      timestamps.completed = now;
      break;
    case 'failed':
      timestamps.failed = now;
      break;
  }

  return {
    ...state,
    phase,
    timestamps,
  };
}

/** Add a job to the run state */
export function addJob(state: BatchRunState, job: BatchJobInfo): BatchRunState {
  return {
    ...state,
    jobs: [...state.jobs, job],
  };
}

/** Update a job's state */
export function updateJobState(
  state: BatchRunState,
  jobId: string,
  jobState: BatchJobInfo['state']
): BatchRunState {
  return {
    ...state,
    jobs: state.jobs.map((job) => (job.jobId === jobId ? { ...job, state: jobState } : job)),
  };
}

/** Mark run as failed with error */
export function markFailed(state: BatchRunState, error: string): BatchRunState {
  return {
    ...updatePhase(state, 'failed'),
    error,
  };
}

/** Check if a phase can resume from a previous state */
export function canResumeFrom(state: BatchRunState): BatchRunPhase | null {
  // Can resume from certain phases
  const resumablePhases: BatchRunPhase[] = [
    'planned',
    'staging',
    'staged',
    'submitted',
    'running',
    'downloading',
    'applying',
  ];

  if (resumablePhases.includes(state.phase)) {
    return state.phase;
  }

  // Cannot resume from completed or failed
  return null;
}

/** List all runs in the artifact directory */
export async function listRuns(baseDir: string): Promise<string[]> {
  const { readdir } = await import('fs/promises');

  if (!existsSync(baseDir)) {
    return [];
  }

  try {
    const entries = await readdir(baseDir, { withFileTypes: true });
    const runs: string[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const statePath = join(baseDir, entry.name, 'state.json');
        if (existsSync(statePath)) {
          runs.push(entry.name);
        }
      }
    }

    // Sort by run ID (which is timestamp-based), newest first
    return runs.sort().reverse();
  } catch {
    return [];
  }
}

/** Get the most recent run that can be resumed */
export async function getMostRecentResumableRun(
  baseDir: string
): Promise<{ runId: string; state: BatchRunState } | null> {
  const runs = await listRuns(baseDir);

  for (const runId of runs) {
    const artifactDir = getArtifactDir(baseDir, runId);
    const state = await loadRunState(artifactDir);

    if (state && canResumeFrom(state)) {
      return { runId, state };
    }
  }

  return null;
}

/** Calculate duration between two timestamps in milliseconds */
export function calculateDuration(
  start: string | undefined,
  end: string | undefined
): number | undefined {
  if (!start || !end) {
    return undefined;
  }

  const startDate = new Date(start);
  const endDate = new Date(end);
  return endDate.getTime() - startDate.getTime();
}
