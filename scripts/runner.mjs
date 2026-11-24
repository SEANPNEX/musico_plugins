#!/usr/bin/env node
/**
 * Self-contained Musico API v1 conformance & strict-VM test harness.
 * Zero external dependencies (requires Node.js 18+).
 *
 * Usage:
 *   node scripts/runner.mjs --self-test
 *   node scripts/runner.mjs --check <path-to-bundle-or-.musico.js> [--compat]
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> can-handle <url>
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> fetch-collection <url> [--cookie "..."] [--cursor "..."] [--setting k=v] [--platform macos] [--compat]
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> fetch-folder <folderId> [--path a/b] [--depth 1] [--cursor "..."]
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> resolve-stream <remoteTrackId> [--cookie "..."] [--force] [--setting k=v] [--platform macos]
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> search <query> [--kind all|track|playlist|album] [--limit 20] [--cursor "..."] [--cookie "..."] [--setting k=v]
 *   node scripts/runner.mjs <path-to-bundle-or-.musico.js> search-lyrics <title> [--artist "..."] [--album "..."] [--duration 213] [--setting k=v]
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export const VALID_CAPABILITIES = new Set(['playlist', 'tree', 'stream', 'cookie', 'proxy', 'lyrics', 'search']);
export const VALID_SEARCH_KINDS = new Set(['track', 'playlist', 'album']);
export const VALID_SETTING_TYPES = new Set(['boolean', 'string', 'select']);
export const VALID_PLATFORMS = new Set(['ios', 'macos', 'android', 'windows']);

export const FORBIDDEN_PORTABILITY_GLOBALS = Object.freeze([
  'URL',
  'URLSearchParams',
  'TextEncoder',
  'TextDecoder',
  'Buffer',
  'atob',
  'btoa',
  'BigInt',
  'fetch',
  'require',
  'window',
  'document'
]);

const FORBIDDEN_GLOBAL_SET = new Set([...FORBIDDEN_PORTABILITY_GLOBALS, 'process']);

const REGEX_PRECEDING_KEYWORDS = new Set([
  'return', 'throw', 'case', 'default', 'typeof', 'void', 'delete',
  'await', 'yield', 'else', 'in', 'instanceof', 'new', 'of', 'do'
]);

export function validateHostPattern(pattern) {
  const trimmed = String(pattern || '').trim().toLowerCase().replace(/\.+$/, '');
  if (
    !trimmed ||
    trimmed === '*' ||
    trimmed.includes('://') ||
    trimmed.includes('/') ||
    /\s/.test(trimmed)
  ) {
    throw Object.assign(new Error(`Invalid host allowlist pattern: ${pattern}`), { code: 'PERMISSION_DENIED' });
  }
  if (trimmed.startsWith('*.')) {
    const domain = trimmed.slice(2);
    const labels = domain.split('.');
    if (labels.length < 2 || domain.includes('*') || labels.some((l) => l.length === 0)) {
      throw Object.assign(new Error(`Invalid host allowlist pattern: ${pattern}`), { code: 'PERMISSION_DENIED' });
    }
  } else if (trimmed.includes('*')) {
    throw Object.assign(new Error(`Invalid host allowlist pattern: ${pattern}`), { code: 'PERMISSION_DENIED' });
  }
  return trimmed;
}

export function isHostAllowed(urlString, allowedPatterns) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (!host) return false;
  for (const raw of allowedPatterns || []) {
    let pat;
    try {
      pat = validateHostPattern(raw);
    } catch {
      continue;
    }
    if (pat.startsWith('*.')) {
      const domain = pat.slice(2);
      if (domain.split('.').length < 2) continue;
      if (host.endsWith('.' + domain) && host.length > domain.length + 1) {
        return true;
      }
    } else if (host === pat) {
      return true;
    }
  }
  return false;
}

export function validateManifest(manifest) {
  assert.ok(manifest && typeof manifest === 'object' && !Array.isArray(manifest), 'manifest must be an object');
  assert.equal(manifest.apiVersion, 1, 'manifest.apiVersion must be 1');
  assert.match(String(manifest.id || ''), /^[a-z0-9._-]{3,64}$/, 'manifest.id invalid');
  assert.ok(typeof manifest.name === 'string' && manifest.name.trim().length > 0, 'manifest.name required');
  assert.match(String(manifest.version || ''), /^\d+\.\d+\.\d+([+-][0-9A-Za-z.-]+)?$/, 'manifest.version must be SemVer');

  if (manifest.badgeLabel !== undefined && manifest.badgeLabel !== null) {
    assert.ok(typeof manifest.badgeLabel === 'string', 'manifest.badgeLabel must be a string');
  }

  if (manifest.entry !== undefined && manifest.entry !== null) {
    assert.ok(typeof manifest.entry === 'string' && manifest.entry.trim().length > 0, 'manifest.entry must be a non-empty string');
    const normalizedEntry = manifest.entry.trim().replace(/\\/g, '/');
    const segments = normalizedEntry.split('/');
    assert.ok(
      !normalizedEntry.startsWith('/') &&
      !normalizedEntry.includes('\0') &&
      !segments.includes('..'),
      `Invalid manifest.entry path: ${manifest.entry}`
    );
  }

  assert.ok(Array.isArray(manifest.capabilities) && manifest.capabilities.length > 0, 'capabilities required');
  for (const cap of manifest.capabilities) {
    assert.ok(VALID_CAPABILITIES.has(String(cap)), `Unsupported capability: ${cap}`);
  }

  const requiresUrlPatterns = manifest.capabilities.includes('playlist') || manifest.capabilities.includes('tree');
  if (requiresUrlPatterns) {
    assert.ok(Array.isArray(manifest.urlPatterns) && manifest.urlPatterns.length > 0, 'urlPatterns required for playlist/tree extensions');
  } else if (manifest.urlPatterns !== undefined) {
    assert.ok(Array.isArray(manifest.urlPatterns), 'urlPatterns must be an array');
  }
  for (const pat of manifest.urlPatterns || []) {
    assert.ok(typeof pat === 'string' && pat.length > 0, 'urlPattern must be a non-empty string');
    new RegExp(pat);
  }

  if (manifest.searchKinds !== undefined) {
    assert.ok(Array.isArray(manifest.searchKinds), 'searchKinds must be an array');
    for (const kind of manifest.searchKinds) {
      assert.ok(VALID_SEARCH_KINDS.has(String(kind)), `Unsupported searchKind: ${kind}`);
    }
  }

  assert.ok(manifest.permissions && Array.isArray(manifest.permissions.hosts) && manifest.permissions.hosts.length > 0, 'permissions.hosts required');
  for (const hostPat of manifest.permissions.hosts) {
    validateHostPattern(hostPat);
  }

  if (manifest.settings !== undefined) {
    assert.ok(Array.isArray(manifest.settings), 'manifest.settings must be an array');
    const seenKeys = new Set();
    for (const spec of manifest.settings) {
      assert.ok(spec && typeof spec === 'object', 'Each setting spec must be an object');
      const key = typeof spec.key === 'string' ? spec.key.trim() : '';
      assert.ok(key.length > 0, 'Setting key must be a non-empty string');
      assert.ok(!seenKeys.has(key), `Duplicate setting key: ${key}`);
      seenKeys.add(key);
      assert.ok(typeof spec.label === 'string' && spec.label.trim().length > 0, `Setting ${key} requires a non-empty label`);
      assert.ok(VALID_SETTING_TYPES.has(String(spec.type)), `Unsupported setting type for ${key}: ${spec.type}`);
      if (spec.type === 'select') {
        assert.ok(Array.isArray(spec.options) && spec.options.length > 0, `Select setting ${key} requires options`);
        for (const opt of spec.options) {
          if (typeof opt === 'string') {
            assert.ok(opt.length > 0, `Empty select option in ${key}`);
          } else {
            assert.ok(opt && typeof opt === 'object' && typeof opt.value === 'string' && opt.value.length > 0, `Invalid select option in ${key}`);
          }
        }
      }
    }
  }

  return manifest;
}

export function validateExports(manifest, exportsObj) {
  assert.ok(exportsObj && typeof exportsObj === 'object', 'Extension must export an object via module.exports');
  const caps = new Set(manifest.capabilities || []);
  if (caps.has('playlist') || caps.has('tree')) {
    assert.equal(typeof exportsObj.canHandle, 'function', 'playlist/tree extension must export canHandle(input)');
    assert.equal(typeof exportsObj.fetchCollection, 'function', 'playlist/tree extension must export fetchCollection(ctx, req)');
  }
  if (caps.has('tree')) {
    assert.equal(typeof exportsObj.fetchFolder, 'function', 'tree extension must export fetchFolder(ctx, req)');
  }
  if (caps.has('stream')) {
    assert.equal(typeof exportsObj.resolveStream, 'function', 'stream extension must export resolveStream(ctx, req)');
  }
  if (caps.has('search')) {
    assert.equal(typeof exportsObj.search, 'function', 'search extension must export search(ctx, req)');
  }
  if (caps.has('lyrics')) {
    assert.equal(typeof exportsObj.searchLyrics, 'function', 'lyrics extension must export searchLyrics(ctx, req)');
  }
  return exportsObj;
}

/**
 * Tokenize JS source cleanly enough to find free references to forbidden globals
 * and BigInt literals without false positives in comments, strings, regex literals,
 * property accesses (.foo), or object literal property keys ({ foo: ... }).
 */
