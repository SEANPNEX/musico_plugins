import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  checkUrlPattern,
  createHostBridge,
  isHostAllowed,
  loadExtension,
  runCanHandle,
  runFetchCollection,
  runResolveStream,
  runSearch,
  scanPortabilityViolations,
  validateHostPattern
} from '../../scripts/runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_PATH = path.join(__dirname, 'netease-cloud.musico.js');

const EAPI_KEY = Buffer.from('e82ckenh8dichen8', 'utf8');

function plain(val) {
  return JSON.parse(JSON.stringify(val));
}

function goEncryptEapi(apiPath, payloadObj) {
  const payloadJson = JSON.stringify(payloadObj);
  const digest = crypto
    .createHash('md5')
    .update(`nobody${apiPath}use${payloadJson}md5forencrypt`, 'utf8')
    .digest('hex');
  const data = `${apiPath}-36cd479b6b5-${payloadJson}-36cd479b6b5-${digest}`;
  const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([cipher.update(Buffer.from(data, 'utf8')), cipher.final()])
    .toString('hex')
    .toUpperCase();
}

function goDecryptEapiHex(hexStr) {
  const buf = Buffer.from(hexStr, 'hex');
  const decipher = crypto.createDecipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([decipher.update(buf), decipher.final()]).toString('utf8');
}

function goEncryptEapiResponse(obj) {
  const cipher = crypto.createCipheriv('aes-128-ecb', EAPI_KEY, null);
  return Buffer.concat([cipher.update(Buffer.from(JSON.stringify(obj), 'utf8')), cipher.final()]);
}

function decodeAndVerifyEapiBody(bodyStr, expectedApiPath) {
  assert.match(bodyStr, /^params=[0-9A-F]+$/, 'EAPI body must be params=<UPPER_HEX>');
  const hex = bodyStr.slice('params='.length);
  const decryptedPlain = goDecryptEapiHex(hex);
  const parts = decryptedPlain.split('-36cd479b6b5-');
  assert.equal(parts.length, 3, 'Decrypted EAPI plaintext must have 3 separator parts');
  const [apiPath, payloadJson, digest] = parts;
  assert.equal(apiPath, expectedApiPath);
  const expectedDigest = crypto
    .createHash('md5')
    .update(`nobody${apiPath}use${payloadJson}md5forencrypt`, 'utf8')
    .digest('hex');
  assert.equal(digest, expectedDigest, 'EAPI MD5 digest must match Music163Api-Go');
  return JSON.parse(payloadJson);
}

test('manifest, exports, host allowlist, and strict portability check', () => {
  const source = fs.readFileSync(PLUGIN_PATH, 'utf8');
  assert.deepEqual(scanPortabilityViolations(source), []);

  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const m = ext.manifest;

  assert.equal(m.apiVersion, 1);
  assert.equal(m.id, 'com.seanpnex.musico.netease');
  assert.equal(m.name, 'NetEase Cloud Music');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'NetEase');
  assert.deepEqual(plain(m.capabilities), ['playlist', 'stream', 'search', 'cookie', 'proxy']);
  assert.equal(m.capabilities.includes('lyrics'), false);
  assert.deepEqual(plain(m.searchKinds), ['track', 'playlist', 'album']);

  assert.deepEqual(
    Object.keys(ext.exportsObj).sort(),
    ['canHandle', 'fetchCollection', 'manifest', 'resolveStream', 'search']
  );

  for (const host of m.permissions.hosts) {
    validateHostPattern(host);
  }
  assert.equal(isHostAllowed('https://music.163.com/eapi/v6/playlist/detail', m.permissions.hosts), true);
  assert.equal(isHostAllowed('https://m801.music.126.net/a/b.mp3', m.permissions.hosts), true);
  assert.equal(isHostAllowed('https://p1.music.126.net/cover.jpg', m.permissions.hosts), true);
  assert.equal(isHostAllowed('https://163cn.tv/blLBLLZa', m.permissions.hosts), true);
  assert.equal(isHostAllowed('https://163cn.link/AbC123', m.permissions.hosts), true);
  assert.equal(isHostAllowed('https://evil.example.com/steal', m.permissions.hosts), false);

  const settingsByKey = Object.fromEntries(plain(m.settings).map((s) => [s.key, s]));
  assert.equal(settingsByKey.quality.default, 'exhigh');
  assert.deepEqual(
    settingsByKey.quality.options.map((o) => o.value),
    ['standard', 'higher', 'exhigh', 'lossless', 'hires', 'jyeffect', 'sky', 'jymaster']
  );
  assert.equal(settingsByKey.allowTrialPreview.type, 'boolean');
  assert.equal(settingsByKey.allowTrialPreview.default, true);
  assert.equal(settingsByKey.customApiHeaderOs.default, 'pc');
  assert.deepEqual(
    settingsByKey.customApiHeaderOs.options.map((o) => o.value),
    ['pc', 'android', 'ios']
  );
});

