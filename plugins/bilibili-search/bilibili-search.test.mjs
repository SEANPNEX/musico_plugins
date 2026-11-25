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
  scanPortabilityViolations,
  validateHostPattern
} from '../../scripts/runner.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_PATH = path.join(__dirname, 'bilibili-search.musico.js');
const PLUGIN_SOURCE = fs.readFileSync(PLUGIN_PATH, 'utf8');

function plain(val) {
  return JSON.parse(JSON.stringify(val));
}

function createBiliMock({ platform = 'macos', settings = {}, kvStore = new Map(), httpHandler } = {}) {
  const requests = [];
  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const bridge = createHostBridge(ext.manifest, {
    platform,
    settingsOverrides: settings,
    kvStore,
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
  return { ext, bridge, requests, kvStore, logs: bridge.logs };
}

test('portability & manifest contract for bilibili-search (no album concept)', () => {
  assert.deepEqual(scanPortabilityViolations(PLUGIN_SOURCE), []);

  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const m = plain(ext.manifest);

  assert.equal(m.apiVersion, 1);
  assert.equal(m.id, 'bilibili-search');
  assert.equal(m.name, 'Bilibili Search');
  assert.equal(m.version, '1.1.0');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'Bilibili');
  assert.equal(
    m.updateUrl,
    'https://github.com/SEANPNEX/musico_plugins/releases/latest/download/bilibili-search.musicoext'
  );
  assert.deepEqual(m.capabilities, ['search', 'playlist', 'stream', 'cookie', 'proxy']);
  assert.deepEqual(m.searchKinds, ['track', 'playlist']);
  assert.equal(m.searchKinds.includes('album'), false);
  assert.deepEqual(m.qualities, [
    { id: 'highest', label: 'Hi-Res / 192k', badge: 'FLAC', lossless: true },
    { id: 'high', label: 'High (192k)', badge: '192k' },
    { id: 'standard', label: 'Standard (132k)', badge: '132k' },
    { id: 'low', label: 'Low (64k)', badge: '64k' }
  ]);
  assert.equal(m.defaultStreamQuality, 'standard');
  assert.equal(m.defaultDownloadQuality, 'highest');
  assert.equal(m.urlPatterns.length, 2);
  for (const pat of m.urlPatterns) {
    assert.doesNotThrow(() => new RegExp(pat));
  }
  for (const h of m.permissions.hosts) {
    validateHostPattern(h);
    assert.equal(h.includes('youtube') || h.includes('youtu.be') || h.includes('googlevideo'), false);
  }
  assert.deepEqual(m.settings.map((s) => s.key), ['biliSearchOrder']);
  assert.deepEqual(
    Object.keys(ext.exportsObj).sort(),
    ['canHandle', 'fetchCollection', 'manifest', 'resolveStream', 'search']
  );
});

test('canHandle recognizes Bilibili URLs and rejects YouTube/other URLs', () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const cases = [
    ['https://www.bilibili.com/video/BV19Dq6BcEwW/?p=2', true, 'bili:video:BV19Dq6BcEwW', 'track'],
    ['https://m.bilibili.com/video/av170001', true, 'bili:video:av170001', 'track'],
    ['https://www.bilibili.com/medialist/detail/ml123456', true, 'bili:fav:123456', 'playlist'],
    ['https://space.bilibili.com/999/favlist?fid=888777', true, 'bili:fav:888777', 'playlist'],
    ['https://space.bilibili.com/1001/lists/2002', true, 'bili:season:1001:2002', 'playlist'],
    ['https://space.bilibili.com/1001/lists/2002?type=series', true, 'bili:series:1001:2002', 'playlist'],
    ['https://space.bilibili.com/1001/collectiondetail?sid=3003', true, 'bili:season:1001:3003', 'playlist'],
    ['https://space.bilibili.com/1001/seriesdetail?sid=4004', true, 'bili:series:1001:4004', 'playlist'],
    ['https://b23.tv/abc123X', true, 'bili:short:abc123X', 'playlist'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', false, null, null],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', false, null, null],
    ['random text', false, null, null]
  ];
  for (const [input, matched, remoteId, kind] of cases) {
    const out = runCanHandle(ext, input);
    assert.equal(out.matched, matched, `Input: ${input}`);
    if (matched) {
      assert.equal(out.remoteId, remoteId, `Input: ${input}`);
      assert.equal(out.kind, kind, `Input: ${input}`);
      assert.ok(out.normalizedUrl);
    }
  }
});