export function scanPortabilityViolations(source) {
  const src = String(source || '');
  const violations = [];
  const n = src.length;
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let prevType = null; // null | 'punct' | 'ident' | 'keyword' | 'num' | 'str' | 'regex'
  let prevVal = '';
  const templateStack = []; // brace depth for nested ${ ... } in template literals

  function posAt(idx) {
    return { line, column: idx - lineStart + 1 };
  }

  function advance(count = 1) {
    while (count > 0 && i < n) {
      if (src[i] === '\n') {
        line++;
        lineStart = i + 1;
      }
      i++;
      count--;
    }
  }

  function canStartRegex() {
    if (prevType === null) return true;
    if (prevType === 'keyword') return REGEX_PRECEDING_KEYWORDS.has(prevVal);
    if (prevType === 'punct') {
      return prevVal !== ')' && prevVal !== ']' && prevVal !== '++' && prevVal !== '--';
    }
    return false;
  }

  function peekNextNonTriviaChar(startIdx) {
    let j = startIdx;
    while (j < n) {
      const ch = src[j];
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        j++;
        continue;
      }
      if (ch === '/' && src[j + 1] === '/') {
        j += 2;
        while (j < n && src[j] !== '\n') j++;
        continue;
      }
      if (ch === '/' && src[j + 1] === '*') {
        j += 2;
        while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j++;
        j += 2;
        continue;
      }
      return src[j];
    }
    return '';
  }

  function readString(quote) {
    advance(1);
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        advance(2);
        continue;
      }
      if (ch === quote) {
        advance(1);
        break;
      }
      advance(1);
    }
    prevType = 'str';
    prevVal = quote;
  }

  function readTemplateTail() {
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        advance(2);
        continue;
      }
      if (ch === '$' && src[i + 1] === '{') {
        advance(2);
        templateStack.push(0);
        prevType = 'punct';
        prevVal = '${';
        return;
      }
      if (ch === '`') {
        advance(1);
        prevType = 'str';
        prevVal = '`';
        return;
      }
      advance(1);
    }
  }

  function readRegex() {
    advance(1); // opening /
    let inClass = false;
    while (i < n) {
      const ch = src[i];
      if (ch === '\\') {
        advance(2);
        continue;
      }
      if (ch === '[' && !inClass) {
        inClass = true;
        advance(1);
        continue;
      }
      if (ch === ']' && inClass) {
        inClass = false;
        advance(1);
        continue;
      }
      if (ch === '/' && !inClass) {
        advance(1);
        while (i < n && /[a-zA-Z]/.test(src[i])) advance(1);
        break;
      }
      if (ch === '\n' || ch === '\r') break;
      advance(1);
    }
    prevType = 'regex';
    prevVal = '/';
  }

  while (i < n) {
    const ch = src[i];

    // Whitespace
    if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
      advance(1);
      continue;
    }

    // Line comment
    if (ch === '/' && src[i + 1] === '/') {
      advance(2);
      while (i < n && src[i] !== '\n') advance(1);
      continue;
    }

    // Block comment
    if (ch === '/' && src[i + 1] === '*') {
      advance(2);
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) advance(1);
      advance(2);
      continue;
    }

    // Strings
    if (ch === '\'' || ch === '"') {
      readString(ch);
      continue;
    }

    // Template literal start
    if (ch === '`') {
      advance(1);
      readTemplateTail();
      continue;
    }

    // Template interpolation brace tracking
    if (templateStack.length > 0) {
      if (ch === '{') {
        templateStack[templateStack.length - 1]++;
      } else if (ch === '}') {
        if (templateStack[templateStack.length - 1] === 0) {
          templateStack.pop();
          advance(1);
          readTemplateTail();
          continue;
        }
        templateStack[templateStack.length - 1]--;
      }
    }

    // Regex literal vs division
    if (ch === '/' && canStartRegex()) {
      readRegex();
      continue;
    }

    // Numbers (including BigInt `123n` / `0xffn`)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] || ''))) {
      const start = i;
      const startPos = posAt(start);
      if (ch === '0' && /[xXoObB]/.test(src[i + 1] || '')) {
        advance(2);
        while (i < n && /[0-9a-fA-F_]/.test(src[i])) advance(1);
      } else {
        while (i < n && /[0-9_]/.test(src[i])) advance(1);
        if (src[i] === '.' && /[0-9]/.test(src[i + 1] || '')) {
          advance(1);
          while (i < n && /[0-9_]/.test(src[i])) advance(1);
        }
        if (/[eE]/.test(src[i] || '')) {
          advance(1);
          if (src[i] === '+' || src[i] === '-') advance(1);
          while (i < n && /[0-9_]/.test(src[i])) advance(1);
        }
      }
      if (src[i] === 'n') {
        advance(1);
        violations.push({
          ...startPos,
          token: src.slice(start, i),
          reason: 'BigInt literal is not portable across all Musico JS engines'
        });
      }
      prevType = 'num';
      prevVal = src.slice(start, i);
      continue;
    }

    // Identifiers
    if (/[a-zA-Z_$]/.test(ch)) {
      const start = i;
      const startPos = posAt(start);
      advance(1);
      while (i < n && /[a-zA-Z0-9_$]/.test(src[i])) advance(1);
      const ident = src.slice(start, i);

      const isPropAccess = prevType === 'punct' && (prevVal === '.' || prevVal === '?.');
      const isObjectKey =
        prevType === 'punct' &&
        (prevVal === '{' || prevVal === ',') &&
        peekNextNonTriviaChar(i) === ':';

      if (FORBIDDEN_GLOBAL_SET.has(ident)) {
        if (!isPropAccess && !isObjectKey) {
          violations.push({
            ...startPos,
            token: ident,
            reason: `Forbidden global "${ident}" is unavailable in strict Jint/QuickJS/JSC portability mode`
          });
        }
      } else if (
        !isPropAccess &&
        (ident === 'globalThis' || ident === 'self') &&
        peekNextNonTriviaChar(i) === '.'
      ) {
        // Check globalThis.<FORBIDDEN>
        let k = i;
        while (k < n && /\s/.test(src[k])) k++;
        if (src[k] === '.') {
          k++;
          while (k < n && /\s/.test(src[k])) k++;
          const pStart = k;
          while (k < n && /[a-zA-Z0-9_$]/.test(src[k])) k++;
          const prop = src.slice(pStart, k);
          if (FORBIDDEN_GLOBAL_SET.has(prop)) {
            violations.push({
              ...startPos,
              token: `${ident}.${prop}`,
              reason: `Forbidden global "${ident}.${prop}" is unavailable in strict Jint/QuickJS/JSC portability mode`
            });
          }
        }
      }

      if (REGEX_PRECEDING_KEYWORDS.has(ident)) {
        prevType = 'keyword';
      } else {
        prevType = 'ident';
      }
      prevVal = ident;
      continue;
    }

    // Multi-char punctuators relevant to regex/property detection
    if (src.startsWith('?.', i) || src.startsWith('=>', i) || src.startsWith('++', i) || src.startsWith('--', i)) {
      const tok = src.slice(i, i + 2);
      advance(2);
      prevType = 'punct';
      prevVal = tok;
      continue;
    }

    advance(1);
    prevType = 'punct';
    prevVal = ch;
  }

  return violations;
}

