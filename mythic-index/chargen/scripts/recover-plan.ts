
import { join } from 'path';
import { readFile, writeFile } from 'fs/promises';
import { createBatchPlan, type BatchPlanOptions } from '../src/services/batch/planners/index.js';
import { getArtifactDir } from '../src/services/batch/state.js';
import { initEntityCache } from '../src/services/entity-cache.js';
import type { BatchRunState } from '../src/types/batch.js';

async function recoverPlan(runId: string) {
  // Initialize cache first
  console.log('Initializing entity cache...');
  await initEntityCache();

  const artifactDir = getArtifactDir('.chargen/batch', runId);
  const statePath = join(artifactDir, 'state.json');
  const planPath = join(artifactDir, 'plan.json');

  console.log(`Recovering plan for run: ${runId}`);
  console.log(`Artifact dir: ${artifactDir}`);

  try {
    const stateContent = await readFile(statePath, 'utf-8');
    const state = JSON.parse(stateContent) as BatchRunState;
    
    console.log(`Loaded state. Phase: ${state.phase}`);
    console.log(`Scope: ${JSON.stringify(state.scope)}`);

    const options: BatchPlanOptions = {
      entityTypes: state.scope.entityTypes,
      kinds: state.scope.kinds,
      slugFilter: state.scope.entityFilter,
      skipGenerated: true, // Assuming default
      config: state.configSnapshot,
      runId: runId, // Pass the ID so it's in the plan
      dryRun: true // Important: don't overwrite state.json!
    };

    console.log('Regenerating plan...');
    const result = await createBatchPlan(options);
    
    // The plan.runId should match options.runId
    const plan = result.plan;
    
    console.log(`Generated plan with ${plan.tasks.length} tasks.`);
    
    // Write the plan file manually
    await writeFile(planPath, JSON.stringify(plan, null, 2), 'utf-8');
    console.log(`Successfully wrote plan.json to ${planPath}`);
    
  } catch (error) {
    console.error('Failed to recover plan:', error);
  }
}

// Get run ID from args
const runId = process.argv[2];
if (!runId) {
  console.error('Please provide run ID as argument');
  process.exit(1);
}

recoverPlan(runId);