test('AES-128-ECB + EAPI encryption/decryption matches Music163Api-Go vectors including UTF-8 & e_r', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  // Exact 16-byte / multi-block AES-128-ECB + MD5 verification via Music163Api-Go algorithm
  const samplePayload = { s: '周杰伦 晴天 🎵', type: 1, offset: 0, limit: 5 };
  const expectedGoHex = goEncryptEapi('/api/cloudsearch/pc', samplePayload);
  assert.match(expectedGoHex, /^[0-9A-F]+$/);

  let capturedForm = null;
  let capturedHeaders = null;

  const bridge = createHostBridge(ext.manifest, {
    settingsOverrides: { customApiHeaderOs: 'android' },
    httpResponder: async ({ method, url, headers, body }) => {
      assert.equal(method, 'POST');
      assert.equal(url, 'https://music.163.com/eapi/cloudsearch/pc');
      capturedForm = body;
      capturedHeaders = headers;

      // Return AES-128-ECB encrypted binary payload (e_r response mode) with UTF-8 Chinese + emoji
      const encryptedBuf = goEncryptEapiResponse({
        code: 200,
        result: {
          songCount: 1,
          hasMore: false,
          songs: [
            {
              id: 186016,
              name: '晴天 🎵',
              ar: [{ id: 6452, name: '周杰伦' }],
              al: { id: 18907, name: '叶惠美', picUrl: 'http://p1.music.126.net/cover.jpg' },
              dt: 269000
            }
          ]
        }
      });
      return {
        status: 200,
        headers: { 'content-type': 'application/octet-stream' },
        bodyBuffer: encryptedBuf
      };
    }
  });

  const res = await runSearch(ext, bridge, { query: '周杰伦 晴天 🎵', kind: 'track', limit: 5 });
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].title, '晴天 🎵');
  assert.equal(res.items[0].artist, '周杰伦');
  assert.equal(res.items[0].album, '叶惠美');
  assert.equal(res.items[0].artworkUrl, 'https://p1.music.126.net/cover.jpg');
  assert.equal(res.items[0].durationSec, 269);

  // Verify captured EAPI request matches Music163Api-Go exactly
  assert.equal(capturedHeaders['Content-Type'], 'application/x-www-form-urlencoded');
  assert.match(capturedHeaders['User-Agent'], /NeteaseMusic\/9\.3\.40/);
  const decryptedPayload = decodeAndVerifyEapiBody(capturedForm, '/api/cloudsearch/pc');
  assert.equal(decryptedPayload.s, '周杰伦 晴天 🎵');
  assert.equal(decryptedPayload.type, 1);
  assert.equal(decryptedPayload.offset, 0);
  assert.equal(decryptedPayload.limit, 5);
  assert.equal(typeof decryptedPayload.header, 'string');
  const innerHeader = JSON.parse(decryptedPayload.header);
  assert.equal(innerHeader.os, 'android');
  assert.equal(innerHeader.appver, '9.3.40');
  assert.ok(innerHeader.MUSIC_A && innerHeader.MUSIC_A.length > 20);
  assert.ok(innerHeader.deviceId && innerHeader.deviceId.length >= 16);

  // Cross-verify exact Go ciphertext when header matches fixed JSON
  const fixedGoHex = goEncryptEapi('/api/cloudsearch/pc', decryptedPayload);
  assert.equal(capturedForm, `params=${fixedGoHex}`);
});