test('search: track mode, album empty return, WBI signing, buvid3 cache, HTML entity decoding, and v_voucher fallback', async () => {
  let spiCalls = 0;
  let navCalls = 0;
  let viewCalls = 0;
  let lastSearchUrl = '';
  const kvStore = new Map();

  const { ext, bridge } = createBiliMock({
    kvStore,
    settings: { biliSearchOrder: 'click' },
    httpHandler: async ({ url }) => {
      if (url.includes('/x/frontend/finger/spi')) {
        spiCalls++;
        return { json: { code: 0, data: { b_3: 'TEST-BUVID3-VALUE' } } };
      }
      if (url.includes('/x/web-interface/nav')) {
        navCalls++;
        return {
          json: {
            code: 0,
            data: {
              wbi_img: {
                img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
                sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'
              }
            }
          }
        };
      }
      if (url.includes('/x/web-interface/view')) {
        viewCalls++;
        return { json: { code: 0, data: {} } };
      }
      if (url.includes('/x/web-interface/wbi/search/type')) {
        lastSearchUrl = url;
        return {
          json: {
            code: 0,
            data: {
              numPages: 3,
              result: [
                {
                  bvid: 'BV19Dq6BcEwW',
                  title: '【Hi-Res】<em class="keyword">YOASOBI</em> &amp; Co. &#x591c;&#39;s Song',
                  author: 'Up<em>Tester</em> &lt;Official&gt;',
                  pic: '//i1.hdslb.com/bfs/archive/test.jpg',
                  duration: '04:15'
                },
                {
                  bvid: 'bv1xx411c7mD',
                  title: 'Hour Mix',
                  author: 'DJ',
                  pic: 'http://i1.hdslb.com/bfs/archive/hour.jpg',
                  duration: '1:05:00'
                }
              ]
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  // Bilibili has no album concept.
  const albRes = await runSearch(ext, bridge, { query: 'Yoasobi', kind: 'album', limit: 10 });
  assert.deepEqual(plain(albRes), { items: [], nextCursor: null });

  const tr1 = await runSearch(ext, bridge, { query: 'Yoasobi!', kind: 'track', limit: 10 });
  assert.equal(tr1.items.length, 2);
  assert.equal(tr1.items[0].remoteTrackId, 'bili:BV19Dq6BcEwW');
  assert.equal(tr1.items[0].title, '【Hi-Res】YOASOBI & Co. 夜\'s Song');
  assert.equal(tr1.items[0].artist, 'UpTester <Official>');
  assert.equal(tr1.items[0].album, 'Bilibili');
  assert.equal(tr1.items[0].artworkUrl, 'https://i1.hdslb.com/bfs/archive/test.jpg');
  assert.equal(tr1.items[0].durationSec, 255);
  assert.equal(tr1.items[1].remoteTrackId, 'bili:BV1xx411c7mD');
  assert.equal(tr1.items[1].durationSec, 3900);
  assert.equal(viewCalls, 0);
  assert.ok(lastSearchUrl.includes('order=click'));
  assert.ok(lastSearchUrl.includes('w_rid='));

  await runSearch(ext, bridge, { query: 'Yoasobi', kind: 'track', limit: 10, cursor: tr1.nextCursor });
  assert.equal(spiCalls, 1);
  assert.equal(navCalls, 1);

  // v_voucher risk-control challenge on WBI endpoint falls back to plain search endpoint.
  const { ext: extV, bridge: bridgeV } = createBiliMock({
    httpHandler: async ({ url }) => {
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      if (url.includes('/wbi/search/type')) return { json: { code: 0, data: { v_voucher: 'voucher_xyz' } } };
      if (url.includes('/x/web-interface/search/type')) {
        return { json: { code: 0, data: { numPages: 1, result: [{ bvid: 'BV1fallback01', title: 'Fallback Track', author: 'UP', duration: '2:30' }] } } };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });
  const fbRes = await runSearch(extV, bridgeV, { query: 'Yoasobi', kind: 'track', limit: 5 });
  assert.equal(fbRes.items.length, 1);
  assert.equal(fbRes.items[0].remoteTrackId, 'bili:BV1fallback01');
});

test('search(playlist & all): classifies 分P and 合集 (deduped), caches blvi:<bvid> 24h, falls back to pagelist, and bounds concurrency <= 4', async () => {
  const kvStore = new Map();
  let viewCalls = 0;
  let pagelistCalls = 0;
  let inFlightProbes = 0;
  let maxInFlightProbes = 0;

  let inFetchCollection = false;
  const { ext, bridge, requests } = createBiliMock({
    kvStore,
    httpHandler: async ({ url, timeoutMs }) => {
      if (!inFetchCollection && (url.includes('/x/web-interface/view?bvid=') || url.includes('/x/player/pagelist?bvid='))) {
        assert.equal(timeoutMs, 3000, `Expected 3000ms probe timeout for ${url}`);
      }
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) {
        return {
          json: {
            code: 0,
            data: {
              wbi_img: {
                img_url: 'https://i0.hdslb.com/bfs/wbi/7cd084941338484aae1ad9425b84077c.png',
                sub_url: 'https://i0.hdslb.com/bfs/wbi/4932caff0ff746eab6f01bf08b70ac45.png'
              }
            }
          }
        };
      }
      if (url.includes('/wbi/search/type')) {
        return {
          json: {
            code: 0,
            data: {
              numPages: 1,
              result: [
                { bvid: 'BV1singleOnly1', title: 'Single Song', author: 'UP1', pic: '//i0.hdslb.com/s1.jpg', duration: '3:20' },
                { bvid: 'BV1multiPart1', title: 'Live <em class="keyword">OST</em>', author: 'UP2', pic: '//i0.hdslb.com/m1.jpg', duration: '20:00' },
                { bvid: 'BV1seasonEp01', title: 'Season Ep 1', author: 'UP3', pic: '//i0.hdslb.com/e1.jpg', duration: '4:00' },
                { bvid: 'BV1seasonEp02', title: 'Season Ep 2', author: 'UP3', pic: '//i0.hdslb.com/e2.jpg', duration: '4:10' },
                { bvid: 'BV1pagelistFb', title: 'Pagelist Fallback 分P', author: 'UP4', pic: '//i0.hdslb.com/p1.jpg', duration: '12:00' },
                { bvid: 'BV1extra00001', title: 'Extra 1', author: 'UP5', duration: '2:00' },
                { bvid: 'BV1extra00002', title: 'Extra 2', author: 'UP6', duration: '2:10' }
              ]
            }
          }
        };
      }
      if (url.includes('/x/web-interface/view?bvid=')) {
        viewCalls++;
        inFlightProbes++;
        if (inFlightProbes > maxInFlightProbes) maxInFlightProbes = inFlightProbes;
        await new Promise((r) => setTimeout(r, 10));
        inFlightProbes--;

        const bv = new URL(url).searchParams.get('bvid');
        if (bv === 'BV1singleOnly1' || bv === 'BV1extra00001' || bv === 'BV1extra00002') {
          return {
            json: {
              code: 0,
              data: {
                bvid: bv,
                title: bv,
                owner: { mid: 11, name: 'UP' },
                pages: [{ cid: 1001, page: 1, part: 'Only' }]
              }
            }
          };
        }
        if (bv === 'BV1multiPart1') {
          return {
            json: {
              code: 0,
              data: {
                bvid: 'BV1multiPart1',
                title: 'Live OST',
                owner: { mid: 22, name: 'UP2' },
                pic: 'http://i0.hdslb.com/m1_hi.jpg',
                pages: [
                  { cid: 111, page: 1, part: 'Part 1', duration: 120 },
                  { cid: 222, page: 2, part: 'Part 2', duration: 180 },
                  { cid: 333, page: 3, part: 'Part 3', duration: 240 }
                ]
              }
            }
          };
        }
        if (bv === 'BV1seasonEp01' || bv === 'BV1seasonEp02') {
          return {
            json: {
              code: 0,
              data: {
                bvid: bv,
                title: bv,
                owner: { mid: 88801, name: 'UP3' },
                pic: 'http://i0.hdslb.com/ep.jpg',
                pages: [{ cid: 501, page: 1, part: 'Ep' }],
                ugc_season: {
                  id: 99001,
                  mid: 88801,
                  title: 'Anime 合集',
                  cover: 'http://i0.hdslb.com/season.jpg',
                  ep_count: 12
                }
              }
            }
          };
        }
        if (bv === 'BV1pagelistFb') {
          return { status: 500, text: 'view error' };
        }
      }
      if (url.includes('/x/player/pagelist?bvid=BV1pagelistFb')) {
        pagelistCalls++;
        inFlightProbes++;
        if (inFlightProbes > maxInFlightProbes) maxInFlightProbes = inFlightProbes;
        await new Promise((r) => setTimeout(r, 10));
        inFlightProbes--;
        return {
          json: {
            code: 0,
            data: [
              { cid: 701, page: 1, part: 'CD1' },
              { cid: 702, page: 2, part: 'CD2' }
            ]
          }
        };
      }
      if (url.includes('/x/polymer/web-space/seasons_archives_list')) {
        return {
          json: {
            code: 0,
            data: {
              meta: { name: 'Anime 合集' },
              page: { total: 2 },
              archives: [
                { bvid: 'BV1seasonEp01', title: 'Season Ep 1', author: 'UP3', duration: 240, pic: 'https://i0.hdslb.com/e1.jpg' },
                { bvid: 'BV1seasonEp02', title: 'Season Ep 2', author: 'UP3', duration: 250, pic: 'https://i0.hdslb.com/e2.jpg' }
              ]
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  // 1. kind = 'playlist': emits only 分P playlists + deduplicated 合集 playlist (including pagelist fallback).
  const plRes = await runSearch(ext, bridge, { query: 'OST', kind: 'playlist', limit: 20 });
  assert.equal(plRes.items.length, 3);
  assert.ok(maxInFlightProbes >= 1 && maxInFlightProbes <= 4, `Expected concurrency <= 4, got ${maxInFlightProbes}`);
  assert.equal(viewCalls, 7);
  assert.equal(pagelistCalls, 1);

  assert.deepEqual(plain(plRes.items[0]), {
    kind: 'playlist',
    remoteId: 'bili:video:BV1multiPart1',
    title: 'Live OST',
    artist: 'UP2',
    artworkUrl: 'https://i0.hdslb.com/m1_hi.jpg',
    sourceUrl: 'https://www.bilibili.com/video/BV1multiPart1',
    trackCount: 3
  });
  assert.deepEqual(plain(plRes.items[1]), {
    kind: 'playlist',
    remoteId: 'bili:season:88801:99001',
    title: 'Anime 合集',
    artist: 'UP3',
    artworkUrl: 'https://i0.hdslb.com/season.jpg',
    sourceUrl: 'https://space.bilibili.com/88801/lists/99001?type=season',
    trackCount: 12
  });
  assert.deepEqual(plain(plRes.items[2]), {
    kind: 'playlist',
    remoteId: 'bili:video:BV1pagelistFb',
    title: 'Pagelist Fallback 分P',
    artist: 'UP4',
    artworkUrl: 'https://i0.hdslb.com/p1.jpg',
    sourceUrl: 'https://www.bilibili.com/video/BV1pagelistFb',
    trackCount: 2
  });

  // Verify blvi:<bvid> cache populated with 24h TTL and probe requests used 3000ms timeout.
  assert.ok(kvStore.has('blvi:BV1multiPart1'));
  assert.ok(kvStore.has('blvi:BV1seasonEp01'));
  assert.ok(kvStore.has('blvi:BV1pagelistFb'));
  assert.ok(requests.some((r) => r.url.includes('/x/web-interface/view?bvid=') && r.timeoutMs === 3000));
  assert.ok(requests.some((r) => r.url.includes('/x/player/pagelist?bvid=') && r.timeoutMs === 3000));

  // 2. kind = 'all': reuses blvi:<bvid> cache (zero new view/pagelist calls!), emits single tracks + 分P playlists + deduplicated 合集 playlist.
  const viewCallsBeforeAll = viewCalls;
  const pagelistCallsBeforeAll = pagelistCalls;
  const allRes = await runSearch(ext, bridge, { query: 'OST', kind: 'all', limit: 20 });
  assert.equal(viewCalls, viewCallsBeforeAll);
  assert.equal(pagelistCalls, pagelistCallsBeforeAll);

  const byId = new Map(allRes.items.map((it) => [it.remoteTrackId || it.remoteId, it]));
  assert.equal(byId.get('bili:BV1singleOnly1').kind, 'track');
  assert.equal(byId.get('bili:video:BV1multiPart1').kind, 'playlist');
  assert.equal(byId.get('bili:BV1seasonEp01').kind, 'track');
  assert.equal(byId.get('bili:season:88801:99001').kind, 'playlist');
  assert.equal(byId.get('bili:BV1seasonEp02').kind, 'track');
  assert.equal(byId.get('bili:video:BV1pagelistFb').kind, 'playlist');
  // Deduplicated season appears only once.
  assert.equal(allRes.items.filter((it) => it.remoteId === 'bili:season:88801:99001').length, 1);

  // 3. Selecting emitted 分P and 合集 playlists loads all tracks via fetchCollection.
  inFetchCollection = true;
  const fetchedMulti = await runFetchCollection(ext, bridge, { url: plRes.items[0].sourceUrl });
  assert.equal(fetchedMulti.remoteId, 'bili:video:BV1multiPart1');
  assert.equal(fetchedMulti.tracks.length, 3);
  assert.equal(fetchedMulti.tracks[0].remoteTrackId, 'bili:BV1multiPart1#111');
  assert.equal(fetchedMulti.tracks[2].remoteTrackId, 'bili:BV1multiPart1#333');

  const fetchedSeason = await runFetchCollection(ext, bridge, { url: plRes.items[1].sourceUrl });
  assert.equal(fetchedSeason.remoteId, 'bili:season:88801:99001');
  assert.equal(fetchedSeason.tracks.length, 2);
  assert.equal(fetchedSeason.tracks[0].remoteTrackId, 'bili:BV1seasonEp01');
  assert.equal(fetchedSeason.tracks[1].remoteTrackId, 'bili:BV1seasonEp02');
});

test('fetchCollection: favlist, series, and b23.tv short link resolution', async () => {
  const { ext, bridge } = createBiliMock({
    httpHandler: async ({ url }) => {
      if (url === 'https://b23.tv/short123') {
        return { status: 302, headers: { location: 'https://www.bilibili.com/video/BV1multiPart1' }, text: '' };
      }
      if (url === 'https://www.bilibili.com/video/BV1multiPart1') {
        return { status: 200, text: '<html></html>' };
      }
      if (url.includes('/x/frontend/finger/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/x/web-interface/view?bvid=BV1multiPart1')) {
        return {
          json: {
            code: 0,
            data: {
              bvid: 'BV1multiPart1',
              title: 'Live Concert',
              owner: { name: 'ConcertUP' },
              pic: 'http://i1.hdslb.com/bfs/archive/live.jpg',
              duration: 500,
              pages: [
                { cid: 111, page: 1, part: 'Intro', duration: 120 },
                { cid: 222, page: 2, part: 'Encore', duration: 380 }
              ]
            }
          }
        };
      }
      if (url.includes('/x/v3/fav/resource/list')) {
        return {
          json: {
            code: 0,
            data: {
              info: { title: 'My Favs' },
              has_more: false,
              medias: [
                { attr: 9, bvid: 'BV1deleted000', title: 'Deleted' },
                { attr: 0, bvid: 'BV1expired000', title: '已失效视频' },
                { attr: 0, bvid: 'BV1validFav01', title: 'Fav Track', upper: { name: 'Creator' }, duration: 180, cover: '//i0.hdslb.com/fav.jpg', ugc: { first_cid: 333 } }
              ]
            }
          }
        };
      }
      if (url.includes('/x/series/series')) {
        return { json: { code: 0, data: { meta: { name: 'My Series' } } } };
      }
      if (url.includes('/x/series/archives')) {
        return {
          json: {
            code: 0,
            data: {
              page: { total: 1 },
              archives: [{ bvid: 'BV1series0001', title: 'Series Song', author: 'ArtistSer', duration: 210, pic: 'https://i0.hdslb.com/ser.jpg' }]
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const b23 = await runFetchCollection(ext, bridge, { url: 'https://b23.tv/short123' });
  assert.equal(b23.remoteId, 'bili:video:BV1multiPart1');
  assert.equal(b23.tracks.length, 2);

  const fav = await runFetchCollection(ext, bridge, { url: 'https://www.bilibili.com/medialist/detail/ml555' });
  assert.equal(fav.remoteId, 'bili:fav:555');
  assert.equal(fav.tracks.length, 1);
  assert.equal(fav.tracks[0].remoteTrackId, 'bili:BV1validFav01#333');

  const series = await runFetchCollection(ext, bridge, { url: 'https://space.bilibili.com/42/lists/88?type=series' });
  assert.equal(series.remoteId, 'bili:series:42:88');
  assert.equal(series.title, 'My Series');
  assert.equal(series.tracks[0].remoteTrackId, 'bili:BV1series0001');
});

test('resolveStream: Bilibili DASH/FLAC priority, bare IDs, and cookie privacy', async () => {
  const { ext: extA, bridge: bridgeA } = createBiliMock({
    httpHandler: async ({ url }) => {
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      if (url.includes('/view')) return { json: { code: 0, data: { bvid: 'BV1dashTest1', cid: 111 } } };
      return {
        json: {
          code: 0,
          data: {
            dash: {
              audio: [
                { id: 30216, baseUrl: 'https://upos-sz-mirrorcos.bilivideo.com/64k.m4s', mimeType: 'audio/mp4', bandwidth: 64000 },
                { id: 30232, baseUrl: 'https://upos-sz-mirrorcos.bilivideo.com/132k.m4s', mimeType: 'audio/mp4', bandwidth: 132000 },
                { id: 30280, baseUrl: 'https://upos-sz-mirrorhw.bilivideo.com/192k.m4s', mimeType: 'audio/mp4', bandwidth: 192000 }
              ],
              flac: {
                audio: { id: 30251, baseUrl: 'https://upos-sz-mirrorhw.bilivideo.com/hi.flac', mimeType: 'audio/flac', bandwidth: 1411000 }
              }
            }
          }
        }
      };
    }
  });
  const dashStd = await runResolveStream(extA, bridgeA, { remoteTrackId: 'bili:BV1dashTest1', purpose: 'stream' });
  assert.equal(dashStd.fileExtension, 'm4a');
  assert.ok(dashStd.url.includes('132k.m4s'));
  assert.equal(dashStd.actualQuality, 'standard');
  assert.equal(dashStd.qualityLabel, '132k');
  assert.equal(dashStd.bitrateKbps, 132);

  const dashHigh = await runResolveStream(extA, bridgeA, { remoteTrackId: 'bili:BV1dashTest1', quality: 'high' });
  assert.equal(dashHigh.fileExtension, 'm4a');
  assert.ok(dashHigh.url.includes('192k.m4s'));
  assert.equal(dashHigh.actualQuality, 'high');
  assert.equal(dashHigh.qualityLabel, '192k');
  assert.equal(dashHigh.bitrateKbps, 192);

  const dashLow = await runResolveStream(extA, bridgeA, { remoteTrackId: 'bili:BV1dashTest1', quality: 'low' });
  assert.equal(dashLow.fileExtension, 'm4a');
  assert.ok(dashLow.url.includes('64k.m4s'));
  assert.equal(dashLow.actualQuality, 'low');
  assert.equal(dashLow.qualityLabel, '64k');
  assert.equal(dashLow.bitrateKbps, 64);

  const dashDl = await runResolveStream(extA, bridgeA, { remoteTrackId: 'bili:BV1dashTest1', purpose: 'download' });
  assert.equal(dashDl.fileExtension, 'flac');
  assert.equal(dashDl.mimeType, 'audio/flac');
  assert.ok(dashDl.url.includes('hi.flac'));
  assert.equal(dashDl.actualQuality, 'highest');
  assert.equal(dashDl.qualityLabel, 'FLAC');
  assert.equal(dashDl.bitrateKbps, 1411);

  const { ext, bridge, logs } = createBiliMock({
    httpHandler: async ({ url, headers }) => {
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      if (url.includes('/x/web-interface/view')) {
        assert.ok(headers.Cookie.includes('SESSDATA=secret_bili_token'));
        return { json: { code: 0, data: { bvid: 'BV1bareTest1', cid: 987654 } } };
      }
      if (url.includes('/x/player/wbi/playurl')) {
        return {
          json: {
            code: 0,
            data: {
              dash: {
                audio: [],
                flac: {
                  audio: {
                    id: 30251,
                    baseUrl: 'https://upos-sz-mirrorhw.bilivideo.com/hires.flac?deadline=1900000100',
                    backupUrl: ['https://upos-hz-mirrorakam.akamaized.net/hires.flac?deadline=1900000100'],
                    mimeType: 'audio/flac',
                    bandwidth: 1411000
                  }
                }
              }
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const res = await runResolveStream(ext, bridge, { remoteTrackId: 'BV1bareTest1', cookie: 'SESSDATA=secret_bili_token' });
  assert.equal(res.fileExtension, 'flac');
  assert.equal(res.mimeType, 'audio/flac');
  assert.equal(res.fallbackUrls.length, 1);
  assert.equal(res.expiresAtMs, (1900000100 - 60) * 1000);
  assert.equal(res.headers.Referer, 'https://www.bilibili.com/video/BV1bareTest1');
  assert.ok(res.headers.Cookie.includes('SESSDATA=secret_bili_token'));
  for (const entry of logs) {
    assert.equal(entry.message.includes('secret_bili_token'), false);
  }
});