export function assertPortableSource(source) {
  const violations = scanPortabilityViolations(source);
  if (violations.length > 0) {
    const details = violations
      .slice(0, 8)
      .map((v) => `line ${v.line}:${v.column} (${v.token}): ${v.reason}`)
      .join('; ');
    throw Object.assign(
      new Error(`Portability check failed: ${details}`),
      { code: 'PORTABILITY_ERROR', violations }
    );
  }
}

export function evaluateCommonJS(source, optsOrTimeout = {}) {
  const opts = typeof optsOrTimeout === 'number'
    ? { timeoutMs: optsOrTimeout, strict: true, staticCheck: false }
    : { timeoutMs: 15000, strict: true, staticCheck: false, ...optsOrTimeout };

  if (opts.staticCheck) {
    assertPortableSource(source);
  }

  let context;
  if (opts.strict) {
    context = vm.createContext({
      console: {
        log: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        debug: () => {}
      },
      setTimeout,
      clearTimeout
    });
    // Remove V8's built-in BigInt so typeof BigInt === 'undefined' and BigInt(...) throws ReferenceError.
    vm.runInContext('delete globalThis.BigInt;', context);
  } else {
    context = vm.createContext({
      console,
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout
    });
  }

  const wrapped = `(function(exports, module) {\n${source}\n})`;
  const fn = vm.runInContext(wrapped, context, { timeout: opts.timeoutMs });
  const mod = { exports: {} };
  fn(mod.exports, mod);
  return mod.exports;
}