test('canHandle and urlPatterns match all NetEase URL forms and reject unrelated URLs', () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  const positives = [
    ['https://music.163.com/#/playlist?id=6792103822', 'https://music.163.com/playlist?id=6792103822', 'playlist:6792103822', 'playlist'],
    ['https://music.163.com/m/playlist?userid=1&id=6792103822', 'https://music.163.com/playlist?id=6792103822', 'playlist:6792103822', 'playlist'],
    ['https://y.music.163.com/m/playlist?aid=99&id=6792103822', 'https://music.163.com/playlist?id=6792103822', 'playlist:6792103822', 'playlist'],
    ['http://music.163.com/playlist/6792103822', 'https://music.163.com/playlist?id=6792103822', 'playlist:6792103822', 'playlist'],
    ['https://music.163.com/#/album?id=18918', 'https://music.163.com/album?id=18918', 'album:18918', 'playlist'],
    ['https://music.163.com/album/18918/', 'https://music.163.com/album?id=18918', 'album:18918', 'playlist'],
    ['https://music.163.com/#/song?id=1295601353', 'https://music.163.com/song?id=1295601353', 'song:1295601353', 'track'],
    ['https://y.music.163.com/m/song?app_version=9.5.05&id=1295601353&userid=1', 'https://music.163.com/song?id=1295601353', 'song:1295601353', 'track'],
    ['https://music.163.com/song/1295601353', 'https://music.163.com/song?id=1295601353', 'song:1295601353', 'track'],
    ['https://music.163.com/#/artist?id=6452', 'https://music.163.com/artist?id=6452', 'artist:6452', 'playlist'],
    ['https://music.163.com/artist/6452', 'https://music.163.com/artist?id=6452', 'artist:6452', 'playlist'],
    ['https://163cn.tv/blLBLLZa', 'https://163cn.tv/blLBLLZa', 'short:blLBLLZa', 'playlist'],
    ['https://163cn.link/AbC_12-x', 'https://163cn.link/AbC_12-x', 'short:AbC_12-x', 'playlist']
  ];

  for (const [url, expectedNorm, expectedRemoteId, expectedKind] of positives) {
    assert.equal(checkUrlPattern(ext.manifest, url), true, `urlPatterns failed for ${url}`);
    const res = runCanHandle(ext, { rawText: url, extractedUrl: url });
    assert.equal(res.matched, true, `canHandle failed for ${url}`);
    assert.equal(res.normalizedUrl, expectedNorm);
    assert.equal(res.remoteId, expectedRemoteId);
    assert.equal(res.kind, expectedKind);
  }

  // Share text extraction via rawText
  const shared = runCanHandle(ext, {
    rawText: '分享周杰伦的单曲《晴天》: https://music.163.com/song?id=186016 (来自@网易云音乐)',
    extractedUrl: ''
  });
  assert.equal(shared.matched, true);
  assert.equal(shared.remoteId, 'song:186016');

  const patternNegatives = [
    'https://music.163.com/mv?id=123456',
    'https://music.163.com/user/home?id=123456',
    'https://evil.com/https://music.163.com/playlist?id=123',
    'hello world'
  ];
  for (const url of patternNegatives) {
    assert.equal(checkUrlPattern(ext.manifest, url), false, `urlPatterns should reject ${url}`);
  }

  const canHandleNegatives = [
    ...patternNegatives,
    'https://music.163.com/playlist?userid=123456',
    'https://music.163.com/playlist?id=0'
  ];
  for (const url of canHandleNegatives) {
    const res = runCanHandle(ext, { rawText: url, extractedUrl: url });
    assert.equal(res.matched, false, `canHandle should reject ${url}`);
  }
});

