#!/usr/bin/env node
/**
 * Release metadata validation, per-plugin version tag detection, and unified
 * release bundle builder (`dist/*.musicoext`, `dist/plugins.json`,
 * `dist/SHA256SUMS.txt`, and `dist/release-notes.md`).
 * Zero external dependencies (requires Node.js 18+, `zip`, and `unzip`).
 */

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_BUNDLE_FILENAME, discoverPlugins, packAll } from './pack.mjs';
import { loadExtension } from './runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ROOT = path.resolve(__dirname, '..');
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function getRepositorySlug() {
  return process.env.GITHUB_REPOSITORY || 'SEANPNEX/musico_plugins';
}

function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function listGitTags(rootDir) {
  const raw = execFileSync('git', ['tag', '-l'], { cwd: rootDir, encoding: 'utf8' });
  const tags = new Set();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed) tags.add(trimmed);
  }
  return tags;
}

function nextCalVerTag(existingTags, now = new Date()) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '.');
  const baseTag = `v${datePart}`;
  if (!existingTags.has(baseTag)) {
    return baseTag;
  }
  let suffix = 2;
  while (existingTags.has(`${baseTag}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseTag}-${suffix}`;
}

export function checkReleaseMetadata({ rootDir = DEFAULT_ROOT, repository = getRepositorySlug() } = {}) {
  const plugins = discoverPlugins(rootDir);
  assert.ok(plugins.length > 0, 'No plugins discovered under plugins/<slug>/<slug>.musico.js');

  const seenIds = new Map();
  const checked = [];

  for (const plugin of plugins) {
    const ext = loadExtension(plugin.entryPath, { strict: true, staticCheck: true });
    const manifest = ext.manifest;

    assert.match(
      String(manifest.version || ''),
      SEMVER_RE,
      `Plugin ${plugin.slug} has invalid SemVer version: ${manifest.version}`
    );

    const existingSlug = seenIds.get(manifest.id);
    assert.ok(
      !existingSlug,
      `Duplicate manifest.id "${manifest.id}" found in ${existingSlug} and ${plugin.slug}`
    );
    seenIds.set(manifest.id, plugin.slug);

    const expectedUpdateUrl = `https://github.com/${repository}/releases/latest/download/${plugin.slug}.musicoext`;
    assert.equal(
      manifest.updateUrl,
      expectedUpdateUrl,
      `Plugin ${plugin.slug} updateUrl must match ${expectedUpdateUrl}`
    );

    checked.push({
      slug: plugin.slug,
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      badgeLabel: manifest.badgeLabel || null,
      capabilities: [...(manifest.capabilities || [])],
      searchKinds: Array.isArray(manifest.searchKinds) ? [...manifest.searchKinds] : [],
      qualities: Array.isArray(manifest.qualities)
        ? manifest.qualities.map((q) => ({ ...q }))
        : [],
      defaultStreamQuality: manifest.defaultStreamQuality || null,
      defaultDownloadQuality: manifest.defaultDownloadQuality || null,
      updateUrl: manifest.updateUrl
    });
  }

  return checked;
}

export function detectReleaseTags({
  rootDir = DEFAULT_ROOT,
  repository = getRepositorySlug(),
  writeGithubOutput = false
} = {}) {
  const checked = checkReleaseMetadata({ rootDir, repository });
  const existingTags = listGitTags(rootDir);

  const newPluginTags = [];
  const updatedPlugins = [];

  for (const plugin of checked) {
    const pluginTag = `${plugin.slug}-v${plugin.version}`;
    if (!existingTags.has(pluginTag)) {
      newPluginTags.push(pluginTag);
      updatedPlugins.push(`${plugin.slug}@${plugin.version}`);
    }
  }

  const suggestedTag = nextCalVerTag(existingTags);
  const summary = {
    hasNewVersions: newPluginTags.length > 0,
    newPluginTags,
    updatedPlugins,
    suggestedTag,
    plugins: checked.map((p) => ({ slug: p.slug, version: p.version, tag: `${p.slug}-v${p.version}` }))
  };

  if (writeGithubOutput && process.env.GITHUB_OUTPUT) {
    const lines = [
      `has_new_versions=${summary.hasNewVersions ? 'true' : 'false'}`,
      `new_plugin_tags=${summary.newPluginTags.join(' ')}`,
      `updated_plugins=${summary.updatedPlugins.join(',')}`,
      `suggested_tag=${summary.suggestedTag}`
    ];
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, 'utf8');
  }

  return summary;
}

