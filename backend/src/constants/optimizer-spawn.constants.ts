// FSRS CLI argv templates. csvPath must be our safe temp path from OptimizationService, not user input.

import { resolve } from 'path';

export type OptimizerSpawnCandidate = { label: string; file: string; args: string[] };

export type OptimizerCheckCandidate = { method: string; file: string; args: string[] };

export function getFsrsOptimizerRunCandidates(csvPath: string): OptimizerSpawnCandidate[] {
  const cwd = process.cwd();
  return [
    { label: 'python3', file: 'python3', args: ['-m', 'fsrs_optimizer', csvPath] },
    { label: 'python', file: 'python', args: ['-m', 'fsrs_optimizer', csvPath] },
    { label: 'venv (root)', file: resolve(cwd, 'venv/bin/python'), args: ['-m', 'fsrs_optimizer', csvPath] },
    { label: '.venv (root)', file: resolve(cwd, '.venv/bin/python'), args: ['-m', 'fsrs_optimizer', csvPath] },
    { label: 'venv (backend)', file: resolve(cwd, 'backend/venv/bin/python'), args: ['-m', 'fsrs_optimizer', csvPath] },
    { label: 'pipx', file: 'pipx', args: ['run', 'fsrs_optimizer', csvPath] },
  ];
}

export function getFsrsOptimizerCheckCandidates(): OptimizerCheckCandidate[] {
  const cwd = process.cwd();
  return [
    { method: 'python3 (system)', file: 'python3', args: ['-c', 'import fsrs_optimizer'] },
    { method: 'python (system)', file: 'python', args: ['-c', 'import fsrs_optimizer'] },
    { method: 'venv (project root)', file: resolve(cwd, 'venv/bin/python'), args: ['-c', 'import fsrs_optimizer'] },
    { method: '.venv (project root)', file: resolve(cwd, '.venv/bin/python'), args: ['-c', 'import fsrs_optimizer'] },
    { method: 'venv (backend)', file: resolve(cwd, 'backend/venv/bin/python'), args: ['-c', 'import fsrs_optimizer'] },
    { method: 'pipx', file: 'pipx', args: ['run', 'fsrs_optimizer', '--help'] },
  ];
}
