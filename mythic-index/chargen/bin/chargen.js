#!/usr/bin/env node

/**
 * CLI wrapper that uses local tsx to run the TypeScript entry point
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const tsxPath = join(projectRoot, 'node_modules', '.bin', 'tsx');
const entryPoint = join(projectRoot, 'src', 'index.ts');

const child = spawn(tsxPath, [entryPoint], {
  stdio: 'inherit',
  cwd: projectRoot,
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