export function loadExtension(targetPath, opts = {}) {
  const { strict = true, staticCheck = strict, timeoutMs = 15000 } = opts;
  const abs = path.resolve(targetPath);
  const stat = fs.statSync(abs);
  let manifest;
  let source;

  if (stat.isDirectory()) {
    manifest = JSON.parse(fs.readFileSync(path.join(abs, 'manifest.json'), 'utf8'));
    const entry = manifest.entry || 'index.js';
    source = fs.readFileSync(path.join(abs, entry), 'utf8');
  } else if (abs.endsWith('.musicoext')) {
    const manifestJson = execFileSync('unzip', ['-p', abs, 'manifest.json'], { encoding: 'utf8' });
    manifest = JSON.parse(manifestJson);
    const entry = manifest.entry || 'index.js';
    source = execFileSync('unzip', ['-p', abs, entry], { encoding: 'utf8' });
  } else {
    source = fs.readFileSync(abs, 'utf8');
    const preloaded = evaluateCommonJS(source, { strict, staticCheck, timeoutMs });
    manifest = preloaded.manifest;
  }

  validateManifest(manifest);
  const exportsObj = evaluateCommonJS(source, { strict, staticCheck, timeoutMs });
  validateExports(manifest, exportsObj);
  return { manifest, source, exportsObj };
}

export function checkUrlPattern(manifest, rawUrl) {
  const patterns = manifest.urlPatterns || [];
  for (const pat of patterns) {
    const re = new RegExp(pat);
    if (re.test(String(rawUrl || ''))) {
      return true;
    }
  }
  return false;
}

export function runConformance(targetPath, opts = {}) {
  const { strict = true } = opts;
  const ext = loadExtension(targetPath, { strict, staticCheck: strict });
  return {
    id: ext.manifest.id,
    name: ext.manifest.name,
    version: ext.manifest.version,
    capabilities: ext.manifest.capabilities,
    hosts: ext.manifest.permissions.hosts,
    strictPortabilityPassed: strict,
    ext
  };
}

