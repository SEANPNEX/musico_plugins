import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PLUGIN_PATH = path.join(__dirname, 'yt-bili-search.musico.js');
const PLUGIN_SOURCE = fs.readFileSync(PLUGIN_PATH, 'utf8');

function plain(val) {
  return JSON.parse(JSON.stringify(val));
}

function loadStrictPortable(source = PLUGIN_SOURCE) {
  const sandbox = {
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    RegExp,
    Error,
    TypeError,
    RangeError,
    SyntaxError,
    Promise,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    URL: undefined,
    URLSearchParams: undefined,
    TextEncoder: undefined,
    TextDecoder: undefined,
    Buffer: undefined,
    atob: undefined,
    btoa: undefined,
    BigInt: undefined,
    fetch: undefined,
    require: undefined,
    process: undefined,
    window: undefined,
    document: undefined
  };
  const context = vm.createContext(sandbox);
  const wrapped = `(function(exports, module) {\n${source}\n})`;
  const factory = vm.runInContext(wrapped, context, { timeout: 5000 });
  const mod = { exports: {} };
  factory(mod.exports, mod);
  return mod.exports;
}

function isHostAllowed(urlString, allowedPatterns) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  for (const raw of allowedPatterns || []) {
    const pat = String(raw).trim().toLowerCase().replace(/\.$/, '');
    if (pat.startsWith('*.')) {
      const domain = pat.slice(2);
      if (domain.split('.').length < 2) continue;
      if (host.endsWith('.' + domain) && host.length > domain.length + 1) return true;
    } else if (host === pat) {
      return true;
    }
  }
  return false;
}

