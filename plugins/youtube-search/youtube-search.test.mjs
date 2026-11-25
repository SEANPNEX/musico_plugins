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
const PLUGIN_PATH = path.join(__dirname, 'youtube-search.musico.js');
const PLUGIN_SOURCE = fs.readFileSync(PLUGIN_PATH, 'utf8');

function plain(val) {
  return JSON.parse(JSON.stringify(val));
}

function createYtMock({ platform = 'macos', settings = {}, kvStore = new Map(), httpHandler } = {}) {
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
        headers: resp.headers || {},
        text: resp.text != null ? resp.text : JSON.stringify(resp.json || {})
      };
    }
  });
  return { ext, bridge, requests, logs: bridge.logs };
}

test('portability & manifest contract for youtube-search', () => {
  assert.deepEqual(scanPortabilityViolations(PLUGIN_SOURCE), []);
  assert.equal(/bytes=0-(?!\d)/.test(PLUGIN_SOURCE), false);

  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const m = plain(ext.manifest);

  assert.equal(m.apiVersion, 1);
  assert.equal(m.id, 'youtube-search');
  assert.equal(m.name, 'YouTube Search');
  assert.equal(m.version, '1.1.0');
  assert.equal(m.author, 'SEANPNEX');
  assert.equal(m.badgeLabel, 'YouTube');
  assert.equal(
    m.updateUrl,
    'https://github.com/SEANPNEX/musico_plugins/releases/latest/download/youtube-search.musicoext'
  );
  assert.deepEqual(m.capabilities, ['search', 'playlist', 'stream', 'cookie', 'proxy']);
  assert.deepEqual(m.searchKinds, ['track', 'playlist', 'album']);
  assert.deepEqual(m.qualities, [
    { id: 'highest', label: 'Best Available', badge: 'Best' },
    { id: 'high', label: 'High', badge: 'High' },
    { id: 'standard', label: 'Standard', badge: 'Std' },
    { id: 'low', label: 'Low (Data Saver)', badge: 'Low' }
  ]);
  assert.equal(m.defaultStreamQuality, 'standard');
  assert.equal(m.defaultDownloadQuality, 'highest');
  assert.equal(m.urlPatterns.length, 2);
  for (const pat of m.urlPatterns) {
    assert.doesNotThrow(() => new RegExp(pat));
  }
  for (const h of m.permissions.hosts) {
    validateHostPattern(h);
    assert.equal(h.includes('bilibili') || h.includes('b23') || h.includes('hdslb'), false);
  }
  assert.deepEqual(m.settings.map((s) => s.key), ['youtubeMode', 'youtubeAudioFormat']);
  assert.deepEqual(
    Object.keys(ext.exportsObj).sort(),
    ['canHandle', 'fetchCollection', 'manifest', 'resolveStream', 'search']
  );
});

