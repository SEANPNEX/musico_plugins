#!/usr/bin/env node
/**
 * Validates single-file `plugins/<slug>/<slug>.musico.js` extensions and packages
 * each into `dist/<slug>.musicoext` (zip archive containing `manifest.json` + `index.js`).
 * Zero external dependencies (requires Node.js 18+, `zip`, and `unzip`).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadExtension } from './runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');

const MAX_ARCHIVE_ENTRIES = 256;
const MAX_UNCOMPRESSED_BYTES = 16 * 1024 * 1024;

export function discoverPlugins(rootDir = DEFAULT_ROOT) {
  const pluginsDir = path.join(rootDir, 'plugins');
  if (!fs.existsSync(pluginsDir)) {
    return [];
  }
  const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const discovered = [];
  for (const slug of entries) {
    const dir = path.join(pluginsDir, slug);
    const entryPath = path.join(dir, `${slug}.musico.js`);
    if (fs.existsSync(entryPath) && fs.statSync(entryPath).isFile()) {
      const iconCandidate = path.join(dir, 'icon.png');
      discovered.push({
        slug,
        dir,
        entryPath,
        iconPath: fs.existsSync(iconCandidate) && fs.statSync(iconCandidate).isFile() ? iconCandidate : null
      });
    }
  }
  return discovered;
}

export function packPlugin({ slug, entryPath, iconPath = null, distDir }) {
  const ext = loadExtension(entryPath, { strict: true, staticCheck: true });
  const manifestForBundle = {
    ...ext.manifest,
    entry: 'index.js'
  };
  const manifestText = JSON.stringify(manifestForBundle, null, 2) + '\n';
  const indexText = fs.readFileSync(entryPath, 'utf8');

  const manifestBytes = Buffer.byteLength(manifestText, 'utf8');
  const indexBytes = Buffer.byteLength(indexText, 'utf8');
  const iconBytes = iconPath ? fs.statSync(iconPath).size : 0;
  const totalUncompressed = manifestBytes + indexBytes + iconBytes;
  assert.ok(
    totalUncompressed <= MAX_UNCOMPRESSED_BYTES,
    `Bundle ${slug} exceeds ${MAX_UNCOMPRESSED_BYTES} byte uncompressed limit (${totalUncompressed} bytes)`
  );

  fs.mkdirSync(distDir, { recursive: true });
  const outFile = path.join(distDir, `${slug}.musicoext`);
  fs.rmSync(outFile, { force: true });

  const stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'musico-pack-'));
  try {
    fs.writeFileSync(path.join(stagingDir, 'manifest.json'), manifestText, 'utf8');
    fs.writeFileSync(path.join(stagingDir, 'index.js'), indexText, 'utf8');
    const filesToZip = ['manifest.json', 'index.js'];
    if (iconPath) {
      fs.copyFileSync(iconPath, path.join(stagingDir, 'icon.png'));
      filesToZip.push('icon.png');
    }

    assert.ok(filesToZip.length <= MAX_ARCHIVE_ENTRIES, `Too many entries in ${slug}`);
    execFileSync('zip', ['-X', '-q', outFile, ...filesToZip], { cwd: stagingDir });
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  // Verify zip archive structure and integrity via unzip -t and unzip -l
  execFileSync('unzip', ['-t', '-q', outFile]);
  const unzipListing = execFileSync('unzip', ['-l', outFile], { encoding: 'utf8' });
  assert.match(unzipListing, /\bmanifest\.json\b/, `${slug}.musicoext missing manifest.json in unzip -l`);
  assert.match(unzipListing, /\bindex\.js\b/, `${slug}.musicoext missing index.js in unzip -l`);

  // Round-trip load the packed .musicoext archive with strict portability checks
  const packedExt = loadExtension(outFile, { strict: true, staticCheck: true });
  assert.equal(packedExt.manifest.id, ext.manifest.id, `Packed manifest.id mismatch for ${slug}`);
  assert.equal(packedExt.manifest.entry, 'index.js', `Packed manifest.entry mismatch for ${slug}`);
  if (ext.manifest.updateUrl !== undefined) {
    assert.equal(packedExt.manifest.updateUrl, ext.manifest.updateUrl, `Packed manifest.updateUrl mismatch for ${slug}`);
  }
  if (ext.manifest.qualities !== undefined) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(packedExt.manifest.qualities)),
      JSON.parse(JSON.stringify(ext.manifest.qualities)),
      `Packed manifest.qualities mismatch for ${slug}`
    );
  }
  if (ext.manifest.defaultStreamQuality !== undefined) {
    assert.equal(
      packedExt.manifest.defaultStreamQuality,
      ext.manifest.defaultStreamQuality,
      `Packed manifest.defaultStreamQuality mismatch for ${slug}`
    );
  }
  if (ext.manifest.defaultDownloadQuality !== undefined) {
    assert.equal(
      packedExt.manifest.defaultDownloadQuality,
      ext.manifest.defaultDownloadQuality,
      `Packed manifest.defaultDownloadQuality mismatch for ${slug}`
    );
  }

  return {
    slug,
    id: ext.manifest.id,
    version: ext.manifest.version,
    updateUrl: ext.manifest.updateUrl || null,
    outFile,
    sizeBytes: fs.statSync(outFile).size,
    unzipListing
  };
}

export function packAll({ rootDir = DEFAULT_ROOT, slugs = [] } = {}) {
  const all = discoverPlugins(rootDir);
  let targets = all;
  if (slugs.length > 0) {
    const bySlug = new Map(all.map((p) => [p.slug, p]));
    targets = slugs.map((s) => {
      const found = bySlug.get(s);
      if (!found) {
        throw new Error(`Plugin not found: plugins/${s}/${s}.musico.js`);
      }
      return found;
    });
  }

  if (targets.length === 0) {
    console.log('No plugins discovered under plugins/<slug>/<slug>.musico.js');
    return [];
  }

  const distDir = path.join(rootDir, 'dist');
  const results = [];
  for (const plugin of targets) {
    const packed = packPlugin({ ...plugin, distDir });
    results.push(packed);
    console.log(`[PACKED] ${packed.slug} (${packed.id}@${packed.version}) -> ${path.relative(rootDir, packed.outFile)} (${packed.sizeBytes} bytes)`);
    console.log(packed.unzipListing.trimEnd());
  }
  return results;
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
  try {
    const slugs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
    packAll({ rootDir: DEFAULT_ROOT, slugs });
  } catch (err) {
    console.error('PACK_ERROR', err?.code || 'ERROR', err?.message || err);
    process.exit(1);
  }
}