test('cookie parsing accepts full cookie string or bare MUSIC_U token and never logs secrets', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });
  const observedCookies = [];
  const observedHeaders = [];

  const responder = async ({ body, headers }) => {
    const payload = decodeAndVerifyEapiBody(body, '/api/v3/song/detail');
    observedCookies.push(headers.Cookie);
    observedHeaders.push(JSON.parse(payload.header));
    return {
      status: 200,
      headers: { 'content-type': 'application/json' },
      text: JSON.stringify({
        code: 200,
        songs: [{ id: 1295601353, name: 'Test Song', ar: [{ name: 'Artist' }], al: { name: 'Album' }, dt: 180000 }]
      })
    };
  };

  const secretFull = 'SECRET_MUSIC_U_VALUE_FULL_987654321';
  const bridgeFull = createHostBridge(ext.manifest, {
    settingsOverrides: { customApiHeaderOs: 'ios' },
    httpResponder: responder
  });
  await runFetchCollection(ext, bridgeFull, {
    url: 'https://music.163.com/song?id=1295601353',
    cookie: `MUSIC_U=${secretFull}; __csrf=csrf_abc; os=pc`
  });
  assert.match(observedCookies[0], new RegExp(`MUSIC_U=${secretFull}`));
  assert.match(observedCookies[0], /__csrf=csrf_abc/);
  assert.equal(observedCookies[0].includes('MUSIC_A='), false);
  assert.equal(observedHeaders[0].MUSIC_U, secretFull);
  assert.equal(observedHeaders[0].os, 'iPhone OS');
  assert.equal(
    bridgeFull.logs.some((l) => l.message.includes(secretFull) || l.message.includes('MUSIC_U')),
    false
  );

  const secretBare = 'BARE_RAW_MUSIC_U_TOKEN_11223344';
  const bridgeBare = createHostBridge(ext.manifest, {
    settingsOverrides: { customApiHeaderOs: 'pc' },
    httpResponder: responder
  });
  await runFetchCollection(ext, bridgeBare, {
    url: 'https://music.163.com/song?id=1295601353',
    cookie: secretBare
  });
  assert.match(observedCookies[1], new RegExp(`MUSIC_U=${secretBare}`));
  assert.equal(observedCookies[1].includes('MUSIC_A='), false);
  assert.equal(observedHeaders[1].MUSIC_U, secretBare);
  assert.equal(observedHeaders[1].os, 'pc');
  assert.equal(
    bridgeBare.logs.some((l) => l.message.includes(secretBare) || l.message.includes('MUSIC_U')),
    false
  );
});

