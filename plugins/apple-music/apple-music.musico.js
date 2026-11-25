'use strict';

var manifest = {
  apiVersion: 1,
  id: 'com.seanpnex.musico.applemusic',
  name: 'Apple Music',
  version: '1.0.0',
  author: 'SEANPNEX',
  description: 'Search, browse albums/playlists, stream, and fetch lyrics from Apple Music via your self-hosted companion server.',
  badgeLabel: 'Apple Music',
  updateUrl: 'https://github.com/SEANPNEX/musico_plugins/releases/download/apple-music-v1.0.0/apple-music.musicoext',
  capabilities: ['search', 'playlist', 'stream', 'lyrics', 'cookie', 'proxy'],
  searchKinds: ['track', 'playlist', 'album'],
  urlPatterns: [
    '^https?://(?:beta\\.|classical\\.)?music\\.apple\\.com/'
  ],
  permissions: {
    hosts: [
      'is1-ssl.mzstatic.com',
      '*.mzstatic.com'
    ]
  },
  settings: [
    {
      key: 'serverUrl',
      label: 'Apple Music Server URL',
      type: 'server_url',
      default: ''
    },
    {
      key: 'codec',
      label: 'Audio Codec',
      type: 'select',
      default: 'aac-web',
      options: [
        { value: 'aac-web', label: 'AAC 256k (aac-web)' },
        { value: 'aac-he-web', label: 'HE-AAC (aac-he-web)' },
        { value: 'alac', label: 'ALAC Lossless (requires wrapper)' },
        { value: 'atmos', label: 'Dolby Atmos (requires wrapper)' }
      ]
    }
  ]
};

var ALLOWED_CODECS = {
  'aac-web': true,
  'aac-he-web': true,
  alac: true,
  atmos: true
};

function extError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function getSetting(ctx, key, fallback) {
  if (!ctx || !ctx.settings || typeof ctx.settings.get !== 'function') {
    return fallback;
  }
  var val = ctx.settings.get(key);
  if (val === null || val === undefined || val === '') {
    return fallback;
  }
  return val;
}