export function buildRelease({
  rootDir = DEFAULT_ROOT,
  repository = getRepositorySlug(),
  tag = '',
  updated = ''
} = {}) {
  const checked = checkReleaseMetadata({ rootDir, repository });
  const checkedBySlug = new Map(checked.map((p) => [p.slug, p]));

  const distDir = path.join(rootDir, 'dist');
  fs.mkdirSync(distDir, { recursive: true });
  for (const entry of fs.readdirSync(distDir, { withFileTypes: true })) {
    if (
      entry.isFile() &&
      (entry.name.endsWith('.musicoext') ||
        entry.name === ALL_BUNDLE_FILENAME ||
        entry.name === 'plugins.json' ||
        entry.name === 'SHA256SUMS.txt' ||
        entry.name === 'release-notes.md')
    ) {
      fs.rmSync(path.join(distDir, entry.name), { force: true });
    }
  }

  const packedResults = packAll({ rootDir });
  const releaseTag = tag.trim() || 'local';
  const generatedAt = new Date().toISOString();

  const pluginEntries = [];
  const checksumEntries = [];

  for (const packed of packedResults) {
    const meta = checkedBySlug.get(packed.slug);
    assert.ok(meta, `Missing checked metadata for ${packed.slug}`);
    const assetName = path.basename(packed.outFile);
    const sha256 = sha256File(packed.outFile);

    pluginEntries.push({
      ...meta,
      asset: assetName,
      sizeBytes: packed.sizeBytes,
      sha256
    });
    checksumEntries.push({ file: assetName, sha256 });
  }

  const allBundlePath = path.join(distDir, ALL_BUNDLE_FILENAME);
  assert.ok(fs.existsSync(allBundlePath), `Missing unified bundle ${ALL_BUNDLE_FILENAME} in dist/`);
  const allBundleSizeBytes = fs.statSync(allBundlePath).size;
  const allBundleSha256 = sha256File(allBundlePath);
  checksumEntries.push({ file: ALL_BUNDLE_FILENAME, sha256: allBundleSha256 });

  const catalog = {
    schemaVersion: 1,
    releaseTag,
    generatedAt,
    repository,
    bundle: {
      asset: ALL_BUNDLE_FILENAME,
      sizeBytes: allBundleSizeBytes,
      sha256: allBundleSha256,
      pluginCount: pluginEntries.length
    },
    plugins: pluginEntries
  };

  const catalogPath = path.join(distDir, 'plugins.json');
  fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  checksumEntries.push({ file: 'plugins.json', sha256: sha256File(catalogPath) });

  checksumEntries.sort((a, b) => a.file.localeCompare(b.file));
  const checksumText = checksumEntries.map((item) => `${item.sha256}  ${item.file}`).join('\n') + '\n';
  fs.writeFileSync(path.join(distDir, 'SHA256SUMS.txt'), checksumText, 'utf8');

  const updatedList = updated
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const notesLines = [`## Musico Plugins ${releaseTag}`, ''];
  if (updatedList.length > 0) {
    notesLines.push('### Updated in this release', '');
    for (const item of updatedList) {
      notesLines.push(`- \`${item}\``);
    }
    notesLines.push('');
  }

  notesLines.push('### Included Plugins', '');
  notesLines.push('| Plugin | ID | Version | Download / Auto-Update | Capabilities | SHA-256 |');
  notesLines.push('|---|---|---|---|---|---|');
  for (const item of pluginEntries) {
    const caps = item.capabilities.join(', ');
    const downloadUrl = `https://github.com/${repository}/releases/latest/download/${item.asset}`;
    notesLines.push(
      `| ${item.name} | \`${item.id}\` | \`${item.version}\` | [\`${item.asset}\`](${downloadUrl}) | \`${caps}\` | \`${item.sha256.slice(0, 12)}\` |`
    );
  }
  const allBundleUrl = `https://github.com/${repository}/releases/latest/download/${ALL_BUNDLE_FILENAME}`;
  notesLines.push(
    '',
    '### All-in-One Bundle',
    '',
    `- **Unified Import URL:** \`${allBundleUrl}\``,
    `- [\`${ALL_BUNDLE_FILENAME}\`](${allBundleUrl}) (\`${allBundleSizeBytes}\` bytes, SHA-256 \`${allBundleSha256.slice(0, 12)}\`) contains all ${pluginEntries.length} plugins for single-file or HTTPS URL import.`,
    '',
    '### Auto-Update & Verification',
    '',
    `- Every plugin manifest \`updateUrl\` points to \`https://github.com/${repository}/releases/latest/download/<slug>.musicoext\`.`,
    '- Release metadata and package SHA-256 checksums are included in `plugins.json` and `SHA256SUMS.txt`.',
    ''
  );

  fs.writeFileSync(path.join(distDir, 'release-notes.md'), notesLines.join('\n'), 'utf8');

  return {
    releaseTag,
    distDir,
    plugins: pluginEntries
  };
}

function parseArgs(argv) {
  const opts = {
    mode: '',
    githubOutput: false,
    tag: '',
    updated: ''
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      opts.mode = 'check';
    } else if (arg === '--detect-tags') {
      opts.mode = 'detect-tags';
    } else if (arg === '--build') {
      opts.mode = 'build';
    } else if (arg === '--github-output') {
      opts.githubOutput = true;
    } else if (arg === '--tag') {
      opts.tag = argv[i + 1] ?? '';
      i += 1;
    } else if (arg === '--updated') {
      opts.updated = argv[i + 1] ?? '';
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!opts.mode) {
    throw new Error('Specify one of: --check, --detect-tags, or --build');
  }
  return opts;
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
    const opts = parseArgs(process.argv.slice(2));
    if (opts.mode === 'check') {
      const checked = checkReleaseMetadata({ rootDir: DEFAULT_ROOT });
      console.log(`[PASS] release metadata verified for ${checked.length} plugin(s)`);
    } else if (opts.mode === 'detect-tags') {
      const summary = detectReleaseTags({
        rootDir: DEFAULT_ROOT,
        writeGithubOutput: opts.githubOutput
      });
      console.log(JSON.stringify(summary, null, 2));
    } else if (opts.mode === 'build') {
      const built = buildRelease({
        rootDir: DEFAULT_ROOT,
        tag: opts.tag,
        updated: opts.updated
      });
      console.log(
        `[BUILT] unified release ${built.releaseTag} (${built.plugins.length} packages + plugins.json + SHA256SUMS.txt + release-notes.md)`
      );
    }
  } catch (err) {
    console.error('RELEASE_ERROR', err?.message || err);
    process.exit(1);
  }
}
