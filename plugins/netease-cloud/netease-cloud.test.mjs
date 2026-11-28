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
  runPollQrLogin,
  runResolveStream,
  runSearch,
  runSearchLyrics,
  runStartQrLogin,
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
  assert.equal(m.version, '1.3.1');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'NetEase');
  assert.equal(
    m.updateUrl,
    'https://github.com/SEANPNEX/musico_plugins/releases/latest/download/netease-cloud.musicoext'
  );
  assert.deepEqual(plain(m.capabilities), ['playlist', 'stream', 'search', 'lyrics', 'cookie', 'qr_login', 'proxy']);
  assert.equal(m.capabilities.includes('lyrics'), true);
  assert.deepEqual(plain(m.searchKinds), ['track', 'playlist', 'album']);
  assert.deepEqual(
    plain(m.qualities).map((q) => q.id),
    ['highest', 'jymaster', 'sky', 'jyeffect', 'hires', 'lossless', 'exhigh', 'higher', 'standard']
  );
  assert.equal(plain(m.qualities)[0].badge, 'Hi-Res');
  assert.equal(plain(m.qualities)[0].lossless, true);
  assert.equal(m.defaultStreamQuality, 'standard');
  assert.equal(m.defaultDownloadQuality, 'highest');

  assert.deepEqual(
    Object.keys(ext.exportsObj).sort(),
    ['canHandle', 'fetchCollection', 'manifest', 'pollQrLogin', 'resolveStream', 'search', 'searchLyrics', 'startQrLogin']
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
  assert.equal(s1.actualQuality, 'exhigh');
  assert.equal(s1.qualityLabel, '320k');
  assert.equal(s1.bitrateKbps, 320);
  assert.equal(s1.headers.Referer, 'https://music.163.com/');
  assert.ok(s1.headers['User-Agent']);
  assert.equal(s1.contentLength, 30000000);

  // Case 1b: req.quality='highest' overrides setting and cascades jymaster -> hires -> lossless -> exhigh -> standard
  const highestAttempts = [];
  const bridgeHighest = createHostBridge(ext.manifest, {
    settingsOverrides: { quality: 'standard' },
    httpResponder: async ({ url, body }) => {
      if (url === 'https://music.163.com/eapi/song/enhance/player/url/v1') {
        const p = decodeAndVerifyEapiBody(body, '/api/song/enhance/player/url/v1');
        highestAttempts.push(p.level);
        if (p.level === 'lossless') {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 200,
              data: [{ id: p.ids[0], url: 'https://m801.music.126.net/hires-fallback.flac', type: 'flac', level: 'lossless', br: 999000 }]
            })
          };
        }
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, data: [{ id: p.ids[0], url: null }] }) };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });
  const sHighest = await runResolveStream(ext, bridgeHighest, {
    remoteTrackId: '1295601353',
    quality: 'highest',
    purpose: 'download'
  });
  assert.deepEqual(highestAttempts, ['jymaster', 'hires', 'lossless']);
  assert.equal(sHighest.actualQuality, 'lossless');
  assert.equal(sHighest.qualityLabel, 'FLAC');
  assert.equal(sHighest.bitrateKbps, 999);

  // Case 1c: empty settings.quality falls back to req.purpose ('download' -> 'highest', 'stream' -> 'standard')
  const purposeLevels = [];
  const bridgePurposeFallback = createHostBridge(ext.manifest, {
    settingsOverrides: { quality: '' },
    httpResponder: async ({ url, body }) => {
      if (url === 'https://music.163.com/eapi/song/enhance/player/url/v1') {
        const p = decodeAndVerifyEapiBody(body, '/api/song/enhance/player/url/v1');
        purposeLevels.push(p.level);
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            data: [{ id: p.ids[0], url: `https://m801.music.126.net/${p.level}.mp3`, type: 'mp3', level: p.level, br: p.level === 'jymaster' ? 1920000 : 128000 }]
          })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });
  const sPurposeDl = await runResolveStream(ext, bridgePurposeFallback, { remoteTrackId: '1295601353', purpose: 'download' });
  const sPurposeStr = await runResolveStream(ext, bridgePurposeFallback, { remoteTrackId: '1295601353', purpose: 'stream' });
  assert.deepEqual(purposeLevels, ['jymaster', 'standard']);
  assert.equal(sPurposeDl.actualQuality, 'jymaster');
  assert.equal(sPurposeDl.qualityLabel, 'Master');
  assert.equal(sPurposeDl.bitrateKbps, 1920);
  assert.equal(sPurposeStr.actualQuality, 'standard');
  assert.equal(sPurposeStr.qualityLabel, '128k');
  assert.equal(sPurposeStr.bitrateKbps, 128);

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