test('canHandle recognizes YouTube / YouTube Music URLs and rejects Bilibili/other URLs', () => {
  const ext = loadExtension(PLUGIN_PATH, { strict: true, staticCheck: true });
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://youtu.be/dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', true, 'yt:dQw4w9WgXcQ', 'track'],
    ['https://www.youtube.com/playlist?list=PL1234567890', true, 'yt:PL1234567890', 'playlist'],
    ['https://music.youtube.com/playlist?list=OLAK5uy_abc12345', true, 'yt:OLAK5uy_abc12345', 'playlist'],
    ['https://music.youtube.com/browse/MPREb_6h43ySO9duW', true, 'yt:MPREb_6h43ySO9duW', 'playlist'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ', true, 'yt:RDdQw4w9WgXcQ', 'playlist'],
    ['https://www.bilibili.com/video/BV19Dq6BcEwW', false, null, null],
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

test('search: YouTube Music mode parses songs, albums, playlists, SAPISIDHASH, limit slicing, and continuation', async () => {
  const { ext, bridge, requests } = createYtMock({
    settings: { youtubeMode: 'music' },
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

  // Slice limit=2 across a 3-item page, then consume item 3 via KV offset, then continuation page 2.
  const p1 = await runSearch(ext, bridge, { query: 'Yoasobi', kind: 'all', limit: 2, cookie: 'SAPISID=my_secret_sapisid; SID=xyz' });
  assert.equal(p1.items.length, 2);
  assert.equal(p1.items[0].kind, 'track');
  assert.equal(p1.items[0].remoteTrackId, 'yt:m9SMT5ipbxk');
  assert.equal(p1.items[0].artist, 'YOASOBI');
  assert.equal(p1.items[0].album, 'The Book 3');
  assert.equal(p1.items[0].durationSec, 214);
  assert.equal(p1.items[0].artworkUrl, 'https://lh3.googleusercontent.com/art1');
  assert.equal(p1.items[1].kind, 'album');
  assert.equal(p1.items[1].remoteId, 'yt:MPREb_6h43ySO9duW');
  assert.ok(requests[0].headers.Authorization.startsWith('SAPISIDHASH '));
  assert.ok(p1.nextCursor);

  const p2 = await runSearch(ext, bridge, { query: 'Yoasobi', kind: 'all', limit: 2, cursor: p1.nextCursor });
  assert.equal(p2.items.length, 1);
  assert.equal(p2.items[0].kind, 'playlist');
  assert.equal(p2.items[0].remoteId, 'yt:PLbtS3brARAM8wGp_k6Id6qq1WX7gFoqMo');
  assert.equal(p2.items[0].trackCount, 25);
  assert.ok(p2.nextCursor);

  const p3 = await runSearch(ext, bridge, { query: 'Yoasobi', kind: 'all', limit: 2, cursor: p2.nextCursor });
  assert.equal(p3.items.length, 1);
  assert.equal(p3.items[0].remoteTrackId, 'yt:vidPage2001');
  assert.equal(p3.nextCursor, null);
  assert.equal(requests.length, 2);
});

test('search: YouTube Music falls back to YouTube Web and ignores filter-chip continuationCommand', async () => {
  const { ext, bridge, requests, logs } = createYtMock({
    settings: { youtubeMode: 'music' },
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

  const p1 = await runSearch(ext, bridge, { query: 'test', kind: 'track', limit: 20 });
  assert.equal(p1.items.length, 1);
  assert.equal(p1.items[0].remoteTrackId, 'yt:webTrack001');
  assert.equal(p1.items[0].durationSec, 3723);
  assert.ok(decodeURIComponent(p1.nextCursor).includes('real-next-page-token'));
  assert.equal(decodeURIComponent(p1.nextCursor).includes('chip-filter-must-ignore'), false);
  assert.ok(logs.some((l) => l.level === 'warn'));

  const p2 = await runSearch(ext, bridge, { query: 'test', kind: 'track', limit: 20, cursor: p1.nextCursor });
  assert.equal(p2.items[0].remoteTrackId, 'yt:webTrack002');
  assert.equal(requests.some((r) => r.url.includes('www.youtube.com/youtubei/v1/search')), true);
});

test('fetchCollection: YouTube album browse header fallback, playlist pagination, and single video', async () => {
  const { ext, bridge } = createYtMock({
    httpHandler: async ({ url, body }) => {
      if (url.includes('music.youtube.com/youtubei/v1/browse')) {
        const payload = JSON.parse(body);
        if (payload.continuation === 'yt-pl-cont-2') {
          return {
            json: {
              continuationContents: {
                musicPlaylistShelfContinuation: {
                  contents: [{
                    musicResponsiveListItemRenderer: {
                      playlistItemData: { videoId: 'trackPage2A' },
                      flexColumns: [
                        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'Track Two' }] } } },
                        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'YOASOBI' }, { text: ' • ' }, { text: '4:00' }] } } }
                      ]
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
                              }],
                              continuations: [{ nextContinuationData: { continuation: 'yt-pl-cont-2' } }]
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
      if (url.includes('/sw.js_data')) return { text: ')]}\'\n["CgtScjNVNXhmS2xMcyj6"]' };
      if (url.includes('/youtubei/v1/player')) {
        return {
          json: {
            videoDetails: {
              videoId: 'dQw4w9WgXcQ',
              title: 'Single Track',
              author: 'Artist One',
              lengthSeconds: '212',
              thumbnail: { thumbnails: [{ url: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', width: 480 }] }
            }
          }
        };
      }
      throw new Error('Unexpected URL ' + url);
    }
  });

  const alb = await runFetchCollection(ext, bridge, { url: 'https://music.youtube.com/browse/MPREb_testAlbum1' });
  assert.equal(alb.remoteId, 'yt:MPREb_testAlbum1');
  assert.equal(alb.title, 'The Book');
  assert.equal(alb.tracks[0].remoteTrackId, 'yt:ZRtdQ81jPUQ');
  assert.equal(alb.tracks[0].artist, 'YOASOBI');
  assert.equal(alb.tracks[0].album, 'The Book');
  assert.equal(alb.tracks[0].artworkUrl, 'https://lh3.googleusercontent.com/book');
  assert.equal(alb.tracks[0].durationSec, 214);
  assert.ok(alb.nextCursor);

  const alb2 = await runFetchCollection(ext, bridge, { url: 'https://music.youtube.com/browse/MPREb_testAlbum1', cursor: alb.nextCursor });
  assert.equal(alb2.tracks.length, 1);
  assert.equal(alb2.tracks[0].remoteTrackId, 'yt:trackPage2A');
  assert.equal(alb2.tracks[0].trackNumber, 2);
  assert.equal(alb2.nextCursor, null);

  const single = await runFetchCollection(ext, bridge, { url: 'https://youtu.be/dQw4w9WgXcQ' });
  assert.equal(single.remoteId, 'yt:dQw4w9WgXcQ');
  assert.equal(single.tracks.length, 1);
  assert.equal(single.tracks[0].durationSec, 212);
});

test('resolveStream: Apple enforces MP4/AAC-only, honors req.quality/req.purpose and format pref, bounded range probes only', async () => {
  const adaptiveFormats = [
    { itag: 141, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=141&expire=1900000000', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 256000, contentLength: '4800000' },
    { itag: 251, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=251&expire=1900000000', mimeType: 'audio/webm; codecs="opus"', bitrate: 160000, contentLength: '2500000' },
    { itag: 250, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=250&expire=1900000000', mimeType: 'audio/webm; codecs="opus"', bitrate: 70000, contentLength: '1100000' },
    { itag: 249, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=249&expire=1900000000', mimeType: 'audio/webm; codecs="opus"', bitrate: 50000, contentLength: '800000' },
    { itag: 140, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=140&expire=1900000000', mimeType: 'audio/mp4; codecs="mp4a.40.2"', bitrate: 128000, contentLength: '2400000' },
    { itag: 139, url: 'https://rr1---sn-a.googlevideo.com/videoplayback?itag=139&expire=1900000000', mimeType: 'audio/mp4; codecs="mp4a.40.5"', bitrate: 48000, contentLength: '900000' }
  ];

  async function runFor(platform, youtubeAudioFormat, streamReq = {}) {
    const { ext, bridge, requests } = createYtMock({
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
    const stream = await runResolveStream(ext, bridge, { remoteTrackId: 'yt:m9SMT5ipbxk', forceRefresh: false, ...streamReq });
    return { stream, requests };
  }

  // Default stream (no quality/purpose -> standard): Apple stays MP4/AAC itag=140
  const iosRes = await runFor('ios', 'opus');
  assert.equal(iosRes.stream.fileExtension, 'm4a');
  assert.equal(iosRes.stream.mimeType, 'audio/mp4');
  assert.ok(iosRes.stream.url.includes('itag=140'));
  assert.equal(iosRes.stream.actualQuality, 'standard');
  assert.equal(iosRes.stream.qualityLabel, '128k');
  assert.equal(iosRes.stream.bitrateKbps, 128);
  const iosRanges = iosRes.requests.filter((r) => r.url.includes('googlevideo.com')).map((r) => r.headers.Range);
  assert.deepEqual(iosRanges, ['bytes=0-1023', 'bytes=1048576-1049599']);

  // Apple download purpose -> highest (itag=141 256k), low -> itag=139 (48k)
  const macDl = await runFor('macos', 'auto', { purpose: 'download' });
  assert.equal(macDl.stream.fileExtension, 'm4a');
  assert.ok(macDl.stream.url.includes('itag=141'));
  assert.equal(macDl.stream.actualQuality, 'highest');
  assert.equal(macDl.stream.qualityLabel, '256k');
  assert.equal(macDl.stream.bitrateKbps, 256);

  const iosLow = await runFor('ios', 'auto', { quality: 'low', purpose: 'stream' });
  assert.equal(iosLow.stream.fileExtension, 'm4a');
  assert.ok(iosLow.stream.url.includes('itag=139'));
  assert.equal(iosLow.stream.actualQuality, 'low');
  assert.equal(iosLow.stream.qualityLabel, '48k');
  assert.equal(iosLow.stream.bitrateKbps, 48);

  // Non-Apple auto: standard -> 250 (70k webm), high -> 251 (160k webm), highest -> 141 (256k m4a), opus+highest -> 251 (160k webm)
  const androidStd = await runFor('android', 'auto', { purpose: 'stream' });
  assert.equal(androidStd.stream.fileExtension, 'webm');
  assert.equal(androidStd.stream.mimeType, 'audio/webm');
  assert.ok(androidStd.stream.url.includes('itag=250'));
  assert.equal(androidStd.stream.actualQuality, 'standard');
  assert.equal(androidStd.stream.qualityLabel, '70k');
  assert.equal(androidStd.stream.bitrateKbps, 70);

  const androidHigh = await runFor('android', 'auto', { quality: 'high' });
  assert.equal(androidHigh.stream.fileExtension, 'webm');
  assert.ok(androidHigh.stream.url.includes('itag=251'));
  assert.equal(androidHigh.stream.actualQuality, 'high');
  assert.equal(androidHigh.stream.qualityLabel, '160k');
  assert.equal(androidHigh.stream.bitrateKbps, 160);

  const androidDl = await runFor('android', 'auto', { purpose: 'download' });
  assert.equal(androidDl.stream.fileExtension, 'm4a');
  assert.ok(androidDl.stream.url.includes('itag=141'));
  assert.equal(androidDl.stream.actualQuality, 'highest');

  const winOpusHighest = await runFor('windows', 'opus', { quality: 'highest' });
  assert.equal(winOpusHighest.stream.fileExtension, 'webm');
  assert.ok(winOpusHighest.stream.url.includes('itag=251'));

  const winM4a = await runFor('windows', 'm4a');
  assert.equal(winM4a.stream.fileExtension, 'm4a');
  assert.ok(winM4a.stream.url.includes('itag=140'));
});
