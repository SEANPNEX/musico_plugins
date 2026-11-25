'use strict';

var manifest = {
  apiVersion: 1,
  id: 'youtube-search',
  name: 'YouTube Search',
  version: '1.1.0',
  author: 'SEANPNEX',
  description: 'Search songs, albums, and playlists from YouTube and YouTube Music, plus import playlists, albums, mixes, and single videos.',
  badgeLabel: 'YouTube',
  updateUrl: 'https://github.com/SEANPNEX/musico_plugins/releases/download/youtube-search-v1.1.0/youtube-search.musicoext',
  capabilities: ['search', 'playlist', 'stream', 'cookie', 'proxy'],
  searchKinds: ['track', 'playlist', 'album'],
  qualities: [
    { id: 'highest', label: 'Best Available', badge: 'Best' },
    { id: 'high', label: 'High', badge: 'High' },
    { id: 'standard', label: 'Standard', badge: 'Std' },
    { id: 'low', label: 'Low (Data Saver)', badge: 'Low' }
  ],
  defaultStreamQuality: 'standard',
  defaultDownloadQuality: 'highest',
  urlPatterns: [
    '^https?://(www\\.|m\\.|music\\.)?youtube\\.com/(watch|playlist|browse|shorts|live|embed)',
    '^https?://youtu\\.be/[A-Za-z0-9_-]{11}'
  ],
  permissions: {
    hosts: [
      'www.youtube.com',
      'music.youtube.com',
      'm.youtube.com',
      'youtu.be',
      '*.googlevideo.com',
      'i.ytimg.com',
      'lh3.googleusercontent.com',
      'yt3.googleusercontent.com'
    ]
  },
  settings: [
    {
      key: 'youtubeMode',
      label: 'YouTube Search Mode',
      type: 'select',
      default: 'music',
      options: [
        { value: 'music', label: 'YouTube Music' },
        { value: 'youtube', label: 'YouTube Main' }
      ]
    },
    {
      key: 'youtubeAudioFormat',
      label: 'YouTube Audio Format',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto (M4A on Apple, Opus/M4A on Android & Windows)' },
        { value: 'm4a', label: 'Prefer M4A / AAC' },
        { value: 'opus', label: 'Prefer Opus / WebM (non-Apple)' }
      ]
    }
  ]
};

var WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var ANONYMOUS_YT_COOKIE = 'SOCS=CAI';
var VISITOR_DATA_KV_KEY = 'yt:visitorData';
var VISITOR_DATA_TTL_SEC = 1800;

var YT_CLIENTS = {
  WEB_REMIX: {
    name: 'WEB_REMIX',
    version: '1.20260707.12.00',
    clientId: 67,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    origin: 'https://music.youtube.com',
    baseUrl: 'https://music.youtube.com',
    clientBody: {
      clientName: 'WEB_REMIX',
      clientVersion: '1.20260707.12.00',
      hl: 'en',
      gl: 'US'
    }
  },
  WEB: {
    name: 'WEB',
    version: '2.20260708.00.00',
    clientId: 1,
    userAgent: WEB_USER_AGENT,
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    clientBody: {
      clientName: 'WEB',
      clientVersion: '2.20260708.00.00',
      hl: 'en',
      gl: 'US'
    }
  },
  VISIONOS: {
    name: 'VISIONOS',
    version: '1.02',
    clientId: 101,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15',
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    clientBody: {
      clientName: 'VISIONOS',
      clientVersion: '1.02',
      deviceMake: 'Apple',
      deviceModel: 'RealityDevice17,1',
      osName: 'visionOS',
      osVersion: '26.5.23O471',
      hl: 'en',
      gl: 'US'
    }
  },
  ANDROID: {
    name: 'ANDROID',
    version: '20.10.38',
    clientId: 3,
    userAgent: 'com.google.android.youtube/20.10.38 (Linux; U; Android 15; en_US) gzip',
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    params: 'CgIIAQ==',
    clientBody: {
      clientName: 'ANDROID',
      clientVersion: '20.10.38',
      androidSdkVersion: 35,
      osName: 'Android',
      osVersion: '15',
      hl: 'en',
      gl: 'US'
    }
  },
  IOS: {
    name: 'IOS',
    version: '20.10.4',
    clientId: 5,
    userAgent: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_1 like Mac OS X;)',
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    params: 'CgIIAQ==',
    clientBody: {
      clientName: 'IOS',
      clientVersion: '20.10.4',
      deviceMake: 'Apple',
      deviceModel: 'iPhone16,2',
      osName: 'iPhone',
      osVersion: '18.3.1',
      hl: 'en',
      gl: 'US'
    }
  },
  ANDROID_VR: {
    name: 'ANDROID_VR',
    version: '1.65.10',
    clientId: 28,
    userAgent: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    params: 'CgIIAQ==',
    clientBody: {
      clientName: 'ANDROID_VR',
      clientVersion: '1.65.10',
      deviceMake: 'Oculus',
      deviceModel: 'Quest 3',
      androidSdkVersion: 32,
      osName: 'Android',
      osVersion: '12L',
      hl: 'en',
      gl: 'US'
    }
  },
  WEB_EMBEDDED_PLAYER: {
    name: 'WEB_EMBEDDED_PLAYER',
    version: '2.20260708.00.00',
    clientId: 56,
    userAgent: WEB_USER_AGENT,
    origin: 'https://www.youtube.com',
    baseUrl: 'https://www.youtube.com',
    thirdPartyEmbedUrl: 'https://www.reddit.com/',
    clientBody: {
      clientName: 'WEB_EMBEDDED_PLAYER',
      clientVersion: '2.20260708.00.00',
      hl: 'en',
      gl: 'US'
    }
  }
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

function kvGetSafe(ctx, key) {
  if (!ctx || !ctx.kv || typeof ctx.kv.get !== 'function') return null;
  try {
    return ctx.kv.get(key);
  } catch (e) {
    return null;
  }
}

function kvSetSafe(ctx, key, val, ttlSec) {
  if (!ctx || !ctx.kv || typeof ctx.kv.set !== 'function') return;
  try {
    ctx.kv.set(key, String(val), ttlSec);
  } catch (e) {
    // Best-effort cache write.
  }
}

function logWarnSafe(ctx, msg) {
  if (ctx && ctx.log && typeof ctx.log.warn === 'function') {
    ctx.log.warn(String(msg));
  }
}

function safeDecodeURIComponent(str) {
  var s = String(str == null ? '' : str).replace(/\+/g, ' ');
  try {
    return decodeURIComponent(s);
  } catch (e) {
    return s;
  }
}

function parseQueryString(search) {
  var out = {};
  if (!search) return out;
  var raw = search.charAt(0) === '?' ? search.slice(1) : search;
  if (!raw) return out;
  var pairs = raw.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var pair = pairs[i];
    if (!pair) continue;
    var eq = pair.indexOf('=');
    var k = eq >= 0 ? safeDecodeURIComponent(pair.slice(0, eq)) : safeDecodeURIComponent(pair);
    var v = eq >= 0 ? safeDecodeURIComponent(pair.slice(eq + 1)) : '';
    if (k && !Object.prototype.hasOwnProperty.call(out, k)) {
      out[k] = v;
    }
  }
  return out;
}

function parseUrl(raw) {
  var s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  if (s.indexOf('//') === 0) s = 'https:' + s;
  var m = s.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/);
  if (!m) return null;
  var scheme = m[1].toLowerCase();
  var authority = m[2] || '';
  var atIdx = authority.lastIndexOf('@');
  var hostPort = atIdx >= 0 ? authority.slice(atIdx + 1) : authority;
  var colonIdx = hostPort.lastIndexOf(':');
  var hostname = (colonIdx >= 0 && hostPort.indexOf(']') < 0 ? hostPort.slice(0, colonIdx) : hostPort).toLowerCase();
  hostname = hostname.replace(/\.$/, '');
  return {
    scheme: scheme,
    hostname: hostname,
    host: hostPort.toLowerCase(),
    pathname: m[3] || '/',
    search: m[4] || '',
    hash: m[5] || '',
    query: parseQueryString(m[4] || '')
  };
}

function normalizeHttps(rawUrl) {
  var s = String(rawUrl == null ? '' : rawUrl).trim();
  if (!s) return null;
  if (s.indexOf('//') === 0) return 'https:' + s;
  if (s.indexOf('http://') === 0) return 'https://' + s.slice(7);
  if (s.indexOf('https://') === 0) return s;
  return null;
}

function sanitizeFileName(name, fallback) {
  var base = String(name == null ? '' : name)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (!base) {
    base = String(fallback || 'track').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
  }
  if (base.length > 120) {
    base = base.slice(0, 120).replace(/[.\s]+$/g, '');
  }
  return base || 'track';
}

function pad2(num) {
  var n = Math.floor(Number(num) || 0);
  return n < 10 ? ('0' + String(n)) : String(n);
}

function parseDurationSec(val) {
  if (typeof val === 'number') {
    return isFinite(val) && val >= 0 ? val : 0;
  }
  var s = String(val == null ? '' : val).trim();
  if (!s) return 0;
  if (/^\d+(?:\.\d+)?$/.test(s)) {
    var num = Number(s);
    return isFinite(num) && num >= 0 ? num : 0;
  }
  if (/^\d+(?::\d{1,2}){1,2}$/.test(s)) {
    var parts = s.split(':');
    var total = 0;
    for (var i = 0; i < parts.length; i++) {
      var partNum = parseInt(parts[i], 10);
      if (!isFinite(partNum) || partNum < 0) return 0;
      total = total * 60 + partNum;
    }
    return total;
  }
  return 0;
}

function isClockDuration(str) {
  return /^\d+(?::\d{2}){1,2}$/.test(String(str == null ? '' : str).trim());
}

function parseCookiePairs(cookieStr) {
  var map = {};
  if (!cookieStr) return map;
  var parts = String(cookieStr).split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var eq = part.indexOf('=');
    if (eq <= 0) continue;
    var k = part.slice(0, eq).trim();
    var v = part.slice(eq + 1).trim();
    if (k) map[k] = v;
  }
  return map;
}