test('qr_login startQrLogin and pollQrLogin follow Music163Api-Go EAPI flow and protect secrets', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  const secretToken = 'QR_SECRET_MUSIC_U_99887766';
  const csrfToken = 'csrf_qr_token_42';
  let checkPhase = 'pending';

  const bridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ url, headers, body }) => {
      if (url === 'https://music.163.com/eapi/login/qrcode/unikey') {
        const p = decodeAndVerifyEapiBody(body, '/api/login/qrcode/unikey');
        assert.equal(p.type, '3');
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({ code: 200, unikey: 'unikey-1234-abcd' })
        };
      }
      if (url === 'https://music.163.com/eapi/login/qrcode/client/login') {
        const p = decodeAndVerifyEapiBody(body, '/api/login/qrcode/client/login');
        assert.equal(p.key, 'unikey-1234-abcd');
        assert.equal(p.type, '3');
        if (checkPhase === 'pending') {
          return { status: 200, headers: {}, text: JSON.stringify({ code: 801, message: '等待扫码' }) };
        }
        if (checkPhase === 'scanned') {
          return { status: 200, headers: {}, text: JSON.stringify({ code: 802, nickname: 'ScanNick', message: '待确认' }) };
        }
        if (checkPhase === 'expired') {
          return { status: 200, headers: {}, text: JSON.stringify({ code: 800, message: '二维码不存在或已过期' }) };
        }
        if (checkPhase === 'confirmed-array') {
          return {
            status: 200,
            headers: {
              'set-cookie': [
                `MUSIC_U=${secretToken}; Max-Age=2592000; Expires=Thu, 31 Dec 2099 23:59:59 GMT; Path=/; HttpOnly`,
                `__csrf=${csrfToken}; Expires=Thu, 31 Dec 2099 23:59:59 GMT; Path=/`
              ]
            },
            text: JSON.stringify({ code: 803, message: '授权登陆成功' })
          };
        }
        if (checkPhase === 'confirmed-joined') {
          return {
            status: 200,
            headers: {
              'set-cookie': `NMTID=nmt; Expires=Thu, 31 Dec 2099 23:59:59 GMT; Path=/, MUSIC_U=${secretToken}; Expires=Thu, 31 Dec 2099 23:59:59 GMT; Path=/; HttpOnly, __csrf=${csrfToken}; Path=/`
            },
            text: JSON.stringify({ code: 803 })
          };
        }
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({ code: 803 })
        };
      }
      if (url === 'https://music.163.com/eapi/w/nuser/account/get') {
        decodeAndVerifyEapiBody(body, '/api/w/nuser/account/get');
        assert.match(headers.Cookie, new RegExp(`MUSIC_U=${secretToken}`));
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({ code: 200, profile: { nickname: 'CloudAccount' } })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const session = await runStartQrLogin(ext, bridge);
  assert.equal(session.sessionId, 'unikey-1234-abcd');
  assert.equal(session.qrContent, 'https://music.163.com/login?codekey=unikey-1234-abcd');
  assert.equal(session.pollIntervalMs, 2000);
  assert.ok(session.expiresAtMs > Date.now());

  const pendingRes = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(pendingRes.status, 'pending');

  checkPhase = 'scanned';
  const scannedRes = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(scannedRes.status, 'scanned');
  assert.equal(scannedRes.accountName, 'ScanNick');

  checkPhase = 'expired';
  const expiredRes = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(expiredRes.status, 'expired');

  checkPhase = 'confirmed-array';
  const confirmedArray = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(confirmedArray.status, 'confirmed');
  assert.equal(confirmedArray.cookie, `MUSIC_U=${secretToken}; __csrf=${csrfToken}`);
  assert.equal(confirmedArray.accountName, 'CloudAccount');

  checkPhase = 'confirmed-joined';
  const confirmedJoined = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(confirmedJoined.status, 'confirmed');
  assert.equal(confirmedJoined.cookie, `MUSIC_U=${secretToken}; __csrf=${csrfToken}`);

  checkPhase = 'missing-cookie';
  const missingCookie = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(missingCookie.status, 'error');

  assert.equal(
    bridge.logs.some((l) => l.message.includes(secretToken) || l.message.includes(csrfToken) || l.message.includes('MUSIC_U')),
    false
  );
});