function extractFirstUrl(rawText) {
  var raw = String(rawText == null ? '' : rawText).trim();
  if (!raw) return '';
  var m = raw.match(/https?:\/\/[^\s<>"'`]+/i);
  if (m) {
    return m[0].replace(/[),.'"\]}>。，」》】!！]+$/, '');
  }
  return raw;
}

function parseQueryParam(queryStr, targetKey) {
  if (!queryStr) return '';
  var raw = queryStr.charAt(0) === '?' ? queryStr.slice(1) : queryStr;
  if (!raw) return '';
  var pairs = raw.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    var k = eq >= 0 ? pairs[i].slice(0, eq) : pairs[i];
    if (k === targetKey) {
      var v = eq >= 0 ? pairs[i].slice(eq + 1) : '';
      try {
        return decodeURIComponent(v.replace(/\+/g, ' ')).trim();
      } catch (e) {
        return v.trim();
      }
    }
  }
  return '';
}

function parseAppleMusicUrl(rawInput) {
  var candidate = extractFirstUrl(rawInput);
  if (!candidate) return null;
  var m = candidate.match(
    /^https?:\/\/((?:beta\.|classical\.)?music\.apple\.com)(\/[^?#]*)(\?[^#]*)?(?:#.*)?$/i
  );
  if (!m) return null;

  var host = m[1].toLowerCase();
  var pathname = m[2] || '/';
  var queryStr = m[3] || '';
  var segments = pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  var idx = 0;
  if (/^[a-z]{2}$/i.test(segments[0]) && segments[0].toLowerCase() !== 'us') {
    idx = 1;
  } else if (/^[a-z]{2}$/i.test(segments[0])) {
    idx = 1;
  }

  var resourceType = '';
  var typeIndex = -1;
  for (var i = idx; i < segments.length; i++) {
    var seg = segments[i].toLowerCase();
    if (seg === 'song' || seg === 'album' || seg === 'playlist') {
      resourceType = seg;
      typeIndex = i;
      break;
    }
    if (seg === 'artist' || seg === 'music-video' || seg === 'curator' || seg === 'station') {
      return null;
    }
  }

  if (!resourceType || typeIndex < 0) return null;
  var rawId = segments[segments.length - 1];
  if (!rawId) return null;

  var queryTrackId = parseQueryParam(queryStr, 'i');
  if (resourceType === 'album' && queryTrackId && /^\d+$/.test(queryTrackId)) {
    return {
      kind: 'track',
      remoteId: 'song:' + queryTrackId,
      normalizedUrl: 'https://' + host + pathname + '?i=' + encodeURIComponent(queryTrackId)
    };
  }

  if (resourceType === 'song') {
    return {
      kind: 'track',
      remoteId: 'song:' + rawId,
      normalizedUrl: 'https://' + host + pathname
    };
  }

  if (resourceType === 'album') {
    return {
      kind: 'album',
      remoteId: 'album:' + rawId,
      normalizedUrl: 'https://' + host + pathname
    };
  }

  if (resourceType === 'playlist') {
    return {
      kind: 'playlist',
      remoteId: 'playlist:' + rawId,
      normalizedUrl: 'https://' + host + pathname
    };
  }

  return null;
}

function canHandle(input) {
  var raw = (input && (input.extractedUrl || input.rawText)) || '';
  var parsed = parseAppleMusicUrl(raw);
  if (!parsed && input && input.rawText && input.extractedUrl && input.rawText !== input.extractedUrl) {
    parsed = parseAppleMusicUrl(input.rawText);
  }
  if (!parsed) {
    return { matched: false };
  }
  return {
    matched: true,
    normalizedUrl: parsed.normalizedUrl,
    remoteId: parsed.remoteId,
    kind: parsed.kind === 'album' ? 'playlist' : parsed.kind
  };
}

function getServerUrl(ctx) {
  var raw = String(getSetting(ctx, 'serverUrl', '') || '').trim();
  if (!raw) {
    throw extError('AUTH_REQUIRED', 'Please configure Apple Music Server URL in Extension Settings.');
  }
  var m = raw.match(/^(https?:\/\/[^/\s?#]+(?:\/[^?\s#]*)?)/i);
  if (!m) {
    throw extError('INVALID_URL', 'Apple Music Server URL must start with http:// or https://.');
  }
  return m[1].replace(/\/+$/, '');
}

function getCodec(ctx) {
  var raw = String(getSetting(ctx, 'codec', 'aac-web') || 'aac-web').trim().toLowerCase();
  return ALLOWED_CODECS[raw] ? raw : 'aac-web';
}

function buildAuthHeaders(cookie) {
  var headers = { Accept: 'application/json' };
  var clean = cookie ? String(cookie).trim() : '';
  if (clean) {
    headers.Authorization = /^bearer\s+/i.test(clean) ? clean : ('Bearer ' + clean);
  }
  return headers;
}

async function requestJson(ctx, url, cookie, timeoutMs) {
  var res = await ctx.http.request({
    method: 'GET',
    url: url,
    headers: buildAuthHeaders(cookie),
    followRedirects: true,
    timeoutMs: timeoutMs || 15000
  });
  if (res.status === 401 || res.status === 403) {
    var msg401 = 'Apple Music server authentication failed.';
    try {
      var errObj = JSON.parse(res.text || '{}');
      if (errObj && errObj.detail) msg401 = String(errObj.detail);
    } catch (e) {
      // keep default message
    }
    throw extError('AUTH_REQUIRED', msg401);
  }
  if (res.status === 429) {
    throw extError('RATE_LIMITED', 'Apple Music server rate limited.');
  }
  if (res.status >= 400) {
    var msgErr = 'Apple Music server returned HTTP ' + String(res.status) + '.';
    try {
      var bodyErr = JSON.parse(res.text || '{}');
      if (bodyErr && bodyErr.detail) msgErr = String(bodyErr.detail);
    } catch (e2) {
      // keep default message
    }
    throw extError('NETWORK_ERROR', msgErr);
  }
  try {
    return JSON.parse(res.text || '{}');
  } catch (e3) {
    throw extError('NETWORK_ERROR', 'Invalid JSON returned by Apple Music server.');
  }
}

async function search(ctx, req) {
  var baseUrl = getServerUrl(ctx);
  var query = String((req && req.query) || '').trim();
  if (!query) {
    return { items: [], nextCursor: null };
  }
  var kind = String((req && req.kind) || 'all').trim().toLowerCase();
  var limit = Math.max(1, Number((req && req.limit) || 20));
  var apiUrl =
    baseUrl +
    '/v1/search?q=' + encodeURIComponent(query) +
    '&kind=' + encodeURIComponent(kind) +
    '&limit=' + encodeURIComponent(String(limit)) +
    (req && req.cursor ? '&cursor=' + encodeURIComponent(String(req.cursor)) : '');

  var data = await requestJson(ctx, apiUrl, req && req.cookie, 15000);
  var rawItems = Array.isArray(data && data.items) ? data.items : [];
  var items = [];
  for (var i = 0; i < rawItems.length; i++) {
    var it = rawItems[i];
    if (!it || !it.title) continue;
    var itemKind = String(it.kind || 'track').toLowerCase();
    if (itemKind === 'playlist' || itemKind === 'album') {
      if (!it.remoteId) continue;
      items.push({
        kind: itemKind,
        remoteId: String(it.remoteId),
        title: String(it.title),
        artist: it.artist ? String(it.artist) : null,
        artworkUrl: it.artworkUrl ? String(it.artworkUrl) : null,
        sourceUrl: it.sourceUrl ? String(it.sourceUrl) : null,
        trackCount: typeof it.trackCount === 'number' ? it.trackCount : null
      });
    } else if (itemKind === 'track') {
      var trackId = it.remoteTrackId != null ? String(it.remoteTrackId) : '';
      if (!trackId) continue;
      items.push({
        kind: 'track',
        remoteTrackId: trackId,
        title: String(it.title),
        artist: it.artist ? String(it.artist) : 'Unknown Artist',
        album: it.album ? String(it.album) : null,
        durationSec: typeof it.durationSec === 'number' && it.durationSec > 0 ? it.durationSec : 0,
        artworkUrl: it.artworkUrl ? String(it.artworkUrl) : null,
        relativePath: it.relativePath ? String(it.relativePath) : null
      });
    }
  }

  return {
    items: items,
    nextCursor: data && data.nextCursor ? String(data.nextCursor) : null
  };
}

async function fetchCollection(ctx, req) {
  var baseUrl = getServerUrl(ctx);
  var targetUrl = String((req && req.url) || '').trim();
  var parsed = parseAppleMusicUrl(targetUrl);
  if (!parsed) {
    throw extError('INVALID_URL', 'Unsupported Apple Music URL.');
  }

  var apiUrl =
    baseUrl +
    '/v1/collection?url=' + encodeURIComponent(parsed.normalizedUrl) +
    (req && req.cursor ? '&cursor=' + encodeURIComponent(String(req.cursor)) : '');

  var data = await requestJson(ctx, apiUrl, req && req.cookie, 60000);
  var rawTracks = Array.isArray(data && data.tracks) ? data.tracks : [];
  var tracks = [];
  for (var i = 0; i < rawTracks.length; i++) {
    var tr = rawTracks[i];
    if (!tr || tr.remoteTrackId == null) continue;
    var trackId = String(tr.remoteTrackId);
    var title = String(tr.title || 'Untitled');
    tracks.push({
      remoteTrackId: trackId,
      relativePath: tr.relativePath ? String(tr.relativePath) : (String(i + 1).padStart(2, '0') + ' - ' + title + '.m4a'),
      title: title,
      artist: tr.artist ? String(tr.artist) : 'Unknown Artist',
      album: tr.album ? String(tr.album) : (data && data.title ? String(data.title) : 'Apple Music'),
      trackNumber: typeof tr.trackNumber === 'number' ? tr.trackNumber : (i + 1),
      durationSec: typeof tr.durationSec === 'number' && tr.durationSec > 0 ? tr.durationSec : 0,
      artworkUrl: tr.artworkUrl ? String(tr.artworkUrl) : null
    });
  }

  if (tracks.length === 0 && !(req && req.cursor)) {
    throw extError('EMPTY_COLLECTION', 'No playable tracks found in this Apple Music collection.');
  }

  return {
    remoteId: data && data.remoteId ? String(data.remoteId) : parsed.remoteId,
    title: data && data.title ? String(data.title) : 'Apple Music',
    tracks: tracks,
    nextCursor: data && data.nextCursor ? String(data.nextCursor) : null
  };
}

async function resolveStream(ctx, req) {
  var baseUrl = getServerUrl(ctx);
  var trackId = String((req && req.remoteTrackId) || '').trim();
  if (!trackId) {
    throw extError('NO_PLAYABLE_STREAM', 'Missing Apple Music track ID.');
  }
  var codec = getCodec(ctx);
  var headers = {};
  var cleanCookie = req && req.cookie ? String(req.cookie).trim() : '';
  if (cleanCookie) {
    headers.Authorization = /^bearer\s+/i.test(cleanCookie) ? cleanCookie : ('Bearer ' + cleanCookie);
  }
  var streamUrl =
    baseUrl +
    '/v1/tracks/' + encodeURIComponent(trackId) +
    '/stream?codec=' + encodeURIComponent(codec) +
    (req && req.forceRefresh ? '&refresh=1' : '');

  return {
    url: streamUrl,
    headers: headers,
    fileExtension: 'm4a',
    mimeType: 'audio/mp4',
    expiresAtMs: Date.now() + 3600 * 1000
  };
}

async function searchLyrics(ctx, req) {
  var rawServer = String(getSetting(ctx, 'serverUrl', '') || '').trim();
  if (!rawServer) {
    return [];
  }
  var baseUrl = getServerUrl(ctx);
  var title = String((req && req.title) || '').trim();
  var artist = String((req && req.artist) || '').trim();
  if (!title && !artist) {
    return [];
  }

  var apiUrl =
    baseUrl +
    '/v1/lyrics?title=' + encodeURIComponent(title) +
    '&artist=' + encodeURIComponent(artist) +
    (req && req.album ? '&album=' + encodeURIComponent(String(req.album)) : '') +
    (req && typeof req.durationSec === 'number' && isFinite(req.durationSec) && req.durationSec > 0
      ? '&durationSec=' + encodeURIComponent(String(req.durationSec))
      : '');

  var res = await ctx.http.request({
    method: 'GET',
    url: apiUrl,
    headers: buildAuthHeaders(null),
    followRedirects: true,
    timeoutMs: 15000
  });
  if (res.status === 404) {
    return [];
  }
  if (res.status === 401 || res.status === 403) {
    throw extError('AUTH_REQUIRED', 'Apple Music server authentication failed.');
  }
  if (res.status === 429) {
    throw extError('RATE_LIMITED', 'Apple Music server rate limited.');
  }
  if (res.status >= 400) {
    throw extError('NETWORK_ERROR', 'Apple Music lyrics HTTP ' + String(res.status) + '.');
  }

  var payload;
  try {
    payload = JSON.parse(res.text || '[]');
  } catch (e) {
    return [];
  }
  var rows = Array.isArray(payload)
    ? payload
    : (Array.isArray(payload && payload.candidates) ? payload.candidates : []);
  var out = [];
  for (var i = 0; i < rows.length; i++) {
    var row = rows[i];
    if (!row) continue;
    out.push({
      externalId: row.externalId ? String(row.externalId) : null,
      title: row.title ? String(row.title) : title,
      artist: row.artist ? String(row.artist) : artist,
      album: row.album ? String(row.album) : null,
      durationSec: typeof row.durationSec === 'number' ? row.durationSec : null,
      syncedLyrics: row.syncedLyrics ? String(row.syncedLyrics) : null,
      plainLyrics: row.plainLyrics ? String(row.plainLyrics) : null,
      translatedLyrics: row.translatedLyrics ? String(row.translatedLyrics) : null,
      instrumental: Boolean(row.instrumental)
    });
  }
  return out;
}

module.exports = {
  manifest: manifest,
  canHandle: canHandle,
  fetchCollection: fetchCollection,
  resolveStream: resolveStream,
  search: search,
  searchLyrics: searchLyrics
};