export function createHostBridge(
  manifest,
  {
    settingsOverrides = {},
    kvStore = new Map(),
    httpResponder = null,
    platform = 'macos',
    appVersion = '1.2.4-dev'
  } = {}
) {
  assert.ok(VALID_PLATFORMS.has(platform), `Invalid platform: ${platform}`);
  const logs = [];
  const allowedHosts = manifest.permissions?.hosts || [];
  const defaultSettings = {};
  for (const s of manifest.settings || []) {
    defaultSettings[s.key] = s.default;
  }

  function assertAllowedUrl(urlString) {
    if (!isHostAllowed(urlString, allowedHosts)) {
      throw Object.assign(new Error(`Host blocked by permissions.hosts: ${urlString}`), { code: 'PERMISSION_DENIED' });
    }
  }

  async function executeHttp(req) {
    const initialMethod = String((req && req.method) || 'GET').toUpperCase();
    let currentMethod = initialMethod;
    let currentUrl = String(req && req.url ? req.url : '');
    let headers = { ...(req?.headers || {}) };
    const followRedirects = req?.followRedirects !== false;
    const timeoutMs = Number(req?.timeoutMs || 15000);
    const maxHops = 10;

    for (let hop = 0; hop <= maxHops; hop++) {
      assertAllowedUrl(currentUrl);
      let resp;
      if (httpResponder) {
        resp = await httpResponder({
          method: currentMethod,
          url: currentUrl,
          headers: { ...headers },
          body: hop === 0 || currentMethod === initialMethod ? req?.body : undefined
        });
      } else {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const nativeRes = await fetch(currentUrl, {
            method: currentMethod,
            headers,
            body: (currentMethod !== 'GET' && currentMethod !== 'HEAD') ? req?.body : undefined,
            redirect: 'manual',
            signal: controller.signal
          });
          const buf = Buffer.from(await nativeRes.arrayBuffer());
          const hdrs = {};
          nativeRes.headers.forEach((v, k) => { hdrs[k.toLowerCase()] = v; });
          resp = { status: nativeRes.status, headers: hdrs, bodyBuffer: buf };
        } catch (err) {
          if (err && err.code === 'PERMISSION_DENIED') throw err;
          throw Object.assign(new Error(err?.message || 'HTTP request failed'), { code: 'NETWORK_ERROR' });
        } finally {
          clearTimeout(timer);
        }
      }

      const status = resp.status;
      const lowerHeaders = {};
      for (const [k, v] of Object.entries(resp.headers || {})) {
        lowerHeaders[k.toLowerCase()] = String(v);
      }

      if (followRedirects && [301, 302, 303, 307, 308].includes(status) && lowerHeaders.location) {
        const nextUrl = new URL(lowerHeaders.location, currentUrl).toString();
        const prevHost = new URL(currentUrl).hostname.toLowerCase();
        const nextHost = new URL(nextUrl).hostname.toLowerCase();
        assertAllowedUrl(nextUrl);
        if (prevHost !== nextHost) {
          for (const key of Object.keys(headers)) {
            const lk = key.toLowerCase();
            if (lk === 'cookie' || lk === 'authorization') {
              delete headers[key];
            }
          }
        }
        if (status !== 307 && status !== 308) {
          currentMethod = 'GET';
        }
        currentUrl = nextUrl;
        continue;
      }

      const buf = resp.bodyBuffer ?? Buffer.from(resp.text || '', 'utf8');
      const capped = buf.subarray(0, 8 * 1024 * 1024);
      const out = {
        status,
        finalUrl: currentUrl,
        headers: lowerHeaders,
        text: capped.toString('utf8')
      };
      if (req?.returnBytes === true || capped.length <= 1024 * 1024) {
        out.bytesBase64 = capped.toString('base64');
      }
      return out;
    }

    throw Object.assign(new Error('Too many HTTP redirects'), { code: 'NETWORK_ERROR' });
  }

  function pushLog(level, message) {
    logs.push({ timestampMs: Date.now(), level, message: String(message) });
    if (logs.length > 200) logs.shift();
  }

  const ctx = {
    http: { request: executeHttp },
    crypto: {
      md5: (s) => crypto.createHash('md5').update(String(s ?? ''), 'utf8').digest('hex'),
      sha1: (s) => crypto.createHash('sha1').update(String(s ?? ''), 'utf8').digest('hex'),
      sha256: (s) => crypto.createHash('sha256').update(String(s ?? ''), 'utf8').digest('hex'),
      hmacSha256: (k, m) => crypto.createHmac('sha256', String(k ?? '')).update(String(m ?? ''), 'utf8').digest('hex'),
      base64Encode: (s) => Buffer.from(String(s ?? ''), 'utf8').toString('base64'),
      base64Decode: (s) => Buffer.from(String(s ?? ''), 'base64').toString('utf8')
    },
    kv: {
      get: (key) => {
        const entry = kvStore.get(String(key));
        if (!entry) return null;
        if (entry.expiresAtMs !== null && Date.now() >= entry.expiresAtMs) {
          kvStore.delete(String(key));
          return null;
        }
        return entry.value;
      },
      set: (key, val, ttlSeconds) => {
        const expiresAtMs = typeof ttlSeconds === 'number' && Number.isFinite(ttlSeconds) && ttlSeconds > 0
          ? Date.now() + ttlSeconds * 1000
          : null;
        kvStore.set(String(key), { value: String(val ?? ''), expiresAtMs });
      },
      remove: (key) => {
        kvStore.delete(String(key));
      }
    },
    settings: {
      get: (key) => {
        if (Object.prototype.hasOwnProperty.call(settingsOverrides, key)) {
          return settingsOverrides[key];
        }
        if (Object.prototype.hasOwnProperty.call(defaultSettings, key)) {
          return defaultSettings[key];
        }
        return null;
      }
    },
    env: {
      platform,
      appVersion,
      apiVersion: 1
    },
    log: {
      info: (msg) => pushLog('info', msg),
      warn: (msg) => pushLog('warn', msg),
      error: (msg) => pushLog('error', msg)
    }
  };

  return { ctx, logs, assertAllowedUrl };
}

export async function invokeWithTimeout(fn, timeoutMs) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(Object.assign(new Error(`Execution timed out after ${timeoutMs}ms`), { code: 'EXTENSION_RUNTIME_ERROR' })),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function runCanHandle(ext, input) {
  assert.equal(typeof ext.exportsObj.canHandle, 'function', 'Extension must export canHandle(input)');
  const payload = typeof input === 'string'
    ? { rawText: input, extractedUrl: input }
    : { rawText: String(input?.rawText || ''), extractedUrl: String(input?.extractedUrl || input?.rawText || '') };
  return ext.exportsObj.canHandle(payload);
}