test('qr_login pollQrLogin handles partial setCookies + headers fallback, skips expired clearing cookies, and supports body cookie fallback', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  const validToken = 'QR_VALID_MUSIC_U_776655';
  const validCsrf = 'csrf_valid_99';
  let scenario = 'partial-setcookies-plus-header';

  const bridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ url }) => {
      if (url === 'https://music.163.com/eapi/login/qrcode/unikey') {
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, unikey: 'unikey-edge-1' }) };
      }
      if (url === 'https://music.163.com/eapi/login/qrcode/client/login') {
        if (scenario === 'partial-setcookies-plus-header') {
          return {
            status: 200,
            headers: {
              'set-cookie': `NMTID=nmt1, MUSIC_U=${validToken}; Path=/; HttpOnly, __csrf=${validCsrf}; Path=/`
            },
            setCookies: ['NMTID=nmt1'],
            text: JSON.stringify({ code: 803 })
          };
        }
        if (scenario === 'expired-then-valid') {
          return {
            status: 200,
            headers: {
              'Set-Cookie': [
                'MUSIC_U=stale_old; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/',
                `MUSIC_U=${validToken}; Max-Age=1296000; Expires=Thu, 31 Dec 2099 23:59:59 GMT; Path=/; HttpOnly`,
                `__csrf=${validCsrf}; Path=/`
              ]
            },
            text: JSON.stringify({ code: 803 })
          };
        }
        if (scenario === 'json-cookie-fallback') {
          return {
            status: 200,
            headers: {},
            text: JSON.stringify({
              code: 803,
              cookie: `NMTID=abc; MUSIC_U=${validToken}; __csrf=${validCsrf}`
            })
          };
        }
      }
      if (url === 'https://music.163.com/eapi/w/nuser/account/get') {
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, profile: { nickname: 'EdgeNick' } }) };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const session = await runStartQrLogin(ext, bridge);

  // 1. Partial setCookies alongside full Set-Cookie header
  const r1 = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(r1.status, 'confirmed');
  assert.equal(r1.cookie, `MUSIC_U=${validToken}; __csrf=${validCsrf}`);
  assert.equal(r1.accountName, 'EdgeNick');

  // 2. Expired / clearing MUSIC_U entry before valid entry
  scenario = 'expired-then-valid';
  const r2 = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(r2.status, 'confirmed');
  assert.equal(r2.cookie, `MUSIC_U=${validToken}; __csrf=${validCsrf}`);

  // 3. JSON data.cookie fallback when headers omit Set-Cookie
  scenario = 'json-cookie-fallback';
  const r3 = await runPollQrLogin(ext, bridge, { sessionId: session.sessionId });
  assert.equal(r3.status, 'confirmed');
  assert.equal(r3.cookie, `MUSIC_U=${validToken}; __csrf=${validCsrf}`);

  assert.equal(
    bridge.logs.some((l) => l.message.includes(validToken) || l.message.includes(validCsrf) || l.message.includes('MUSIC_U')),
    false
  );
});