test('fetchCollection handles shortlink redirect, playlist >200 chunk pagination (with and without KV), album, song, and artist fallback', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  const allTrackIds = Array.from({ length: 255 }, (_, i) => ({ id: 1000 + i }));
  const makeSongObj = (id) => ({
    id,
    name: `Track ${id}`,
    ar: [{ name: 'Artist A' }, { name: 'Artist B' }],
    al: { name: 'Album X', picUrl: 'http://p2.music.126.net/pic.jpg' },
    dt: 215000
  });
  const detailCalls = [];

  const responder = async ({ method, url, body }) => {
    if (method === 'GET' && url === 'https://163cn.tv/short123') {
      return { status: 302, headers: { location: '/redir-step2' }, text: '' };
    }
    if (method === 'GET' && url === 'https://163cn.tv/redir-step2') {
      return { status: 302, headers: { location: 'https://y.music.163.com/m/playlist?id=999001&userid=7' }, text: '' };
    }
    if (url === 'https://music.163.com/eapi/v6/playlist/detail') {
      const p = decodeAndVerifyEapiBody(body, '/api/v6/playlist/detail');
      assert.equal(p.id, '999001');
      assert.equal(p.n, 1000);
      assert.equal(p.s, 0);
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({
          code: 200,
          playlist: {
            id: 999001,
            name: 'Mega List',
            coverImgUrl: 'http://p1.music.126.net/pl.jpg',
            tracks: [makeSongObj(1000), makeSongObj(1001), makeSongObj(1002)],
            trackIds: allTrackIds
          }
        })
      };
    }
    if (url === 'https://music.163.com/eapi/v3/song/detail') {
      const p = decodeAndVerifyEapiBody(body, '/api/v3/song/detail');
      const ids = JSON.parse(p.c).map((x) => x.id);
      detailCalls.push(ids);
      assert.ok(ids.length <= 200, 'Chunks must not exceed 200 IDs');
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({ code: 200, songs: ids.map(makeSongObj) })
      };
    }
    if (url === 'https://music.163.com/eapi/v1/album/444') {
      decodeAndVerifyEapiBody(body, '/api/v1/album/444');
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({
          code: 200,
          album: { id: 444, name: 'Double Disc', picUrl: 'http://p1.music.126.net/al.jpg' },
          songs: [
            { id: 1, name: 'Intro', no: 1, ar: [{ name: 'A' }], al: { name: 'Double Disc' }, dt: 60000 },
            { id: 2, name: 'Intro', no: 1, ar: [{ name: 'A' }], al: { name: 'Double Disc' }, dt: 65000 }
          ]
        })
      };
    }
    if (url === 'https://music.163.com/eapi/v1/artist/777') {
      decodeAndVerifyEapiBody(body, '/api/v1/artist/777');
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({
          code: 200,
          artist: { id: 777, name: 'Fallback Artist', picUrl: 'http://p1.music.126.net/ar.jpg' },
          hotSongs: []
        })
      };
    }
    if (url === 'https://music.163.com/eapi/artist/top/song') {
      const p = decodeAndVerifyEapiBody(body, '/api/artist/top/song');
      assert.equal(p.id, 777);
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({ code: 200, songs: [makeSongObj(5001)] })
      };
    }
    return { status: 404, headers: {}, text: 'not found' };
  };

  // 1. Shortlink -> Playlist pagination with shared KV
  const bridge = createHostBridge(ext.manifest, { httpResponder: responder });
  const p1 = await runFetchCollection(ext, bridge, { url: 'https://163cn.tv/short123' });
  assert.equal(p1.remoteId, 'playlist:999001');
  assert.equal(p1.title, 'Mega List');
  assert.equal(p1.tracks.length, 3);
  assert.equal(p1.tracks[0].artist, 'Artist A / Artist B');
  assert.equal(p1.tracks[0].artworkUrl, 'https://p2.music.126.net/pic.jpg');
  assert.equal(p1.tracks[0].durationSec, 215);
  assert.equal(p1.nextCursor, 'pl:999001:3');

  const p2 = await runFetchCollection(ext, bridge, { url: 'https://music.163.com/playlist?id=999001', cursor: p1.nextCursor });
  assert.equal(p2.tracks.length, 200);
  assert.equal(p2.tracks[0].remoteTrackId, '1003');
  assert.equal(p2.tracks[0].trackNumber, 4);
  assert.equal(p2.nextCursor, 'pl:999001:203');

  // Page 3 with a brand-new bridge (KV cache miss fallback test)
  const freshBridge = createHostBridge(ext.manifest, { httpResponder: responder });
  const p3 = await runFetchCollection(ext, freshBridge, { url: 'https://music.163.com/playlist?id=999001', cursor: p2.nextCursor });
  assert.equal(p3.tracks.length, 52);
  assert.equal(p3.tracks[0].remoteTrackId, '1203');
  assert.equal(p3.tracks[51].remoteTrackId, '1254');
  assert.equal(p3.tracks[51].trackNumber, 255);
  assert.equal(p3.nextCursor, null);
  assert.deepEqual(detailCalls.map((c) => c.length), [200, 52]);

  // 2. Multi-disc album keeps unique relativePath despite duplicate song.no & title
  const al = await runFetchCollection(ext, bridge, { url: 'https://music.163.com/album?id=444' });
  assert.equal(al.remoteId, 'album:444');
  assert.equal(al.tracks.length, 2);
  assert.equal(al.tracks[0].trackNumber, 1);
  assert.equal(al.tracks[1].trackNumber, 1);
  assert.notEqual(al.tracks[0].relativePath, al.tracks[1].relativePath);
  assert.equal(al.tracks[0].artworkUrl, 'https://p1.music.126.net/al.jpg');

  // 3. Artist falls back to /eapi/artist/top/song when hotSongs is empty
  const ar = await runFetchCollection(ext, bridge, { url: 'https://music.163.com/artist?id=777' });
  assert.equal(ar.remoteId, 'artist:777');
  assert.equal(ar.title, 'Fallback Artist');
  assert.equal(ar.tracks[0].remoteTrackId, '5001');
});

