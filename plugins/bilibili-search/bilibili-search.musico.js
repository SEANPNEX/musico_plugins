'use strict';

var manifest = {
  apiVersion: 1,
  id: 'bilibili-search',
  name: 'Bilibili Search',
  version: '1.0.0',
  author: 'SEANPNEX',
  description: 'Search songs, multi-part videos (分P), and collections (合集) from Bilibili, plus import videos, favlists, collections, and series.',
  badgeLabel: 'Bilibili',
  updateUrl: 'https://github.com/SEANPNEX/musico_plugins/releases/download/bilibili-search-v1.0.0/bilibili-search.musicoext',
  capabilities: ['search', 'playlist', 'stream', 'cookie', 'proxy'],
  searchKinds: ['track', 'playlist'],
  urlPatterns: [
    '^https?://(www\\.|m\\.|space\\.)?bilibili\\.com/',
    '^https?://b23\\.tv/[A-Za-z0-9]+'
  ],
  permissions: {
    hosts: [
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
    }
  ]
};

var WEB_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
var BUVID3_KV_KEY = 'bili:buvid3';
var BUVID3_TTL_SEC = 86400;
var WBI_KEY_KV_KEY = 'bili:wbiMixinKey';
var WBI_KEY_TTL_SEC = 21600;
var BLVI_TTL_SEC = 86400;
var BILI_PROBE_CONCURRENCY = 4;
var BILI_PROBE_TIMEOUT_MS = 3000;
var FALLBACK_BUVID3 = 'B0E2A3F1-1234-4567-89AB-CDEF01234567infoc';

