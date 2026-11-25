import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createHostBridge,
  loadExtension,
  runCanHandle,
  runFetchCollection,
  runResolveStream,
  runSearch,
  runSearchLyrics,
  scanPortabilityViolations,
  validateHostPattern
} from '../../scripts/runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_PATH = path.join(__dirname, 'apple-music.musico.js');
const PLUGIN_SOURCE = fs.readFileSync(PLUGIN_PATH, 'utf8');

function plain(val) {
  return JSON.parse(JSON.stringify(val));
}

function createMock({ settings = {}, httpHandler } = {}) {
  const requests = [];
  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const bridge = createHostBridge(ext.manifest, {
    settingsOverrides: settings,
    httpResponder: async (req) => {
      requests.push(req);
      const resp = await httpHandler(req);
      return {
        status: resp.status ?? 200,
        finalUrl: resp.finalUrl,
        headers: resp.headers || {},
        text: resp.text != null ? resp.text : JSON.stringify(resp.json || {})
      };
    }
  });
  return { ext, bridge, requests };
}

test('portability & manifest contract for apple-music', () => {
  assert.deepEqual(scanPortabilityViolations(PLUGIN_SOURCE), []);

  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const m = plain(ext.manifest);

  assert.equal(m.apiVersion, 1);
  assert.equal(m.id, 'com.seanpnex.musico.applemusic');
  assert.equal(m.name, 'Apple Music');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'Apple Music');
  assert.equal(
    m.updateUrl,
    'https://github.com/SEANPNEX/musico_plugins/releases/latest/download/apple-music.musicoext'
  );
  assert.deepEqual(m.capabilities, ['search', 'playlist', 'stream', 'lyrics', 'cookie', 'proxy']);
  assert.deepEqual(m.searchKinds, ['track', 'playlist', 'album']);
  assert.deepEqual(m.qualities, [
    { id: 'aac-he-web', label: 'HE-AAC', badge: 'HE-AAC' },
    { id: 'aac-web', label: 'AAC 256k', badge: '256k' },
    { id: 'alac', label: 'ALAC Lossless', badge: 'ALAC', lossless: true },
    { id: 'atmos', label: 'Dolby Atmos', badge: 'Atmos' }
  ]);
  assert.equal(m.defaultStreamQuality, 'aac-web');
  assert.equal(m.defaultDownloadQuality, 'aac-web');
  for (const h of m.permissions.hosts) {
    validateHostPattern(h);
  }
  assert.deepEqual(m.settings.map((s) => [s.key, s.type]), [
    ['serverUrl', 'server_url'],
    ['codec', 'select']
  ]);
  assert.deepEqual(
    Object.keys(ext.exportsObj).sort(),
    ['canHandle', 'fetchCollection', 'manifest', 'resolveStream', 'search', 'searchLyrics']
  );
});

test('canHandle matches Apple Music songs, albums, playlists and rejects artists/other domains', () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const cases = [
    ['https://music.apple.com/us/song/idol/1680778943', true, 'song:1680778943', 'track'],
    ['https://music.apple.com/us/album/the-book/1544711907?i=1544711909', true, 'song:1544711909', 'track'],
    ['https://music.apple.com/jp/album/first-love/1440857781', true, 'album:1440857781', 'playlist'],
    ['https://classical.music.apple.com/us/album/goldberg/1452180909', true, 'album:1452180909', 'playlist'],
    ['https://beta.music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb', true, 'playlist:pl.f4d106fed2bd41149aaacabb233eb5eb', 'playlist'],
    ['https://music.apple.com/us/artist/yoasobi/1490256993', false, null, null],
    ['https://open.spotify.com/track/123', false, null, null],
    ['not a url', false, null, null]
  ];

  for (const [input, matched, remoteId, kind] of cases) {
    const out = runCanHandle(ext, input);
    assert.equal(out.matched, matched, `Input: ${input}`);
    if (matched) {
      assert.equal(out.remoteId, remoteId);
      assert.equal(out.kind, kind);
    }
  }
});

test('search forwards query, kind, cursor, Bearer auth, and uses server_url host allowlist', async () => {
  const { ext, bridge, requests } = createMock({
    settings: { serverUrl: 'https://am.local.test:8787/' },
    httpHandler: async () => ({
      status: 200,
      json: {
        items: [
          {
            kind: 'track',
            remoteTrackId: '1680778943',
            title: 'Idol',
            artist: 'YOASOBI',
            album: 'THE BOOK 3',
            durationSec: 213,
            artworkUrl: 'https://is1-ssl.mzstatic.com/image/thumb/cover.jpg'
          },
          {
            kind: 'album',
            remoteId: '1544711907',
            title: 'THE BOOK',
            artist: 'YOASOBI',
            trackCount: 9,
            sourceUrl: 'https://music.apple.com/us/album/the-book/1544711907'
          }
        ],
        nextCursor: '20'
      }
    })
  });

  const page = await runSearch(ext, bridge, {
    query: 'YOASOBI',
    kind: 'all',
    limit: 20,
    cookie: 'secret-api-token'
  });

  assert.equal(requests.length, 1);
  assert.equal(
    requests[0].url,
    'https://am.local.test:8787/v1/search?q=YOASOBI&kind=all&limit=20'
  );
  assert.equal(requests[0].headers.Authorization, 'Bearer secret-api-token');
  assert.equal(page.items.length, 2);
  assert.equal(page.items[0].remoteTrackId, '1680778943');
  assert.equal(page.items[1].kind, 'album');
  assert.equal(page.nextCursor, '20');
});