test('resolveStream handles quality fallback, legacy endpoint fallback, trial previews, HTTP/HTTPS CDN negotiation, and error codes', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  // Case 1: lossless returns null -> falls back to exhigh -> HEAD HTTPS 200 upgrades URL
  const bridgeFallback = createHostBridge(ext.manifest, {
    settingsOverrides: { quality: 'lossless', customApiHeaderOs: 'pc' },
    httpResponder: async ({ method, url, body }) => {
      if (url === 'https://music.163.com/eapi/song/enhance/player/url/v1') {
        const p = decodeAndVerifyEapiBody(body, '/api/song/enhance/player/url/v1');
        if (p.level === 'lossless') {
          return { status: 200, headers: {}, text: JSON.stringify({ code: 200, data: [{ id: p.ids[0], url: null, code: 404 }] }) };
        }
        if (p.level === 'exhigh') {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 200,
              data: [{ id: p.ids[0], url: 'http://m801.music.126.net/track.flac', type: 'flac', expi: 1200, size: 30000000, freeTrialInfo: null }]
            })
          };
        }
      }
      if (method === 'HEAD' && url === 'https://m801.music.126.net/track.flac') {
        return { status: 200, headers: {}, text: '' };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });
  const s1 = await runResolveStream(ext, bridgeFallback, { remoteTrackId: '1295601353', forceRefresh: false });
  assert.equal(s1.url, 'https://m801.music.126.net/track.flac');
  assert.equal(s1.fileExtension, 'flac');
  assert.equal(s1.mimeType, 'audio/flac');
  assert.equal(s1.headers.Referer, 'https://music.163.com/');
  assert.ok(s1.headers['User-Agent']);
  assert.equal(s1.contentLength, 30000000);

  // Case 2: sky sends immerseType='c51', HTTPS HEAD fails -> preserves http://, legacy fallback works
  const bridgeLegacyHttp = createHostBridge(ext.manifest, {
    settingsOverrides: { quality: 'sky' },
    httpResponder: async ({ method, url, body }) => {
      if (url === 'https://music.163.com/eapi/song/enhance/player/url/v1') {
        const p = decodeAndVerifyEapiBody(body, '/api/song/enhance/player/url/v1');
        if (p.level === 'sky') assert.equal(p.immerseType, 'c51');
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, data: [{ id: p.ids[0], url: null }] }) };
      }
      if (url === 'https://music.163.com/eapi/song/enhance/player/url') {
        const p = decodeAndVerifyEapiBody(body, '/api/song/enhance/player/url');
        assert.equal(p.br, 999000);
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            data: [{ id: p.ids[0], url: 'http://m7.music.126.net/legacy.m4a', type: 'm4a', expi: 600 }]
          })
        };
      }
      if (method === 'HEAD' && url.startsWith('https://m7.music.126.net/')) {
        throw new Error('TLS handshake failed');
      }
      return { status: 404, headers: {}, text: '' };
    }
  });
  const s2 = await runResolveStream(ext, bridgeLegacyHttp, { remoteTrackId: '1295601353', forceRefresh: true });
  assert.equal(s2.url, 'http://m7.music.126.net/legacy.m4a');
  assert.equal(s2.fileExtension, 'm4a');
  assert.equal(s2.mimeType, 'audio/mp4');

  // Case 3: Trial preview handling (allowTrialPreview true vs false)
  const trialResponder = async ({ url }) => {
    if (url.includes('/eapi/song/enhance/player/url/v1')) {
      return {
        status: 200,
        headers: {},
        text: JSON.stringify({
          code: 200,
          data: [{ id: 186016, url: 'https://m8.music.126.net/trial.mp3', type: 'mp3', freeTrialInfo: { start: 0, end: 30 } }]
        })
      };
    }
    return { status: 200, headers: {}, text: JSON.stringify({ code: 200, data: [] }) };
  };
  const bridgeTrialOk = createHostBridge(ext.manifest, {
    settingsOverrides: { allowTrialPreview: true },
    httpResponder: trialResponder
  });
  const sTrial = await runResolveStream(ext, bridgeTrialOk, { remoteTrackId: '186016', forceRefresh: false });
  assert.equal(sTrial.url, 'https://m8.music.126.net/trial.mp3');

  const bridgeTrialBlocked = createHostBridge(ext.manifest, {
    settingsOverrides: { allowTrialPreview: false },
    httpResponder: trialResponder
  });
  await assert.rejects(
    () => runResolveStream(ext, bridgeTrialBlocked, { remoteTrackId: '186016', forceRefresh: false }),
    (err) => err.code === 'AUTH_REQUIRED'
  );

  // Case 4: No URL -> AUTH_REQUIRED without cookie, NO_PLAYABLE_STREAM with cookie
  const emptyUrlBridge = createHostBridge(ext.manifest, {
    httpResponder: async () => ({ status: 200, headers: {}, text: JSON.stringify({ code: 200, data: [{ id: 99, url: null }] }) })
  });
  await assert.rejects(
    () => runResolveStream(ext, emptyUrlBridge, { remoteTrackId: '99', forceRefresh: false }),
    (err) => err.code === 'AUTH_REQUIRED'
  );
  await assert.rejects(
    () => runResolveStream(ext, emptyUrlBridge, { remoteTrackId: '99', cookie: 'MUSIC_U=valid', forceRefresh: false }),
    (err) => err.code === 'NO_PLAYABLE_STREAM'
  );
});

