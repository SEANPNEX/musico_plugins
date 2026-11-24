'use strict';

var manifest = {
  apiVersion: 1,
  id: 'com.seanpnex.musico.yt-bili-search',
  name: 'YouTube & Bilibili Search',
  version: '1.0.0',
  author: 'SEANPNEX',
  description: 'Search songs, albums, and playlists from YouTube, YouTube Music, and Bilibili, plus import playlists, albums, favlists, and collections.',
  badgeLabel: 'YT / Bili',
  capabilities: ['search', 'playlist', 'stream', 'cookie', 'proxy'],
  searchKinds: ['track', 'playlist', 'album'],
  urlPatterns: [
    '^https?://(www\\.|m\\.|music\\.)?youtube\\.com/(watch|playlist|browse|shorts)',
    '^https?://youtu\\.be/[A-Za-z0-9_-]{11}',
    '^https?://(www\\.|m\\.|space\\.)?bilibili\\.com/',
    '^https?://b23\\.tv/[A-Za-z0-9]+'
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
      'yt3.googleusercontent.com',
      'api.bilibili.com',
      'www.bilibili.com',
      'm.bilibili.com',
      'space.bilibili.com',
      'search.bilibili.com',
      'b23.tv',
      '*.bilivideo.com',
      '*.bilivideo.cn',
      '*.bilivideo.net',
      '*.akamaized.net',
      '*.hdslb.com',
      '*.szbdyd.com'
    ]
  },
  settings: [
    {
      key: 'source',
      label: 'Search Sources',
      type: 'select',
      default: 'both',
      options: [
        { value: 'both', label: 'YouTube + Bilibili' },
        { value: 'youtube', label: 'YouTube Only' },
        { value: 'bilibili', label: 'Bilibili Only' }
      ]
    },
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
      key: 'biliSearchOrder',
      label: 'Bilibili Search Order',
      type: 'select',
      default: 'totalrank',
      options: [
        { value: 'totalrank', label: 'Relevance' },
        { value: 'click', label: 'Most Played' },
        { value: 'pubdate', label: 'Newest' },
        { value: 'stow', label: 'Most Favorited' }
      ]
    },
    {
      key: 'cookieScope',
      label: 'Extension Cookie Scope',
      type: 'select',
      default: 'auto',
      options: [
        { value: 'auto', label: 'Auto-detect' },
        { value: 'youtube', label: 'YouTube Cookie' },
        { value: 'bilibili', label: 'Bilibili Cookie' }
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
var BUVID3_KV_KEY = 'bili:buvid3';
var BUVID3_TTL_SEC = 86400;
var WBI_KEY_KV_KEY = 'bili:wbiMixinKey';
var WBI_KEY_TTL_SEC = 21600;
var FALLBACK_BUVID3 = 'B0E2A3F1-1234-4567-89AB-CDEF01234567infoc';

var WBI_MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

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

function kvRemoveSafe(ctx, key) {
  if (!ctx || !ctx.kv || typeof ctx.kv.remove !== 'function') return;
  try {
    ctx.kv.remove(key);
  } catch (e) {
    // Best-effort cache delete.
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

function encodeRfc3986(str) {
  return encodeURIComponent(String(str == null ? '' : str)).replace(/[!'()*]/g, function (c) {
    return '%' + c.charCodeAt(0).toString(16).toUpperCase();
  });
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

function stripHtmlTags(raw) {
  return String(raw == null ? '' : raw).replace(/<[^>]*>/g, '');
}

function decodeHtmlEntities(raw) {
  var s = String(raw == null ? '' : raw);
  var named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: '\'',
    nbsp: ' '
  };
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|amp|lt|gt|quot|apos|nbsp);/g, function (full, entity) {
    var lower = entity.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(named, lower)) {
      return named[lower];
    }
    var cp = -1;
    if (lower.indexOf('#x') === 0) {
      cp = parseInt(lower.slice(2), 16);
    } else if (lower.charAt(0) === '#') {
      cp = parseInt(lower.slice(1), 10);
    }
    if (!isFinite(cp) || cp < 0 || cp > 0x10FFFF) {
      return full;
    }
    if (typeof String.fromCodePoint === 'function') {
      return String.fromCodePoint(cp);
    }
    if (cp <= 0xFFFF) {
      return String.fromCharCode(cp);
    }
    return full;
  });
}

function cleanBiliText(raw) {
  return decodeHtmlEntities(stripHtmlTags(raw)).replace(/\s+/g, ' ').trim();
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

function resolveScopedCookie(ctx, rawCookie, targetPlatform) {
  var trimmed = String(rawCookie == null ? '' : rawCookie).trim();
  if (!trimmed) return null;
  var scope = String(getSetting(ctx, 'cookieScope', 'auto')).toLowerCase();
  if (scope === 'youtube') {
    return targetPlatform === 'youtube' ? trimmed : null;
  }
  if (scope === 'bilibili') {
    return targetPlatform === 'bilibili' ? trimmed : null;
  }
  var pairs = parseCookiePairs(trimmed);
  var hasBili = Boolean(
    pairs.SESSDATA || pairs.bili_jct || pairs.DedeUserID || pairs.buvid3 || pairs.buvid4 || pairs.bili_ticket
  );
  var hasYt = Boolean(
    pairs.SAPISID ||
    pairs['__Secure-3PAPISID'] ||
    pairs['__Secure-1PAPISID'] ||
    pairs.LOGIN_INFO ||
    pairs.VISITOR_INFO1_LIVE ||
    pairs.HSID ||
    pairs.SSID ||
    pairs.APISID ||
    pairs.SID ||
    pairs.SOCS
  );
  if (targetPlatform === 'youtube') {
    if (hasBili && !hasYt) return null;
    return trimmed;
  }
  if (targetPlatform === 'bilibili') {
    if (hasYt && !hasBili) return null;
    return trimmed;
  }
  return null;
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

function normalizeBvid(raw) {
  var s = String(raw == null ? '' : raw);
  return s.length >= 2 ? ('BV' + s.slice(2)) : s;
}

function extractBvidFromText(text) {
  var m = String(text == null ? '' : text).match(/BV[0-9A-Za-z]{10,}/i);
  return m ? normalizeBvid(m[0]) : null;
}

function parseTarget(rawInput) {
  var candidate = extractShareUrl(rawInput);
  if (!candidate) return null;

  // Namespaced IDs (internal / direct invocation support).
  if (candidate.indexOf('yt:') === 0) {
    var ytId = stripVlPrefix(candidate.slice(3));
    if (isYouTubePlaylistId(ytId)) {
      return {
        platform: 'youtube',
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
        platform: 'youtube',
        targetType: 'video',
        videoId: ytId,
        remoteId: 'yt:' + ytId,
        normalizedUrl: 'https://www.youtube.com/watch?v=' + ytId,
        kind: 'track'
      };
    }
    return null;
  }

  if (candidate.indexOf('bili:') === 0) {
    var rest = candidate.slice(5);
    var parts = rest.split(':');
    if (parts[0] === 'video' && parts[1]) {
      var bv = extractBvidFromText(parts[1]);
      if (bv) {
        return {
          platform: 'bilibili',
          targetType: 'video',
          bvid: bv,
          aid: null,
          remoteId: 'bili:video:' + bv,
          normalizedUrl: 'https://www.bilibili.com/video/' + bv,
          kind: 'track'
        };
      }
      var avM = parts[1].match(/^av([0-9]+)$/i);
      if (avM) {
        return {
          platform: 'bilibili',
          targetType: 'video',
          bvid: null,
          aid: avM[1],
          remoteId: 'bili:video:av' + avM[1],
          normalizedUrl: 'https://www.bilibili.com/video/av' + avM[1],
          kind: 'track'
        };
      }
    } else if (parts[0] === 'fav' && isDigitsOnly(parts[1])) {
      return {
        platform: 'bilibili',
        targetType: 'fav',
        mediaId: parts[1],
        remoteId: 'bili:fav:' + parts[1],
        normalizedUrl: 'https://www.bilibili.com/medialist/detail/ml' + parts[1],
        kind: 'playlist'
      };
    } else if (parts[0] === 'season' && isDigitsOnly(parts[1]) && isDigitsOnly(parts[2])) {
      return {
        platform: 'bilibili',
        targetType: 'season',
        mid: parts[1],
        seasonId: parts[2],
        remoteId: 'bili:season:' + parts[1] + ':' + parts[2],
        normalizedUrl: 'https://space.bilibili.com/' + parts[1] + '/lists/' + parts[2] + '?type=season',
        kind: 'playlist'
      };
    } else if (parts[0] === 'series' && isDigitsOnly(parts[1]) && isDigitsOnly(parts[2])) {
      return {
        platform: 'bilibili',
        targetType: 'series',
        mid: parts[1],
        seriesId: parts[2],
        remoteId: 'bili:series:' + parts[1] + ':' + parts[2],
        normalizedUrl: 'https://space.bilibili.com/' + parts[1] + '/lists/' + parts[2] + '?type=series',
        kind: 'playlist'
      };
    }
    return null;
  }

  // Bare unambiguous IDs without scheme or slash.
  if (candidate.indexOf('://') < 0 && candidate.indexOf('/') < 0 && candidate.indexOf('.') < 0 && candidate.indexOf(' ') < 0) {
    var stripped = stripVlPrefix(candidate);
    if (isYouTubePlaylistId(stripped)) {
      return {
        platform: 'youtube',
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
    if (/^BV[0-9A-Za-z]{10,}$/i.test(candidate)) {
      var bareBv = normalizeBvid(candidate);
      return {
        platform: 'bilibili',
        targetType: 'video',
        bvid: bareBv,
        aid: null,
        remoteId: 'bili:video:' + bareBv,
        normalizedUrl: 'https://www.bilibili.com/video/' + bareBv,
        kind: 'track'
      };
    }
    var bareAv = candidate.match(/^av([0-9]+)$/i);
    if (bareAv) {
      return {
        platform: 'bilibili',
        targetType: 'video',
        bvid: null,
        aid: bareAv[1],
        remoteId: 'bili:video:av' + bareAv[1],
        normalizedUrl: 'https://www.bilibili.com/video/av' + bareAv[1],
        kind: 'track'
      };
    }
    var bareMl = candidate.match(/^ml([0-9]+)$/i);
    if (bareMl) {
      return {
        platform: 'bilibili',
        targetType: 'fav',
        mediaId: bareMl[1],
        remoteId: 'bili:fav:' + bareMl[1],
        normalizedUrl: 'https://www.bilibili.com/medialist/detail/ml' + bareMl[1],
        kind: 'playlist'
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
        platform: 'youtube',
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
        platform: 'youtube',
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
        platform: 'youtube',
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
          platform: 'youtube',
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
        platform: 'youtube',
        targetType: 'video',
        videoId: resolvedVid,
        remoteId: 'yt:' + resolvedVid,
        normalizedUrl: (isMusicHost ? 'https://music.youtube.com' : 'https://www.youtube.com') + '/watch?v=' + resolvedVid,
        kind: 'track'
      };
    }
    return null;
  }

  // Bilibili short link.
  if (host === 'b23.tv' || host.slice(-7) === '.b23.tv') {
    var code = segments[0] || '';
    if (!code) return null;
    return {
      platform: 'bilibili',
      targetType: 'short',
      url: 'https://b23.tv/' + code,
      remoteId: 'bili:short:' + code,
      normalizedUrl: 'https://b23.tv/' + code,
      kind: 'playlist'
    };
  }

  // Bilibili main/space/mobile links.
  if (host === 'bilibili.com' || host.slice(-13) === '.bilibili.com') {
    var pathMid = (host === 'space.bilibili.com' && segments[0] && isDigitsOnly(segments[0])) ? segments[0] : null;
    var fid = isDigitsOnly(query.fid) ? query.fid : (isDigitsOnly(query.media_id) ? query.media_id : null);
    if (fid) {
      return {
        platform: 'bilibili',
        targetType: 'fav',
        mediaId: fid,
        remoteId: 'bili:fav:' + fid,
        normalizedUrl: 'https://www.bilibili.com/medialist/detail/ml' + fid,
        kind: 'playlist'
      };
    }
    for (var sIdx = 0; sIdx < segments.length; sIdx++) {
      var mlMatch = segments[sIdx].match(/^ml([0-9]+)$/i);
      if (mlMatch) {
        return {
          platform: 'bilibili',
          targetType: 'fav',
          mediaId: mlMatch[1],
          remoteId: 'bili:fav:' + mlMatch[1],
          normalizedUrl: 'https://www.bilibili.com/medialist/detail/ml' + mlMatch[1],
          kind: 'playlist'
        };
      }
    }

    // space.bilibili.com/<mid>/lists/<sid>?type=season|series
    var listsIdx = segments.indexOf('lists');
    if (listsIdx >= 0 && listsIdx + 1 < segments.length && isDigitsOnly(segments[listsIdx + 1])) {
      var sid = segments[listsIdx + 1];
      var mid = pathMid || (isDigitsOnly(query.mid) ? query.mid : '0');
      if (String(query.type || '').toLowerCase() === 'series') {
        return {
          platform: 'bilibili',
          targetType: 'series',
          mid: mid,
          seriesId: sid,
          remoteId: 'bili:series:' + mid + ':' + sid,
          normalizedUrl: 'https://space.bilibili.com/' + mid + '/lists/' + sid + '?type=series',
          kind: 'playlist'
        };
      }
      return {
        platform: 'bilibili',
        targetType: 'season',
        mid: mid,
        seasonId: sid,
        remoteId: 'bili:season:' + mid + ':' + sid,
        normalizedUrl: 'https://space.bilibili.com/' + mid + '/lists/' + sid + '?type=season',
        kind: 'playlist'
      };
    }

    if (u.pathname.indexOf('collectiondetail') >= 0 && isDigitsOnly(query.sid || query.season_id)) {
      var colSid = query.sid || query.season_id;
      var colMid = pathMid || (isDigitsOnly(query.mid) ? query.mid : '0');
      return {
        platform: 'bilibili',
        targetType: 'season',
        mid: colMid,
        seasonId: colSid,
        remoteId: 'bili:season:' + colMid + ':' + colSid,
        normalizedUrl: 'https://space.bilibili.com/' + colMid + '/lists/' + colSid + '?type=season',
        kind: 'playlist'
      };
    }

    if (u.pathname.indexOf('seriesdetail') >= 0 && isDigitsOnly(query.sid || query.series_id)) {
      var serSid = query.sid || query.series_id;
      var serMid = pathMid || (isDigitsOnly(query.mid) ? query.mid : '0');
      return {
        platform: 'bilibili',
        targetType: 'series',
        mid: serMid,
        seriesId: serSid,
        remoteId: 'bili:series:' + serMid + ':' + serSid,
        normalizedUrl: 'https://space.bilibili.com/' + serMid + '/lists/' + serSid + '?type=series',
        kind: 'playlist'
      };
    }

    if (isDigitsOnly(query.season_id)) {
      var qSeasonMid = pathMid || (isDigitsOnly(query.mid) ? query.mid : '0');
      return {
        platform: 'bilibili',
        targetType: 'season',
        mid: qSeasonMid,
        seasonId: query.season_id,
        remoteId: 'bili:season:' + qSeasonMid + ':' + query.season_id,
        normalizedUrl: 'https://space.bilibili.com/' + qSeasonMid + '/lists/' + query.season_id + '?type=season',
        kind: 'playlist'
      };
    }

    if (isDigitsOnly(query.series_id)) {
      var qSeriesMid = pathMid || (isDigitsOnly(query.mid) ? query.mid : '0');
      return {
        platform: 'bilibili',
        targetType: 'series',
        mid: qSeriesMid,
        seriesId: query.series_id,
        remoteId: 'bili:series:' + qSeriesMid + ':' + query.series_id,
        normalizedUrl: 'https://space.bilibili.com/' + qSeriesMid + '/lists/' + query.series_id + '?type=series',
        kind: 'playlist'
      };
    }

    var pathBv = extractBvidFromText(u.pathname);
    if (pathBv) {
      return {
        platform: 'bilibili',
        targetType: 'video',
        bvid: pathBv,
        aid: null,
        remoteId: 'bili:video:' + pathBv,
        normalizedUrl: 'https://www.bilibili.com/video/' + pathBv,
        kind: 'track'
      };
    }

    for (var avIdx = 0; avIdx < segments.length; avIdx++) {
      var segAv = segments[avIdx].match(/^av([0-9]+)$/i);
      if (segAv) {
        return {
          platform: 'bilibili',
          targetType: 'video',
          bvid: null,
          aid: segAv[1],
          remoteId: 'bili:video:av' + segAv[1],
          normalizedUrl: 'https://www.bilibili.com/video/av' + segAv[1],
          kind: 'track'
        };
      }
    }
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

// ---------- Bilibili WBI & API Helpers ----------

function biliHeaders(cookie, referer, origin) {
  var h = {
    'User-Agent': WEB_USER_AGENT,
    'Referer': referer || 'https://www.bilibili.com/',
    'Origin': origin || 'https://www.bilibili.com'
  };
  if (cookie) {
    h.Cookie = cookie;
  }
  return h;
}

async function resolveBiliCookie(ctx, rawCookie) {
  var trimmed = rawCookie ? String(rawCookie).trim() : '';
  if (/\bbuvid3=/i.test(trimmed)) {
    return trimmed;
  }
  var buvid3 = kvGetSafe(ctx, BUVID3_KV_KEY);
  if (!buvid3) {
    try {
      var spiRes = await ctx.http.request({
        method: 'GET',
        url: 'https://api.bilibili.com/x/frontend/finger/spi',
        headers: biliHeaders(null, 'https://www.bilibili.com/', 'https://www.bilibili.com'),
        followRedirects: true,
        timeoutMs: 10000
      });
      if (spiRes.status >= 200 && spiRes.status < 300 && spiRes.text) {
        var spiJson = JSON.parse(spiRes.text);
        var fetched = spiJson && spiJson.data && spiJson.data.b_3 ? String(spiJson.data.b_3).trim() : '';
        if (fetched) {
          buvid3 = fetched;
          kvSetSafe(ctx, BUVID3_KV_KEY, fetched, BUVID3_TTL_SEC);
        }
      }
    } catch (e) {
      // Fallback below.
    }
  }
  var effectiveB3 = buvid3 || FALLBACK_BUVID3;
  return trimmed ? (trimmed + '; buvid3=' + effectiveB3) : ('buvid3=' + effectiveB3);
}

function extractWbiKeyName(urlStr) {
  var s = String(urlStr == null ? '' : urlStr);
  var slash = s.lastIndexOf('/');
  var file = slash >= 0 ? s.slice(slash + 1) : s;
  var dot = file.indexOf('.');
  return dot >= 0 ? file.slice(0, dot) : file;
}

function computeMixinKey(imgUrl, subUrl) {
  var raw = extractWbiKeyName(imgUrl) + extractWbiKeyName(subUrl);
  var out = '';
  for (var i = 0; i < 32; i++) {
    var idx = WBI_MIXIN_TAB[i];
    if (idx < raw.length) {
      out += raw.charAt(idx);
    }
  }
  return out;
}

async function getWbiMixinKey(ctx, effectiveCookie, forceRefresh) {
  if (!forceRefresh) {
    var cached = kvGetSafe(ctx, WBI_KEY_KV_KEY);
    if (cached) return cached;
  }
  var res = await ctx.http.request({
    method: 'GET',
    url: 'https://api.bilibili.com/x/web-interface/nav',
    headers: biliHeaders(effectiveCookie, 'https://www.bilibili.com/', 'https://www.bilibili.com'),
    followRedirects: true,
    timeoutMs: 10000
  });
  if (res.status === 429) throw extError('RATE_LIMITED', 'Bilibili nav rate limited (HTTP 429).');
  if (res.status >= 400) throw extError('NETWORK_ERROR', 'Bilibili nav returned HTTP ' + String(res.status) + '.');
  var navJson;
  try {
    navJson = JSON.parse(res.text || '{}');
  } catch (e) {
    throw extError('NETWORK_ERROR', 'Invalid JSON from Bilibili nav.');
  }
  var wbiImg = navJson && navJson.data && navJson.data.wbi_img;
  if (!wbiImg || !wbiImg.img_url || !wbiImg.sub_url) {
    throw extError('NETWORK_ERROR', 'Missing Bilibili WBI keys.');
  }
  var mixinKey = computeMixinKey(wbiImg.img_url, wbiImg.sub_url);
  if (mixinKey.length < 32) {
    throw extError('NETWORK_ERROR', 'Invalid Bilibili WBI mixin key.');
  }
  kvSetSafe(ctx, WBI_KEY_KV_KEY, mixinKey, WBI_KEY_TTL_SEC);
  return mixinKey;
}

function signWbiParams(ctx, params, mixinKey, wtsSec) {
  var all = {};
  var pKeys = Object.keys(params || {});
  for (var i = 0; i < pKeys.length; i++) {
    all[pKeys[i]] = String(params[pKeys[i]] == null ? '' : params[pKeys[i]]);
  }
  all.wts = String(wtsSec != null ? Math.floor(Number(wtsSec)) : Math.floor(Date.now() / 1000));
  var sortedKeys = Object.keys(all).sort();
  var parts = [];
  for (var k = 0; k < sortedKeys.length; k++) {
    var key = sortedKeys[k];
    var cleanVal = all[key].replace(/[!'()*]/g, '');
    parts.push(encodeRfc3986(key) + '=' + encodeRfc3986(cleanVal));
  }
  var query = parts.join('&');
  var wRid = ctx.crypto.md5(query + mixinKey);
  return query + '&w_rid=' + wRid;
}

function buildPlainQuery(params) {
  var keys = Object.keys(params || {});
  var parts = [];
  for (var i = 0; i < keys.length; i++) {
    parts.push(encodeRfc3986(keys[i]) + '=' + encodeRfc3986(String(params[keys[i]] == null ? '' : params[keys[i]])));
  }
  return parts.join('&');
}

async function getBiliJson(ctx, url, effectiveCookie, referer, origin) {
  var res = await ctx.http.request({
    method: 'GET',
    url: url,
    headers: biliHeaders(effectiveCookie, referer, origin),
    followRedirects: true,
    timeoutMs: 15000
  });
  if (res.status === 429) throw extError('RATE_LIMITED', 'Bilibili returned HTTP 429.');
  if (res.status === 401 || res.status === 403) throw extError('AUTH_REQUIRED', 'Bilibili returned HTTP ' + String(res.status) + '.');
  if (res.status >= 400) throw extError('NETWORK_ERROR', 'Bilibili returned HTTP ' + String(res.status) + '.');
  var json;
  try {
    json = JSON.parse(res.text || '{}');
  } catch (e) {
    throw extError('NETWORK_ERROR', 'Invalid JSON from Bilibili.');
  }
  var code = typeof json.code === 'number' ? json.code : 0;
  if (code !== 0) {
    var msg = json.message ? String(json.message) : ('code ' + String(code));
    if (code === -412 || code === -799 || code === -509) {
      throw extError('RATE_LIMITED', 'Bilibili rate limited (' + String(code) + '): ' + msg);
    }
    if (code === -101 || code === -403) {
      throw extError('AUTH_REQUIRED', 'Bilibili authentication required (' + String(code) + '): ' + msg);
    }
    throw extError('NETWORK_ERROR', 'Bilibili API error (' + String(code) + '): ' + msg);
  }
  return json;
}

async function searchBilibili(ctx, query, order, page, pageSize, rawCookie) {
  var validOrders = { totalrank: true, click: true, pubdate: true, stow: true };
  var cleanOrder = validOrders[order] ? order : 'totalrank';
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);

  var params = {
    search_type: 'video',
    keyword: query,
    order: cleanOrder,
    page: String(page),
    page_size: String(pageSize)
  };

  var json = null;
  var wbiErr = null;
  try {
    var mixinKey = await getWbiMixinKey(ctx, effectiveCookie, false);
    var signedQuery = signWbiParams(ctx, params, mixinKey);
    json = await getBiliJson(
      ctx,
      'https://api.bilibili.com/x/web-interface/wbi/search/type?' + signedQuery,
      effectiveCookie,
      'https://search.bilibili.com/',
      'https://search.bilibili.com'
    );
    if (json && json.data && json.data.v_voucher && !Array.isArray(json.data.result)) {
      throw extError('RATE_LIMITED', 'Bilibili WBI search returned v_voucher challenge.');
    }
  } catch (err) {
    wbiErr = err;
    kvRemoveSafe(ctx, WBI_KEY_KV_KEY);
    try {
      var plainQuery = buildPlainQuery(params);
      json = await getBiliJson(
        ctx,
        'https://api.bilibili.com/x/web-interface/search/type?' + plainQuery,
        effectiveCookie,
        'https://search.bilibili.com/',
        'https://search.bilibili.com'
      );
      if (json && json.data && json.data.v_voucher && !Array.isArray(json.data.result)) {
        throw extError('RATE_LIMITED', 'Bilibili search returned v_voucher challenge.');
      }
    } catch (fbErr) {
      throw (fbErr && fbErr.code === 'RATE_LIMITED') ? fbErr : (wbiErr || fbErr);
    }
  }

  var data = (json && json.data) || {};
  var rawRows = Array.isArray(data.result) ? data.result : [];
  var items = [];
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row.bvid) continue;
    var bvid = normalizeBvid(String(row.bvid));
    var title = cleanBiliText(row.title) || bvid;
    var artist = cleanBiliText(row.author) || 'Bilibili';
    var art = normalizeHttps(row.pic);
    var durationSec = parseDurationSec(row.duration);
    items.push({
      kind: 'track',
      remoteTrackId: 'bili:' + bvid,
      title: title,
      artist: artist,
      album: 'Bilibili',
      durationSec: durationSec,
      artworkUrl: art,
      relativePath: sanitizeFileName(title, bvid) + '.m4a'
    });
  }

  var numPages = typeof data.numPages === 'number' ? data.numPages : 0;
  var hasMore = items.length > 0 && (numPages > 0 ? page < numPages : items.length >= pageSize);
  return {
    items: items,
    hasMore: hasMore,
    nextPage: hasMore ? (page + 1) : null
  };
}

// ---------- Combined Search & Pagination ----------

function parseSearchCursor(cursor) {
  var state = { yt: '', ytOffset: 0, biliPage: 0, biliOffset: 0 };
  if (!cursor || typeof cursor !== 'string' || cursor.indexOf('v1:') !== 0) {
    return state;
  }
  var body = cursor.slice(3);
  var segments = body.split(':');
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    var eq = seg.indexOf('=');
    if (eq <= 0) continue;
    var k = seg.slice(0, eq);
    var v = safeDecodeURIComponent(seg.slice(eq + 1));
    if (k === 'yt') {
      var atIdx = v.lastIndexOf('@');
      if (atIdx >= 0 && isDigitsOnly(v.slice(atIdx + 1))) {
        state.yt = v.slice(0, atIdx);
        state.ytOffset = parseInt(v.slice(atIdx + 1), 10) || 0;
      } else {
        state.yt = v;
      }
    } else if (k === 'bili') {
      var comma = v.indexOf(',');
      if (comma >= 0) {
        state.biliPage = parseInt(v.slice(0, comma), 10) || 0;
        state.biliOffset = parseInt(v.slice(comma + 1), 10) || 0;
      } else {
        state.biliPage = parseInt(v, 10) || 0;
      }
    }
  }
  return state;
}

function formatSearchCursor(ytVal, biliVal) {
  if (!ytVal && !biliVal) return null;
  return 'v1:yt=' + encodeURIComponent(ytVal || '') + ':bili=' + encodeURIComponent(biliVal || '');
}

async function search(ctx, req) {
  var query = String((req && req.query) || '').trim();
  if (!query) {
    return { items: [], nextCursor: null };
  }

  var rawKind = String((req && req.kind) || 'all').trim().toLowerCase();
  var kind = (rawKind === 'track' || rawKind === 'playlist' || rawKind === 'album') ? rawKind : 'all';
  var limit = Math.max(1, Math.min(50, Math.floor(Number((req && req.limit) || 20)) || 20));
  var rawCookie = req && req.cookie ? String(req.cookie) : null;
  var prevCursor = req && req.cursor ? String(req.cursor).trim() : null;

  var source = String(getSetting(ctx, 'source', 'both')).toLowerCase();
  if (source !== 'youtube' && source !== 'bilibili') source = 'both';
  var youtubeMode = String(getSetting(ctx, 'youtubeMode', 'music')).toLowerCase();
  if (youtubeMode !== 'youtube') youtubeMode = 'music';
  var biliOrder = String(getSetting(ctx, 'biliSearchOrder', 'totalrank')).toLowerCase();

  if (source === 'bilibili' && (kind === 'playlist' || kind === 'album')) {
    return { items: [], nextCursor: null };
  }

  var parsedCur = parseSearchCursor(prevCursor);
  var isFirstPage = !prevCursor;

  var wantYt = (source === 'both' || source === 'youtube') &&
    !(youtubeMode === 'youtube' && kind === 'album') &&
    (isFirstPage || Boolean(parsedCur.yt) || parsedCur.ytOffset > 0);
  var wantBili = (source === 'both' || source === 'bilibili') &&
    (kind === 'all' || kind === 'track') &&
    (isFirstPage || parsedCur.biliPage > 0);

  if (!wantYt && !wantBili) {
    return { items: [], nextCursor: null };
  }

  var ytCookie = resolveScopedCookie(ctx, rawCookie, 'youtube');
  var biliCookie = resolveScopedCookie(ctx, rawCookie, 'bilibili');
  var biliPageToFetch = isFirstPage ? 1 : parsedCur.biliPage;
  var biliPageSize = Math.min(20, Math.max(10, limit));

  var ytOutcome = null;
  var biliOutcome = null;
  var tasks = [];

  if (wantYt) {
    var ytCursorTok = isFirstPage ? null : (parsedCur.yt || null);
    var ytCacheKey = 'ytsp:' + ctx.crypto.md5([youtubeMode, kind, query, ytCursorTok || ''].join('|'));
    tasks.push((async function () {
      try {
        if (!isFirstPage && parsedCur.ytOffset > 0) {
          var cachedRaw = kvGetSafe(ctx, ytCacheKey);
          if (cachedRaw) {
            ytOutcome = { ok: true, data: JSON.parse(cachedRaw) };
            return;
          }
        }
        var data = await searchYouTube(ctx, query, kind, youtubeMode, ytCookie, ytCursorTok);
        kvSetSafe(ctx, ytCacheKey, JSON.stringify(data), 300);
        ytOutcome = { ok: true, data: data };
      } catch (err) {
        ytOutcome = { ok: false, error: err };
      }
    })());
  }

  if (wantBili) {
    var biliCacheKey = 'blsp:' + ctx.crypto.md5([biliOrder, query, String(biliPageToFetch), String(biliPageSize)].join('|'));
    tasks.push((async function () {
      try {
        if (!isFirstPage && parsedCur.biliOffset > 0) {
          var cachedRaw = kvGetSafe(ctx, biliCacheKey);
          if (cachedRaw) {
            biliOutcome = { ok: true, data: JSON.parse(cachedRaw) };
            return;
          }
        }
        var data = await searchBilibili(ctx, query, biliOrder, biliPageToFetch, biliPageSize, biliCookie);
        kvSetSafe(ctx, biliCacheKey, JSON.stringify(data), 300);
        biliOutcome = { ok: true, data: data };
      } catch (err) {
        biliOutcome = { ok: false, error: err };
      }
    })());
  }

  await Promise.all(tasks);

  if (wantYt && wantBili) {
    if (!ytOutcome.ok && !biliOutcome.ok) {
      if (biliOutcome.error && biliOutcome.error.code === 'RATE_LIMITED') throw biliOutcome.error;
      throw ytOutcome.error || biliOutcome.error;
    }
    if (!ytOutcome.ok) {
      logWarnSafe(ctx, 'YouTube search failed in combined mode: ' + (ytOutcome.error && ytOutcome.error.message ? ytOutcome.error.message : String(ytOutcome.error)));
    }
    if (!biliOutcome.ok) {
      logWarnSafe(ctx, 'Bilibili search failed in combined mode: ' + (biliOutcome.error && biliOutcome.error.message ? biliOutcome.error.message : String(biliOutcome.error)));
    }
  } else if (wantYt && !ytOutcome.ok) {
    throw ytOutcome.error;
  } else if (wantBili && !biliOutcome.ok) {
    throw biliOutcome.error;
  }

  var ytAll = (ytOutcome && ytOutcome.ok && Array.isArray(ytOutcome.data.items)) ? ytOutcome.data.items : [];
  var ytSlice = parsedCur.ytOffset > 0 ? ytAll.slice(parsedCur.ytOffset) : ytAll;

  var biliAll = (biliOutcome && biliOutcome.ok && Array.isArray(biliOutcome.data.items)) ? biliOutcome.data.items : [];
  var biliSlice = parsedCur.biliOffset > 0 ? biliAll.slice(parsedCur.biliOffset) : biliAll;

  var combined = [];
  var ytIdx = 0;
  var biliIdx = 0;
  while (combined.length < limit && (ytIdx < ytSlice.length || biliIdx < biliSlice.length)) {
    if (ytIdx < ytSlice.length) {
      combined.push(ytSlice[ytIdx++]);
    }
    if (combined.length < limit && biliIdx < biliSlice.length) {
      combined.push(biliSlice[biliIdx++]);
    }
  }

  var nextYtSeg = '';
  if (ytOutcome && ytOutcome.ok) {
    var totalYtConsumed = (isFirstPage ? 0 : parsedCur.ytOffset) + ytIdx;
    if (totalYtConsumed < ytAll.length) {
      nextYtSeg = (isFirstPage ? '' : (parsedCur.yt || '')) + '@' + String(totalYtConsumed);
    } else if (ytOutcome.data.nextToken) {
      nextYtSeg = ytOutcome.data.nextToken;
    }
  }

  var nextBiliSeg = '';
  if (biliOutcome && biliOutcome.ok) {
    var totalBiliConsumed = (isFirstPage ? 0 : parsedCur.biliOffset) + biliIdx;
    if (totalBiliConsumed < biliAll.length) {
      nextBiliSeg = String(biliPageToFetch) + ',' + String(totalBiliConsumed);
    } else if (biliOutcome.data.hasMore && biliOutcome.data.nextPage) {
      nextBiliSeg = String(biliOutcome.data.nextPage);
    }
  }

  var nextCursor = formatSearchCursor(nextYtSeg, nextBiliSeg);
  if (nextCursor && prevCursor && nextCursor === prevCursor) {
    nextCursor = null;
  }

  return {
    items: combined,
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

  // Modern WEB_REMIX places musicResponsiveHeaderRenderer inside twoColumnBrowseResultsRenderer.
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

async function fetchBiliVideo(ctx, bvid, aid, rawCookie) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var query = bvid ? ('bvid=' + encodeURIComponent(bvid)) : ('aid=' + encodeURIComponent(aid));
  var json = await getBiliJson(
    ctx,
    'https://api.bilibili.com/x/web-interface/view?' + query,
    effectiveCookie,
    'https://www.bilibili.com/',
    'https://www.bilibili.com'
  );
  var data = json && json.data;
  if (!data) {
    throw extError('EMPTY_COLLECTION', 'Bilibili video data missing.');
  }
  var resolvedBvid = data.bvid ? normalizeBvid(String(data.bvid)) : (bvid || ('av' + String(aid)));
  var videoTitle = String(data.title || resolvedBvid).trim() || resolvedBvid;
  var artist = String((data.owner && data.owner.name) || 'Bilibili').trim() || 'Bilibili';
  var art = normalizeHttps(data.pic);
  var totalDur = parseDurationSec(data.duration);
  var pages = Array.isArray(data.pages) ? data.pages : [];
  var tracks = [];

  if (pages.length > 1) {
    for (var i = 0; i < pages.length; i++) {
      var p = pages[i];
      if (!p || !p.cid) continue;
      var pageNum = typeof p.page === 'number' ? p.page : (i + 1);
      var partName = String(p.part || '').trim();
      var trackTitle = partName ? ('P' + String(pageNum) + ' ' + partName) : (videoTitle + ' - P' + String(pageNum));
      var trackId = 'bili:' + resolvedBvid + '#' + String(p.cid);
      tracks.push({
        remoteTrackId: trackId,
        relativePath: pad2(pageNum) + ' - ' + sanitizeFileName(trackTitle, trackId) + '.m4a',
        title: trackTitle,
        artist: artist,
        album: videoTitle,
        trackNumber: pageNum,
        durationSec: parseDurationSec(p.duration) || totalDur,
        artworkUrl: art
      });
    }
  } else {
    var singleCid = (pages[0] && pages[0].cid) || data.cid;
    var singleId = singleCid ? ('bili:' + resolvedBvid + '#' + String(singleCid)) : ('bili:' + resolvedBvid);
    tracks.push({
      remoteTrackId: singleId,
      relativePath: '01 - ' + sanitizeFileName(videoTitle, singleId) + '.m4a',
      title: videoTitle,
      artist: artist,
      album: videoTitle,
      trackNumber: 1,
      durationSec: totalDur,
      artworkUrl: art
    });
  }

  if (tracks.length === 0) {
    throw extError('EMPTY_COLLECTION', 'Bilibili video contains no playable parts.');
  }

  return {
    remoteId: 'bili:video:' + resolvedBvid,
    title: videoTitle,
    tracks: tracks,
    nextCursor: null
  };
}

function encodeBiliCollectionCursor(obj) {
  return 'bili:' + JSON.stringify(obj);
}

function decodeBiliCollectionCursor(cursor) {
  if (!cursor || cursor.indexOf('bili:') !== 0) return null;
  try {
    return JSON.parse(cursor.slice(5));
  } catch (e) {
    return null;
  }
}

async function fetchBiliFavlist(ctx, mediaId, rawCookie, cursor) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var cur = decodeBiliCollectionCursor(cursor);
  var page = cur && typeof cur.p === 'number' ? cur.p : 1;
  var offset = cur && typeof cur.o === 'number' ? cur.o : 1;
  var title = (cur && cur.t) || ('Bilibili Favlist (' + mediaId + ')');
  var tracks = [];
  var hasMore = false;

  // Loop only if a page consists purely of invalidated entries.
  while (page <= 50) {
    var url = 'https://api.bilibili.com/x/v3/fav/resource/list?media_id=' + encodeURIComponent(mediaId) + '&pn=' + String(page) + '&ps=20&platform=web';
    var json = await getBiliJson(ctx, url, effectiveCookie, 'https://www.bilibili.com/', 'https://www.bilibili.com');
    var data = (json && json.data) || {};
    if (page === 1 && data.info && data.info.title) {
      title = String(data.info.title).trim() || title;
    }
    var medias = Array.isArray(data.medias) ? data.medias : [];
    for (var i = 0; i < medias.length; i++) {
      var item = medias[i];
      if (!item || item.attr === 9 || !item.bvid) continue;
      var itemTitle = String(item.title || item.bvid).trim();
      if (itemTitle === '已失效视频') continue;
      var bvid = normalizeBvid(String(item.bvid));
      var cid = item.ugc && item.ugc.first_cid ? String(item.ugc.first_cid) : null;
      var remoteTrackId = cid ? ('bili:' + bvid + '#' + cid) : ('bili:' + bvid);
      var artist = String((item.upper && item.upper.name) || 'Bilibili').trim() || 'Bilibili';
      var num = offset + tracks.length;
      tracks.push({
        remoteTrackId: remoteTrackId,
        relativePath: pad2(num) + ' - ' + sanitizeFileName(itemTitle, remoteTrackId) + '.m4a',
        title: itemTitle,
        artist: artist,
        album: title,
        trackNumber: num,
        durationSec: parseDurationSec(item.duration),
        artworkUrl: normalizeHttps(item.cover)
      });
    }
    hasMore = Boolean(data.has_more) && medias.length > 0;
    page += 1;
    if (tracks.length > 0 || !hasMore) break;
  }

  if (tracks.length === 0 && !cursor) {
    throw extError('EMPTY_COLLECTION', 'Bilibili favlist contains no playable videos.');
  }

  return {
    remoteId: 'bili:fav:' + mediaId,
    title: title,
    tracks: tracks,
    nextCursor: hasMore ? encodeBiliCollectionCursor({ p: page, o: offset + tracks.length, t: title }) : null
  };
}

function mapBiliArchiveTracks(archives, title, offset) {
  var tracks = [];
  for (var i = 0; i < archives.length; i++) {
    var item = archives[i];
    if (!item || !item.bvid) continue;
    var bvid = normalizeBvid(String(item.bvid));
    var itemTitle = String(item.title || bvid).trim() || bvid;
    var artist = String(item.author || (item.owner && item.owner.name) || 'Bilibili').trim() || 'Bilibili';
    var num = offset + tracks.length;
    var trackId = 'bili:' + bvid;
    tracks.push({
      remoteTrackId: trackId,
      relativePath: pad2(num) + ' - ' + sanitizeFileName(itemTitle, trackId) + '.m4a',
      title: itemTitle,
      artist: artist,
      album: title,
      trackNumber: num,
      durationSec: parseDurationSec(item.duration),
      artworkUrl: normalizeHttps(item.pic)
    });
  }
  return tracks;
}

async function fetchBiliSeason(ctx, mid, seasonId, rawCookie, cursor) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var cur = decodeBiliCollectionCursor(cursor);
  var page = cur && typeof cur.p === 'number' ? cur.p : 1;
  var offset = cur && typeof cur.o === 'number' ? cur.o : 1;
  var title = (cur && cur.t) || ('Bilibili Collection (' + seasonId + ')');

  var url = 'https://api.bilibili.com/x/polymer/web-space/seasons_archives_list?mid=' +
    encodeURIComponent(mid || '0') + '&season_id=' + encodeURIComponent(seasonId) +
    '&sort_reverse=false&page_num=' + String(page) + '&page_size=30';
  var json = await getBiliJson(ctx, url, effectiveCookie, 'https://space.bilibili.com/', 'https://space.bilibili.com');
  var data = (json && json.data) || {};
  if (page === 1 && data.meta && data.meta.name) {
    title = String(data.meta.name).trim() || title;
  }
  var archives = Array.isArray(data.archives) ? data.archives : [];
  var tracks = mapBiliArchiveTracks(archives, title, offset);
  var total = data.page && typeof data.page.total === 'number' ? data.page.total : 0;
  var hasMore = archives.length >= 30 && (total === 0 || ((page - 1) * 30 + archives.length) < total);

  if (tracks.length === 0 && !cursor) {
    throw extError('EMPTY_COLLECTION', 'Bilibili collection contains no playable videos.');
  }

  return {
    remoteId: 'bili:season:' + (mid || '0') + ':' + seasonId,
    title: title,
    tracks: tracks,
    nextCursor: hasMore ? encodeBiliCollectionCursor({ p: page + 1, o: offset + tracks.length, t: title }) : null
  };
}

async function fetchBiliSeries(ctx, mid, seriesId, rawCookie, cursor) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var cur = decodeBiliCollectionCursor(cursor);
  var page = cur && typeof cur.p === 'number' ? cur.p : 1;
  var offset = cur && typeof cur.o === 'number' ? cur.o : 1;
  var title = (cur && cur.t) || ('Bilibili Series (' + seriesId + ')');

  if (page === 1) {
    try {
      var metaJson = await getBiliJson(
        ctx,
        'https://api.bilibili.com/x/series/series?series_id=' + encodeURIComponent(seriesId),
        effectiveCookie,
        'https://space.bilibili.com/',
        'https://space.bilibili.com'
      );
      if (metaJson && metaJson.data && metaJson.data.meta && metaJson.data.meta.name) {
        title = String(metaJson.data.meta.name).trim() || title;
      }
    } catch (e) {
      // Non-fatal metadata fetch.
    }
  }

  var url = 'https://api.bilibili.com/x/series/archives?mid=' +
    encodeURIComponent(mid || '0') + '&series_id=' + encodeURIComponent(seriesId) +
    '&only_normal=true&sort=desc&pn=' + String(page) + '&ps=30';
  var json = await getBiliJson(ctx, url, effectiveCookie, 'https://space.bilibili.com/', 'https://space.bilibili.com');
  var data = (json && json.data) || {};
  var archives = Array.isArray(data.archives) ? data.archives : [];
  var tracks = mapBiliArchiveTracks(archives, title, offset);
  var total = data.page && typeof data.page.total === 'number' ? data.page.total : 0;
  var hasMore = archives.length >= 30 && (total === 0 || ((page - 1) * 30 + archives.length) < total);

  if (tracks.length === 0 && !cursor) {
    throw extError('EMPTY_COLLECTION', 'Bilibili series contains no playable videos.');
  }

  return {
    remoteId: 'bili:series:' + (mid || '0') + ':' + seriesId,
    title: title,
    tracks: tracks,
    nextCursor: hasMore ? encodeBiliCollectionCursor({ p: page + 1, o: offset + tracks.length, t: title }) : null
  };
}

async function fetchCollection(ctx, req) {
  var rawUrl = String((req && req.url) || '').trim();
  var target = parseTarget(rawUrl);
  if (!target) {
    throw extError('INVALID_URL', 'Unsupported YouTube or Bilibili link.');
  }

  var rawCookie = req && req.cookie ? String(req.cookie) : null;
  var cursor = req && req.cursor ? String(req.cursor).trim() : null;

  if (target.platform === 'bilibili' && target.targetType === 'short') {
    var biliCookie = resolveScopedCookie(ctx, rawCookie, 'bilibili');
    var redirRes = await ctx.http.request({
      method: 'GET',
      url: target.url,
      headers: biliHeaders(biliCookie, 'https://www.bilibili.com/', 'https://www.bilibili.com'),
      followRedirects: true,
      timeoutMs: 15000
    });
    var resolvedUrl = redirRes.finalUrl || (redirRes.headers && redirRes.headers.location) || '';
    var nextTarget = parseTarget(resolvedUrl);
    if ((!nextTarget || nextTarget.targetType === 'short') && redirRes.text) {
      var metaM = redirRes.text.match(/https?:\/\/(?:www\.|m\.|space\.)?bilibili\.com\/[^\s"'<>]+/i);
      if (metaM) nextTarget = parseTarget(metaM[0]);
    }
    if (!nextTarget || nextTarget.targetType === 'short') {
      throw extError('INVALID_URL', 'Could not resolve Bilibili short link.');
    }
    target = nextTarget;
  }

  if (target.platform === 'youtube') {
    var ytCookie = resolveScopedCookie(ctx, rawCookie, 'youtube');
    if (target.targetType === 'video') {
      return await fetchYtSingleVideo(ctx, target.videoId, ytCookie);
    }
    return await fetchYtPlaylist(ctx, target.listId, target.videoId, ytCookie, cursor);
  }

  var scopedBiliCookie = resolveScopedCookie(ctx, rawCookie, 'bilibili');
  if (target.targetType === 'fav') {
    return await fetchBiliFavlist(ctx, target.mediaId, scopedBiliCookie, cursor);
  }
  if (target.targetType === 'season') {
    return await fetchBiliSeason(ctx, target.mid, target.seasonId, scopedBiliCookie, cursor);
  }
  if (target.targetType === 'series') {
    return await fetchBiliSeries(ctx, target.mid, target.seriesId, scopedBiliCookie, cursor);
  }
  return await fetchBiliVideo(ctx, target.bvid, target.aid, scopedBiliCookie);
}

// ---------- Stream Resolution ----------

function parseStreamTrackId(rawId) {
  var s = String(rawId == null ? '' : rawId).trim();
  if (!s) return null;

  if (s.indexOf('yt:') === 0) {
    var yv = s.slice(3);
    return isYouTubeVideoId(yv) ? { platform: 'youtube', videoId: yv } : null;
  }
  if (s.indexOf('bili:') === 0) {
    var rest = s.slice(5);
    var parts = rest.split('#');
    var base = parts[0];
    var cid = parts[1] && isDigitsOnly(parts[1]) ? parts[1] : null;
    if (/^BV[0-9A-Za-z]{10,}$/i.test(base)) {
      return { platform: 'bilibili', bvid: normalizeBvid(base), aid: null, cid: cid };
    }
    var avM = base.match(/^av([0-9]+)$/i);
    if (avM) {
      return { platform: 'bilibili', bvid: null, aid: avM[1], cid: cid };
    }
    return null;
  }

  // Bare IDs supported in resolveStream.
  var hashParts = s.split('#');
  var bareBase = hashParts[0];
  var bareCid = hashParts[1] && isDigitsOnly(hashParts[1]) ? hashParts[1] : null;
  if (/^BV[0-9A-Za-z]{10,}$/i.test(bareBase)) {
    return { platform: 'bilibili', bvid: normalizeBvid(bareBase), aid: null, cid: bareCid };
  }
  var bareAv = bareBase.match(/^av([0-9]+)$/i);
  if (bareAv) {
    return { platform: 'bilibili', bvid: null, aid: bareAv[1], cid: bareCid };
  }
  if (isYouTubeVideoId(s)) {
    return { platform: 'youtube', videoId: s };
  }
  return null;
}

function selectYtAudioCandidates(ctx, playerJson) {
  var sd = playerJson && playerJson.streamingData;
  if (!sd) return [];
  var all = []
    .concat(Array.isArray(sd.adaptiveFormats) ? sd.adaptiveFormats : [])
    .concat(Array.isArray(sd.formats) ? sd.formats : []);

  var platform = String((ctx && ctx.env && ctx.env.platform) || '').toLowerCase();
  var isApple = (platform === 'ios' || platform === 'macos');
  var formatPref = String(getSetting(ctx, 'youtubeAudioFormat', 'auto')).toLowerCase();

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

    var priority = -1;
    var fileExtension = 'm4a';
    var mimeType = 'audio/mp4';

    if (isApple || formatPref === 'm4a') {
      if (itag === 141) { priority = 0; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 140) { priority = 1; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 139) { priority = 2; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (isMp4Audio) { priority = 3; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (!isApple && isWebmAudio) {
        if (itag === 251) priority = 4;
        else if (itag === 250) priority = 5;
        else if (itag === 249) priority = 6;
        else priority = 7;
        fileExtension = 'webm';
        mimeType = 'audio/webm';
      } else if (itag === 18) { priority = 8; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
      else if (isMp4Video) { priority = 9; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
    } else if (formatPref === 'opus') {
      if (itag === 251) { priority = 0; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (itag === 250) { priority = 1; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (itag === 249) { priority = 2; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (isWebmAudio) { priority = 3; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (itag === 141) { priority = 4; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 140) { priority = 5; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 139) { priority = 6; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (isMp4Audio) { priority = 7; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 18) { priority = 8; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
      else if (isMp4Video) { priority = 9; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
    } else {
      // Non-Apple auto: prefer 251, 250, 141, 140, 139, 18.
      if (itag === 251) { priority = 0; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (itag === 250) { priority = 1; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (itag === 141) { priority = 2; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 140) { priority = 3; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 139) { priority = 4; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 249) { priority = 5; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (isWebmAudio) { priority = 6; fileExtension = 'webm'; mimeType = 'audio/webm'; }
      else if (isMp4Audio) { priority = 7; fileExtension = 'm4a'; mimeType = 'audio/mp4'; }
      else if (itag === 18) { priority = 8; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
      else if (isMp4Video) { priority = 9; fileExtension = 'mp4'; mimeType = 'video/mp4'; }
    }

    if (priority < 0) continue;
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

async function resolveYtStream(ctx, videoId, ytCookie, forceRefresh) {
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

          var candidates = selectYtAudioCandidates(ctx, json);
          var expSec = json && json.streamingData && json.streamingData.expiresInSeconds
            ? parseInt(String(json.streamingData.expiresInSeconds), 10)
            : 0;

          for (var c = 0; c < Math.min(3, candidates.length); c++) {
            var cand = candidates[c];
            if (await probeYtCandidate(ctx, cand, cl.userAgent)) {
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
                contentLength: cand.contentLength
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

function extractBiliStreamCandidate(playJson) {
  var data = playJson && playJson.data;
  if (!data) return null;

  if (data.dash) {
    var streams = Array.isArray(data.dash.audio) ? data.dash.audio.slice() : [];
    if (data.dash.flac && data.dash.flac.audio) {
      streams.push(data.dash.flac.audio);
    }
    var preferredIds = [30280, 30232, 30216, 30251];
    streams.sort(function (a, b) {
      var idA = typeof (a && a.id) === 'number' ? a.id : 0;
      var idB = typeof (b && b.id) === 'number' ? b.id : 0;
      var rankA = preferredIds.indexOf(idA);
      var rankB = preferredIds.indexOf(idB);
      if (rankA < 0) rankA = preferredIds.length;
      if (rankB < 0) rankB = preferredIds.length;
      if (rankA !== rankB) return rankA - rankB;
      return (Number(b && b.bandwidth) || 0) - (Number(a && a.bandwidth) || 0);
    });

    for (var i = 0; i < streams.length; i++) {
      var s = streams[i];
      if (!s) continue;
      var primary = normalizeHttps(s.baseUrl || s.base_url);
      var rawBackups = (Array.isArray(s.backupUrl) ? s.backupUrl : (Array.isArray(s.backup_url) ? s.backup_url : []));
      var backups = [];
      for (var b = 0; b < rawBackups.length; b++) {
        var normB = normalizeHttps(rawBackups[b]);
        if (normB) {
          if (!primary) primary = normB;
          else if (normB !== primary && backups.indexOf(normB) < 0) backups.push(normB);
        }
      }
      if (!primary) continue;
      var sid = typeof s.id === 'number' ? s.id : 0;
      var mime = String(s.mimeType || s.mime_type || '').toLowerCase();
      var isFlac = sid === 30251 || mime.indexOf('flac') >= 0;
      return {
        url: primary,
        fallbackUrls: backups,
        fileExtension: isFlac ? 'flac' : 'm4a',
        mimeType: isFlac ? 'audio/flac' : 'audio/mp4'
      };
    }
  }

  if (Array.isArray(data.durl) && data.durl.length > 0) {
    var first = data.durl[0];
    if (first) {
      var dPrimary = normalizeHttps(first.url);
      var dRawBackups = Array.isArray(first.backup_url) ? first.backup_url : [];
      var dBackups = [];
      for (var j = 0; j < dRawBackups.length; j++) {
        var normD = normalizeHttps(dRawBackups[j]);
        if (normD) {
          if (!dPrimary) dPrimary = normD;
          else if (normD !== dPrimary && dBackups.indexOf(normD) < 0) dBackups.push(normD);
        }
      }
      if (dPrimary) {
        return {
          url: dPrimary,
          fallbackUrls: dBackups,
          fileExtension: 'mp4',
          mimeType: 'video/mp4'
        };
      }
    }
  }

  return null;
}

function extractBiliExpireMs(urlStr) {
  var parsed = parseUrl(urlStr);
  if (parsed && parsed.query && parsed.query.deadline && isDigitsOnly(parsed.query.deadline)) {
    var dl = parseInt(parsed.query.deadline, 10);
    if (isFinite(dl) && dl > 0) {
      return (dl - 60) * 1000;
    }
  }
  return Date.now() + 5400 * 1000;
}

async function resolveBiliStream(ctx, target, rawCookie) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var bvid = target.bvid;
  var aid = target.aid;
  var cid = target.cid;

  if (!cid || !bvid) {
    var viewQuery = bvid ? ('bvid=' + encodeURIComponent(bvid)) : ('aid=' + encodeURIComponent(aid));
    var viewJson = await getBiliJson(
      ctx,
      'https://api.bilibili.com/x/web-interface/view?' + viewQuery,
      effectiveCookie,
      'https://www.bilibili.com/',
      'https://www.bilibili.com'
    );
    var viewData = viewJson && viewJson.data;
    if (!viewData) {
      throw extError('NO_PLAYABLE_STREAM', 'Could not resolve Bilibili video info.');
    }
    if (!bvid && viewData.bvid) bvid = normalizeBvid(String(viewData.bvid));
    if (!cid) {
      var resolvedC = viewData.cid || (Array.isArray(viewData.pages) && viewData.pages[0] && viewData.pages[0].cid);
      if (resolvedC) cid = String(resolvedC);
    }
  }

  if (!bvid || !cid) {
    throw extError('NO_PLAYABLE_STREAM', 'Missing Bilibili bvid or cid.');
  }

  var params = {
    bvid: bvid,
    cid: String(cid),
    qn: '80',
    fnval: '16',
    fnver: '0',
    fourk: '1'
  };

  var playJson = null;
  var candidate = null;
  var wbiErr = null;
  try {
    var mixinKey = await getWbiMixinKey(ctx, effectiveCookie, false);
    var signedQuery = signWbiParams(ctx, params, mixinKey);
    playJson = await getBiliJson(
      ctx,
      'https://api.bilibili.com/x/player/wbi/playurl?' + signedQuery,
      effectiveCookie,
      'https://www.bilibili.com/video/' + bvid,
      'https://www.bilibili.com'
    );
    candidate = extractBiliStreamCandidate(playJson);
  } catch (err) {
    wbiErr = err;
    kvRemoveSafe(ctx, WBI_KEY_KV_KEY);
  }

  if (!candidate) {
    try {
      var plainQuery = buildPlainQuery(params);
      playJson = await getBiliJson(
        ctx,
        'https://api.bilibili.com/x/player/playurl?' + plainQuery,
        effectiveCookie,
        'https://www.bilibili.com/video/' + bvid,
        'https://www.bilibili.com'
      );
      candidate = extractBiliStreamCandidate(playJson);
    } catch (fbErr) {
      throw wbiErr || fbErr;
    }
  }

  if (!candidate) {
    throw extError('NO_PLAYABLE_STREAM', 'No playable audio stream in Bilibili playurl response.');
  }

  return {
    url: candidate.url,
    headers: {
      'User-Agent': WEB_USER_AGENT,
      'Referer': 'https://www.bilibili.com/video/' + bvid,
      'Origin': 'https://www.bilibili.com',
      'Cookie': effectiveCookie
    },
    fileExtension: candidate.fileExtension,
    mimeType: candidate.mimeType,
    expiresAtMs: extractBiliExpireMs(candidate.url),
    fallbackUrls: candidate.fallbackUrls
  };
}

async function resolveStream(ctx, req) {
  var rawTrackId = (req && (req.remoteTrackId || req.relativePath)) || '';
  var parsed = parseStreamTrackId(rawTrackId);
  if (!parsed) {
    throw extError('NO_PLAYABLE_STREAM', 'Unrecognized track ID: ' + String(rawTrackId));
  }
  var rawCookie = req && req.cookie ? String(req.cookie) : null;
  if (parsed.platform === 'youtube') {
    var ytCookie = resolveScopedCookie(ctx, rawCookie, 'youtube');
    return await resolveYtStream(ctx, parsed.videoId, ytCookie, Boolean(req && req.forceRefresh));
  }
  var biliCookie = resolveScopedCookie(ctx, rawCookie, 'bilibili');
  return await resolveBiliStream(ctx, parsed, biliCookie);
}

module.exports = {
  manifest: manifest,
  canHandle: canHandle,
  fetchCollection: fetchCollection,
  resolveStream: resolveStream,
  search: search
};