test('searchLyrics fetches /api/search/get/web + /api/song/lyric, normalizes JSON-lines, preserves translation, and strips metadata', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });
  const requests = [];
  const secretCookie = 'LYRICS_SECRET_MUSIC_U_5566';

  const bridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ method, url, headers, body }) => {
      requests.push({ method, url, headers, body });
      if (url === 'https://music.163.com/api/search/get/web') {
        assert.equal(method, 'POST');
        assert.equal(headers.Referer, 'https://music.163.com/');
        assert.equal(headers.Origin, 'https://music.163.com');
        assert.match(headers.Cookie, new RegExp(`MUSIC_U=${secretCookie}`));
        assert.match(body, /limit=8/);
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            result: {
              songs: [
                {
                  id: 186016,
                  name: '晴天',
                  artists: [{ name: '周杰伦' }],
                  album: { name: '叶惠美' },
                  duration: 269000
                },
                {
                  id: 186017,
                  name: '晴天 (Live)',
                  ar: [{ name: '周杰伦' }],
                  al: { name: 'Live' },
                  dt: 280000
                }
              ]
            }
          })
        };
      }
      if (url === 'https://music.163.com/api/song/lyric?id=186016&lv=1&tv=1') {
        assert.equal(method, 'GET');
        assert.match(headers.Cookie, new RegExp(`MUSIC_U=${secretCookie}`));
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            lrc: {
              lyric: [
                '[ti:晴天]',
                '[by:NetEase]',
                '{"t":0,"c":[{"tx":"作词 : "},{"tx":"方文山"}]}',
                '[00:10.00]   ',
                '[00:28.90]故事的小黄花',
                '[00:32.10]从出生那年就飘着'
              ].join('\n')
            },
            tlyric: {
              lyric: [
                '[by:Translator]',
                '[00:28.90]Little yellow flower of the story',
                '[00:32.10]   ',
                '[00:32.10]Floating since birth'
              ].join('\n')
            }
          })
        };
      }
      if (url === 'https://music.163.com/api/song/lyric?id=186017&lv=1&tv=1') {
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            lrc: {
              lyric: '故事的小黄花\n从出生那年就飘着'
            }
          })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const hits = await runSearchLyrics(ext, bridge, {
    title: '晴天',
    artist: '周杰伦',
    album: '叶惠美',
    durationSec: 269,
    cookie: secretCookie
  });

  assert.equal(hits.length, 2);
  assert.equal(hits[0].externalId, '186016');
  assert.equal(hits[0].title, '晴天');
  assert.equal(hits[0].artist, '周杰伦');
  assert.equal(hits[0].album, '叶惠美');
  assert.equal(hits[0].durationSec, 269);
  assert.equal(hits[0].instrumental, false);
  assert.equal(
    hits[0].syncedLyrics,
    '[00:00.00]作词 : 方文山\n[00:28.90]故事的小黄花\n[00:32.10]从出生那年就飘着'
  );
  assert.equal(hits[0].plainLyrics, null);
  assert.equal(
    hits[0].translatedLyrics,
    '[00:28.90]Little yellow flower of the story\n[00:32.10]Floating since birth'
  );

  // Untimed lyrics populate plainLyrics instead of syncedLyrics
  assert.equal(hits[1].externalId, '186017');
  assert.equal(hits[1].syncedLyrics, null);
  assert.equal(hits[1].plainLyrics, '故事的小黄花\n从出生那年就飘着');
  assert.equal(hits[1].translatedLyrics, null);

  assert.equal(
    bridge.logs.some((l) => l.message.includes(secretCookie) || l.message.includes('MUSIC_U')),
    false
  );
});

test('searchLyrics falls back to /api/cloudsearch/pc and caps lyric fetches to top 5 ranked songs', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });
  const lyricRequests = [];

  const songs = Array.from({ length: 8 }, (_, idx) => ({
    id: 500 + idx,
    name: idx === 6 ? 'Target Song' : `Other ${idx}`,
    ar: [{ name: idx === 6 ? 'Target Artist' : `Artist ${idx}` }],
    al: { name: 'Album' },
    dt: idx === 6 ? 210000 : 120000 + idx * 1000
  }));

  const bridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ method, url }) => {
      if (url === 'https://music.163.com/api/search/get/web') {
        return { status: 502, headers: {}, text: 'bad gateway' };
      }
      if (url.startsWith('https://music.163.com/api/cloudsearch/pc?')) {
        assert.equal(method, 'GET');
        assert.match(url, /limit=8/);
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({ code: 200, result: { songs } })
        };
      }
      if (url.startsWith('https://music.163.com/api/song/lyric?')) {
        const match = url.match(/id=(\d+)/);
        const songId = match ? match[1] : '';
        lyricRequests.push(songId);
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            lrc: { lyric: `[00:01.00]Lyric for ${songId}` }
          })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const hits = await runSearchLyrics(ext, bridge, {
    title: 'Target Song',
    artist: 'Target Artist',
    durationSec: 210
  });

  assert.equal(lyricRequests.length, 5, 'Must fetch lyrics for at most 5 songs');
  assert.equal(lyricRequests[0], '506', 'Best-matching song must be ranked first');
  assert.equal(hits.length, 5);
  assert.equal(hits[0].externalId, '506');
  assert.equal(hits[0].syncedLyrics, '[00:01.00]Lyric for 506');
});