function computeSapisidHash(ctx, cookieStr, origin, timestampSec) {
  if (!cookieStr || !ctx || !ctx.crypto || typeof ctx.crypto.sha1 !== 'function') {
    return null;
  }
  var pairs = parseCookiePairs(cookieStr);
  var sapisid = pairs.SAPISID || pairs['__Secure-3PAPISID'] || pairs['__Secure-1PAPISID'];
  if (!sapisid) return null;
  var ts = timestampSec != null ? Math.floor(Number(timestampSec)) : Math.floor(Date.now() / 1000);
  var digest = ctx.crypto.sha1(String(ts) + ' ' + sapisid + ' ' + origin);
  return 'SAPISIDHASH ' + String(ts) + '_' + digest;
}

function extractShareUrl(rawInput) {
  var raw = String(rawInput == null ? '' : rawInput).trim();
  if (!raw) return '';
  var m = raw.match(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/i);
  if (m) {
    return m[0].replace(/[),.'"\]}>。，」》】!！]+$/, '');
  }
  return raw;
}

function isDigitsOnly(str) {
  return typeof str === 'string' && /^[0-9]+$/.test(str);
}

function isYouTubeVideoId(str) {
  return typeof str === 'string' && /^[A-Za-z0-9_-]{11}$/.test(str);
}

function stripVlPrefix(id) {
  var s = String(id == null ? '' : id).trim();
  if (s.indexOf('VL') === 0 && s.length > 4) {
    return s.slice(2);
  }
  return s;
}

function isYouTubePlaylistId(id) {
  if (!id) return false;
  if (id === 'RDMM') return true;
  if (id.length < 10) return false;
  var prefixes = ['PL', 'OLAK5uy_', 'MPREb_', 'UU', 'FL', 'RD', 'LL', 'VL'];
  for (var i = 0; i < prefixes.length; i++) {
    if (id.indexOf(prefixes[i]) === 0) return true;
  }
  return false;
}

function parseTarget(rawInput) {
  var candidate = extractShareUrl(rawInput);
  if (!candidate) return null;

  // Namespaced IDs (internal / direct invocation support).
  if (candidate.indexOf('yt:') === 0) {
    var ytId = stripVlPrefix(candidate.slice(3));
    if (isYouTubePlaylistId(ytId)) {
      return {
        targetType: 'playlist',
        listId: ytId,
        videoId: null,
        remoteId: 'yt:' + ytId,
        normalizedUrl: ytId.indexOf('MPREb_') === 0
          ? 'https://music.youtube.com/browse/' + ytId
          : 'https://www.youtube.com/playlist?list=' + ytId,
        kind: 'playlist'
      };
    }
    if (isYouTubeVideoId(ytId)) {
      return {
        targetType: 'video',
        videoId: ytId,
        remoteId: 'yt:' + ytId,
        normalizedUrl: 'https://www.youtube.com/watch?v=' + ytId,
        kind: 'track'
      };
    }
    return null;
  }

  // Bare unambiguous IDs without scheme or slash.
  if (candidate.indexOf('://') < 0 && candidate.indexOf('/') < 0 && candidate.indexOf('.') < 0 && candidate.indexOf(' ') < 0) {
    var stripped = stripVlPrefix(candidate);
    if (isYouTubePlaylistId(stripped)) {
      return {
        targetType: 'playlist',
        listId: stripped,
        videoId: null,
        remoteId: 'yt:' + stripped,
        normalizedUrl: stripped.indexOf('MPREb_') === 0
          ? 'https://music.youtube.com/browse/' + stripped
          : 'https://www.youtube.com/playlist?list=' + stripped,
        kind: 'playlist'
      };
    }
    if (isYouTubeVideoId(candidate)) {
      return {
        targetType: 'video',
        videoId: candidate,
        remoteId: 'yt:' + candidate,
        normalizedUrl: 'https://www.youtube.com/watch?v=' + candidate,
        kind: 'track'
      };
    }
    return null;
  }

  var withScheme = candidate.indexOf('://') >= 0 ? candidate : ('https://' + candidate);
  var u = parseUrl(withScheme);
  if (!u || !u.hostname) return null;
  var host = u.hostname;
  var query = u.query;
  var segments = u.pathname.split('/').filter(Boolean);

  // YouTube short links.
  if (host === 'youtu.be' || host.slice(-9) === '.youtu.be') {
    var shortVid = segments[0] && isYouTubeVideoId(segments[0]) ? segments[0] : null;
    var shortList = query.list ? stripVlPrefix(query.list) : null;
    if (shortList) {
      return {
        targetType: 'playlist',
        listId: shortList,
        videoId: shortVid,
        remoteId: 'yt:' + shortList,
        normalizedUrl: shortVid
          ? ('https://www.youtube.com/watch?v=' + shortVid + '&list=' + shortList)
          : ('https://www.youtube.com/playlist?list=' + shortList),
        kind: 'playlist'
      };
    }
    if (shortVid) {
      return {
        targetType: 'video',
        videoId: shortVid,
        remoteId: 'yt:' + shortVid,
        normalizedUrl: 'https://www.youtube.com/watch?v=' + shortVid,
        kind: 'track'
      };
    }
    return null;
  }

  // YouTube / YouTube Music links.
  if (
    host === 'youtube.com' ||
    host.slice(-12) === '.youtube.com' ||
    host === 'youtube-nocookie.com' ||
    host.slice(-20) === '.youtube-nocookie.com'
  ) {
    var qVid = query.v && isYouTubeVideoId(query.v) ? query.v : null;
    var pVid = null;
    if (segments.length >= 2 && (segments[0] === 'shorts' || segments[0] === 'live' || segments[0] === 'embed' || segments[0] === 'v')) {
      if (isYouTubeVideoId(segments[1])) pVid = segments[1];
    }
    var resolvedVid = qVid || pVid;
    var listId = query.list ? stripVlPrefix(query.list) : null;
    var isMusicHost = host === 'music.youtube.com';

    if (listId) {
      var normListUrl;
      if (resolvedVid && listId.indexOf('RD') === 0) {
        normListUrl = (isMusicHost ? 'https://music.youtube.com' : 'https://www.youtube.com') +
          '/watch?v=' + resolvedVid + '&list=' + listId;
      } else {
        normListUrl = (isMusicHost ? 'https://music.youtube.com' : 'https://www.youtube.com') +
          '/playlist?list=' + listId;
      }
      return {
        targetType: 'playlist',
        listId: listId,
        videoId: resolvedVid,
        remoteId: 'yt:' + listId,
        normalizedUrl: normListUrl,
        kind: 'playlist'
      };
    }

    if (segments.length >= 2 && segments[0] === 'browse' && segments[1]) {
      var browseRaw = segments[1];
      var browseClean = stripVlPrefix(browseRaw);
      if (browseClean) {
        return {
          targetType: 'playlist',
          listId: browseClean,
          videoId: null,
          remoteId: 'yt:' + browseClean,
          normalizedUrl: 'https://music.youtube.com/browse/' + browseRaw,
          kind: 'playlist'
        };
      }
    }

    if (resolvedVid) {
      return {
        targetType: 'video',
        videoId: resolvedVid,
        remoteId: 'yt:' + resolvedVid,
        normalizedUrl: (isMusicHost ? 'https://music.youtube.com' : 'https://www.youtube.com') + '/watch?v=' + resolvedVid,
        kind: 'track'
      };
    }
    return null;
  }

  return null;
}

function canHandle(input) {
  var raw = (input && (input.extractedUrl || input.rawText)) || '';
  var parsed = parseTarget(raw);
  if (!parsed && input && input.rawText && input.extractedUrl && input.rawText !== input.extractedUrl) {
    parsed = parseTarget(input.rawText);
  }
  if (!parsed) {
    return { matched: false };
  }
  return {
    matched: true,
    normalizedUrl: parsed.normalizedUrl,
    remoteId: parsed.remoteId,
    kind: parsed.kind
  };
}

// ---------- Innertube HTTP & JSON Helpers ----------

function buildYtHeaders(ctx, client, origin, cookie, visitorData) {
  var headers = {
    'User-Agent': client.userAgent,
    'Origin': origin,
    'X-Origin': origin,
    'Referer': origin + '/',
    'X-YouTube-Client-Name': String(client.clientId),
    'X-YouTube-Client-Version': client.version
  };
  if (visitorData) {
    headers['X-Goog-Visitor-Id'] = visitorData;
  }
  var cleanCookie = cookie ? String(cookie).trim() : '';
  if (cleanCookie) {
    headers.Cookie = cleanCookie;
    var sapisidAuth = computeSapisidHash(ctx, cleanCookie, origin);
    if (sapisidAuth) {
      headers.Authorization = sapisidAuth;
    }
  } else {
    headers.Cookie = ANONYMOUS_YT_COOKIE;
  }
  return headers;
}

function buildYtClientContext(client, visitorData) {
  var c = {};
  var keys = Object.keys(client.clientBody);
  for (var i = 0; i < keys.length; i++) {
    c[keys[i]] = client.clientBody[keys[i]];
  }
  if (visitorData) {
    c.visitorData = visitorData;
  }
  var contextObj = { client: c };
  if (client.thirdPartyEmbedUrl) {
    contextObj.thirdParty = { embedUrl: client.thirdPartyEmbedUrl };
  }
  return contextObj;
}

async function postInnertube(ctx, url, client, bodyObj, cookie, visitorData) {
  var headers = buildYtHeaders(ctx, client, client.origin, cookie, visitorData);
  headers['Content-Type'] = 'application/json';
  var res = await ctx.http.request({
    method: 'POST',
    url: url,
    headers: headers,
    body: JSON.stringify(bodyObj),
    followRedirects: true,
    timeoutMs: 15000
  });
  if (res.status === 429) {
    throw extError('RATE_LIMITED', 'YouTube returned HTTP 429.');
  }
  if (res.status === 401 || res.status === 403) {
    throw extError('AUTH_REQUIRED', 'YouTube returned HTTP ' + String(res.status) + '.');
  }
  if (res.status >= 400) {
    throw extError('NETWORK_ERROR', 'YouTube returned HTTP ' + String(res.status) + '.');
  }
  try {
    return JSON.parse(res.text || '{}');
  } catch (e) {
    throw extError('NETWORK_ERROR', 'Invalid JSON from YouTube.');
  }
}

async function fetchYtVisitorData(ctx, forceRefresh) {
  if (!forceRefresh) {
    var cached = kvGetSafe(ctx, VISITOR_DATA_KV_KEY);
    if (cached) return cached;
  }
  try {
    var res = await ctx.http.request({
      method: 'GET',
      url: 'https://www.youtube.com/sw.js_data',
      headers: {
        'User-Agent': YT_CLIENTS.WEB.userAgent,
        'Accept': '*/*',
        'Cookie': ANONYMOUS_YT_COOKIE
      },
      followRedirects: true,
      timeoutMs: 10000
    });
    if (res.status >= 200 && res.status < 300 && res.text) {
      var m = res.text.match(/"(Cg[A-Za-z0-9_%-]{15,})"/);
      if (m && m[1]) {
        kvSetSafe(ctx, VISITOR_DATA_KV_KEY, m[1], VISITOR_DATA_TTL_SEC);
        return m[1];
      }
    }
  } catch (e) {
    // Visitor data is best-effort.
  }
  return null;
}

function runsText(node) {
  if (!node || typeof node !== 'object') return '';
  if (typeof node.simpleText === 'string') return node.simpleText.trim();
  if (typeof node.content === 'string') return node.content.trim();
  if (Array.isArray(node.runs)) {
    var out = '';
    for (var i = 0; i < node.runs.length; i++) {
      if (node.runs[i] && typeof node.runs[i].text === 'string') {
        out += node.runs[i].text;
      }
    }
    return out.trim();
  }
  return '';
}

function bestThumbnailFromArray(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  var bestUrl = null;
  var bestWidth = -1;
  for (var i = 0; i < arr.length; i++) {
    var item = arr[i];
    if (!item) continue;
    var url = normalizeHttps(item.url);
    if (!url) continue;
    var w = typeof item.width === 'number' ? item.width : 0;
    if (w >= bestWidth) {
      bestWidth = w;
      bestUrl = url;
    }
  }
  return bestUrl;
}

function bestThumbnail(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.musicThumbnailRenderer) {
    return bestThumbnail(node.musicThumbnailRenderer.thumbnail);
  }
  if (node.thumbnailRenderer && node.thumbnailRenderer.musicThumbnailRenderer) {
    return bestThumbnail(node.thumbnailRenderer.musicThumbnailRenderer.thumbnail);
  }
  if (Array.isArray(node.thumbnails)) {
    return bestThumbnailFromArray(node.thumbnails);
  }
  if (Array.isArray(node.sources)) {
    return bestThumbnailFromArray(node.sources);
  }
  return null;
}

