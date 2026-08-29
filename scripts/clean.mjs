/**
 * Cross-platform `npm run clean`.
 *
 * Replaces `Remove-Item -Recurse -Force .next`, which is a PowerShell cmdlet
 * and fails on Linux and macOS with "command not found". A file rather than a
 * `node -e` one-liner so it needs no shell-specific quote escaping, which is
 * the other half of how these scripts became Windows-only.
 */

import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Build output only. Never node_modules — that is `npm ci`, not `clean`. */
const TARGETS = ['.next', 'tsconfig.tsbuildinfo', 'coverage'];

for (const target of TARGETS) {
  const path = join(repoRoot, target);
  rmSync(path, { recursive: true, force: true });
  console.log(`removed ${target}`);
}