function createMockCtx({
  platform = 'macos',
  settings = {},
  kvStore = new Map(),
  httpHandler
} = {}) {
  const logs = [];
  const requests = [];
  const ext = loadStrictPortable();
  const allowedHosts = ext.manifest.permissions.hosts;
  const defaults = {};
  for (const s of ext.manifest.settings || []) {
    defaults[s.key] = s.default;
  }

  const ctx = {
    http: {
      request: async (req) => {
        const method = String((req && req.method) || 'GET').toUpperCase();
        const url = String((req && req.url) || '');
        const headers = { ...(req && req.headers ? req.headers : {}) };
        if (!isHostAllowed(url, allowedHosts)) {
          throw Object.assign(new Error(`Blocked host: ${url}`), { code: 'PERMISSION_DENIED' });
        }
        requests.push({ method, url, headers, body: req && req.body, followRedirects: req && req.followRedirects });
        const resp = await httpHandler({ method, url, headers, body: req && req.body, followRedirects: req && req.followRedirects });
        const lowerHeaders = {};
        for (const [k, v] of Object.entries(resp.headers || {})) {
          lowerHeaders[k.toLowerCase()] = String(v);
        }
        const finalUrl = resp.finalUrl || url;
        if (!isHostAllowed(finalUrl, allowedHosts)) {
          throw Object.assign(new Error(`Blocked redirect host: ${finalUrl}`), { code: 'PERMISSION_DENIED' });
        }
        return {
          status: resp.status ?? 200,
          finalUrl,
          headers: lowerHeaders,
          text: resp.text != null ? resp.text : JSON.stringify(resp.json || {})
        };
      }
    },
    crypto: {
      md5: (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex'),
      sha1: (s) => crypto.createHash('sha1').update(String(s), 'utf8').digest('hex'),
      sha256: (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex'),
      hmacSha256: (k, m) => crypto.createHmac('sha256', String(k)).update(String(m), 'utf8').digest('hex'),
      base64Encode: (s) => Buffer.from(String(s), 'utf8').toString('base64'),
      base64Decode: (b) => Buffer.from(String(b), 'base64').toString('utf8')
    },
    kv: {
      get: (k) => {
        const item = kvStore.get(String(k));
        if (!item) return null;
        if (item.exp !== null && Date.now() >= item.exp) {
          kvStore.delete(String(k));
          return null;
        }
        return item.val;
      },
      set: (k, v, ttl) => {
        const exp = typeof ttl === 'number' && ttl > 0 ? Date.now() + ttl * 1000 : null;
        kvStore.set(String(k), { val: String(v), exp });
      },
      remove: (k) => kvStore.delete(String(k))
    },
    settings: {
      get: (k) => {
        if (Object.prototype.hasOwnProperty.call(settings, k)) return settings[k];
        if (Object.prototype.hasOwnProperty.call(defaults, k)) return defaults[k];
        return null;
      }
    },
    env: { platform, appVersion: '1.2.4-test', apiVersion: 1 },
    log: {
      info: (m) => logs.push({ level: 'info', message: String(m) }),
      warn: (m) => logs.push({ level: 'warn', message: String(m) }),
      error: (m) => logs.push({ level: 'error', message: String(m) })
    }
  };

  return { ext, ctx, logs, requests, kvStore };
}

test('portability: zero forbidden globals or APIs and loads in strict VM', () => {
  const forbidden = [
    /\brequire\s*\(/,
    /\bBuffer\b/,
    /\bprocess\b/,
    /\bnew\s+URL\b/,
    /\bURLSearchParams\b/,
    /\bTextEncoder\b/,
    /\bTextDecoder\b/,
    /\batob\s*\(/,
    /\bbtoa\s*\(/,
    /\bBigInt\b/,
    /\bfetch\s*\(/,
    /\bwindow\b/,
    /\bdocument\b/,
    /bytes=0-(?!\d)/
  ];
  for (const pat of forbidden) {
    assert.equal(pat.test(PLUGIN_SOURCE), false, `Forbidden pattern matched: ${pat}`);
  }
  const ext = loadStrictPortable();
  assert.equal(typeof ext.manifest, 'object');
  assert.equal(typeof ext.canHandle, 'function');
  assert.equal(typeof ext.fetchCollection, 'function');
  assert.equal(typeof ext.resolveStream, 'function');
  assert.equal(typeof ext.search, 'function');
});

test('manifest contract & host allowlist validity', () => {
  const { ext } = createMockCtx();
  const m = plain(ext.manifest);
  assert.equal(m.apiVersion, 1);
  assert.equal(m.id, 'com.seanpnex.musico.yt-bili-search');
  assert.equal(m.name, 'YouTube & Bilibili Search');
  assert.equal(m.version, '1.0.0');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'YT / Bili');
  assert.ok(m.badgeLabel.length <= 16);
  assert.deepEqual(m.capabilities, ['search', 'playlist', 'stream', 'cookie', 'proxy']);
  assert.deepEqual(m.searchKinds, ['track', 'playlist', 'album']);
  assert.equal(m.urlPatterns.length, 4);
  for (const pat of m.urlPatterns) {
    assert.doesNotThrow(() => new RegExp(pat));
  }
  const requiredHosts = [
    'www.youtube.com', 'music.youtube.com', 'm.youtube.com', 'youtu.be',
    '*.googlevideo.com', 'i.ytimg.com', 'lh3.googleusercontent.com',
    'api.bilibili.com', 'www.bilibili.com', 'm.bilibili.com',
    'space.bilibili.com', 'search.bilibili.com', 'b23.tv',
    '*.bilivideo.com', '*.bilivideo.cn', '*.bilivideo.net',
    '*.akamaized.net', '*.hdslb.com', '*.szbdyd.com'
  ];
  for (const h of requiredHosts) {
    assert.ok(m.permissions.hosts.includes(h), `Missing required host: ${h}`);
  }
  for (const h of m.permissions.hosts) {
    assert.notEqual(h, '*');
    if (h.startsWith('*.')) {
      assert.ok(h.slice(2).split('.').length >= 2, `Wildcard needs >= 2 labels: ${h}`);
    }
  }
  const keys = m.settings.map((s) => s.key);
  assert.deepEqual(keys, ['source', 'youtubeMode', 'biliSearchOrder', 'cookieScope', 'youtubeAudioFormat']);
});

test('canHandle recognizes YouTube, YouTube Music, and Bilibili URLs cleanly', () => {
  const { ext } = createMockCtx();

  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://youtu.be/dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://www.youtube.com/playlist?list=PL1234567890', true, 'yt:PL1234567890', 'playlist'],
    ['https://music.youtube.com/playlist?list=OLAK5uy_abc12345', true, 'yt:OLAK5uy_abc12345', 'playlist'],
    ['https://music.youtube.com/browse/MPREb_6h43ySO9duW', true, 'yt:MPREb_6h43ySO9duW', 'playlist'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ', true, 'yt:RDdQw4w9WgXcQ', 'playlist'],
    ['https://www.bilibili.com/video/BV19Dq6BcEwW/?p=2', true, 'bili:video:BV19Dq6BcEwW', 'track'],
    ['https://m.bilibili.com/video/av170001', true, 'bili:video:av170001', 'track'],
    ['https://www.bilibili.com/medialist/detail/ml123456', true, 'bili:fav:123456', 'playlist'],
    ['https://space.bilibili.com/999/favlist?fid=888777', true, 'bili:fav:888777', 'playlist'],
    ['https://space.bilibili.com/1001/lists/2002', true, 'bili:season:1001:2002', 'playlist'],
    ['https://space.bilibili.com/1001/lists/2002?type=series', true, 'bili:series:1001:2002', 'playlist'],
    ['https://space.bilibili.com/1001/collectiondetail?sid=3003', true, 'bili:season:1001:3003', 'playlist'],
    ['https://space.bilibili.com/1001/seriesdetail?sid=4004', true, 'bili:series:1001:4004', 'playlist'],
    ['https://b23.tv/abc123X', true, 'bili:short:abc123X', 'playlist'],
    ['https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', false, null, null],
    ['just random words', false, null, null]
  ];

  for (const [input, matched, remoteId, kind] of cases) {
    const out = ext.canHandle({ rawText: input, extractedUrl: input });
    assert.equal(out.matched, matched, `Input: ${input}`);
    if (matched) {
      assert.equal(out.remoteId, remoteId, `Input: ${input}`);
      assert.equal(out.kind, kind, `Input: ${input}`);
      assert.ok(out.normalizedUrl);
    }
  }
});

test('search: YouTube Music mode parses songs, albums, playlists, two-row items, SAPISIDHASH, and continuation', async () => {
  const { ext, ctx, requests } = createMockCtx({
    settings: { source: 'youtube', youtubeMode: 'music', cookieScope: 'youtube' },
    httpHandler: async ({ url, body }) => {
      const payload = JSON.parse(body);
      if (url.startsWith('https://music.youtube.com/youtubei/v1/search')) {
        if (payload.continuation === 'ytm-tok-2') {
          return {
            json: {
              continuationContents: {
                musicShelfContinuation: {
                  contents: [
                    {
                      musicResponsiveListItemRenderer: {
                        playlistItemData: { videoId: 'vidPage2001' },
                        flexColumns: [
                          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Song Page 2' }] } } },
                          { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Artist 2' }, { text: ' • ' }, { text: '4:05' }] } } }
                        ]
                      }
                    }
                  ]
                }
              }
            }
          };
        }
        assert.equal(payload.context.client.clientName, 'WEB_REMIX');
        assert.equal(payload.context.client.clientVersion, '1.20260707.12.00');
        return {
          json: {
            contents: {
              tabbedSearchResultsRenderer: {
                tabs: [{
                  tabRenderer: {
                    content: {
                      sectionListRenderer: {
                        contents: [{
                          musicShelfRenderer: {
                            contents: [
                              {
                                musicResponsiveListItemRenderer: {
                                  playlistItemData: { videoId: 'm9SMT5ipbxk' },
                                  thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'http://lh3.googleusercontent.com/art1', width: 120 }] } } },
                                  flexColumns: [
                                    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Idol' }] } } },
                                    {
                                      musicResponsiveListItemFlexColumnRenderer: {
                                        text: {
                                          runs: [
                                            { text: 'YOASOBI', navigationEndpoint: { browseEndpoint: { browseId: 'UC1', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ARTIST' } } } } },
                                            { text: ' • ' },
                                            { text: 'The Book 3', navigationEndpoint: { browseEndpoint: { browseId: 'MPREb_1', browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' } } } } },
                                            { text: ' • ' },
                                            { text: '3:34' }
                                          ]
                                        }
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                musicResponsiveListItemRenderer: {
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: 'MPREb_6h43ySO9duW',
                                      browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_ALBUM' } }
                                    }
                                  },
                                  thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/alb1', width: 544 }] } } },
                                  flexColumns: [
                                    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Idol Album' }] } } },
                                    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Album' }, { text: ' • ' }, { text: 'YOASOBI' }, { text: ' • ' }, { text: '2023' }] } } }
                                  ]
                                }
                              },
                              {
                                musicTwoRowItemRenderer: {
                                  title: { runs: [{ text: 'Mix Playlist' }] },
                                  subtitle: { runs: [{ text: 'Playlist' }, { text: ' • ' }, { text: 'Curator' }, { text: ' • ' }, { text: '25 songs' }] },
                                  thumbnailRenderer: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg', width: 480 }] } } },
                                  navigationEndpoint: {
                                    browseEndpoint: {
                                      browseId: 'VLPLbtS3brARAM8wGp_k6Id6qq1WX7gFoqMo',
                                      browseEndpointContextSupportedConfigs: { browseEndpointContextMusicConfig: { pageType: 'MUSIC_PAGE_TYPE_PLAYLIST' } }
                                    }
                                  }
                                }
                              }
                            ],
                            continuations: [{ nextContinuationData: { continuation: 'ytm-tok-2' } }]
                          }
                        }]
                      }
                    }
                  }
                }]
              }
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const p1 = await ext.search(ctx, { query: 'Yoasobi', kind: 'all', limit: 20, cookie: 'SAPISID=my_secret_sapisid; SID=xyz' });
  assert.equal(p1.items.length, 3);
  assert.equal(p1.items[0].kind, 'track');
  assert.equal(p1.items[0].remoteTrackId, 'yt:m9SMT5ipbxk');
  assert.equal(p1.items[0].artist, 'YOASOBI');
  assert.equal(p1.items[0].album, 'The Book 3');
  assert.equal(p1.items[0].durationSec, 214);
  assert.equal(p1.items[0].artworkUrl, 'https://lh3.googleusercontent.com/art1');

  assert.equal(p1.items[1].kind, 'album');
  assert.equal(p1.items[1].remoteId, 'yt:MPREb_6h43ySO9duW');
  assert.equal(p1.items[1].sourceUrl, 'https://music.youtube.com/browse/MPREb_6h43ySO9duW');
  assert.equal(p1.items[1].artist, 'YOASOBI');

  assert.equal(p1.items[2].kind, 'playlist');
  assert.equal(p1.items[2].remoteId, 'yt:PLbtS3brARAM8wGp_k6Id6qq1WX7gFoqMo');
  assert.equal(p1.items[2].trackCount, 25);
  assert.equal(p1.items[2].sourceUrl, 'https://music.youtube.com/playlist?list=PLbtS3brARAM8wGp_k6Id6qq1WX7gFoqMo');

  assert.ok(requests[0].headers.Authorization.startsWith('SAPISIDHASH '));
  assert.ok(p1.nextCursor);

  const p2 = await ext.search(ctx, { query: 'Yoasobi', kind: 'all', limit: 20, cursor: p1.nextCursor });
  assert.equal(p2.items.length, 1);
  assert.equal(p2.items[0].remoteTrackId, 'yt:vidPage2001');
  assert.equal(p2.nextCursor, null);
});

test('search: YouTube Music falls back to YouTube Web when Music returns error/empty; Web ignores filter-chip continuationCommand', async () => {
  const { ext, ctx, requests } = createMockCtx({
    settings: { source: 'youtube', youtubeMode: 'music' },
    httpHandler: async ({ url, body }) => {
      const payload = JSON.parse(body);
      if (url.startsWith('https://music.youtube.com/')) {
        return { status: 500, text: 'upstream fail' };
      }
      if (url.startsWith('https://www.youtube.com/youtubei/v1/search')) {
        if (payload.continuation === 'real-next-page-token') {
          return {
            json: {
              onResponseReceivedCommands: [{
                appendContinuationItemsAction: {
                  continuationItems: [{
                    videoRenderer: {
                      videoId: 'webTrack002',
                      title: { runs: [{ text: 'Web Page 2' }] },
                      ownerText: { runs: [{ text: 'Channel B' }] },
                      lengthText: { simpleText: '2:10' }
                    }
                  }]
                }
              }]
            }
          };
        }
        assert.equal(payload.params, 'EgIQAQ%3D%3D');
        return {
          json: {
            header: {
              searchHeaderRenderer: {
                chipBar: {
                  chipCloudRenderer: {
                    chips: [{
                      chipCloudChipRenderer: {
                        navigationEndpoint: { continuationCommand: { token: 'chip-filter-must-ignore' } }
                      }
                    }]
                  }
                }
              }
            },
            contents: {
              twoColumnSearchResultsRenderer: {
                primaryContents: {
                  sectionListRenderer: {
                    contents: [
                      {
                        itemSectionRenderer: {
                          contents: [{
                            videoRenderer: {
                              videoId: 'webTrack001',
                              title: { runs: [{ text: 'Web Video 1' }] },
                              shortBylineText: { runs: [{ text: 'Channel A' }] },
                              lengthText: { simpleText: '1:02:03' },
                              thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/webTrack001/hq720.jpg', width: 720 }] }
                            }
                          }]
                        }
                      },
                      {
                        continuationItemRenderer: {
                          continuationEndpoint: { continuationCommand: { token: 'real-next-page-token' } }
                        }
                      }
                    ]
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

  const p1 = await ext.search(ctx, { query: 'test', kind: 'track', limit: 20 });
  assert.equal(p1.items.length, 1);
  assert.equal(p1.items[0].remoteTrackId, 'yt:webTrack001');
  assert.equal(p1.items[0].durationSec, 3723);
  assert.ok(decodeURIComponent(p1.nextCursor).includes('real-next-page-token'));
  assert.equal(decodeURIComponent(p1.nextCursor).includes('chip-filter-must-ignore'), false);

  const p2 = await ext.search(ctx, { query: 'test', kind: 'track', limit: 20, cursor: p1.nextCursor });
  assert.equal(p2.items[0].remoteTrackId, 'yt:webTrack002');
  assert.equal(requests.some((r) => r.url.includes('www.youtube.com/youtubei/v1/search')), true);
});

test('search: Bilibili WBI signing, buvid3 cache, HTML entity decoding, and playlist/album skip', async () => {
  let spiCalls = 0;
  let navCalls = 0;
  let lastSearchUrl = '';
  const kvStore = new Map();

  const { ext, ctx } = createMockCtx({
    kvStore,
    settings: { source: 'bilibili', biliSearchOrder: 'click' },
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

  const plRes = await ext.search(ctx, { query: 'Yoasobi', kind: 'playlist', limit: 10 });
  assert.deepEqual(plain(plRes), { items: [], nextCursor: null });

  const tr1 = await ext.search(ctx, { query: 'Yoasobi!', kind: 'track', limit: 10 });
  assert.equal(tr1.items.length, 2);
  assert.equal(tr1.items[0].remoteTrackId, 'bili:BV19Dq6BcEwW');
  assert.equal(tr1.items[0].title, '【Hi-Res】YOASOBI & Co. 夜\'s Song');
  assert.equal(tr1.items[0].artist, 'UpTester <Official>');
  assert.equal(tr1.items[0].album, 'Bilibili');
  assert.equal(tr1.items[0].artworkUrl, 'https://i1.hdslb.com/bfs/archive/test.jpg');
  assert.equal(tr1.items[0].durationSec, 255);
  assert.equal(tr1.items[0].relativePath, '【Hi-Res】YOASOBI & Co. 夜\'s Song.m4a');
  assert.equal(tr1.items[1].remoteTrackId, 'bili:BV1xx411c7mD');
  assert.equal(tr1.items[1].durationSec, 3900);
  assert.equal(tr1.items[1].artworkUrl, 'https://i1.hdslb.com/bfs/archive/hour.jpg');
  assert.ok(lastSearchUrl.includes('order=click'));
  assert.ok(lastSearchUrl.includes('w_rid='));
  assert.ok(lastSearchUrl.includes('wts='));
  assert.equal(lastSearchUrl.includes('keyword=Yoasobi!'), false);

  await ext.search(ctx, { query: 'Yoasobi', kind: 'track', limit: 10, cursor: tr1.nextCursor });
  assert.equal(spiCalls, 1);
  assert.equal(navCalls, 1);

  // Also verify v_voucher risk-control challenge on WBI endpoint falls back to plain search endpoint.
  const { ext: extV, ctx: ctxV } = createMockCtx({
    settings: { source: 'bilibili' },
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
  const fbRes = await extV.search(ctxV, { query: 'Yoasobi', kind: 'track', limit: 5 });
  assert.equal(fbRes.items.length, 1);
  assert.equal(fbRes.items[0].remoteTrackId, 'bili:BV1fallback01');
});

test('search: both mode interleaving, cursor advancement without repeat/loss, and single-source failure resilience', async () => {
  const { ext, ctx } = createMockCtx({
    settings: { source: 'both', youtubeMode: 'music' },
    httpHandler: async ({ url, body }) => {
      if (url.includes('music.youtube.com/youtubei/v1/search')) {
        const p = JSON.parse(body);
        if (p.continuation === 'yt-p2') {
          return {
            json: {
              contents: {
                musicShelfContinuation: {
                  contents: [{
                    musicResponsiveListItemRenderer: {
                      playlistItemData: { videoId: 'ytVideo0003' },
                      flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'YT 3' }] } } }]
                    }
                  }]
                }
              }
            }
          };
        }
        return {
          json: {
            contents: {
              musicShelfRenderer: {
                contents: [
                  { musicResponsiveListItemRenderer: { playlistItemData: { videoId: 'ytVideo0001' }, flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'YT 1' }] } } }] } },
                  { musicResponsiveListItemRenderer: { playlistItemData: { videoId: 'ytVideo0002' }, flexColumns: [{ musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'YT 2' }] } } }] } }
                ],
                continuations: [{ nextContinuationData: { continuation: 'yt-p2' } }]
              }
            }
          }
        };
      }
      if (url.includes('/x/frontend/finger/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/x/web-interface/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      if (url.includes('/x/web-interface/wbi/search/type')) {
        const u = new URL(url);
        const page = Number(u.searchParams.get('page'));
        if (page === 1) {
          return {
            json: {
              code: 0,
              data: {
                numPages: 2,
                result: [
                  { bvid: 'BV1000000001', title: 'Bili 1', author: 'U1', duration: '1:00' },
                  { bvid: 'BV1000000002', title: 'Bili 2', author: 'U2', duration: '2:00' }
                ]
              }
            }
          };
        }
        return {
          json: {
            code: 0,
            data: {
              numPages: 2,
              result: [{ bvid: 'BV1000000003', title: 'Bili 3', author: 'U3', duration: '3:00' }]
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const s1 = await ext.search(ctx, { query: 'test', kind: 'track', limit: 2 });
  assert.deepEqual(plain(s1.items.map((x) => x.remoteTrackId)), ['yt:ytVideo0001', 'bili:BV1000000001']);
  assert.ok(s1.nextCursor);

  const s2 = await ext.search(ctx, { query: 'test', kind: 'track', limit: 2, cursor: s1.nextCursor });
  assert.deepEqual(plain(s2.items.map((x) => x.remoteTrackId)), ['yt:ytVideo0002', 'bili:BV1000000002']);
  assert.notEqual(s2.nextCursor, s1.nextCursor);

  const s3 = await ext.search(ctx, { query: 'test', kind: 'track', limit: 2, cursor: s2.nextCursor });
  assert.deepEqual(plain(s3.items.map((x) => x.remoteTrackId)), ['yt:ytVideo0003', 'bili:BV1000000003']);
  assert.equal(s3.nextCursor, null);

  const { ext: ext2, ctx: ctx2, logs: logs2 } = createMockCtx({
    settings: { source: 'both' },
    httpHandler: async ({ url }) => {
      if (url.includes('youtube.com')) return { status: 503, text: 'down' };
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      return { json: { code: 0, data: { numPages: 1, result: [{ bvid: 'BV1000000009', title: 'Only Bili', author: 'U', duration: '1:10' }] } } };
    }
  });
  const partial = await ext2.search(ctx2, { query: 'abc', kind: 'all', limit: 10 });
  assert.equal(partial.items.length, 1);
  assert.equal(partial.items[0].remoteTrackId, 'bili:BV1000000009');
  assert.ok(logs2.some((l) => l.level === 'warn'));

  const { ext: ext3, ctx: ctx3 } = createMockCtx({
    settings: { source: 'both' },
    httpHandler: async () => ({ status: 429, text: 'rate limited' })
  });
  await assert.rejects(() => ext3.search(ctx3, { query: 'abc', kind: 'track', limit: 10 }), (e) => e.code === 'RATE_LIMITED');
});

test('fetchCollection: YouTube album browse header fallback, Bilibili multi-part video, favlist, season, series, and b23.tv', async () => {
  const { ext, ctx } = createMockCtx({
    httpHandler: async ({ url }) => {
      if (url.includes('music.youtube.com/youtubei/v1/browse')) {
        return {
          json: {
            contents: {
              twoColumnBrowseResultsRenderer: {
                tabs: [{
                  tabRenderer: {
                    content: {
                      sectionListRenderer: {
                        contents: [
                          {
                            musicResponsiveHeaderRenderer: {
                              title: { runs: [{ text: 'The Book' }] },
                              straplineTextOne: { runs: [{ text: 'YOASOBI' }] },
                              thumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails: [{ url: 'https://lh3.googleusercontent.com/book', width: 544 }] } } }
                            }
                          },
                          {
                            musicShelfRenderer: {
                              contents: [{
                                musicResponsiveListItemRenderer: {
                                  overlay: { musicItemThumbnailOverlayRenderer: { content: { musicPlayButtonRenderer: { playNavigationEndpoint: { watchEndpoint: { videoId: 'ZRtdQ81jPUQ' } } } } } },
                                  flexColumns: [
                                    { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Idol' }] } } },
                                    { musicResponsiveListItemFlexColumnRenderer: { text: {} } }
                                  ],
                                  fixedColumns: [
                                    { musicResponsiveListItemFixedColumnRenderer: { text: { runs: [{ text: '3:34' }] } } }
                                  ]
                                }
                              }]
                            }
                          }
                        ]
                      }
                    }
                  }
                }]
              }
            }
          }
        };
      }
      if (url === 'https://b23.tv/short123') {
        return { status: 200, finalUrl: 'https://www.bilibili.com/video/BV1multiPart1', text: '' };
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
      if (url.includes('/x/polymer/web-space/seasons_archives_list')) {
        return {
          json: {
            code: 0,
            data: {
              meta: { name: 'Season Mix' },
              page: { total: 1 },
              archives: [{ bvid: 'BV1season0001', title: 'Season Song', author: 'ArtistS', duration: 200, pic: 'https://i0.hdslb.com/s.jpg' }]
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const alb = await ext.fetchCollection(ctx, { url: 'https://music.youtube.com/browse/MPREb_testAlbum1' });
  assert.equal(alb.remoteId, 'yt:MPREb_testAlbum1');
  assert.equal(alb.title, 'The Book');
  assert.equal(alb.tracks[0].remoteTrackId, 'yt:ZRtdQ81jPUQ');
  assert.equal(alb.tracks[0].artist, 'YOASOBI');
  assert.equal(alb.tracks[0].album, 'The Book');
  assert.equal(alb.tracks[0].artworkUrl, 'https://lh3.googleusercontent.com/book');
  assert.equal(alb.tracks[0].durationSec, 214);

  const b23 = await ext.fetchCollection(ctx, { url: 'https://b23.tv/short123' });
  assert.equal(b23.remoteId, 'bili:video:BV1multiPart1');
  assert.equal(b23.tracks.length, 2);
  assert.equal(b23.tracks[0].remoteTrackId, 'bili:BV1multiPart1#111');
  assert.equal(b23.tracks[1].remoteTrackId, 'bili:BV1multiPart1#222');

  const fav = await ext.fetchCollection(ctx, { url: 'https://www.bilibili.com/medialist/detail/ml555' });
  assert.equal(fav.remoteId, 'bili:fav:555');
  assert.equal(fav.tracks.length, 1);
  assert.equal(fav.tracks[0].remoteTrackId, 'bili:BV1validFav01#333');

  const season = await ext.fetchCollection(ctx, { url: 'https://space.bilibili.com/42/lists/77' });
  assert.equal(season.remoteId, 'bili:season:42:77');
  assert.equal(season.tracks[0].remoteTrackId, 'bili:BV1season0001');
});

test('resolveStream: Apple enforces MP4/AAC-only, non-Apple honors format pref, bounded range probes only', async () => {
  const adaptiveFormats = [
    { itag: 251, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=251&expire=1900000000', mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, contentLength: '2500000' },
    { itag: 250, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=250&expire=1900000000', mimeType: 'audio/webm; codecs="opus"', bitrate: 70000, contentLength: '1100000' },
    { itag: 140, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=140&expire=1900000000', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, contentLength: '2400000' }
  ];

  async function runFor(platform, youtubeAudioFormat) {
    const { ext, ctx, requests } = createMockCtx({
      platform,
      settings: { youtubeAudioFormat },
      httpHandler: async ({ url, headers }) => {
        if (url.includes('/sw.js_data')) return { text: ')]}\'\n["CgtScjNVNXhmS2xMcyj6"]' };
        if (url.includes('/youtubei/v1/player')) {
          return {
            json: {
              playabilityStatus: { status: 'OK' },
              streamingData: { expiresInSeconds: '21540', adaptiveFormats }
            }
          };
        }
        if (url.includes('googlevideo.com')) {
          assert.notEqual(headers.Range, 'bytes=0-');
          assert.ok(headers.Range === 'bytes=0-1023' || headers.Range === 'bytes=1048576-1049599');
          return { status: 206, headers: { 'content-type': 'audio/mp4' }, text: 'ok' };
        }
        throw new Error('Unexpected URL ' + url);
      }
    });
    const stream = await ext.resolveStream(ctx, { remoteTrackId: 'yt:m9SMT5ipbxk', forceRefresh: false });
    return { stream, requests };
  }

  const iosRes = await runFor('ios', 'opus');
  assert.equal(iosRes.stream.fileExtension, 'm4a');
  assert.equal(iosRes.stream.mimeType, 'audio/mp4');
  assert.ok(iosRes.stream.url.includes('itag=140'));
  const iosRanges = iosRes.requests.filter((r) => r.url.includes('googlevideo.com')).map((r) => r.headers.Range);
  assert.deepEqual(iosRanges, ['bytes=0-1023', 'bytes=1048576-1049599']);

  const macRes = await runFor('macos', 'auto');
  assert.equal(macRes.stream.fileExtension, 'm4a');
  assert.ok(macRes.stream.url.includes('itag=140'));

  const androidAuto = await runFor('android', 'auto');
  assert.equal(androidAuto.stream.fileExtension, 'webm');
  assert.equal(androidAuto.stream.mimeType, 'audio/webm');
  assert.ok(androidAuto.stream.url.includes('itag=251'));

  const winM4a = await runFor('windows', 'm4a');
  assert.equal(winM4a.stream.fileExtension, 'm4a');
  assert.ok(winM4a.stream.url.includes('itag=140'));
});

test('resolveStream: Bilibili DASH/FLAC priority, bare IDs, and cookie privacy', async () => {
  // 1. Standard DASH priority: 30280 > 30232 > 30216 > 30251
  const { ext: extA, ctx: ctxA } = createMockCtx({
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
  const dashRes = await extA.resolveStream(ctxA, { remoteTrackId: 'bili:BV1dashTest1' });
  assert.equal(dashRes.fileExtension, 'm4a');
  assert.ok(dashRes.url.includes('192k.m4s'));

  // 2. FLAC-only / 30251 + bare BV ID + cookie privacy
  const { ext, ctx, logs } = createMockCtx({
    settings: { cookieScope: 'auto' },
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

  const res = await ext.resolveStream(ctx, { remoteTrackId: 'BV1bareTest1', cookie: 'SESSDATA=secret_bili_token' });
  assert.equal(res.fileExtension, 'flac');
  assert.equal(res.mimeType, 'audio/flac');
  assert.equal(res.fallbackUrls.length, 1);
  assert.equal(res.expiresAtMs, (1900000100 - 60) * 1000);
  assert.equal(res.headers.Referer, 'https://www.bilibili.com/video/BV1bareTest1');
  assert.ok(res.headers.Cookie.includes('SESSDATA=secret_bili_token'));

  for (const entry of logs) {
    assert.equal(entry.message.includes('secret_bili_token'), false);
  }

  // 3. Cookie scope isolation: YT cookie must NOT be sent to Bilibili
  const { ext: ext2, ctx: ctx2, requests: reqs2 } = createMockCtx({
    settings: { cookieScope: 'auto' },
    httpHandler: async ({ url }) => {
      if (url.includes('/spi')) return { json: { code: 0, data: { b_3: 'B3' } } };
      if (url.includes('/nav')) return { json: { code: 0, data: { wbi_img: { img_url: 'https://i0.hdslb.com/a/7cd084941338484aae1ad9425b84077c.png', sub_url: 'https://i0.hdslb.com/a/4932caff0ff746eab6f01bf08b70ac45.png' } } } };
      if (url.includes('/view')) return { json: { code: 0, data: { bvid: 'BV1bareTest1', cid: 11 } } };
      return { json: { code: 0, data: { dash: { audio: [{ id: 30280, baseUrl: 'https://upos-sz-mirrorhw.bilivideo.com/hi.m4s' }] } } } };
    }
  });
  await ext2.resolveStream(ctx2, { remoteTrackId: 'bili:BV1bareTest1', cookie: 'SAPISID=yt_only_secret; SID=yt_sid' });
  for (const r of reqs2) {
    assert.equal((r.headers.Cookie || '').includes('yt_only_secret'), false);
  }
});