function isYtMetadataNoise(text) {
  var s = String(text == null ? '' : text).trim();
  if (!s) return true;
  if (s === '•' || s === '·' || s === '|') return true;
  if (/^(Song|Video|Album|Single|EP|Playlist|Artist|Podcast|Episode)$/i.test(s)) return true;
  if (/^\d{4}$/.test(s)) return true;
  if (/[\d.,]+\s*[KMBkmb]?\s*(views?|plays?|subscribers?|listeners?|watching)$/i.test(s)) return true;
  return false;
}

function getBrowsePageType(browseEndpoint) {
  return browseEndpoint &&
    browseEndpoint.browseEndpointContextSupportedConfigs &&
    browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig &&
    browseEndpoint.browseEndpointContextSupportedConfigs.browseEndpointContextMusicConfig.pageType;
}

function findYtContinuationToken(root) {
  function walk(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var foundArr = walk(node[i]);
        if (foundArr) return foundArr;
      }
      return null;
    }
    if (node.continuationItemRenderer &&
        node.continuationItemRenderer.continuationEndpoint &&
        node.continuationItemRenderer.continuationEndpoint.continuationCommand &&
        node.continuationItemRenderer.continuationEndpoint.continuationCommand.token) {
      return String(node.continuationItemRenderer.continuationEndpoint.continuationCommand.token);
    }
    if (Array.isArray(node.continuations)) {
      for (var c = 0; c < node.continuations.length; c++) {
        var cont = node.continuations[c];
        if (cont && cont.nextContinuationData && cont.nextContinuationData.continuation) {
          return String(cont.nextContinuationData.continuation);
        }
      }
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var found = walk(node[keys[k]]);
      if (found) return found;
    }
    return null;
  }
  return walk(root);
}

function extractMrlirVideoId(item) {
  if (item.playlistItemData && item.playlistItemData.videoId) {
    return String(item.playlistItemData.videoId);
  }
  var overlayVid = item.overlay &&
    item.overlay.musicItemThumbnailOverlayRenderer &&
    item.overlay.musicItemThumbnailOverlayRenderer.content &&
    item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer &&
    item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint &&
    item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint &&
    item.overlay.musicItemThumbnailOverlayRenderer.content.musicPlayButtonRenderer.playNavigationEndpoint.watchEndpoint.videoId;
  if (overlayVid) return String(overlayVid);
  var navVid = item.navigationEndpoint &&
    item.navigationEndpoint.watchEndpoint &&
    item.navigationEndpoint.watchEndpoint.videoId;
  if (navVid) return String(navVid);
  var flex = Array.isArray(item.flexColumns) ? item.flexColumns : [];
  for (var i = 0; i < flex.length; i++) {
    var col = flex[i] && flex[i].musicResponsiveListItemFlexColumnRenderer;
    var runs = col && col.text && col.text.runs;
    if (!Array.isArray(runs)) continue;
    for (var j = 0; j < runs.length; j++) {
      var rVid = runs[j] && runs[j].navigationEndpoint && runs[j].navigationEndpoint.watchEndpoint && runs[j].navigationEndpoint.watchEndpoint.videoId;
      if (rVid) return String(rVid);
    }
  }
  return null;
}

function parseMrlirTrackDetails(item, fallbackArtist, fallbackAlbum, fallbackArt) {
  var flex = Array.isArray(item.flexColumns) ? item.flexColumns : [];
  var col0 = flex[0] && flex[0].musicResponsiveListItemFlexColumnRenderer;
  var title = runsText(col0 && col0.text);

  var durationSec = 0;
  var fixed = Array.isArray(item.fixedColumns) ? item.fixedColumns : [];
  if (fixed[0] && fixed[0].musicResponsiveListItemFixedColumnRenderer) {
    var fixedText = runsText(fixed[0].musicResponsiveListItemFixedColumnRenderer.text);
    if (isClockDuration(fixedText)) {
      durationSec = parseDurationSec(fixedText);
    }
  }

  var artistList = [];
  var album = '';
  var fallbackTokens = [];
  var col1 = flex[1] && flex[1].musicResponsiveListItemFlexColumnRenderer;
  var runs1 = col1 && col1.text && Array.isArray(col1.text.runs) ? col1.text.runs : [];
  for (var i = 0; i < runs1.length; i++) {
    var run = runs1[i];
    if (!run || typeof run.text !== 'string') continue;
    var txt = run.text.trim();
    if (!txt || txt === '•' || txt === '·') continue;
    if (isClockDuration(txt)) {
      if (durationSec === 0) durationSec = parseDurationSec(txt);
      continue;
    }
    var pt = getBrowsePageType(run.navigationEndpoint && run.navigationEndpoint.browseEndpoint);
    if (pt === 'MUSIC_PAGE_TYPE_ARTIST') {
      artistList.push(txt);
      continue;
    }
    if (pt === 'MUSIC_PAGE_TYPE_ALBUM') {
      if (!album) album = txt;
      continue;
    }
    if (isYtMetadataNoise(txt)) continue;
    fallbackTokens.push(txt);
  }

  if (flex.length > 2 && flex[2] && flex[2].musicResponsiveListItemFlexColumnRenderer) {
    var col2Text = runsText(flex[2].musicResponsiveListItemFlexColumnRenderer.text);
    if (col2Text && !isClockDuration(col2Text) && !isYtMetadataNoise(col2Text)) {
      album = col2Text;
    }
  }

  var artist = artistList.length > 0 ? artistList.join(' / ') : (fallbackTokens[0] || fallbackArtist || 'YouTube Music');
  if (!album) {
    album = artistList.length > 0 ? (fallbackTokens[0] || fallbackAlbum || 'YouTube Music') : (fallbackTokens[1] || fallbackAlbum || 'YouTube Music');
  }
  var artworkUrl = bestThumbnail(item.thumbnail) || fallbackArt || null;

  return {
    title: title,
    artist: artist,
    album: album,
    durationSec: durationSec,
    artworkUrl: artworkUrl
  };
}

function buildYtmCollectionResult(browseId, pageType, title, artist, art, trackCount, kindFilter) {
  var cleanId = stripVlPrefix(browseId);
  if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || browseId.indexOf('MPREb_') === 0 || browseId.indexOf('OLAK5uy_') === 0) {
    if (kindFilter === 'track' || kindFilter === 'playlist') return null;
    return {
      kind: 'album',
      remoteId: 'yt:' + cleanId,
      title: title,
      artist: artist,
      artworkUrl: art,
      sourceUrl: 'https://music.youtube.com/browse/' + encodeURIComponent(browseId),
      trackCount: trackCount
    };
  }
  if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST' || browseId.indexOf('VL') === 0 || browseId.indexOf('PL') === 0 || browseId.indexOf('RD') === 0) {
    if (kindFilter === 'track' || kindFilter === 'album') return null;
    return {
      kind: 'playlist',
      remoteId: 'yt:' + cleanId,
      title: title,
      artist: artist,
      artworkUrl: art,
      sourceUrl: 'https://music.youtube.com/playlist?list=' + encodeURIComponent(cleanId),
      trackCount: trackCount
    };
  }
  return null;
}