test('search supports track, playlist, album, all, pagination, and /eapi/search/get fallback', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  const bridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ url, body }) => {
      if (url === 'https://music.163.com/eapi/cloudsearch/pc') {
        const p = decodeAndVerifyEapiBody(body, '/api/cloudsearch/pc');
        if (p.s === 'fallback-test') {
          return { status: 502, headers: {}, text: 'bad gateway' };
        }
        if (p.type === 1) {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 200,
              result: {
                songCount: 50,
                songs: [{ id: 11, name: `Song ${p.offset}`, ar: [{ name: 'Singer' }], al: { name: 'Alb', picUrl: 'http://p1.music.126.net/s.jpg' }, dt: 200000 }]
              }
            })
          };
        }
        if (p.type === 1000) {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 200,
              result: {
                playlistCount: 20,
                playlists: [{ id: 22, name: 'Mix 22', creator: { nickname: 'DJ' }, coverImgUrl: 'http://p1.music.126.net/p.jpg', trackCount: 40 }]
              }
            })
          };
        }
        if (p.type === 10) {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 200,
              result: {
                albumCount: 15,
                albums: [{ id: 33, name: 'Album 33', artists: [{ name: 'Band' }], picUrl: 'http://p1.music.126.net/a.jpg', size: 12 }]
              }
            })
          };
        }
      }
      if (url === 'https://music.163.com/eapi/search/get') {
        decodeAndVerifyEapiBody(body, '/api/search/get');
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            result: {
              songCount: 1,
              songs: [{ id: 88, name: 'Legacy Song', artists: [{ name: 'Legacy Artist' }], album: { name: 'Legacy Alb' }, duration: 150000 }]
            }
          })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const allPage = await runSearch(ext, bridge, { query: 'Jay', kind: 'all', limit: 10 });
  assert.equal(allPage.items.length, 3);
  assert.equal(allPage.nextCursor, 'off:10');

  const trackItem = allPage.items.find((x) => x.kind === 'track');
  assert.equal(trackItem.remoteTrackId, '11');
  assert.equal(trackItem.artworkUrl, 'https://p1.music.126.net/s.jpg');

  const plItem = allPage.items.find((x) => x.kind === 'playlist');
  assert.equal(plItem.remoteId, 'playlist:22');
  assert.equal(plItem.sourceUrl, 'https://music.163.com/playlist?id=22');
  assert.equal(plItem.trackCount, 40);

  const alItem = allPage.items.find((x) => x.kind === 'album');
  assert.equal(alItem.remoteId, 'album:33');
  assert.equal(alItem.sourceUrl, 'https://music.163.com/album?id=33');
  assert.equal(alItem.trackCount, 12);

  const trackPage2 = await runSearch(ext, bridge, { query: 'Jay', kind: 'track', limit: 10, cursor: 'off:10' });
  assert.equal(trackPage2.items[0].title, 'Song 10');
  assert.equal(trackPage2.nextCursor, 'off:11');

  const fallbackRes = await runSearch(ext, bridge, { query: 'fallback-test', kind: 'track', limit: 5 });
  assert.equal(fallbackRes.items.length, 1);
  assert.equal(fallbackRes.items[0].remoteTrackId, '88');
  assert.equal(fallbackRes.items[0].artist, 'Legacy Artist');
  assert.equal(fallbackRes.items[0].durationSec, 150);

  const emptyRes = await runSearch(ext, bridge, { query: '   ', kind: 'all', limit: 10 });
  assert.deepEqual(plain(emptyRes), { items: [], nextCursor: null });
});