export async function runFetchCollection(ext, bridge, req, timeoutMs = 60000) {
  assert.equal(typeof ext.exportsObj.fetchCollection, 'function', 'Extension must export fetchCollection(ctx, req)');
  return invokeWithTimeout(() => ext.exportsObj.fetchCollection(bridge.ctx, req), timeoutMs);
}

export async function runFetchFolder(ext, bridge, req, timeoutMs = 60000) {
  assert.equal(typeof ext.exportsObj.fetchFolder, 'function', 'Extension must export fetchFolder(ctx, req)');
  return invokeWithTimeout(() => ext.exportsObj.fetchFolder(bridge.ctx, req), timeoutMs);
}

export async function runResolveStream(ext, bridge, req, timeoutMs = 15000) {
  assert.equal(typeof ext.exportsObj.resolveStream, 'function', 'Extension must export resolveStream(ctx, req)');
  const result = await invokeWithTimeout(() => ext.exportsObj.resolveStream(bridge.ctx, req), timeoutMs);
  assert.ok(result && typeof result === 'object', 'resolveStream() must return an object');
  bridge.assertAllowedUrl(result.url);
  for (const fb of result.fallbackUrls || []) {
    bridge.assertAllowedUrl(fb);
  }
  return result;
}

export async function runSearch(ext, bridge, req, timeoutMs = 15000) {
  assert.equal(typeof ext.exportsObj.search, 'function', 'Extension must export search(ctx, req)');
  const payload = {
    query: String(req?.query || ''),
    kind: String(req?.kind || 'all'),
    limit: Math.max(1, Number(req?.limit || 20)),
    ...(req?.cursor ? { cursor: String(req.cursor) } : {}),
    ...(req?.cookie ? { cookie: String(req.cookie) } : {})
  };
  const result = await invokeWithTimeout(() => ext.exportsObj.search(bridge.ctx, payload), timeoutMs);
  if (result == null) {
    return { items: [], nextCursor: null };
  }
  assert.ok(typeof result === 'object' && !Array.isArray(result), 'search() must return an object { items, nextCursor? }');
  assert.ok(Array.isArray(result.items), 'search() result.items must be an array');
  for (const item of result.items) {
    assert.ok(item && typeof item === 'object', 'Each search item must be an object');
    assert.ok(VALID_SEARCH_KINDS.has(String(item.kind)), `Invalid search item kind: ${item.kind}`);
    assert.ok(typeof item.title === 'string' && item.title.trim().length > 0, 'Each search item requires a non-empty title');
    if (item.kind === 'track') {
      assert.ok(item.remoteTrackId != null && String(item.remoteTrackId).trim().length > 0, 'Track search item requires remoteTrackId');
    } else {
      assert.ok(item.remoteId != null && String(item.remoteId).trim().length > 0, `${item.kind} search item requires remoteId`);
    }
  }
  return {
    items: result.items,
    nextCursor: result.nextCursor == null ? null : String(result.nextCursor)
  };
}

export async function runSearchLyrics(ext, bridge, req, timeoutMs = 15000) {
  assert.equal(typeof ext.exportsObj.searchLyrics, 'function', 'Extension must export searchLyrics(ctx, req)');
  const payload = {
    title: String(req?.title || ''),
    artist: String(req?.artist || ''),
    ...(req?.album ? { album: String(req.album) } : {}),
    ...(typeof req?.durationSec === 'number' && Number.isFinite(req.durationSec) && req.durationSec > 0
      ? { durationSec: req.durationSec }
      : {})
  };
  const result = await invokeWithTimeout(() => ext.exportsObj.searchLyrics(bridge.ctx, payload), timeoutMs);
  if (result == null) return [];
  if (Array.isArray(result)) return result;
  if (typeof result === 'object') {
    if (Array.isArray(result.candidates)) return result.candidates;
    if (Array.isArray(result.results)) return result.results;
  }
  throw Object.assign(new Error('searchLyrics() must return an array or { candidates | results } object'), {
    code: 'EXTENSION_RUNTIME_ERROR'
  });
}