test('fetchCollection resolves tracks and rejects empty collections', async () => {
  const { ext, bridge } = createMock({
    settings: { serverUrl: 'http://127.0.0.1:8787' },
    httpHandler: async ({ url }) => {
      if (url.includes('empty')) {
        return { status: 200, json: { remoteId: 'album:empty', title: 'Empty', tracks: [] } };
      }
      return {
        status: 200,
        json: {
          remoteId: 'album:1544711907',
          title: 'THE BOOK',
          tracks: [
            {
              remoteTrackId: '1544711909',
              title: 'Epilogue',
              artist: 'YOASOBI',
              album: 'THE BOOK',
              trackNumber: 1,
              durationSec: 50
            }
          ],
          nextCursor: null
        }
      };
    }
  });

  const col = await runFetchCollection(ext, bridge, {
    url: 'https://music.apple.com/us/album/the-book/1544711907'
  });
  assert.equal(col.remoteId, 'album:1544711907');
  assert.equal(col.tracks.length, 1);
  assert.equal(col.tracks[0].remoteTrackId, '1544711909');

  await assert.rejects(
    () => runFetchCollection(ext, bridge, { url: 'https://music.apple.com/us/album/empty/999' }),
    (err) => err.code === 'EMPTY_COLLECTION'
  );
});

test('resolveStream returns stream URL with zero HTTP calls and honors req.quality before codec + auth', async () => {
  const { ext, bridge, requests } = createMock({
    settings: { serverUrl: 'https://am.local.test:8787/', codec: 'alac' },
    httpHandler: async () => {
      throw new Error('resolveStream should not issue HTTP requests');
    }
  });

  // Falls back to ctx.settings.get('codec') when req.quality is omitted
  const streamFromSetting = await runResolveStream(ext, bridge, {
    remoteTrackId: '1680778943',
    cookie: 'Bearer tok-123',
    forceRefresh: true
  });

  assert.equal(requests.length, 0);
  assert.equal(
    streamFromSetting.url,
    'https://am.local.test:8787/v1/tracks/1680778943/stream?codec=alac&refresh=1'
  );
  assert.equal(streamFromSetting.headers.Authorization, 'Bearer tok-123');
  assert.equal(streamFromSetting.fileExtension, 'm4a');
  assert.equal(streamFromSetting.mimeType, 'audio/mp4');
  assert.equal(streamFromSetting.actualQuality, 'alac');
  assert.equal(streamFromSetting.qualityLabel, 'ALAC');
  assert.equal(streamFromSetting.bitrateKbps, 1411);

  // req.quality overrides ctx.settings.get('codec')
  const expectedQualities = [
    ['aac-he-web', 'HE-AAC', 64, 'stream'],
    ['aac-web', '256k', 256, 'download'],
    ['atmos', 'Atmos', 768, 'stream']
  ];
  for (const [qualityId, label, kbps, purpose] of expectedQualities) {
    const res = await runResolveStream(ext, bridge, {
      remoteTrackId: '1680778943',
      quality: qualityId,
      purpose
    });
    assert.equal(
      res.url,
      `https://am.local.test:8787/v1/tracks/1680778943/stream?codec=${qualityId}`
    );
    assert.equal(res.actualQuality, qualityId);
    assert.equal(res.qualityLabel, label);
    assert.equal(res.bitrateKbps, kbps);
  }
});

test('searchLyrics fetches candidates and treats 404 as empty list', async () => {
  const { ext, bridge } = createMock({
    settings: { serverUrl: 'https://am.local.test:8787' },
    httpHandler: async ({ url }) => {
      if (url.includes('Missing')) {
        return { status: 404, json: { detail: 'not found' } };
      }
      return {
        status: 200,
        json: [
          {
            externalId: '1680778943',
            title: 'Idol',
            artist: 'YOASOBI',
            syncedLyrics: '[00:01.00]Muteki no egao'
          }
        ]
      };
    }
  });

  const hits = await runSearchLyrics(ext, bridge, { title: 'Idol', artist: 'YOASOBI', durationSec: 213 });
  assert.equal(hits.length, 1);
  assert.equal(hits[0].syncedLyrics, '[00:01.00]Muteki no egao');

  const empty = await runSearchLyrics(ext, bridge, { title: 'Missing', artist: 'Nobody' });
  assert.deepEqual(plain(empty), []);
});

test('missing serverUrl raises AUTH_REQUIRED on search/collection/stream', async () => {
  const { ext, bridge } = createMock({ settings: { serverUrl: '' } });

  await assert.rejects(
    () => runSearch(ext, bridge, { query: 'test' }),
    (err) => err.code === 'AUTH_REQUIRED'
  );
  await assert.rejects(
    () => runResolveStream(ext, bridge, { remoteTrackId: '123', forceRefresh: false }),
    (err) => err.code === 'AUTH_REQUIRED'
  );
});
