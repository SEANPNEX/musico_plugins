#!/usr/bin/env node
/**
 * Discovers and runs strict Musico conformance checks on all plugins/<slug>/*.musico.js
 * and executes all plugin test suites plugins/<slug>/*.test.mjs.
 * Zero external dependencies (requires Node.js 18+).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runConformance, runSelfTest } from './runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

export function discoverPluginFiles(rootDir = DEFAULT_ROOT) {
  const pluginsDir = path.join(rootDir, 'plugins');
  const musicoFiles = [];
  const testFiles = [];

  if (!fs.existsSync(pluginsDir)) {
    return { musicoFiles, testFiles };
  }

  const subdirs = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dirName of subdirs) {
    const fullDir = path.join(pluginsDir, dirName);
    const entries = fs.readdirSync(fullDir, { withFileTypes: true })
      .filter((d) => d.isFile())
      .map((d) => d.name)
      .sort();

    for (const fileName of entries) {
      const fullPath = path.join(fullDir, fileName);
      if (fileName.endsWith('.musico.js')) {
        musicoFiles.push(fullPath);
      } else if (fileName.endsWith('.test.mjs')) {
        testFiles.push(fullPath);
      }
    }
  }

  return { musicoFiles, testFiles };
}

export async function runAllTests({ rootDir = DEFAULT_ROOT } = {}) {
  const failures = [];

  // 1. Verify runner & strict VM harness invariants
  try {
    const selfRes = await runSelfTest();
    console.log(`[PASS] runner self-test (${selfRes.checkedForbiddenGlobals} forbidden globals verified)`);
  } catch (err) {
    failures.push({ label: 'scripts/runner.mjs --self-test', error: err });
    console.error('[FAIL] runner self-test:', err?.message || err);
  }

  const { musicoFiles, testFiles } = discoverPluginFiles(rootDir);

  // 2. Strict conformance & portability checks on every plugins/<slug>/*.musico.js
  for (const filePath of musicoFiles) {
    const rel = path.relative(rootDir, filePath);
    try {
      const res = runConformance(filePath, { strict: true });
      const updateNote = res.updateUrl ? `, updateUrl=ok` : '';
      console.log(`[PASS] conformance ${rel} (${res.id}@${res.version}, caps=${res.capabilities.join(',')}${updateNote})`);
    } catch (err) {
      failures.push({ label: `conformance ${rel}`, error: err });
      console.error(`[FAIL] conformance ${rel}:`, err?.message || err);
    }
  }

  // 3. Run every plugins/<slug>/*.test.mjs
  for (const testFile of testFiles) {
    const rel = path.relative(rootDir, testFile);
    console.log(`\n[RUN] ${rel}`);
    try {
      execFileSync(process.execPath, [testFile], { cwd: rootDir, stdio: 'inherit' });
      console.log(`[PASS] ${rel}`);
    } catch (err) {
      failures.push({ label: rel, error: err });
      console.error(`[FAIL] ${rel} (exit ${err?.status ?? 1})`);
    }
  }

  console.log('\nTEST_SUMMARY', {
    conformanceFiles: musicoFiles.length,
    testSuites: testFiles.length,
    failures: failures.length
  });

  if (failures.length > 0) {
    const labels = failures.map((f) => f.label).join(', ');
    throw new Error(`${failures.length} check(s) failed: ${labels}`);
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  try {
    return fs.realpathSync(path.resolve(process.argv[1])) === fs.realpathSync(__filename);
  } catch {
    return path.resolve(process.argv[1]) === __filename;
  }
}

if (isMainModule()) {
  runAllTests({ rootDir: DEFAULT_ROOT }).catch((err) => {
    console.error('TEST_ERROR', err?.message || err);
    process.exit(1);
  });
}