test('searchLyrics detects nolyric/pureMusic instrumental tracks, skips metadata-only lyrics, and handles empty/error cases', async () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true });

  // 1. Empty query issues zero HTTP calls
  const noCallBridge = createHostBridge(ext.manifest, {
    httpResponder: async () => {
      throw new Error('Unexpected HTTP call on empty query');
    }
  });
  const emptyHits = await runSearchLyrics(ext, noCallBridge, { title: '   ', artist: '  ' });
  assert.deepEqual(plain(emptyHits), []);

  // 2. Instrumental (nolyric + pureMusic) & metadata-only lyric skipping
  const instBridge = createHostBridge(ext.manifest, {
    httpResponder: async ({ url }) => {
      if (url === 'https://music.163.com/api/search/get/web') {
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            result: {
              songs: [
                { id: 1, name: 'NoLyric Track', ar: [{ name: 'Composer' }], dt: 180000 },
                { id: 2, name: 'PureMusic Track', ar: [{ name: 'Pianist' }], dt: 190000 },
                { id: 3, name: 'Metadata Only', ar: [{ name: 'Nobody' }], dt: 200000 }
              ]
            }
          })
        };
      }
      if (url === 'https://music.163.com/api/song/lyric?id=1&lv=1&tv=1') {
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, nolyric: true }) };
      }
      if (url === 'https://music.163.com/api/song/lyric?id=2&lv=1&tv=1') {
        return { status: 200, headers: {}, text: JSON.stringify({ code: 200, pureMusic: true, lrc: { lyric: '' } }) };
      }
      if (url === 'https://music.163.com/api/song/lyric?id=3&lv=1&tv=1') {
        return {
          status: 200,
          headers: {},
          text: JSON.stringify({
            code: 200,
            lrc: { lyric: '[ti:Metadata Only]\n[ar:Nobody]\n[00:00.00]   \n{"t":0,"c":[{"tx":""}]}' }
          })
        };
      }
      return { status: 404, headers: {}, text: '' };
    }
  });

  const instHits = await runSearchLyrics(ext, instBridge, { title: 'Track', artist: 'Composer' });
  assert.equal(instHits.length, 2);
  assert.equal(instHits[0].externalId, '1');
  assert.equal(instHits[0].instrumental, true);
  assert.equal(instHits[0].syncedLyrics, null);
  assert.equal(instHits[0].plainLyrics, null);
  assert.equal(instHits[1].externalId, '2');
  assert.equal(instHits[1].instrumental, true);

  // 3. Rate limit (429) and fallback HTTP 500 error propagation
  const rateLimitBridge = createHostBridge(ext.manifest, {
    httpResponder: async () => ({ status: 429, headers: {}, text: '' })
  });
  await assert.rejects(
    () => runSearchLyrics(ext, rateLimitBridge, { title: 'Test', artist: 'Artist' }),
    (err) => err.code === 'RATE_LIMITED'
  );

  const serverErrorBridge = createHostBridge(ext.manifest, {
    httpResponder: async () => ({ status: 500, headers: {}, text: 'error' })
  });
  await assert.rejects(
    () => runSearchLyrics(ext, serverErrorBridge, { title: 'Test', artist: 'Artist' }),
    (err) => err.code === 'NETWORK_ERROR'
  );
});
