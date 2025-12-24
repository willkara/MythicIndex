/**
 * Batch operations module
 *
 * Re-exports all batch workflow functions for use in the main menu.
 */

// Generation workflows
export { runBatchGenerationWorkflow, executeBatchPipeline } from './generation.js';

// Analysis workflows
export { runAnalysisWorkflow, runScaffoldAnalyzeWorkflow } from './analysis.js';

// Discovery workflow
export { runDiscoveryWorkflow } from './discovery.js';

// Management workflows
export { runResumeWorkflow, runHistoryBrowser, runDLQManager } from './management.js';

// Shared helpers (if needed externally)
export { getDefaultConfig, getApiKey } from './helpers.js';
