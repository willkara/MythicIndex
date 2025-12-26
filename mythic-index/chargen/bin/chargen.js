#!/usr/bin/env node

/**
 * CLI wrapper that uses local tsx to run the TypeScript entry point
 * Works on both Windows and Unix/Linux/macOS
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const entryPoint = join(projectRoot, 'src', 'index.ts');
const isWindows = process.platform === 'win32';

let child;

if (isWindows) {
  // Windows: use quoted path to handle spaces in OneDrive paths
  const cmd = `npx tsx "${entryPoint}"`;
  child = spawn(cmd, [], {
    stdio: 'inherit',
    cwd: projectRoot,
    shell: true,
  });
} else {
  // Unix/Linux/macOS: direct tsx execution
  const tsxPath = join(projectRoot, 'node_modules', '.bin', 'tsx');
  child = spawn(tsxPath, [entryPoint], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
}

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