function parseYtmSearchItem(item, kindFilter) {
  if (!item || typeof item !== 'object') return null;
  var nav = item.navigationEndpoint;
  var browse = nav && nav.browseEndpoint;
  var browseId = browse && browse.browseId ? String(browse.browseId) : null;
  var pageType = getBrowsePageType(browse);

  if (browseId) {
    var flex = Array.isArray(item.flexColumns) ? item.flexColumns : [];
    var colTitle = runsText(flex[0] && flex[0].musicResponsiveListItemFlexColumnRenderer && flex[0].musicResponsiveListItemFlexColumnRenderer.text);
    if (!colTitle) return null;
    var art = bestThumbnail(item.thumbnail);
    var col1Runs = flex[1] && flex[1].musicResponsiveListItemFlexColumnRenderer && flex[1].musicResponsiveListItemFlexColumnRenderer.text && flex[1].musicResponsiveListItemFlexColumnRenderer.text.runs;
    var artistNames = [];
    var fallbackByline = [];
    var trackCount = null;
    if (Array.isArray(col1Runs)) {
      for (var i = 0; i < col1Runs.length; i++) {
        var r = col1Runs[i];
        if (!r || typeof r.text !== 'string') continue;
        var t = r.text.trim();
        if (!t || t === '•' || t === '·') continue;
        var countM = t.match(/^(\d+)\s+(?:songs?|tracks?|videos?)$/i);
        if (countM) {
          trackCount = parseInt(countM[1], 10);
          continue;
        }
        var pt = getBrowsePageType(r.navigationEndpoint && r.navigationEndpoint.browseEndpoint);
        if (pt === 'MUSIC_PAGE_TYPE_ARTIST' || pt === 'MUSIC_PAGE_TYPE_USER_CHANNEL') {
          artistNames.push(t);
          continue;
        }
        if (!isYtMetadataNoise(t)) {
          fallbackByline.push(t);
        }
      }
    }
    var itemArtist = artistNames.length > 0 ? artistNames.join(' / ') : (fallbackByline[0] || 'YouTube Music');
    return buildYtmCollectionResult(browseId, pageType, colTitle, itemArtist, art, trackCount, kindFilter);
  }

  if (kindFilter === 'playlist' || kindFilter === 'album') return null;
  var videoId = extractMrlirVideoId(item);
  if (!videoId || !isYouTubeVideoId(videoId)) return null;
  var info = parseMrlirTrackDetails(item, 'YouTube Music', 'YouTube Music', null);
  var title = info.title || videoId;
  return {
    kind: 'track',
    remoteTrackId: 'yt:' + videoId,
    title: title,
    artist: info.artist,
    album: info.album,
    durationSec: info.durationSec,
    artworkUrl: info.artworkUrl,
    relativePath: sanitizeFileName(title, videoId) + '.m4a'
  };
}

function parseYtmTwoRowItem(item, kindFilter) {
  if (!item || typeof item !== 'object') return null;
  var title = runsText(item.title);
  if (!title) return null;
  var art = bestThumbnail(item.thumbnailRenderer || item.thumbnail);
  var subtitleRuns = item.subtitle && Array.isArray(item.subtitle.runs) ? item.subtitle.runs : [];
  var artistList = [];
  var fallbackSub = [];
  var trackCount = null;
  var durationSec = 0;

  for (var i = 0; i < subtitleRuns.length; i++) {
    var r = subtitleRuns[i];
    if (!r || typeof r.text !== 'string') continue;
    var t = r.text.trim();
    if (!t || t === '•' || t === '·') continue;
    if (isClockDuration(t)) {
      if (durationSec === 0) durationSec = parseDurationSec(t);
      continue;
    }
    var cntM = t.match(/^(\d+)\s+(?:songs?|tracks?|videos?)$/i);
    if (cntM) {
      trackCount = parseInt(cntM[1], 10);
      continue;
    }
    var pt = getBrowsePageType(r.navigationEndpoint && r.navigationEndpoint.browseEndpoint);
    if (pt === 'MUSIC_PAGE_TYPE_ARTIST' || pt === 'MUSIC_PAGE_TYPE_USER_CHANNEL') {
      artistList.push(t);
      continue;
    }
    if (!isYtMetadataNoise(t)) fallbackSub.push(t);
  }
  var artist = artistList.length > 0 ? artistList.join(' / ') : (fallbackSub[0] || 'YouTube Music');

  var nav = item.navigationEndpoint;
  var browse = nav && nav.browseEndpoint;
  if (browse && browse.browseId) {
    return buildYtmCollectionResult(
      String(browse.browseId),
      getBrowsePageType(browse),
      title,
      artist,
      art,
      trackCount,
      kindFilter
    );
  }

  var watch = nav && nav.watchEndpoint;
  if (watch && watch.videoId && isYouTubeVideoId(watch.videoId)) {
    if (kindFilter === 'playlist' || kindFilter === 'album') return null;
    return {
      kind: 'track',
      remoteTrackId: 'yt:' + watch.videoId,
      title: title,
      artist: artist,
      album: 'YouTube Music',
      durationSec: durationSec,
      artworkUrl: art,
      relativePath: sanitizeFileName(title, watch.videoId) + '.m4a'
    };
  }
  return null;
}

function parseYtWebVideoRenderer(r, kindFilter) {
  if (!r || !r.videoId || !isYouTubeVideoId(r.videoId)) return null;
  if (kindFilter === 'playlist' || kindFilter === 'album') return null;
  if (r.upcomingEventData) return null;
  var title = runsText(r.title) || r.videoId;
  var artist = runsText(r.ownerText) || runsText(r.shortBylineText) || runsText(r.longBylineText) || 'YouTube';
  var durationSec = parseDurationSec(runsText(r.lengthText));
  var art = bestThumbnail(r.thumbnail);
  return {
    kind: 'track',
    remoteTrackId: 'yt:' + r.videoId,
    title: title,
    artist: artist,
    album: 'YouTube',
    durationSec: durationSec,
    artworkUrl: art,
    relativePath: sanitizeFileName(title, r.videoId) + '.m4a'
  };
}

function parseYtWebPlaylistRenderer(r, kindFilter) {
  if (!r || !r.playlistId) return null;
  if (kindFilter === 'track' || kindFilter === 'album') return null;
  var listId = stripVlPrefix(String(r.playlistId));
  var title = runsText(r.title) || listId;
  var artist = runsText(r.shortBylineText) || runsText(r.longBylineText) || 'YouTube';
  var count = null;
  if (typeof r.videoCount === 'number' && isFinite(r.videoCount)) {
    count = r.videoCount;
  } else if (typeof r.videoCount === 'string' && isDigitsOnly(r.videoCount)) {
    count = parseInt(r.videoCount, 10);
  } else {
    var countTxt = runsText(r.videoCountText);
    var cm = countTxt.match(/(\d+)/);
    if (cm) count = parseInt(cm[1], 10);
  }
  var art = bestThumbnail(r.thumbnail || (Array.isArray(r.thumbnails) ? r.thumbnails[0] : null));
  return {
    kind: 'playlist',
    remoteId: 'yt:' + listId,
    title: title,
    artist: artist,
    artworkUrl: art,
    sourceUrl: 'https://www.youtube.com/playlist?list=' + encodeURIComponent(listId),
    trackCount: count
  };
}

function extractOverlayBadges(thumbVm) {
  var badges = [];
  var overlays = thumbVm && Array.isArray(thumbVm.overlays) ? thumbVm.overlays : [];
  for (var i = 0; i < overlays.length; i++) {
    var ov = overlays[i];
    if (!ov) continue;
    if (ov.thumbnailBadgeViewModel && ov.thumbnailBadgeViewModel.text) {
      badges.push(String(ov.thumbnailBadgeViewModel.text));
    }
    var arr1 = ov.thumbnailOverlayBadgeViewModel && ov.thumbnailOverlayBadgeViewModel.thumbnailBadges;
    if (Array.isArray(arr1)) {
      for (var j = 0; j < arr1.length; j++) {
        if (arr1[j] && arr1[j].thumbnailBadgeViewModel && arr1[j].thumbnailBadgeViewModel.text) {
          badges.push(String(arr1[j].thumbnailBadgeViewModel.text));
        }
      }
    }
    var arr2 = ov.thumbnailBottomOverlayViewModel && ov.thumbnailBottomOverlayViewModel.badges;
    if (Array.isArray(arr2)) {
      for (var k = 0; k < arr2.length; k++) {
        if (arr2[k] && arr2[k].thumbnailBadgeViewModel && arr2[k].thumbnailBadgeViewModel.text) {
          badges.push(String(arr2[k].thumbnailBadgeViewModel.text));
        }
      }
    }
  }
  return badges;
}

function parseLockupViewModelSearch(vm, kindFilter) {
  if (!vm || !vm.contentId) return null;
  var contentId = String(vm.contentId);
  var contentType = vm.contentType || '';
  var meta = vm.metadata && vm.metadata.lockupMetadataViewModel;
  var title = runsText(meta && meta.title) || contentId;

  var rows = (meta && meta.metadata && meta.metadata.contentMetadataViewModel && meta.metadata.contentMetadataViewModel.metadataRows) ||
    (meta && meta.metadataRows) || [];
  var artist = '';
  for (var r = 0; r < rows.length; r++) {
    var parts = rows[r] && Array.isArray(rows[r].metadataParts) ? rows[r].metadataParts : [];
    for (var p = 0; p < parts.length; p++) {
      var cand = runsText(parts[p] && parts[p].text);
      if (cand && !isClockDuration(cand) && !isYtMetadataNoise(cand)) {
        artist = cand;
        break;
      }
    }
    if (artist) break;
  }

  var thumbVm = (vm.contentImage && vm.contentImage.thumbnailViewModel) ||
    (vm.contentImage && vm.contentImage.collectionThumbnailViewModel && vm.contentImage.collectionThumbnailViewModel.primaryThumbnail && vm.contentImage.collectionThumbnailViewModel.primaryThumbnail.thumbnailViewModel);
  var art = bestThumbnail(thumbVm && thumbVm.image);
  var badges = extractOverlayBadges(thumbVm);

  if (contentType === 'LOCKUP_CONTENT_TYPE_PLAYLIST' || isYouTubePlaylistId(stripVlPrefix(contentId))) {
    if (kindFilter === 'track' || kindFilter === 'album') return null;
    var listId = stripVlPrefix(contentId);
    var trackCount = null;
    for (var b = 0; b < badges.length; b++) {
      var cm = badges[b].match(/^(\d+)\s+(?:videos?|songs?|tracks?)/i);
      if (cm) {
        trackCount = parseInt(cm[1], 10);
        break;
      }
    }
    var watchSeed = vm.rendererContext &&
      vm.rendererContext.commandContext &&
      vm.rendererContext.commandContext.onTap &&
      vm.rendererContext.commandContext.onTap.innertubeCommand &&
      vm.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint &&
      vm.rendererContext.commandContext.onTap.innertubeCommand.watchEndpoint.videoId;
    var sourceUrl = (listId.indexOf('RD') === 0 && watchSeed)
      ? ('https://www.youtube.com/watch?v=' + encodeURIComponent(watchSeed) + '&list=' + encodeURIComponent(listId))
      : ('https://www.youtube.com/playlist?list=' + encodeURIComponent(listId));
    return {
      kind: 'playlist',
      remoteId: 'yt:' + listId,
      title: title,
      artist: artist || 'YouTube',
      artworkUrl: art,
      sourceUrl: sourceUrl,
      trackCount: trackCount
    };
  }

  if (contentType === 'LOCKUP_CONTENT_TYPE_VIDEO' || isYouTubeVideoId(contentId)) {
    if (kindFilter === 'playlist' || kindFilter === 'album') return null;
    var durationSec = 0;
    for (var bi = 0; bi < badges.length; bi++) {
      if (isClockDuration(badges[bi])) {
        durationSec = parseDurationSec(badges[bi]);
        break;
      }
    }
    return {
      kind: 'track',
      remoteTrackId: 'yt:' + contentId,
      title: title,
      artist: artist || 'YouTube',
      album: 'YouTube',
      durationSec: durationSec,
      artworkUrl: art,
      relativePath: sanitizeFileName(title, contentId) + '.m4a'
    };
  }

  return null;
}