export async function runSelfTest() {
  // 1. Validate host allowlist rules (including >= 2 labels after *.)
  assert.equal(validateHostPattern('Example.COM.'), 'example.com');
  assert.equal(validateHostPattern('*.cdn.example.com'), '*.cdn.example.com');
  for (const bad of ['', '*', '*.com', '*.net', 'https://example.com', 'example.com/path', 'a.*.example.com']) {
    assert.throws(() => validateHostPattern(bad), (err) => err.code === 'PERMISSION_DENIED', `Expected invalid host pattern: ${bad}`);
  }
  assert.equal(isHostAllowed('https://edge1.cdn.example.com/a.mp3', ['*.cdn.example.com']), true);
  assert.equal(isHostAllowed('https://cdn.example.com/a.mp3', ['*.cdn.example.com']), false);
  assert.equal(isHostAllowed('file:///etc/passwd', ['example.com']), false);

  // 2. Validate manifest constraints
  assert.throws(() => validateManifest({
    apiVersion: 1,
    id: 'com.example.invalid.playlist',
    name: 'Invalid Playlist',
    version: '1.0.0',
    capabilities: ['playlist', 'stream'],
    urlPatterns: [],
    permissions: { hosts: ['example.com'] }
  }), /urlPatterns required/);

  assert.throws(() => validateManifest({
    apiVersion: 1,
    id: 'com.example.invalid.cap',
    name: 'Invalid Cap',
    version: '1.0.0',
    capabilities: ['unknown-cap'],
    permissions: { hosts: ['example.com'] }
  }), /Unsupported capability/);

  assert.throws(() => validateManifest({
    apiVersion: 1,
    id: 'com.example.invalid.kind',
    name: 'Invalid Kind',
    version: '1.0.0',
    capabilities: ['search'],
    searchKinds: ['podcast'],
    permissions: { hosts: ['example.com'] }
  }), /Unsupported searchKind/);

  // 3. Verify strict VM omits every forbidden global at runtime
  for (const sym of FORBIDDEN_PORTABILITY_GLOBALS) {
    const probeSource = `
      var manifest = {
        apiVersion: 1,
        id: 'com.test.strict.${sym.toLowerCase()}',
        name: 'Strict Probe',
        version: '1.0.0',
        capabilities: ['search'],
        permissions: { hosts: ['api.example.com'] }
      };
      async function search() {
        return { items: [{ kind: 'track', remoteTrackId: '1', title: String(${sym}) }] };
      }
      module.exports = { manifest: manifest, search: search };
    `;
    const exported = evaluateCommonJS(probeSource, { strict: true, staticCheck: false });
    await assert.rejects(
      () => exported.search(),
      (err) => err && (err.name === 'ReferenceError' || err.name === 'TypeError'),
      `Strict VM should fail when accessing ${sym}`
    );

    // Static portability scan must catch it even before execution
    assert.throws(
      () => assertPortableSource(probeSource),
      (err) => err.code === 'PORTABILITY_ERROR',
      `Static portability check should catch ${sym}`
    );
  }

  // Catch BigInt literals (e.g. 123n) too
  assert.throws(
    () => assertPortableSource('var x = 42n;'),
    (err) => err.code === 'PORTABILITY_ERROR'
  );

  // Must NOT false-positive on comments, strings, regexes, property names, or object keys
  assertPortableSource(`
    // URLSearchParams TextEncoder Buffer fetch window document
    /* require('fs') atob btoa BigInt */
    var s = "URL Buffer fetch window document";
    var t = \`hello \${1 + 2} require Buffer\`;
    var re = /Buffer|URL|fetch/gi;
    var obj = { fetch: true, URL: 'https://example.com', document: 1 };
    var v = obj.fetch + obj.URL;
    var n = 10 / 2;
  `);

  // 4. Verify redirect host enforcement, cross-host cookie stripping, and resolveStream host enforcement
  const mockManifest = validateManifest({
    apiVersion: 1,
    id: 'com.test.bridge',
    name: 'Bridge Test',
    version: '1.0.0',
    capabilities: ['playlist', 'stream', 'cookie'],
    urlPatterns: ['^https://fixture\\.test/p/[a-z0-9]+$'],
    permissions: { hosts: ['fixture.test', 'other.fixture.test', '*.cdn.fixture.test'] },
    settings: [{ key: 'q', label: 'Quality', type: 'select', default: 'high', options: ['high', 'std'] }]
  });

  const seenHeaders = [];
  const bridge = createHostBridge(mockManifest, {
    platform: 'ios',
    httpResponder: async ({ url, headers }) => {
      seenHeaders.push({ url, headers });
      if (url === 'https://fixture.test/redir-ok') {
        return { status: 302, headers: { location: 'https://other.fixture.test/target' }, text: '' };
      }
      if (url === 'https://other.fixture.test/target') {
        return { status: 200, headers: { 'content-type': 'text/plain' }, text: 'ok' };
      }
      if (url === 'https://fixture.test/redir-evil') {
        return { status: 302, headers: { location: 'https://evil.example.com/steal' }, text: '' };
      }
      return { status: 404, headers: {}, text: 'missing' };
    }
  });

  const redirRes = await bridge.ctx.http.request({
    method: 'GET',
    url: 'https://fixture.test/redir-ok',
    headers: { Cookie: 'secret=1', Authorization: 'Bearer abc', 'X-Keep': 'yes' }
  });
  assert.equal(redirRes.text, 'ok');
  assert.equal(seenHeaders[1].headers.Cookie, undefined);
  assert.equal(seenHeaders[1].headers.Authorization, undefined);
  assert.equal(seenHeaders[1].headers['X-Keep'], 'yes');

  await assert.rejects(
    () => bridge.ctx.http.request({ method: 'GET', url: 'https://fixture.test/redir-evil' }),
    (err) => err.code === 'PERMISSION_DENIED'
  );

  const mockExt = {
    manifest: mockManifest,
    source: '',
    exportsObj: {
      canHandle: () => ({ matched: true }),
      fetchCollection: async () => ({ remoteId: '1', title: 't', tracks: [] }),
      resolveStream: async (_ctx, req) => ({
        url: req.remoteTrackId === 'bad' ? 'https://evil.example.com/a.mp3' : 'https://edge1.cdn.fixture.test/a.mp3',
        fallbackUrls: req.remoteTrackId === 'bad-fb' ? ['https://evil.example.com/b.mp3'] : ['https://edge2.cdn.fixture.test/b.mp3'],
        fileExtension: 'mp3'
      })
    }
  };
  await runResolveStream(mockExt, bridge, { remoteTrackId: 'ok', forceRefresh: false });
  await assert.rejects(
    () => runResolveStream(mockExt, bridge, { remoteTrackId: 'bad', forceRefresh: false }),
    (err) => err.code === 'PERMISSION_DENIED'
  );
  await assert.rejects(
    () => runResolveStream(mockExt, bridge, { remoteTrackId: 'bad-fb', forceRefresh: false }),
    (err) => err.code === 'PERMISSION_DENIED'
  );

  // 5. Verify crypto, kv TTL, settings, env, logs
  assert.equal(bridge.ctx.crypto.md5('musico'), '860a75194508c8447e93dbcba86b5ffe');
  assert.equal(bridge.ctx.crypto.sha1('musico'), 'e16682e68bc1074d3b8f9e4c9869ebcdb3b20090');
  assert.equal(bridge.ctx.crypto.base64Decode(bridge.ctx.crypto.base64Encode('hello')), 'hello');
  bridge.ctx.kv.set('k', 'v', 60);
  assert.equal(bridge.ctx.kv.get('k'), 'v');
  bridge.ctx.kv.remove('k');
  assert.equal(bridge.ctx.kv.get('k'), null);
  assert.equal(bridge.ctx.settings.get('q'), 'high');
  assert.equal(bridge.ctx.env.platform, 'ios');
  assert.equal(bridge.ctx.env.apiVersion, 1);

  return {
    ok: true,
    checkedForbiddenGlobals: FORBIDDEN_PORTABILITY_GLOBALS.length
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    const res = await runSelfTest();
    console.log('RUNNER_SELF_TESTS_PASSED', res);
    return;
  }

  const strict = !args.includes('--compat');
  const filteredArgs = args.filter((a) => a !== '--strict' && a !== '--compat');

  if (filteredArgs[0] === '--check' && filteredArgs[1]) {
    const summary = runConformance(filteredArgs[1], { strict });
    console.log(JSON.stringify({
      ok: true,
      id: summary.id,
      name: summary.name,
      version: summary.version,
      capabilities: summary.capabilities,
      hosts: summary.hosts,
      strictPortabilityPassed: summary.strictPortabilityPassed
    }, null, 2));
    return;
  }

  if (filteredArgs.length < 3) {
    console.error(
      'Usage: node scripts/runner.mjs [--self-test | --check <path> [--compat] | <path> <can-handle|fetch-collection|fetch-folder|resolve-stream|search|search-lyrics> <target> [options]]'
    );
    process.exit(2);
  }

  const [extPath, command, target, ...rest] = filteredArgs;
  let cookie = null;
  let cursor = null;
  let depth = 1;
  let pathSegments = [];
  let forceRefresh = false;
  let kind = 'all';
  let limit = 20;
  let artist = '';
  let album = null;
  let durationSec = null;
  let platform = 'macos';
  const settingsOverrides = {};

  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i];
    if (flag === '--cookie' && rest[i + 1]) cookie = rest[++i];
    else if (flag === '--cursor' && rest[i + 1]) cursor = rest[++i];
    else if (flag === '--depth' && rest[i + 1]) depth = Number(rest[++i]);
    else if (flag === '--path' && rest[i + 1]) pathSegments = rest[++i].split('/').filter(Boolean);
    else if (flag === '--force') forceRefresh = true;
    else if (flag === '--kind' && rest[i + 1]) kind = rest[++i];
    else if (flag === '--limit' && rest[i + 1]) limit = Number(rest[++i]);
    else if (flag === '--artist' && rest[i + 1]) artist = rest[++i];
    else if (flag === '--album' && rest[i + 1]) album = rest[++i];
    else if (flag === '--duration' && rest[i + 1]) durationSec = Number(rest[++i]);
    else if (flag === '--platform' && rest[i + 1]) platform = rest[++i];
    else if (flag === '--setting' && rest[i + 1]) {
      const eq = rest[++i];
      const idx = eq.indexOf('=');
      if (idx > 0) {
        const k = eq.slice(0, idx);
        const v = eq.slice(idx + 1);
        settingsOverrides[k] = v === 'true' ? true : v === 'false' ? false : v;
      }
    }
  }

  const ext = loadExtension(extPath, { strict });
  const bridge = createHostBridge(ext.manifest, { settingsOverrides, platform });
  let output;
  if (command === 'can-handle') {
    output = runCanHandle(ext, target);
  } else if (command === 'fetch-collection') {
    output = await runFetchCollection(ext, bridge, { url: target, cookie, cursor }, 60000);
  } else if (command === 'fetch-folder') {
    output = await runFetchFolder(ext, bridge, { folderId: target, pathSegments, depth, cookie, cursor }, 60000);
  } else if (command === 'resolve-stream') {
    output = await runResolveStream(ext, bridge, { remoteTrackId: target, cookie, forceRefresh }, 15000);
  } else if (command === 'search') {
    output = await runSearch(ext, bridge, { query: target, kind, limit, cursor, cookie }, 15000);
  } else if (command === 'search-lyrics') {
    output = await runSearchLyrics(ext, bridge, { title: target, artist, album, durationSec }, 15000);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  console.log(JSON.stringify({ result: output, logs: bridge.logs }, null, 2));
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
  main().catch((err) => {
    console.error('RUNNER_ERROR', err?.code || 'ERROR', err?.message || err);
    process.exit(1);
  });
}