var WBI_MIXIN_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

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
  if (candidate.indexOf('bili:') === 0) {
    var rest = candidate.slice(5);
    var parts = rest.split(':');
    if (parts[0] === 'video' && parts[1]) {
      var bv = extractBvidFromText(parts[1]);
      if (bv) {
        return {
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
        targetType: 'fav',
        mediaId: parts[1],
        remoteId: 'bili:fav:' + parts[1],
        normalizedUrl: 'https://www.bilibili.com/medialist/detail/ml' + parts[1],
        kind: 'playlist'
      };
    } else if (parts[0] === 'season' && isDigitsOnly(parts[1]) && isDigitsOnly(parts[2])) {
      return {
        targetType: 'season',
        mid: parts[1],
        seasonId: parts[2],
        remoteId: 'bili:season:' + parts[1] + ':' + parts[2],
        normalizedUrl: 'https://space.bilibili.com/' + parts[1] + '/lists/' + parts[2] + '?type=season',
        kind: 'playlist'
      };
    } else if (parts[0] === 'series' && isDigitsOnly(parts[1]) && isDigitsOnly(parts[2])) {
      return {
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
    if (/^BV[0-9A-Za-z]{10,}$/i.test(candidate)) {
      var bareBv = normalizeBvid(candidate);
      return {
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

  // Bilibili short link.
  if (host === 'b23.tv' || host.slice(-7) === '.b23.tv') {
    var code = segments[0] || '';
    if (!code) return null;
    return {
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
          targetType: 'series',
          mid: mid,
          seriesId: sid,
          remoteId: 'bili:series:' + mid + ':' + sid,
          normalizedUrl: 'https://space.bilibili.com/' + mid + '/lists/' + sid + '?type=series',
          kind: 'playlist'
        };
      }
      return {
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

async function getBiliJson(ctx, url, effectiveCookie, referer, origin, timeoutMs) {
  var res = await ctx.http.request({
    method: 'GET',
    url: url,
    headers: biliHeaders(effectiveCookie, referer, origin),
    followRedirects: true,
    timeoutMs: timeoutMs || 15000
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

async function mapWithConcurrency(items, maxConcurrency, worker) {
  var results = new Array(items.length);
  if (items.length === 0) return results;
  var limit = Math.max(1, Math.min(maxConcurrency, items.length));
  var cursor = 0;

  async function runWorker() {
    while (cursor < items.length) {
      var idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }

  var workers = [];
  for (var w = 0; w < limit; w++) {
    workers.push(runWorker());
  }
  await Promise.all(workers);
  return results;
}

function extractUgcSeasonInfo(data) {
  var season = data && data.ugc_season;
  if (!season || typeof season !== 'object') return null;
  var seasonId = season.id != null ? String(season.id).trim() : '';
  if (!seasonId || !isDigitsOnly(seasonId)) return null;
  var rawMid = season.mid != null ? season.mid : (data.owner && data.owner.mid);
  var mid = (rawMid != null && isDigitsOnly(String(rawMid))) ? String(rawMid) : '0';
  var title = cleanBiliText(season.title) || ('Bilibili Collection (' + seasonId + ')');
  var artist = cleanBiliText((data.owner && data.owner.name) || '') || 'Bilibili';
  var artworkUrl = normalizeHttps(season.cover || data.pic);

  var trackCount = null;
  if (typeof season.ep_count === 'number' && isFinite(season.ep_count) && season.ep_count > 0) {
    trackCount = season.ep_count;
  } else if (Array.isArray(season.sections)) {
    var totalEps = 0;
    for (var s = 0; s < season.sections.length; s++) {
      var sec = season.sections[s];
      if (sec && Array.isArray(sec.episodes)) {
        totalEps += sec.episodes.length;
      }
    }
    if (totalEps > 0) trackCount = totalEps;
  }

  return {
    seasonId: seasonId,
    mid: mid,
    title: title,
    artist: artist,
    artworkUrl: artworkUrl,
    trackCount: trackCount
  };
}

async function probeBiliVideoInfo(ctx, bvid, effectiveCookie) {
  var cacheKey = 'blvi:' + bvid;
  var cachedRaw = kvGetSafe(ctx, cacheKey);
  if (cachedRaw) {
    try {
      var parsedCache = JSON.parse(cachedRaw);
      if (parsedCache && typeof parsedCache.pagesCount === 'number') {
        return parsedCache;
      }
    } catch (e) {
      // Ignore malformed cache entry.
    }
  }

  var viewData = null;
  try {
    var viewJson = await getBiliJson(
      ctx,
      'https://api.bilibili.com/x/web-interface/view?bvid=' + encodeURIComponent(bvid),
      effectiveCookie,
      'https://www.bilibili.com/',
      'https://www.bilibili.com',
      BILI_PROBE_TIMEOUT_MS
    );
    if (viewJson && viewJson.data) {
      viewData = viewJson.data;
    }
  } catch (e) {
    // Fall back to pagelist endpoint below.
  }

  if (viewData) {
    var pages = Array.isArray(viewData.pages) ? viewData.pages : [];
    if (pages.length === 0) {
      try {
        var plJsonFromView = await getBiliJson(
          ctx,
          'https://api.bilibili.com/x/player/pagelist?bvid=' + encodeURIComponent(bvid),
          effectiveCookie,
          'https://www.bilibili.com/',
          'https://www.bilibili.com',
          BILI_PROBE_TIMEOUT_MS
        );
        if (plJsonFromView && Array.isArray(plJsonFromView.data)) {
          pages = plJsonFromView.data;
        }
      } catch (e2) {
        // Best-effort pagelist fallback.
      }
    }
    var probe = {
      bvid: bvid,
      title: cleanBiliText(viewData.title) || null,
      artist: cleanBiliText((viewData.owner && viewData.owner.name) || '') || null,
      artworkUrl: normalizeHttps(viewData.pic),
      pagesCount: pages.length > 0 ? pages.length : 1,
      ugcSeason: extractUgcSeasonInfo(viewData)
    };
    kvSetSafe(ctx, cacheKey, JSON.stringify(probe), BLVI_TTL_SEC);
    return probe;
  }

  try {
    var plJson = await getBiliJson(
      ctx,
      'https://api.bilibili.com/x/player/pagelist?bvid=' + encodeURIComponent(bvid),
      effectiveCookie,
      'https://www.bilibili.com/',
      'https://www.bilibili.com',
      BILI_PROBE_TIMEOUT_MS
    );
    if (plJson && Array.isArray(plJson.data)) {
      var fbProbe = {
        bvid: bvid,
        title: null,
        artist: null,
        artworkUrl: null,
        pagesCount: plJson.data.length > 0 ? plJson.data.length : 1,
        ugcSeason: null
      };
      kvSetSafe(ctx, cacheKey, JSON.stringify(fbProbe), BLVI_TTL_SEC);
      return fbProbe;
    }
  } catch (e3) {
    // Probe failed completely; degrade gracefully without caching failure.
  }

  return null;
}

async function searchBilibiliRaw(ctx, query, order, page, pageSize, effectiveCookie) {
  var validOrders = { totalrank: true, click: true, pubdate: true, stow: true };
  var cleanOrder = validOrders[order] ? order : 'totalrank';

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
  var rows = [];
  for (var i = 0; i < rawRows.length; i++) {
    var row = rawRows[i];
    if (!row || !row.bvid) continue;
    rows.push(row);
  }
  var numPages = typeof data.numPages === 'number' ? data.numPages : 0;
  var hasMore = rows.length > 0 && (numPages > 0 ? page < numPages : rows.length >= pageSize);
  return {
    rows: rows,
    hasMore: hasMore,
    nextPage: hasMore ? (page + 1) : null
  };
}

async function searchBilibili(ctx, query, order, kind, page, pageSize, rawCookie) {
  var effectiveCookie = await resolveBiliCookie(ctx, rawCookie);
  var rawResult = await searchBilibiliRaw(ctx, query, order, page, pageSize, effectiveCookie);
  var rows = rawResult.rows;

  var items = [];
  if (kind === 'track') {
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
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
    return {
      items: items,
      hasMore: rawResult.hasMore,
      nextPage: rawResult.nextPage
    };
  }

  // kind is 'playlist' or 'all': probe video details to detect 分P (pages.length > 1) and 合集 (ugc_season).
  var uniqueBvids = [];
  var seenBvids = {};
  for (var r = 0; r < rows.length; r++) {
    var rb = normalizeBvid(String(rows[r].bvid));
    if (!seenBvids[rb]) {
      seenBvids[rb] = true;
      uniqueBvids.push(rb);
    }
  }

  var probedList = await mapWithConcurrency(uniqueBvids, BILI_PROBE_CONCURRENCY, function (bv) {
    return probeBiliVideoInfo(ctx, bv, effectiveCookie);
  });
  var probeByBvid = {};
  for (var p = 0; p < uniqueBvids.length; p++) {
    if (probedList[p]) {
      probeByBvid[uniqueBvids[p]] = probedList[p];
    }
  }

  var seenSeasons = {};
  var seenItemKeys = {};
  function pushUnique(item) {
    if (!item) return;
    var key = item.kind + ':' + (item.kind === 'track' ? item.remoteTrackId : item.remoteId);
    if (seenItemKeys[key]) return;
    seenItemKeys[key] = true;
    items.push(item);
  }

  for (var idx = 0; idx < rows.length; idx++) {
    var vRow = rows[idx];
    var bvidVal = normalizeBvid(String(vRow.bvid));
    var rowTitle = cleanBiliText(vRow.title) || bvidVal;
    var rowArtist = cleanBiliText(vRow.author) || 'Bilibili';
    var rowArt = normalizeHttps(vRow.pic);
    var rowDur = parseDurationSec(vRow.duration);
    var probe = probeByBvid[bvidVal] || null;
    var pagesCount = probe && typeof probe.pagesCount === 'number' ? probe.pagesCount : 1;

    // Case 1 (分P): pages.length > 1 -> classify/emit as playlist.
    if (pagesCount > 1) {
      pushUnique({
        kind: 'playlist',
        remoteId: 'bili:video:' + bvidVal,
        title: (probe && probe.title) || rowTitle,
        artist: (probe && probe.artist) || rowArtist,
        artworkUrl: (probe && probe.artworkUrl) || rowArt,
        sourceUrl: 'https://www.bilibili.com/video/' + bvidVal,
        trackCount: pagesCount
      });
    } else if (kind === 'all') {
      pushUnique({
        kind: 'track',
        remoteTrackId: 'bili:' + bvidVal,
        title: rowTitle,
        artist: rowArtist,
        album: 'Bilibili',
        durationSec: rowDur,
        artworkUrl: rowArt,
        relativePath: sanitizeFileName(rowTitle, bvidVal) + '.m4a'
      });
    }

    // Case 2 (合集 / ugc_season): emit playlist deduplicated by seasonId.
    if (probe && probe.ugcSeason) {
      var season = probe.ugcSeason;
      if (!seenSeasons[season.seasonId]) {
        seenSeasons[season.seasonId] = true;
        pushUnique({
          kind: 'playlist',
          remoteId: 'bili:season:' + season.mid + ':' + season.seasonId,
          title: season.title,
          artist: season.artist || rowArtist,
          artworkUrl: season.artworkUrl || rowArt,
          sourceUrl: 'https://space.bilibili.com/' + season.mid + '/lists/' + season.seasonId + '?type=season',
          trackCount: season.trackCount
        });
      }
    }
  }

  return {
    items: items,
    hasMore: rawResult.hasMore,
    nextPage: rawResult.nextPage
  };
}

// ---------- Search Pagination ----------

function parseSearchCursor(cursor) {
  var state = { biliPage: 0, biliOffset: 0 };
  if (!cursor || typeof cursor !== 'string' || cursor.indexOf('v1:') !== 0) {
    return state;
  }
  var val = safeDecodeURIComponent(cursor.slice(3));
  var comma = val.indexOf(',');
  if (comma >= 0) {
    state.biliPage = parseInt(val.slice(0, comma), 10) || 0;
    state.biliOffset = parseInt(val.slice(comma + 1), 10) || 0;
  } else {
    state.biliPage = parseInt(val, 10) || 0;
  }
  return state;
}

function formatSearchCursor(biliVal) {
  if (!biliVal) return null;
  return 'v1:' + encodeURIComponent(biliVal);
}

async function search(ctx, req) {
  var query = String((req && req.query) || '').trim();
  if (!query) {
    return { items: [], nextCursor: null };
  }

  var rawKind = String((req && req.kind) || 'all').trim().toLowerCase();
  if (rawKind === 'album') {
    return { items: [], nextCursor: null };
  }
  var kind = (rawKind === 'track' || rawKind === 'playlist') ? rawKind : 'all';
  var limit = Math.max(1, Math.min(50, Math.floor(Number((req && req.limit) || 20)) || 20));
  var biliCookie = req && req.cookie ? String(req.cookie).trim() : null;
  var prevCursor = req && req.cursor ? String(req.cursor).trim() : null;
  var biliOrder = String(getSetting(ctx, 'biliSearchOrder', 'totalrank')).toLowerCase();

  var parsedCur = parseSearchCursor(prevCursor);
  var isFirstPage = !prevCursor;
  if (!isFirstPage && parsedCur.biliPage <= 0) {
    return { items: [], nextCursor: null };
  }

  var biliPageToFetch = isFirstPage ? 1 : parsedCur.biliPage;
  var biliOffset = isFirstPage ? 0 : parsedCur.biliOffset;
  var biliPageSize = Math.min(20, Math.max(10, limit));

  var data = null;
  var maxPageAttempts = kind === 'playlist' && biliOffset === 0 ? 2 : 1;
  for (var attempt = 0; attempt < maxPageAttempts; attempt++) {
    var biliCacheKey = 'blsp:' + ctx.crypto.md5([biliOrder, kind, query, String(biliPageToFetch), String(biliPageSize)].join('|'));
    if (biliOffset > 0) {
      var cachedRaw = kvGetSafe(ctx, biliCacheKey);
      if (cachedRaw) {
        try {
          data = JSON.parse(cachedRaw);
        } catch (e) {
          data = null;
        }
      }
    }
    if (!data) {
      data = await searchBilibili(ctx, query, biliOrder, kind, biliPageToFetch, biliPageSize, biliCookie);
      kvSetSafe(ctx, biliCacheKey, JSON.stringify(data), 300);
    }
    if (data.items.length > 0 || !data.hasMore || !data.nextPage) {
      break;
    }
    biliPageToFetch = data.nextPage;
    data = null;
  }

  var biliAll = (data && Array.isArray(data.items)) ? data.items : [];
  var biliSlice = biliOffset > 0 ? biliAll.slice(biliOffset) : biliAll;
  var items = biliSlice.slice(0, limit);

  var nextBiliSeg = '';
  var totalConsumed = biliOffset + items.length;
  if (totalConsumed < biliAll.length) {
    nextBiliSeg = String(biliPageToFetch) + ',' + String(totalConsumed);
  } else if (data && data.hasMore && data.nextPage) {
    nextBiliSeg = String(data.nextPage);
  }

  var nextCursor = formatSearchCursor(nextBiliSeg);
  if (nextCursor && prevCursor && nextCursor === prevCursor) {
    nextCursor = null;
  }

  return {
    items: items,
    nextCursor: nextCursor
  };
}

// ---------- Collection Fetching ----------

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
  if (pages.length === 0 && !data.cid && resolvedBvid.indexOf('BV') === 0) {
    try {
      var plJson = await getBiliJson(
        ctx,
        'https://api.bilibili.com/x/player/pagelist?bvid=' + encodeURIComponent(resolvedBvid),
        effectiveCookie,
        'https://www.bilibili.com/',
        'https://www.bilibili.com'
      );
      if (plJson && Array.isArray(plJson.data)) {
        pages = plJson.data;
      }
    } catch (e) {
      // Fall through.
    }
  }

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
    throw extError('INVALID_URL', 'Unsupported Bilibili link.');
  }

  var biliCookie = req && req.cookie ? String(req.cookie).trim() : null;
  var cursor = req && req.cursor ? String(req.cursor).trim() : null;

  if (target.targetType === 'short') {
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

  if (target.targetType === 'fav') {
    return await fetchBiliFavlist(ctx, target.mediaId, biliCookie, cursor);
  }
  if (target.targetType === 'season') {
    return await fetchBiliSeason(ctx, target.mid, target.seasonId, biliCookie, cursor);
  }
  if (target.targetType === 'series') {
    return await fetchBiliSeries(ctx, target.mid, target.seriesId, biliCookie, cursor);
  }
  return await fetchBiliVideo(ctx, target.bvid, target.aid, biliCookie);
}

// ---------- Stream Resolution ----------

function parseStreamTrackId(rawId) {
  var s = String(rawId == null ? '' : rawId).trim();
  if (!s) return null;

  if (s.indexOf('bili:') === 0) {
    var rest = s.slice(5);
    var parts = rest.split('#');
    var base = parts[0];
    var cid = parts[1] && isDigitsOnly(parts[1]) ? parts[1] : null;
    if (/^BV[0-9A-Za-z]{10,}$/i.test(base)) {
      return { bvid: normalizeBvid(base), aid: null, cid: cid };
    }
    var avM = base.match(/^av([0-9]+)$/i);
    if (avM) {
      return { bvid: null, aid: avM[1], cid: cid };
    }
    return null;
  }

  // Bare IDs supported in resolveStream.
  var hashParts = s.split('#');
  var bareBase = hashParts[0];
  var bareCid = hashParts[1] && isDigitsOnly(hashParts[1]) ? hashParts[1] : null;
  if (/^BV[0-9A-Za-z]{10,}$/i.test(bareBase)) {
    return { bvid: normalizeBvid(bareBase), aid: null, cid: bareCid };
  }
  var bareAv = bareBase.match(/^av([0-9]+)$/i);
  if (bareAv) {
    return { bvid: null, aid: bareAv[1], cid: bareCid };
  }
  return null;
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
    throw extError('NO_PLAYABLE_STREAM', 'Unrecognized Bilibili track ID: ' + String(rawTrackId));
  }
  var biliCookie = req && req.cookie ? String(req.cookie).trim() : null;
  return await resolveBiliStream(ctx, parsed, biliCookie);
}

module.exports = {
  manifest: manifest,
  canHandle: canHandle,
  fetchCollection: fetchCollection,
  resolveStream: resolveStream,
  search: search
};