function collectSearchItemsFromJson(root, mode, kindFilter) {
  var items = [];
  var seenKeys = {};

  function addItem(it) {
    if (!it) return;
    var key = it.kind + ':' + (it.kind === 'track' ? it.remoteTrackId : it.remoteId);
    if (seenKeys[key]) return;
    seenKeys[key] = true;
    items.push(it);
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (mode === 'music') {
      if (node.musicResponsiveListItemRenderer) {
        addItem(parseYtmSearchItem(node.musicResponsiveListItemRenderer, kindFilter));
        return;
      }
      if (node.musicTwoRowItemRenderer) {
        addItem(parseYtmTwoRowItem(node.musicTwoRowItemRenderer, kindFilter));
        return;
      }
    } else {
      if (node.videoRenderer) {
        addItem(parseYtWebVideoRenderer(node.videoRenderer, kindFilter));
        return;
      }
      if (node.playlistRenderer) {
        addItem(parseYtWebPlaylistRenderer(node.playlistRenderer, kindFilter));
        return;
      }
      if (node.lockupViewModel) {
        addItem(parseLockupViewModelSearch(node.lockupViewModel, kindFilter));
        return;
      }
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      walk(node[keys[k]]);
    }
  }

  walk(root);
  return {
    items: items,
    nextToken: findYtContinuationToken(root)
  };
}

async function searchYouTubeWeb(ctx, query, kindFilter, cookie, rawToken) {
  var webParams = null;
  if (kindFilter === 'track') webParams = 'EgIQAQ%3D%3D';
  else if (kindFilter === 'playlist') webParams = 'EgIQAw%3D%3D';

  var webBody = {
    context: buildYtClientContext(YT_CLIENTS.WEB, null)
  };
  if (rawToken) {
    webBody.continuation = rawToken;
  } else {
    webBody.query = query;
    if (webParams) webBody.params = webParams;
  }

  var webJson = await postInnertube(
    ctx,
    'https://www.youtube.com/youtubei/v1/search?prettyPrint=false',
    YT_CLIENTS.WEB,
    webBody,
    cookie,
    null
  );
  var parsed = collectSearchItemsFromJson(webJson, 'youtube', kindFilter);
  return {
    items: parsed.items,
    nextToken: parsed.nextToken ? ('w|' + parsed.nextToken) : null
  };
}

async function searchYouTube(ctx, query, kindFilter, youtubeMode, cookie, cursorToken) {
  var effectiveMode = youtubeMode === 'youtube' ? 'youtube' : 'music';
  if (effectiveMode === 'youtube' && kindFilter === 'album') {
    return { items: [], nextToken: null };
  }

  var tokenMode = effectiveMode;
  var rawToken = cursorToken;
  if (rawToken && rawToken.indexOf('m|') === 0) {
    tokenMode = 'music';
    rawToken = rawToken.slice(2);
  } else if (rawToken && rawToken.indexOf('w|') === 0) {
    tokenMode = 'youtube';
    rawToken = rawToken.slice(2);
  }

  if (tokenMode === 'music') {
    var ytmParams = null;
    if (kindFilter === 'track') ytmParams = 'EgWKAQIIAWoKEAMQBBAJEAoQBQ==';
    else if (kindFilter === 'album') ytmParams = 'EgWKAQIYAWoKEAMQBBAJEAoQBQ==';
    else if (kindFilter === 'playlist') ytmParams = 'EgWKAQIoAWoKEAMQBBAJEAoQBQ==';

    var ytmBody = {
      context: buildYtClientContext(YT_CLIENTS.WEB_REMIX, null)
    };
    if (rawToken) {
      ytmBody.continuation = rawToken;
    } else {
      ytmBody.query = query;
      if (ytmParams) ytmBody.params = ytmParams;
    }

    var ytmErr = null;
    try {
      var ytmJson = await postInnertube(
        ctx,
        'https://music.youtube.com/youtubei/v1/search?prettyPrint=false',
        YT_CLIENTS.WEB_REMIX,
        ytmBody,
        cookie,
        null
      );
      var parsedYtm = collectSearchItemsFromJson(ytmJson, 'music', kindFilter);
      if (parsedYtm.items.length > 0 || rawToken) {
        return {
          items: parsedYtm.items,
          nextToken: parsedYtm.nextToken ? ('m|' + parsedYtm.nextToken) : null
        };
      }
    } catch (err) {
      ytmErr = err;
      if (rawToken) throw err;
      logWarnSafe(ctx, 'YouTube Music search failed, falling back to YouTube Web: ' + (err && err.message ? err.message : String(err)));
    }

    // Fallback to www.youtube.com WEB when Music returns empty/error on initial page.
    if (kindFilter === 'album') {
      if (ytmErr) throw ytmErr;
      return { items: [], nextToken: null };
    }
    try {
      return await searchYouTubeWeb(ctx, query, kindFilter, cookie, null);
    } catch (webErr) {
      throw ytmErr || webErr;
    }
  }

  return await searchYouTubeWeb(ctx, query, kindFilter, cookie, rawToken);
}

// ---------- Search & Pagination ----------

function parseSearchCursor(cursor) {
  var state = { yt: '', ytOffset: 0 };
  if (!cursor || typeof cursor !== 'string' || cursor.indexOf('v1:') !== 0) {
    return state;
  }
  var val = safeDecodeURIComponent(cursor.slice(3));
  var atIdx = val.lastIndexOf('@');
  if (atIdx >= 0 && isDigitsOnly(val.slice(atIdx + 1))) {
    state.yt = val.slice(0, atIdx);
    state.ytOffset = parseInt(val.slice(atIdx + 1), 10) || 0;
  } else {
    state.yt = val;
  }
  return state;
}

function formatSearchCursor(ytVal) {
  if (!ytVal) return null;
  return 'v1:' + encodeURIComponent(ytVal);
}

async function search(ctx, req) {
  var query = String((req && req.query) || '').trim();
  if (!query) {
    return { items: [], nextCursor: null };
  }

  var rawKind = String((req && req.kind) || 'all').trim().toLowerCase();
  var kind = (rawKind === 'track' || rawKind === 'playlist' || rawKind === 'album') ? rawKind : 'all';
  var limit = Math.max(1, Math.min(50, Math.floor(Number((req && req.limit) || 20)) || 20));
  var ytCookie = req && req.cookie ? String(req.cookie).trim() : null;
  var prevCursor = req && req.cursor ? String(req.cursor).trim() : null;

  var youtubeMode = String(getSetting(ctx, 'youtubeMode', 'music')).toLowerCase();
  if (youtubeMode !== 'youtube') youtubeMode = 'music';

  if (youtubeMode === 'youtube' && kind === 'album') {
    return { items: [], nextCursor: null };
  }

  var parsedCur = parseSearchCursor(prevCursor);
  var isFirstPage = !prevCursor;
  if (!isFirstPage && !parsedCur.yt && parsedCur.ytOffset <= 0) {
    return { items: [], nextCursor: null };
  }

  var ytCursorTok = isFirstPage ? null : (parsedCur.yt || null);
  var ytCacheKey = 'ytsp:' + ctx.crypto.md5([youtubeMode, kind, query, ytCursorTok || ''].join('|'));

  var data = null;
  if (!isFirstPage && parsedCur.ytOffset > 0) {
    var cachedRaw = kvGetSafe(ctx, ytCacheKey);
    if (cachedRaw) {
      try {
        data = JSON.parse(cachedRaw);
      } catch (e) {
        data = null;
      }
    }
  }
  if (!data) {
    data = await searchYouTube(ctx, query, kind, youtubeMode, ytCookie, ytCursorTok);
    kvSetSafe(ctx, ytCacheKey, JSON.stringify(data), 300);
  }

  var ytAll = (data && Array.isArray(data.items)) ? data.items : [];
  var ytSlice = parsedCur.ytOffset > 0 ? ytAll.slice(parsedCur.ytOffset) : ytAll;
  var items = ytSlice.slice(0, limit);

  var nextYtSeg = '';
  var totalConsumed = (isFirstPage ? 0 : parsedCur.ytOffset) + items.length;
  if (totalConsumed < ytAll.length) {
    nextYtSeg = (isFirstPage ? '' : (parsedCur.yt || '')) + '@' + String(totalConsumed);
  } else if (data.nextToken) {
    nextYtSeg = data.nextToken;
  }

  var nextCursor = formatSearchCursor(nextYtSeg);
  if (nextCursor && prevCursor && nextCursor === prevCursor) {
    nextCursor = null;
  }

  return {
    items: items,
    nextCursor: nextCursor
  };
}