test('maps standard error codes cleanly across HTTP and NetEase JSON status codes', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  await assert.rejects(
    () => runFetchCollection(ext, createHostBridge(ext.manifest), { url: 'https://example.com/nope' }),
    (err) => err.code === 'INVALID_URL'
  );

  const cases = [
    [{ status: 429, headers: {}, text: '' }, 'RATE_LIMITED'],
    [{ status: 403, headers: {}, text: '' }, 'AUTH_REQUIRED'],
    [{ status: 200, headers: {}, text: JSON.stringify({ code: 301 }) }, 'AUTH_REQUIRED'],
    [{ status: 200, headers: {}, text: JSON.stringify({ code: -460 }) }, 'RATE_LIMITED'],
    [{ status: 200, headers: {}, text: JSON.stringify({ code: 200, playlist: { id: 1, name: 'Empty', tracks: [], trackIds: [] } }) }, 'EMPTY_COLLECTION'],
    [{ status: 500, headers: {}, text: 'oops' }, 'NETWORK_ERROR']
  ];

  for (const [resp, expectedCode] of cases) {
    const bridge = createHostBridge(ext.manifest, { httpResponder: async () => resp });
    await assert.rejects(
      () => runFetchCollection(ext, bridge, { url: 'https://music.163.com/playlist?id=1' }),
      (err) => err.code === expectedCode,
      `Expected ${expectedCode} for ${JSON.stringify(resp)}`
    );
  }
});