// ---------- Collection Fetching ----------

function extractYtPlaylistMeta(root) {
  var title = null;
  var artist = null;
  var artworkUrl = null;

  var header = root && root.header;
  if (header) {
    var ph = header.pageHeaderRenderer;
    if (ph) {
      if (typeof ph.pageTitle === 'string' && ph.pageTitle.trim()) {
        title = ph.pageTitle.trim();
      } else {
        var dyn = ph.content && ph.content.pageHeaderViewModel && ph.content.pageHeaderViewModel.title && ph.content.pageHeaderViewModel.title.dynamicTextViewModel;
        if (dyn && dyn.text && dyn.text.content) title = String(dyn.text.content).trim();
      }
    }
    var hKeys = ['musicDetailHeaderRenderer', 'musicResponsiveHeaderRenderer', 'playlistHeaderRenderer', 'musicEditablePlaylistDetailHeaderRenderer'];
    for (var i = 0; i < hKeys.length; i++) {
      var sub = header[hKeys[i]];
      if (!sub) continue;
      if (!title) {
        var t1 = runsText(sub.title);
        if (t1) title = t1;
      }
      if (!artist) {
        var a1 = runsText(sub.straplineTextOne) || runsText(sub.subtitle) || runsText(sub.ownerText);
        if (a1 && !isYtMetadataNoise(a1)) artist = a1;
      }
      if (!artworkUrl) {
        artworkUrl = bestThumbnail(sub.thumbnail);
      }
      if (sub.header) {
        var inner = sub.header.musicDetailHeaderRenderer || sub.header.musicResponsiveHeaderRenderer;
        if (inner) {
          if (!title) title = runsText(inner.title) || title;
          if (!artist) artist = runsText(inner.straplineTextOne) || runsText(inner.subtitle) || artist;
          if (!artworkUrl) artworkUrl = bestThumbnail(inner.thumbnail);
        }
      }
    }
  }

  if (!title && root && root.metadata && root.metadata.playlistMetadataRenderer && root.metadata.playlistMetadataRenderer.title) {
    title = String(root.metadata.playlistMetadataRenderer.title).trim();
  }

  function findResponsiveHeader(node) {
    if (!node || typeof node !== 'object') return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var found = findResponsiveHeader(node[i]);
        if (found) return found;
      }
      return null;
    }
    if (node.musicResponsiveHeaderRenderer) return node.musicResponsiveHeaderRenderer;
    if (node.musicDetailHeaderRenderer) return node.musicDetailHeaderRenderer;
    var ks = Object.keys(node);
    for (var k = 0; k < ks.length; k++) {
      var hit = findResponsiveHeader(node[ks[k]]);
      if (hit) return hit;
    }
    return null;
  }

  if (!title || !artist || !artworkUrl) {
    var innerHeader = findResponsiveHeader(root && root.contents);
    if (innerHeader) {
      if (!title) title = runsText(innerHeader.title) || title;
      if (!artist) {
        var strap = runsText(innerHeader.straplineTextOne);
        if (strap && !isYtMetadataNoise(strap)) artist = strap;
      }
      if (!artworkUrl) artworkUrl = bestThumbnail(innerHeader.thumbnail);
    }
  }

  if (!title && root && root.microformat && root.microformat.microformatDataRenderer && root.microformat.microformatDataRenderer.title) {
    title = String(root.microformat.microformatDataRenderer.title).trim();
  }

  var watchPl = root && root.contents && root.contents.twoColumnWatchNextResults && root.contents.twoColumnWatchNextResults.playlist && root.contents.twoColumnWatchNextResults.playlist.playlist;
  if (!title && watchPl) {
    title = (typeof watchPl.title === 'string' ? watchPl.title.trim() : runsText(watchPl.title)) || title;
  }

  return {
    title: title || null,
    artist: artist || null,
    artworkUrl: artworkUrl || null
  };
}

function parseBrowseTracks(root, meta, startNumber) {
  var tracks = [];
  var seen = {};
  var fallbackAlbum = meta.title || 'YouTube Playlist';
  var fallbackArtist = meta.artist || null;
  var fallbackArt = meta.artworkUrl || null;

  function addTrack(tr) {
    if (!tr || !tr.remoteTrackId) return;
    if (seen[tr.remoteTrackId]) return;
    seen[tr.remoteTrackId] = true;
    var num = startNumber + tracks.length;
    tr.trackNumber = num;
    tr.relativePath = pad2(num) + ' - ' + sanitizeFileName(tr.title, tr.remoteTrackId) + '.m4a';
    tracks.push(tr);
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i]);
      return;
    }
    if (node.musicResponsiveListItemRenderer) {
      var mItem = node.musicResponsiveListItemRenderer;
      var mVid = extractMrlirVideoId(mItem);
      if (mVid && isYouTubeVideoId(mVid)) {
        var det = parseMrlirTrackDetails(mItem, fallbackArtist || 'YouTube Music', fallbackAlbum, fallbackArt);
        addTrack({
          remoteTrackId: 'yt:' + mVid,
          title: det.title || mVid,
          artist: det.artist,
          album: det.album,
          durationSec: det.durationSec,
          artworkUrl: det.artworkUrl
        });
      }
      return;
    }
    if (node.playlistVideoRenderer || node.playlistPanelVideoRenderer) {
      var pItem = node.playlistVideoRenderer || node.playlistPanelVideoRenderer;
      if (node.playlistPanelVideoRenderer && pItem.unplayableText) return;
      if (pItem.isPlayable === false) return;
      if (pItem.videoId && isYouTubeVideoId(pItem.videoId)) {
        var pTitle = runsText(pItem.title) || pItem.videoId;
        var pArtist = runsText(pItem.shortBylineText) || runsText(pItem.longBylineText) || fallbackArtist || 'YouTube';
        var pDur = parseDurationSec(pItem.lengthSeconds || runsText(pItem.lengthText));
        var pArt = bestThumbnail(pItem.thumbnail) || fallbackArt;
        addTrack({
          remoteTrackId: 'yt:' + pItem.videoId,
          title: pTitle,
          artist: pArtist,
          album: fallbackAlbum,
          durationSec: pDur,
          artworkUrl: pArt
        });
      }
      return;
    }
    if (node.lockupViewModel) {
      var lvm = parseLockupViewModelSearch(node.lockupViewModel, 'track');
      if (lvm && lvm.kind === 'track') {
        addTrack({
          remoteTrackId: lvm.remoteTrackId,
          title: lvm.title,
          artist: lvm.artist || fallbackArtist || 'YouTube',
          album: fallbackAlbum,
          durationSec: lvm.durationSec,
          artworkUrl: lvm.artworkUrl || fallbackArt
        });
      }
      return;
    }
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      walk(node[keys[k]]);
    }
  }

  walk(root);
  return {
    tracks: tracks,
    continuation: findYtContinuationToken(root)
  };
}

function encodeYtBrowseCursor(clientTag, listId, offset, title, artist, artworkUrl, token) {
  return 'ytb:' + JSON.stringify({
    c: clientTag,
    l: listId,
    o: offset,
    t: title || '',
    a: artist || '',
    art: artworkUrl || '',
    k: token
  });
}

function decodeYtBrowseCursor(cursor) {
  if (!cursor || cursor.indexOf('ytb:') !== 0) return null;
  try {
    return JSON.parse(cursor.slice(4));
  } catch (e) {
    return null;
  }
}

function inferMixVideoId(listId, explicitVideoId) {
  if (explicitVideoId) return explicitVideoId;
  if (listId.indexOf('RDAMVM') === 0 && listId.length >= 17) {
    var s1 = listId.slice(6, 17);
    if (isYouTubeVideoId(s1)) return s1;
  }
  if (listId.indexOf('RD') === 0 && listId.length === 13) {
    var s2 = listId.slice(2);
    if (isYouTubeVideoId(s2)) return s2;
  }
  return null;
}

function extractYtInitialData(html) {
  var text = String(html == null ? '' : html);
  var searchFrom = 0;
  while (searchFrom < text.length) {
    var idx = text.indexOf('ytInitialData', searchFrom);
    if (idx < 0) return null;
    searchFrom = idx + 13;
    var eq = text.indexOf('=', searchFrom);
    if (eq < 0 || eq - searchFrom > 16) continue;
    var start = eq + 1;
    while (start < text.length && /\s/.test(text.charAt(start))) start++;
    if (start >= text.length || text.charAt(start) !== '{') continue;
    var depth = 0;
    var inString = false;
    var escaped = false;
    var end = -1;
    for (var i = start; i < text.length; i++) {
      var ch = text.charAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else {
        if (ch === '"') inString = true;
        else if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
    }
    if (end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch (e) {
        // Continue scanning.
      }
    }
  }
  return null;
}

async function fetchYtSingleVideo(ctx, videoId, cookie) {
  var visitorData = await fetchYtVisitorData(ctx, false);
  var clients = [YT_CLIENTS.VISIONOS, YT_CLIENTS.ANDROID, YT_CLIENTS.IOS, YT_CLIENTS.WEB];
  var details = null;
  var lastErr = null;

  for (var i = 0; i < clients.length; i++) {
    var cl = clients[i];
    try {
      var body = {
        context: buildYtClientContext(cl, visitorData),
        videoId: videoId,
        contentCheckOk: true,
        racyCheckOk: true
      };
      if (cl.params) body.params = cl.params;
      var json = await postInnertube(ctx, cl.baseUrl + '/youtubei/v1/player?prettyPrint=false', cl, body, cookie, visitorData);
      if (json && json.videoDetails && json.videoDetails.title) {
        details = json.videoDetails;
        break;
      }
      if (json && json.videoDetails && !details) {
        details = json.videoDetails;
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (details) {
    var title = String(details.title || ('YouTube (' + videoId + ')')).trim();
    var author = String(details.author || 'YouTube').trim() || 'YouTube';
    var dur = parseDurationSec(details.lengthSeconds);
    var art = bestThumbnail(details.thumbnail);
    return {
      remoteId: 'yt:' + videoId,
      title: title,
      tracks: [
        {
          remoteTrackId: 'yt:' + videoId,
          relativePath: '01 - ' + sanitizeFileName(title, videoId) + '.m4a',
          title: title,
          artist: author,
          album: title,
          trackNumber: 1,
          durationSec: dur,
          artworkUrl: art
        }
      ],
      nextCursor: null
    };
  }

  try {
    var oRes = await ctx.http.request({
      method: 'GET',
      url: 'https://www.youtube.com/oembed?url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + videoId) + '&format=json',
      headers: {
        'User-Agent': YT_CLIENTS.WEB.userAgent,
        'Cookie': cookie || ANONYMOUS_YT_COOKIE
      },
      followRedirects: true,
      timeoutMs: 10000
    });
    if (oRes.status >= 200 && oRes.status < 300) {
      var oJson = JSON.parse(oRes.text || '{}');
      if (oJson.title) {
        var oTitle = String(oJson.title).trim();
        var oAuthor = String(oJson.author_name || 'YouTube').trim() || 'YouTube';
        return {
          remoteId: 'yt:' + videoId,
          title: oTitle,
          tracks: [
            {
              remoteTrackId: 'yt:' + videoId,
              relativePath: '01 - ' + sanitizeFileName(oTitle, videoId) + '.m4a',
              title: oTitle,
              artist: oAuthor,
              album: oTitle,
              trackNumber: 1,
              durationSec: 0,
              artworkUrl: normalizeHttps(oJson.thumbnail_url)
            }
          ],
          nextCursor: null
        };
      }
    }
  } catch (e) {
    // Fall through.
  }

  throw lastErr || extError('EMPTY_COLLECTION', 'Could not load YouTube video details.');
}

async function fetchYtPlaylist(ctx, rawListId, videoId, cookie, cursor) {
  var listId = stripVlPrefix(rawListId);

  if (cursor) {
    var state = decodeYtBrowseCursor(cursor);
    if (!state || !state.k) {
      throw extError('INVALID_URL', 'Invalid YouTube pagination cursor.');
    }
    var cl = state.c === 'remix' ? YT_CLIENTS.WEB_REMIX : YT_CLIENTS.WEB;
    var contJson = await postInnertube(
      ctx,
      cl.baseUrl + '/youtubei/v1/browse?prettyPrint=false',
      cl,
      { context: buildYtClientContext(cl, null), continuation: state.k },
      cookie,
      null
    );
    var contMeta = { title: state.t || null, artist: state.a || null, artworkUrl: state.art || null };
    var contParsed = parseBrowseTracks(contJson, contMeta, Number(state.o) || 1);
    var nextC = (contParsed.continuation && contParsed.continuation !== state.k)
      ? encodeYtBrowseCursor(state.c, listId, (Number(state.o) || 1) + contParsed.tracks.length, contMeta.title, contMeta.artist, contMeta.artworkUrl, contParsed.continuation)
      : null;
    return {
      remoteId: 'yt:' + listId,
      title: contMeta.title || ('YouTube Playlist (' + listId + ')'),
      tracks: contParsed.tracks,
      nextCursor: nextC
    };
  }

  var isMix = listId.indexOf('RD') === 0;
  var browseId = (listId.indexOf('VL') === 0 || listId.indexOf('MPREb_') === 0 || listId.indexOf('FEmusic_') === 0)
    ? listId
    : ('VL' + listId);
  var lastErr = null;

  if (isMix) {
    try {
      var mixVid = inferMixVideoId(listId, videoId);
      var mixBody = { context: buildYtClientContext(YT_CLIENTS.WEB, null), playlistId: listId };
      if (mixVid) mixBody.videoId = mixVid;
      var mixJson = await postInnertube(ctx, 'https://www.youtube.com/youtubei/v1/next?prettyPrint=false', YT_CLIENTS.WEB, mixBody, cookie, null);
      var mixMeta = extractYtPlaylistMeta(mixJson);
      var mixParsed = parseBrowseTracks(mixJson, mixMeta, 1);
      if (mixParsed.tracks.length > 0) {
        return {
          remoteId: 'yt:' + listId,
          title: mixMeta.title || 'YouTube Mix',
          tracks: mixParsed.tracks,
          nextCursor: null
        };
      }
    } catch (e) {
      lastErr = e;
    }
  }

  var browseClients = [
    { tag: 'remix', client: YT_CLIENTS.WEB_REMIX },
    { tag: 'web', client: YT_CLIENTS.WEB }
  ];
  for (var i = 0; i < browseClients.length; i++) {
    var entry = browseClients[i];
    try {
      var json = await postInnertube(
        ctx,
        entry.client.baseUrl + '/youtubei/v1/browse?prettyPrint=false',
        entry.client,
        { context: buildYtClientContext(entry.client, null), browseId: browseId },
        cookie,
        null
      );
      var meta = extractYtPlaylistMeta(json);
      var parsed = parseBrowseTracks(json, meta, 1);
      if (parsed.tracks.length > 0) {
        var finalTitle = meta.title || ('YouTube Playlist (' + listId + ')');
        var nextCursor = parsed.continuation
          ? encodeYtBrowseCursor(entry.tag, listId, 1 + parsed.tracks.length, finalTitle, meta.artist, meta.artworkUrl, parsed.continuation)
          : null;
        return {
          remoteId: 'yt:' + listId,
          title: finalTitle,
          tracks: parsed.tracks,
          nextCursor: nextCursor
        };
      }
    } catch (err) {
      lastErr = err;
    }
  }

  if (!isMix && videoId) {
    try {
      var nextJson = await postInnertube(
        ctx,
        'https://www.youtube.com/youtubei/v1/next?prettyPrint=false',
        YT_CLIENTS.WEB,
        { context: buildYtClientContext(YT_CLIENTS.WEB, null), playlistId: listId, videoId: videoId },
        cookie,
        null
      );
      var nextMeta = extractYtPlaylistMeta(nextJson);
      var nextParsed = parseBrowseTracks(nextJson, nextMeta, 1);
      if (nextParsed.tracks.length > 0) {
        return {
          remoteId: 'yt:' + listId,
          title: nextMeta.title || ('YouTube Playlist (' + listId + ')'),
          tracks: nextParsed.tracks,
          nextCursor: null
        };
      }
    } catch (e) {
      lastErr = e;
    }
  }

  try {
    var htmlRes = await ctx.http.request({
      method: 'GET',
      url: 'https://www.youtube.com/playlist?list=' + encodeURIComponent(listId),
      headers: {
        'User-Agent': YT_CLIENTS.WEB.userAgent,
        'Cookie': cookie || ANONYMOUS_YT_COOKIE,
        'Accept-Language': 'en-US,en;q=0.9'
      },
      followRedirects: true,
      timeoutMs: 15000
    });
    if (htmlRes.status >= 200 && htmlRes.status < 300) {
      var initJson = extractYtInitialData(htmlRes.text);
      if (initJson) {
        var hMeta = extractYtPlaylistMeta(initJson);
        var hParsed = parseBrowseTracks(initJson, hMeta, 1);
        if (hParsed.tracks.length > 0) {
          return {
            remoteId: 'yt:' + listId,
            title: hMeta.title || ('YouTube Playlist (' + listId + ')'),
            tracks: hParsed.tracks,
            nextCursor: null
          };
        }
      }
    }
  } catch (e) {
    lastErr = e;
  }

  if (videoId) {
    return await fetchYtSingleVideo(ctx, videoId, cookie);
  }

  throw lastErr || extError('EMPTY_COLLECTION', 'YouTube playlist contains no playable tracks.');
}

async function fetchCollection(ctx, req) {
  var rawUrl = String((req && req.url) || '').trim();
  var target = parseTarget(rawUrl);
  if (!target) {
    throw extError('INVALID_URL', 'Unsupported YouTube link.');
  }

  var ytCookie = req && req.cookie ? String(req.cookie).trim() : null;
  var cursor = req && req.cursor ? String(req.cursor).trim() : null;

  if (target.targetType === 'video') {
    return await fetchYtSingleVideo(ctx, target.videoId, ytCookie);
  }
  return await fetchYtPlaylist(ctx, target.listId, target.videoId, ytCookie, cursor);
}

// ---------- Stream Resolution ----------

function parseStreamTrackId(rawId) {
  var s = String(rawId == null ? '' : rawId).trim();
  if (!s) return null;

  if (s.indexOf('yt:') === 0) {
    var yv = s.slice(3);
    return isYouTubeVideoId(yv) ? { videoId: yv } : null;
  }
  if (isYouTubeVideoId(s)) {
    return { videoId: s };
  }
  return null;
}

var YT_QUALITY_IDS = {
  highest: true,
  high: true,
  standard: true,
  low: true
};

var YT_QUALITY_ORDER = {
  highest: {
    m4a: [141, 140, 139, 'mp4a', 251, 250, 249, 'opus', 18, 'mp4v'],
    opus: [251, 250, 249, 'opus', 141, 140, 139, 'mp4a', 18, 'mp4v'],
    auto: [141, 251, 140, 250, 139, 249, 'opus', 'mp4a', 18, 'mp4v']
  },
  high: {
    m4a: [140, 141, 139, 'mp4a', 251, 250, 249, 'opus', 18, 'mp4v'],
    opus: [251, 250, 249, 'opus', 140, 141, 139, 'mp4a', 18, 'mp4v'],
    auto: [251, 140, 141, 250, 139, 249, 'opus', 'mp4a', 18, 'mp4v']
  },
  standard: {
    m4a: [140, 139, 141, 'mp4a', 250, 249, 251, 'opus', 18, 'mp4v'],
    opus: [250, 249, 251, 'opus', 140, 139, 141, 'mp4a', 18, 'mp4v'],
    auto: [250, 140, 249, 139, 251, 141, 'opus', 'mp4a', 18, 'mp4v']
  },
  low: {
    m4a: [139, 140, 141, 'mp4a', 249, 250, 251, 'opus', 18, 'mp4v'],
    opus: [249, 250, 251, 'opus', 139, 140, 141, 'mp4a', 18, 'mp4v'],
    auto: [249, 139, 250, 140, 251, 141, 'opus', 'mp4a', 18, 'mp4v']
  }
};

function resolveYtRequestedQuality(req) {
  var raw = req && req.quality ? String(req.quality).trim().toLowerCase() : '';
  if (raw && YT_QUALITY_IDS[raw]) {
    return raw;
  }
  var purpose = req && req.purpose ? String(req.purpose).trim().toLowerCase() : '';
  return purpose === 'download' ? 'highest' : 'standard';
}

function ytCandidateQualityMeta(cand) {
  var itag = cand.itag;
  var defaultKbps = itag === 141 ? 256
    : itag === 251 ? 160
      : itag === 140 ? 128
        : itag === 250 ? 70
          : itag === 249 ? 50
            : itag === 139 ? 48
              : itag === 18 ? 96
                : 128;
  var kbps = cand.bitrate > 0 ? Math.max(1, Math.round(cand.bitrate / 1000)) : defaultKbps;
  var actualQuality;
  if (itag === 141) actualQuality = 'highest';
  else if (itag === 251) actualQuality = 'high';
  else if (itag === 140 || itag === 250) actualQuality = 'standard';
  else if (itag === 139 || itag === 249 || itag === 18) actualQuality = 'low';
  else actualQuality = kbps >= 220 ? 'highest' : kbps >= 145 ? 'high' : kbps >= 65 ? 'standard' : 'low';
  return {
    actualQuality: actualQuality,
    qualityLabel: String(kbps) + 'k',
    bitrateKbps: kbps
  };
}

function selectYtAudioCandidates(ctx, playerJson, requestedQuality) {
  var sd = playerJson && playerJson.streamingData;
  if (!sd) return [];
  var all = []
    .concat(Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [])
    .concat(Array.isArray(sd.formats) ? sd.formats : []);

  var platform = String((ctx && ctx.env && ctx.env.platform) || '').toLowerCase();
  var isApple = (platform === 'ios' || platform === 'macos');
  var formatPref = String(getSetting(ctx, 'youtubeAudioFormat', 'auto')).toLowerCase();
  var qualityKey = YT_QUALITY_IDS[requestedQuality] ? requestedQuality : 'standard';
  var branch = (isApple || formatPref === 'm4a') ? 'm4a' : (formatPref === 'opus' ? 'opus' : 'auto');
  var orderList = YT_QUALITY_ORDER[qualityKey][branch];

  var candidates = [];
  for (var i = 0; i < all.length; i++) {
    var f = all[i];
    if (!f || !f.url || typeof f.itag !== 'number') continue;
    var url = normalizeHttps(f.url);
    if (!url) continue;
    var itag = f.itag;
    var mime = String(f.mimeType || '').toLowerCase();
    var isMp4Audio = itag === 141 || itag === 140 || itag === 139 || mime.indexOf('audio/mp4') === 0 || mime.indexOf('mp4a') >= 0;
    var isMp4Video = itag === 18 || mime.indexOf('video/mp4') === 0;
    var isWebmAudio = itag === 251 || itag === 250 || itag === 249 || mime.indexOf('audio/webm') === 0 || mime.indexOf('opus') >= 0;

    if (isApple && !isMp4Audio && !isMp4Video) {
      // Apple AVPlayer cannot play WebM/Opus streams.
      continue;
    }

    var priority = orderList.indexOf(itag);
    if (priority < 0) {
      if (isWebmAudio) priority = orderList.indexOf('opus');
      else if (isMp4Audio) priority = orderList.indexOf('mp4a');
      else if (isMp4Video) priority = orderList.indexOf('mp4v');
    }
    if (priority < 0) continue;

    var fileExtension = isWebmAudio ? 'webm' : (isMp4Video ? 'mp4' : 'm4a');
    var mimeType = isWebmAudio ? 'audio/webm' : (isMp4Video ? 'video/mp4' : 'audio/mp4');
    var bitrate = Number(f.bitrate || f.averageBitrate || 0) || 0;
    var contentLength = f.contentLength != null ? parseInt(String(f.contentLength), 10) : null;
    if (!contentLength || !isFinite(contentLength) || contentLength <= 0) contentLength = null;

    candidates.push({
      itag: itag,
      url: url,
      fileExtension: fileExtension,
      mimeType: mimeType,
      priority: priority,
      bitrate: bitrate,
      contentLength: contentLength
    });
  }

  candidates.sort(function (a, b) {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return b.bitrate - a.bitrate;
  });

  return candidates;
}

function extractYtExpireMs(urlStr, expiresInSec) {
  var parsed = parseUrl(urlStr);
  if (parsed && parsed.query && parsed.query.expire && isDigitsOnly(parsed.query.expire)) {
    var expSec = parseInt(parsed.query.expire, 10);
    if (isFinite(expSec) && expSec > 0) {
      var candidate = (expSec - 120) * 1000;
      var maxCap = Date.now() + 3600 * 1000;
      return candidate < maxCap ? candidate : maxCap;
    }
  }
  if (expiresInSec && isFinite(expiresInSec) && expiresInSec > 0) {
    var ttl = Math.max(300, expiresInSec - 120);
    return Date.now() + ttl * 1000;
  }
  return Date.now() + 1800 * 1000;
}

async function sendBoundedRangeProbe(ctx, url, userAgent, rangeHeader) {
  try {
    var res = await ctx.http.request({
      method: 'GET',
      url: url,
      headers: {
        'User-Agent': userAgent,
        'Accept': '*/*',
        'Range': rangeHeader
      },
      followRedirects: true,
      timeoutMs: 8000
    });
    if (res.status !== 200 && res.status !== 206) return false;
    var ct = res.headers && res.headers['content-type'] ? String(res.headers['content-type']).toLowerCase() : '';
    if (ct.indexOf('text/html') >= 0) return false;
    return true;
  } catch (e) {
    return false;
  }
}

async function probeYtCandidate(ctx, candidate, userAgent) {
  var firstOk = await sendBoundedRangeProbe(ctx, candidate.url, userAgent, 'bytes=0-1023');
  if (!firstOk) return false;
  if (candidate.contentLength && candidate.contentLength > 1200000) {
    var post1MbOk = await sendBoundedRangeProbe(ctx, candidate.url, userAgent, 'bytes=1048576-1049599');
    if (!post1MbOk) return false;
  }
  return true;
}

async function resolveYtStream(ctx, videoId, ytCookie, forceRefresh, requestedQuality) {
  var visitorData = await fetchYtVisitorData(ctx, Boolean(forceRefresh));
  var clients = [
    YT_CLIENTS.VISIONOS,
    YT_CLIENTS.ANDROID,
    YT_CLIENTS.IOS,
    YT_CLIENTS.ANDROID_VR,
    YT_CLIENTS.WEB_EMBEDDED_PLAYER
  ];
  var didRefreshVisitorForLogin = false;
  var lastErr = null;
  var sawLoginRequired = false;

  async function tryClients(useCookie) {
    for (var i = 0; i < clients.length; i++) {
      var cl = clients[i];
      var attempt = 0;
      while (attempt < 2) {
        attempt += 1;
        try {
          var body = {
            context: buildYtClientContext(cl, visitorData),
            videoId: videoId,
            contentCheckOk: true,
            racyCheckOk: true
          };
          if (cl.params) body.params = cl.params;

          var json = await postInnertube(
            ctx,
            cl.baseUrl + '/youtubei/v1/player?prettyPrint=false',
            cl,
            body,
            useCookie,
            visitorData
          );

          var status = json && json.playabilityStatus && json.playabilityStatus.status;
          if (status === 'LOGIN_REQUIRED') {
            sawLoginRequired = true;
            if (cl.name === 'VISIONOS' && !didRefreshVisitorForLogin && !useCookie) {
              didRefreshVisitorForLogin = true;
              var refreshed = await fetchYtVisitorData(ctx, true);
              if (refreshed) {
                visitorData = refreshed;
                continue;
              }
            }
          }

          var candidates = selectYtAudioCandidates(ctx, json, requestedQuality);
          var expSec = json && json.streamingData && json.streamingData.expiresInSeconds
            ? parseInt(String(json.streamingData.expiresInSeconds), 10)
            : 0;

          for (var c = 0; c < Math.min(3, candidates.length); c++) {
            var cand = candidates[c];
            if (await probeYtCandidate(ctx, cand, cl.userAgent)) {
              var qMeta = ytCandidateQualityMeta(cand);
              return {
                url: cand.url,
                headers: {
                  'User-Agent': cl.userAgent,
                  'Accept': '*/*'
                },
                fileExtension: cand.fileExtension,
                mimeType: cand.mimeType,
                expiresAtMs: extractYtExpireMs(cand.url, expSec),
                fallbackUrls: [],
                contentLength: cand.contentLength,
                actualQuality: qMeta.actualQuality,
                qualityLabel: qMeta.qualityLabel,
                bitrateKbps: qMeta.bitrateKbps
              };
            }
          }
          break;
        } catch (err) {
          lastErr = err;
          break;
        }
      }
    }
    return null;
  }

  // Primary anonymous Innertube attempts avoid browser-cookie playback blocks.
  var anonResult = await tryClients(null);
  if (anonResult) return anonResult;

  // Retry with user cookie + SAPISIDHASH if provided and anonymous failed.
  if (ytCookie) {
    var authResult = await tryClients(ytCookie);
    if (authResult) return authResult;
  }

  if (sawLoginRequired && !ytCookie) {
    throw extError('AUTH_REQUIRED', 'YouTube requires login for this video.');
  }
  throw lastErr || extError('NO_PLAYABLE_STREAM', 'No playable YouTube audio stream found.');
}

async function resolveStream(ctx, req) {
  var rawTrackId = (req && (req.remoteTrackId || req.relativePath)) || '';
  var parsed = parseStreamTrackId(rawTrackId);
  if (!parsed) {
    throw extError('NO_PLAYABLE_STREAM', 'Unrecognized YouTube track ID: ' + String(rawTrackId));
  }
  var ytCookie = req && req.cookie ? String(req.cookie).trim() : null;
  var requestedQuality = resolveYtRequestedQuality(req);
  return await resolveYtStream(ctx, parsed.videoId, ytCookie, Boolean(req && req.forceRefresh), requestedQuality);
}

module.exports = {
  manifest: manifest,
  canHandle: canHandle,
  fetchCollection: fetchCollection,
  resolveStream: resolveStream,
  search: search
};
