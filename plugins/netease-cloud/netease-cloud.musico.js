'use strict';

var manifest = {
  apiVersion: 1,
  id: 'com.seanpnex.musico.netease',
  name: 'NetEase Cloud Music',
  version: '1.2.0',
  author: 'SEANPNEX',
  description: 'Playlists, albums, artists, single tracks, cloud search, QR code login, and EAPI stream resolution for NetEase Cloud Music.',
  badgeLabel: 'NetEase',
  updateUrl: 'https://github.com/SEANPNEX/musico_plugins/releases/download/netease-cloud-v1.2.0/netease-cloud.musicoext',
  capabilities: ['playlist', 'stream', 'search', 'cookie', 'qr_login', 'proxy'],
  searchKinds: ['track', 'playlist', 'album'],
  qualities: [
    { id: 'highest', label: 'Highest Available', badge: 'Hi-Res', lossless: true },
    { id: 'jymaster', label: 'JY Master', badge: 'Master', lossless: true },
    { id: 'sky', label: 'Sky (Spatial Audio)', badge: 'Spatial', lossless: true },
    { id: 'jyeffect', label: 'JY Effect (Surround)', badge: 'Surround', lossless: true },
    { id: 'hires', label: 'Hi-Res', badge: 'Hi-Res', lossless: true },
    { id: 'lossless', label: 'Lossless (FLAC)', badge: 'FLAC', lossless: true },
    { id: 'exhigh', label: 'ExHigh (320 kbps)', badge: '320k' },
    { id: 'higher', label: 'Higher (192 kbps)', badge: '192k' },
    { id: 'standard', label: 'Standard (128 kbps)', badge: '128k' }
  ],
  defaultStreamQuality: 'standard',
  defaultDownloadQuality: 'highest',
  urlPatterns: [
    '^https?://(y\\.)?music\\.163\\.com/(#/)?(m/)?(playlist|album|song|artist)(\\?.*id=\\d+|/\\d+)',
    '^https?://163cn\\.(tv|link)/[A-Za-z0-9_-]+'
  ],
  permissions: {
    hosts: [
      'music.163.com',
      'y.music.163.com',
      'interface.music.163.com',
      'interface3.music.163.com',
      'interface4.music.163.com',
      'interface5.music.163.com',
      'interface6.music.163.com',
      '*.music.163.com',
      '163cn.tv',
      '163cn.link',
      'music.126.net',
      '*.music.126.net',
      '*.126.net',
      '*.127.net'
    ]
  },
  settings: [
    {
      key: 'quality',
      label: 'Preferred Audio Quality',
      type: 'select',
      default: 'exhigh',
      options: [
        { value: 'standard', label: 'Standard (128 kbps)' },
        { value: 'higher', label: 'Higher (192 kbps)' },
        { value: 'exhigh', label: 'ExHigh (320 kbps)' },
        { value: 'lossless', label: 'Lossless (FLAC)' },
        { value: 'hires', label: 'Hi-Res' },
        { value: 'jyeffect', label: 'JY Effect (Surround)' },
        { value: 'sky', label: 'Sky (Spatial Audio)' },
        { value: 'jymaster', label: 'JY Master' }
      ]
    },
    {
      key: 'allowTrialPreview',
      label: 'Allow 30s VIP trial preview',
      type: 'boolean',
      default: true
    },
    {
      key: 'customApiHeaderOs',
      label: 'EAPI Client OS Header',
      type: 'select',
      default: 'pc',
      options: [
        { value: 'pc', label: 'PC' },
        { value: 'android', label: 'Android' },
        { value: 'ios', label: 'iOS' }
      ]
    }
  ]
};

var EAPI_KEY_STR = 'e82ckenh8dichen8';
var EAPI_SEPARATOR = '-36cd479b6b5-';
var DEFAULT_MUSIC_A =
  '4ee5f776c9ed1e4d5f031b09e084c6cb333e43ee4a841afeebbef9bbf4b7e415' +
  '2b51ff20ecb9e8ee9e89ab23044cf50d1609e4781e805e73a138419e5583bc7f' +
  'd1e5933c52368d9127ba9ce4e2f233bf5a77ba40ea6045ae1fc612ead95d7b0e' +
  '0edf70a74334194e1a190979f5fc12e9968c3666a981495b33a649814e309366';

var AES_SBOX = [
  0x63, 0x7c, 0x77, 0x7b, 0xf2, 0x6b, 0x6f, 0xc5, 0x30, 0x01, 0x67, 0x2b, 0xfe, 0xd7, 0xab, 0x76,
  0xca, 0x82, 0xc9, 0x7d, 0xfa, 0x59, 0x47, 0xf0, 0xad, 0xd4, 0xa2, 0xaf, 0x9c, 0xa4, 0x72, 0xc0,
  0xb7, 0xfd, 0x93, 0x26, 0x36, 0x3f, 0xf7, 0xcc, 0x34, 0xa5, 0xe5, 0xf1, 0x71, 0xd8, 0x31, 0x15,
  0x04, 0xc7, 0x23, 0xc3, 0x18, 0x96, 0x05, 0x9a, 0x07, 0x12, 0x80, 0xe2, 0xeb, 0x27, 0xb2, 0x75,
  0x09, 0x83, 0x2c, 0x1a, 0x1b, 0x6e, 0x5a, 0xa0, 0x52, 0x3b, 0xd6, 0xb3, 0x29, 0xe3, 0x2f, 0x84,
  0x53, 0xd1, 0x00, 0xed, 0x20, 0xfc, 0xb1, 0x5b, 0x6a, 0xcb, 0xbe, 0x39, 0x4a, 0x4c, 0x58, 0xcf,
  0xd0, 0xef, 0xaa, 0xfb, 0x43, 0x4d, 0x33, 0x85, 0x45, 0xf9, 0x02, 0x7f, 0x50, 0x3c, 0x9f, 0xa8,
  0x51, 0xa3, 0x40, 0x8f, 0x92, 0x9d, 0x38, 0xf5, 0xbc, 0xb6, 0xda, 0x21, 0x10, 0xff, 0xf3, 0xd2,
  0xcd, 0x0c, 0x13, 0xec, 0x5f, 0x97, 0x44, 0x17, 0xc4, 0xa7, 0x7e, 0x3d, 0x64, 0x5d, 0x19, 0x73,
  0x60, 0x81, 0x4f, 0xdc, 0x22, 0x2a, 0x90, 0x88, 0x46, 0xee, 0xb8, 0x14, 0xde, 0x5e, 0x0b, 0xdb,
  0xe0, 0x32, 0x3a, 0x0a, 0x49, 0x06, 0x24, 0x5c, 0xc2, 0xd3, 0xac, 0x62, 0x91, 0x95, 0xe4, 0x79,
  0xe7, 0xc8, 0x37, 0x6d, 0x8d, 0xd5, 0x4e, 0xa9, 0x6c, 0x56, 0xf4, 0xea, 0x65, 0x7a, 0xae, 0x08,
  0xba, 0x78, 0x25, 0x2e, 0x1c, 0xa6, 0xb4, 0xc6, 0xe8, 0xdd, 0x74, 0x1f, 0x4b, 0xbd, 0x8b, 0x8a,
  0x70, 0x3e, 0xb5, 0x66, 0x48, 0x03, 0xf6, 0x0e, 0x61, 0x35, 0x57, 0xb9, 0x86, 0xc1, 0x1d, 0x9e,
  0xe1, 0xf8, 0x98, 0x11, 0x69, 0xd9, 0x8e, 0x94, 0x9b, 0x1e, 0x87, 0xe9, 0xce, 0x55, 0x28, 0xdf,
  0x8c, 0xa1, 0x89, 0x0d, 0xbf, 0xe6, 0x42, 0x68, 0x41, 0x99, 0x2d, 0x0f, 0xb0, 0x54, 0xbb, 0x16
];

var AES_INV_SBOX = [
  0x52, 0x09, 0x6a, 0xd5, 0x30, 0x36, 0xa5, 0x38, 0xbf, 0x40, 0xa3, 0x9e, 0x81, 0xf3, 0xd7, 0xfb,
  0x7c, 0xe3, 0x39, 0x82, 0x9b, 0x2f, 0xff, 0x87, 0x34, 0x8e, 0x43, 0x44, 0xc4, 0xde, 0xe9, 0xcb,
  0x54, 0x7b, 0x94, 0x32, 0xa6, 0xc2, 0x23, 0x3d, 0xee, 0x4c, 0x95, 0x0b, 0x42, 0xfa, 0xc3, 0x4e,
  0x08, 0x2e, 0xa1, 0x66, 0x28, 0xd9, 0x24, 0xb2, 0x76, 0x5b, 0xa2, 0x49, 0x6d, 0x8b, 0xd1, 0x25,
  0x72, 0xf8, 0xf6, 0x64, 0x86, 0x68, 0x98, 0x16, 0xd4, 0xa4, 0x5c, 0xcc, 0x5d, 0x65, 0xb6, 0x92,
  0x6c, 0x70, 0x48, 0x50, 0xfd, 0xed, 0xb9, 0xda, 0x5e, 0x15, 0x46, 0x57, 0xa7, 0x8d, 0x9d, 0x84,
  0x90, 0xd8, 0xab, 0x00, 0x8c, 0xbc, 0xd3, 0x0a, 0xf7, 0xe4, 0x58, 0x05, 0xb8, 0xb3, 0x45, 0x06,
  0xd0, 0x2c, 0x1e, 0x8f, 0xca, 0x3f, 0x0f, 0x02, 0xc1, 0xaf, 0xbd, 0x03, 0x01, 0x13, 0x8a, 0x6b,
  0x3a, 0x91, 0x11, 0x41, 0x4f, 0x67, 0xdc, 0xea, 0x97, 0xf2, 0xcf, 0xce, 0xf0, 0xb4, 0xe6, 0x73,
  0x96, 0xac, 0x74, 0x22, 0xe7, 0xad, 0x35, 0x85, 0xe2, 0xf9, 0x37, 0xe8, 0x1c, 0x75, 0xdf, 0x6e,
  0x47, 0xf1, 0x1a, 0x71, 0x1d, 0x29, 0xc5, 0x89, 0x6f, 0xb7, 0x62, 0x0e, 0xaa, 0x18, 0xbe, 0x1b,
  0xfc, 0x56, 0x3e, 0x4b, 0xc6, 0xd2, 0x79, 0x20, 0x9a, 0xdb, 0xc0, 0xfe, 0x78, 0xcd, 0x5a, 0xf4,
  0x1f, 0xdd, 0xa8, 0x33, 0x88, 0x07, 0xc7, 0x31, 0xb1, 0x12, 0x10, 0x59, 0x27, 0x80, 0xec, 0x5f,
  0x60, 0x51, 0x7f, 0xa9, 0x19, 0xb5, 0x4a, 0x0d, 0x2d, 0xe5, 0x7a, 0x9f, 0x93, 0xc9, 0x9c, 0xef,
  0xa0, 0xe0, 0x3b, 0x4d, 0xae, 0x2a, 0xf5, 0xb0, 0xc8, 0xeb, 0xbb, 0x3c, 0x83, 0x53, 0x99, 0x61,
  0x17, 0x2b, 0x04, 0x7e, 0xba, 0x77, 0xd6, 0x26, 0xe1, 0x69, 0x14, 0x63, 0x55, 0x21, 0x0c, 0x7d
];

var AES_RCON = [0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
var HEX_UPPER = '0123456789ABCDEF';
var B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function extError(code, message) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function utf8Encode(str) {
  var s = String(str);
  var out = [];
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      var low = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (low >= 0xdc00 && low <= 0xdfff) {
        var cp = 0x10000 + (((c - 0xd800) << 10) | (low - 0xdc00));
        out.push(
          0xf0 | (cp >> 18),
          0x80 | ((cp >> 12) & 0x3f),
          0x80 | ((cp >> 6) & 0x3f),
          0x80 | (cp & 0x3f)
        );
        i++;
      } else {
        out.push(0xef, 0xbf, 0xbd);
      }
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      out.push(0xef, 0xbf, 0xbd);
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return new Uint8Array(out);
}

function utf8Decode(bytes) {
  var out = '';
  var i = 0;
  var len = bytes.length;
  while (i < len) {
    var b0 = bytes[i];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
      i += 1;
    } else if ((b0 & 0xe0) === 0xc0) {
      if (i + 1 >= len) {
        out += '\ufffd';
        break;
      }
      var b1 = bytes[i + 1];
      if ((b1 & 0xc0) !== 0x80 || b0 < 0xc2) {
        out += '\ufffd';
        i += 1;
      } else {
        out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
        i += 2;
      }
    } else if ((b0 & 0xf0) === 0xe0) {
      if (i + 2 >= len) {
        out += '\ufffd';
        break;
      }
      var c1 = bytes[i + 1];
      var c2 = bytes[i + 2];
      var cp3 = ((b0 & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f);
      if ((c1 & 0xc0) !== 0x80 || (c2 & 0xc0) !== 0x80 || cp3 < 0x800 || (cp3 >= 0xd800 && cp3 <= 0xdfff)) {
        out += '\ufffd';
        i += 1;
      } else {
        out += String.fromCharCode(cp3);
        i += 3;
      }
    } else if ((b0 & 0xf8) === 0xf0) {
      if (i + 3 >= len) {
        out += '\ufffd';
        break;
      }
      var d1 = bytes[i + 1];
      var d2 = bytes[i + 2];
      var d3 = bytes[i + 3];
      var cp4 = ((b0 & 0x07) << 18) | ((d1 & 0x3f) << 12) | ((d2 & 0x3f) << 6) | (d3 & 0x3f);
      if ((d1 & 0xc0) !== 0x80 || (d2 & 0xc0) !== 0x80 || (d3 & 0xc0) !== 0x80 || cp4 < 0x10000 || cp4 > 0x10ffff) {
        out += '\ufffd';
        i += 1;
      } else {
        var u = cp4 - 0x10000;
        out += String.fromCharCode(0xd800 + (u >> 10), 0xdc00 + (u & 0x3ff));
        i += 4;
      }
    } else {
      out += '\ufffd';
      i += 1;
    }
  }
  return out;
}

function base64DecodeBytes(input) {
  var clean = String(input || '').replace(/[\r\n\t\s]/g, '').replace(/-/g, '+').replace(/_/g, '/');
  if (!clean) return new Uint8Array(0);
  var pad = 0;
  if (clean.length >= 2 && clean.charAt(clean.length - 1) === '=') {
    pad++;
    if (clean.charAt(clean.length - 2) === '=') pad++;
  }
  var outLen = ((clean.length * 3) >> 2) - pad;
  if (outLen < 0) return new Uint8Array(0);
  var out = new Uint8Array(outLen);
  var o = 0;
  for (var i = 0; i < clean.length; i += 4) {
    var c0 = B64_ALPHABET.indexOf(clean.charAt(i));
    var c1 = B64_ALPHABET.indexOf(clean.charAt(i + 1));
    var ch2 = clean.charAt(i + 2);
    var ch3 = clean.charAt(i + 3);
    var c2 = ch2 === '=' || ch2 === '' ? 0 : B64_ALPHABET.indexOf(ch2);
    var c3 = ch3 === '=' || ch3 === '' ? 0 : B64_ALPHABET.indexOf(ch3);
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) {
      throw extError('NETWORK_ERROR', 'Invalid base64 payload in response.');
    }
    var n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (o < outLen) out[o++] = (n >> 16) & 0xff;
    if (o < outLen) out[o++] = (n >> 8) & 0xff;
    if (o < outLen) out[o++] = n & 0xff;
  }
  return out;
}

function bytesToUpperHex(bytes) {
  var parts = new Array(bytes.length);
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i];
    parts[i] = HEX_UPPER.charAt((b >> 4) & 0x0f) + HEX_UPPER.charAt(b & 0x0f);
  }
  return parts.join('');
}

function hexToBytes(hexStr) {
  var clean = String(hexStr || '').replace(/\s+/g, '');
  if (clean.length % 2 !== 0) {
    throw extError('NETWORK_ERROR', 'Invalid hex string length.');
  }
  var out = new Uint8Array(clean.length / 2);
  for (var i = 0; i < clean.length; i += 2) {
    var byteVal = parseInt(clean.slice(i, i + 2), 16);
    if (isNaN(byteVal)) {
      throw extError('NETWORK_ERROR', 'Invalid hex character.');
    }
    out[i / 2] = byteVal;
  }
  return out;
}

function normalizeAes128Key(keyBytes) {
  var genKey = new Uint8Array(16);
  var i;
  for (i = 0; i < 16 && i < keyBytes.length; i++) {
    genKey[i] = keyBytes[i];
  }
  for (i = 16; i < keyBytes.length; i++) {
    genKey[i % 16] ^= keyBytes[i];
  }
  return genKey;
}

function aesExpandKey128(keyBytes) {
  var k = normalizeAes128Key(keyBytes);
  var rk = new Uint8Array(176);
  var i;
  for (i = 0; i < 16; i++) {
    rk[i] = k[i];
  }
  var bytesGenerated = 16;
  var rconIdx = 0;
  var t0, t1, t2, t3;
  while (bytesGenerated < 176) {
    t0 = rk[bytesGenerated - 4];
    t1 = rk[bytesGenerated - 3];
    t2 = rk[bytesGenerated - 2];
    t3 = rk[bytesGenerated - 1];
    if (bytesGenerated % 16 === 0) {
      var tmp = t0;
      t0 = AES_SBOX[t1] ^ AES_RCON[rconIdx++];
      t1 = AES_SBOX[t2];
      t2 = AES_SBOX[t3];
      t3 = AES_SBOX[tmp];
    }
    rk[bytesGenerated] = rk[bytesGenerated - 16] ^ t0;
    rk[bytesGenerated + 1] = rk[bytesGenerated - 15] ^ t1;
    rk[bytesGenerated + 2] = rk[bytesGenerated - 14] ^ t2;
    rk[bytesGenerated + 3] = rk[bytesGenerated - 13] ^ t3;
    bytesGenerated += 4;
  }
  return rk;
}

function xtime(a) {
  return ((a << 1) ^ ((a & 0x80) ? 0x1b : 0)) & 0xff;
}

function gfMul(a, b) {
  var res = 0;
  var x = a;
  var y = b;
  for (var i = 0; i < 8; i++) {
    if (y & 1) res ^= x;
    x = xtime(x);
    y >>= 1;
  }
  return res;
}

function aesAddRoundKey(s, rk, offset) {
  for (var i = 0; i < 16; i++) {
    s[i] ^= rk[offset + i];
  }
}

function aesEncryptBlock(block, rk) {
  var s = new Uint8Array(16);
  var i;
  for (i = 0; i < 16; i++) s[i] = block[i];
  aesAddRoundKey(s, rk, 0);

  for (var round = 1; round <= 10; round++) {
    for (i = 0; i < 16; i++) s[i] = AES_SBOX[s[i]];

    var tmp = s[1];
    s[1] = s[5];
    s[5] = s[9];
    s[9] = s[13];
    s[13] = tmp;

    tmp = s[2];
    s[2] = s[10];
    s[10] = tmp;
    tmp = s[6];
    s[6] = s[14];
    s[14] = tmp;

    tmp = s[15];
    s[15] = s[11];
    s[11] = s[7];
    s[7] = s[3];
    s[3] = tmp;

    if (round < 10) {
      for (var c = 0; c < 4; c++) {
        var idx = c * 4;
        var s0 = s[idx];
        var s1 = s[idx + 1];
        var s2 = s[idx + 2];
        var s3 = s[idx + 3];
        var t = s0 ^ s1 ^ s2 ^ s3;
        s[idx] = s0 ^ t ^ xtime(s0 ^ s1);
        s[idx + 1] = s1 ^ t ^ xtime(s1 ^ s2);
        s[idx + 2] = s2 ^ t ^ xtime(s2 ^ s3);
        s[idx + 3] = s3 ^ t ^ xtime(s3 ^ s0);
      }
    }

    aesAddRoundKey(s, rk, round * 16);
  }
  return s;
}

function aesDecryptBlock(block, rk) {
  var s = new Uint8Array(16);
  var i;
  for (i = 0; i < 16; i++) s[i] = block[i];
  aesAddRoundKey(s, rk, 160);

  for (var round = 9; round >= 0; round--) {
    var tmp = s[13];
    s[13] = s[9];
    s[9] = s[5];
    s[5] = s[1];
    s[1] = tmp;

    tmp = s[2];
    s[2] = s[10];
    s[10] = tmp;
    tmp = s[6];
    s[6] = s[14];
    s[14] = tmp;

    tmp = s[3];
    s[3] = s[7];
    s[7] = s[11];
    s[11] = s[15];
    s[15] = tmp;

    for (i = 0; i < 16; i++) s[i] = AES_INV_SBOX[s[i]];

    aesAddRoundKey(s, rk, round * 16);

    if (round > 0) {
      for (var c = 0; c < 4; c++) {
        var idx = c * 4;
        var s0 = s[idx];
        var s1 = s[idx + 1];
        var s2 = s[idx + 2];
        var s3 = s[idx + 3];
        s[idx] = gfMul(s0, 0x0e) ^ gfMul(s1, 0x0b) ^ gfMul(s2, 0x0d) ^ gfMul(s3, 0x09);
        s[idx + 1] = gfMul(s0, 0x09) ^ gfMul(s1, 0x0e) ^ gfMul(s2, 0x0b) ^ gfMul(s3, 0x0d);
        s[idx + 2] = gfMul(s0, 0x0d) ^ gfMul(s1, 0x09) ^ gfMul(s2, 0x0e) ^ gfMul(s3, 0x0b);
        s[idx + 3] = gfMul(s0, 0x0b) ^ gfMul(s1, 0x0d) ^ gfMul(s2, 0x09) ^ gfMul(s3, 0x0e);
      }
    }
  }
  return s;
}

function aes128EcbEncrypt(plainBytes, keyBytes) {
  var rk = aesExpandKey128(keyBytes);
  var pad = 16 - (plainBytes.length % 16);
  var total = plainBytes.length + pad;
  var padded = new Uint8Array(total);
  var i;
  for (i = 0; i < plainBytes.length; i++) padded[i] = plainBytes[i];
  for (i = plainBytes.length; i < total; i++) padded[i] = pad;

  var out = new Uint8Array(total);
  for (var offset = 0; offset < total; offset += 16) {
    var encBlock = aesEncryptBlock(padded.subarray(offset, offset + 16), rk);
    for (i = 0; i < 16; i++) out[offset + i] = encBlock[i];
  }
  return out;
}

function aes128EcbDecrypt(cipherBytes, keyBytes) {
  if (!cipherBytes || cipherBytes.length === 0 || cipherBytes.length % 16 !== 0) {
    throw extError('NETWORK_ERROR', 'Invalid AES-128-ECB ciphertext length.');
  }
  var rk = aesExpandKey128(keyBytes);
  var out = new Uint8Array(cipherBytes.length);
  var i;
  for (var offset = 0; offset < cipherBytes.length; offset += 16) {
    var decBlock = aesDecryptBlock(cipherBytes.subarray(offset, offset + 16), rk);
    for (i = 0; i < 16; i++) out[offset + i] = decBlock[i];
  }
  var pad = out[out.length - 1];
  if (pad < 1 || pad > 16) {
    throw extError('NETWORK_ERROR', 'Invalid PKCS#7 padding in EAPI response.');
  }
  for (i = out.length - pad; i < out.length; i++) {
    if (out[i] !== pad) {
      throw extError('NETWORK_ERROR', 'Corrupted PKCS#7 padding in EAPI response.');
    }
  }
  return out.subarray(0, out.length - pad);
}

var EAPI_KEY_BYTES = utf8Encode(EAPI_KEY_STR);

function eapiEncryptPayload(ctx, apiPath, payloadJson) {
  var digest = ctx.crypto.md5('nobody' + apiPath + 'use' + payloadJson + 'md5forencrypt');
  var plaintext = apiPath + EAPI_SEPARATOR + payloadJson + EAPI_SEPARATOR + digest;
  var encrypted = aes128EcbEncrypt(utf8Encode(plaintext), EAPI_KEY_BYTES);
  return 'params=' + bytesToUpperHex(encrypted);
}

function padNum(n, width) {
  var s = String(n);
  while (s.length < width) s = '0' + s;
  return s;
}

function getClientProfile(ctx) {
  var osSetting = ctx && ctx.settings ? String(ctx.settings.get('customApiHeaderOs') || 'pc').toLowerCase() : 'pc';
  if (osSetting === 'android') {
    return {
      os: 'android',
      appver: '9.3.40',
      versioncode: '9003040',
      mobilename: 'MIX2',
      osver: '13',
      channel: 'netease',
      userAgent: 'NeteaseMusic/9.3.40.1753206443(164);Dalvik/2.1.0 (Linux; U; Android 13; MIX 2)'
    };
  }
  if (osSetting === 'ios') {
    return {
      os: 'iPhone OS',
      appver: '9.3.40',
      versioncode: '9003040',
      mobilename: 'iPhone15,2',
      osver: '17.4',
      channel: 'appstore',
      userAgent: 'NeteaseMusic/9.3.40 (iPhone; iOS 17.4; Scale/3.00)'
    };
  }
  return {
    os: 'pc',
    appver: '3.0.18.203152',
    versioncode: '140',
    mobilename: '',
    osver: '10.15.7',
    channel: 'netease',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  };
}

function getOrCreateDeviceId(ctx) {
  var existing = null;
  try {
    if (ctx && ctx.kv) existing = ctx.kv.get('netease_device_id');
  } catch (e) {
    existing = null;
  }
  if (existing && /^[0-9a-z]{16,64}$/i.test(existing)) {
    return existing;
  }
  var chars = '0123456789abcdef';
  var out = '';
  for (var i = 0; i < 32; i++) {
    out += chars.charAt(Math.floor(Math.random() * 16));
  }
  try {
    if (ctx && ctx.kv) ctx.kv.set('netease_device_id', out);
  } catch (e) {
    // Ignore kv persistence errors
  }
  return out;
}

function parseCookieString(rawCookie) {
  var map = {};
  if (!rawCookie || typeof rawCookie !== 'string') return map;
  var trimmed = rawCookie.trim();
  if (!trimmed) return map;

  if (/^cookie\s*:/i.test(trimmed)) {
    trimmed = trimmed.replace(/^cookie\s*:\s*/i, '').trim();
  }
  if (!trimmed) return map;

  if (trimmed.indexOf('=') === -1 && trimmed.indexOf(';') === -1) {
    map.MUSIC_U = trimmed;
    return map;
  }

  var parts = trimmed.split(';');
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i].trim();
    if (!part) continue;
    var eq = part.indexOf('=');
    if (eq <= 0) continue;
    var key = part.slice(0, eq).trim();
    var val = part.slice(eq + 1).trim();
    if (!key) continue;
    if (key === 'MUSIC_U' && !val) continue;
    map[key] = val;
  }
  return map;
}

function buildCookieAndHeader(ctx, rawCookie) {
  var userCookies = parseCookieString(rawCookie);
  var profile = getClientProfile(ctx);
  var nowMs = Date.now();
  var buildver = String(Math.floor(nowMs / 1000));
  var deviceId = userCookies.deviceId || getOrCreateDeviceId(ctx);
  var hasMusicU = Boolean(userCookies.MUSIC_U && String(userCookies.MUSIC_U).trim());

  var merged = {
    deviceId: deviceId,
    appver: profile.appver,
    buildver: buildver,
    resolution: '1920x1080',
    os: profile.os
  };

  var userKeys = Object.keys(userCookies);
  for (var i = 0; i < userKeys.length; i++) {
    var k = userKeys[i];
    merged[k] = userCookies[k];
  }

  if (hasMusicU) {
    merged.MUSIC_U = userCookies.MUSIC_U;
  } else if (!merged.MUSIC_A) {
    merged.MUSIC_A = DEFAULT_MUSIC_A;
  }

  var cookiePairs = [];
  var mergedKeys = Object.keys(merged);
  for (var j = 0; j < mergedKeys.length; j++) {
    var ck = mergedKeys[j];
    if (merged[ck] !== undefined && merged[ck] !== null && merged[ck] !== '') {
      cookiePairs.push(ck + '=' + String(merged[ck]));
    }
  }

  var headerObj = {
    os: profile.os,
    appver: profile.appver,
    versioncode: profile.versioncode,
    mobilename: profile.mobilename,
    buildver: buildver,
    resolution: '1920x1080',
    __csrf: merged.__csrf || '',
    osver: profile.osver,
    channel: profile.channel,
    deviceId: deviceId,
    requestId: String(nowMs) + '_' + padNum(Math.floor(Math.random() * 10000), 4)
  };
  if (hasMusicU) {
    headerObj.MUSIC_U = merged.MUSIC_U;
  } else {
    headerObj.MUSIC_A = merged.MUSIC_A;
  }

  return {
    hasUserAuth: hasMusicU,
    profile: profile,
    cookieHeader: cookiePairs.join('; '),
    eapiHeaderJson: JSON.stringify(headerObj)
  };
}

function parseEapiResponse(res) {
  var text = typeof res.text === 'string' ? res.text : '';
  var trimmed = text.trim();
  if (trimmed && (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[')) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {
      // Fall through to encrypted response check
    }
  }

  if (res.bytesBase64) {
    var cipherBytes = base64DecodeBytes(res.bytesBase64);
    if (cipherBytes.length > 0) {
      var plainBytes = aes128EcbDecrypt(cipherBytes, EAPI_KEY_BYTES);
      var decodedText = utf8Decode(plainBytes).trim();
      try {
        return JSON.parse(decodedText);
      } catch (err) {
        throw extError('NETWORK_ERROR', 'Failed to parse decrypted EAPI JSON.');
      }
    }
  }

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length >= 32 && trimmed.length % 32 === 0) {
    var hexBytes = hexToBytes(trimmed);
    var hexPlain = aes128EcbDecrypt(hexBytes, EAPI_KEY_BYTES);
    var hexDecoded = utf8Decode(hexPlain).trim();
    try {
      return JSON.parse(hexDecoded);
    } catch (err2) {
      throw extError('NETWORK_ERROR', 'Failed to parse hex-decrypted EAPI JSON.');
    }
  }

  throw extError('NETWORK_ERROR', 'Unexpected non-JSON response from NetEase API.');
}

async function callEapiWithResponse(ctx, apiPath, payloadObj, rawCookie, options) {
  var opts = options || {};
  var auth = buildCookieAndHeader(ctx, rawCookie);
  var bodyObj = {};
  var keys = Object.keys(payloadObj || {});
  for (var i = 0; i < keys.length; i++) {
    bodyObj[keys[i]] = payloadObj[keys[i]];
  }
  if (bodyObj.header === undefined) {
    bodyObj.header = auth.eapiHeaderJson;
  }
  if (opts.encryptResponse) {
    bodyObj.e_r = true;
  }

  var payloadJson = JSON.stringify(bodyObj);
  var formBody = eapiEncryptPayload(ctx, apiPath, payloadJson);
  var eapiUrl = 'https://music.163.com/eapi' + apiPath.slice(4);

  var reqSpec = {
    method: 'POST',
    url: eapiUrl,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Referer: 'https://music.163.com/',
      Origin: 'https://music.163.com',
      'User-Agent': auth.profile.userAgent,
      Accept: 'application/json',
      Cookie: auth.cookieHeader
    },
    body: formBody,
    followRedirects: true,
    timeoutMs: opts.timeoutMs || 15000
  };
  if (opts.encryptResponse) {
    reqSpec.returnBytes = true;
  }

  var res = await ctx.http.request(reqSpec);
  if (res.status === 401 || res.status === 403) {
    throw extError('AUTH_REQUIRED', 'NetEase authentication required or cookie expired.');
  }
  if (res.status === 429 || res.status === 503) {
    throw extError('RATE_LIMITED', 'Rate limited by NetEase Cloud Music.');
  }
  if (res.status >= 400) {
    throw extError('NETWORK_ERROR', 'NetEase API returned HTTP ' + String(res.status));
  }

  var parsed = parseEapiResponse(res);
  var apiCode = parsed && typeof parsed.code === 'number' ? parsed.code : 200;
  if (apiCode === 301 || apiCode === 401 || apiCode === 20001 || apiCode === 20002) {
    throw extError('AUTH_REQUIRED', 'NetEase login cookie required (code ' + String(apiCode) + ').');
  }
  if (apiCode === 405 || apiCode === 406 || apiCode === 429 || apiCode === -460 || apiCode === -462) {
    throw extError('RATE_LIMITED', 'NetEase rate limit or risk control (code ' + String(apiCode) + ').');
  }
  if (apiCode !== 200 && !opts.allowNon200) {
    throw extError('NETWORK_ERROR', 'NetEase API returned code ' + String(apiCode));
  }
  return {
    data: parsed,
    response: res
  };
}

async function callEapi(ctx, apiPath, payloadObj, rawCookie, options) {
  var result = await callEapiWithResponse(ctx, apiPath, payloadObj, rawCookie, options);
  return result.data;
}

function decodeURIComponentSafe(s) {
  try {
    return decodeURIComponent(String(s || '').replace(/\+/g, ' '));
  } catch (e) {
    return String(s || '');
  }
}

function extractFirstUrl(rawText) {
  var raw = String(rawText || '').trim();
  if (!raw) return '';
  if (/^https?:\/\/\S+$/i.test(raw)) return raw;
  var m = raw.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!m) return raw;
  return m[0].replace(/[)\],.;!?。，！？]+$/, '');
}

function parseQueryParamId(queryStr) {
  if (!queryStr) return '';
  var pairs = queryStr.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var eq = pairs[i].indexOf('=');
    var k = eq >= 0 ? decodeURIComponentSafe(pairs[i].slice(0, eq)) : decodeURIComponentSafe(pairs[i]);
    if (k === 'id') {
      var v = eq >= 0 ? decodeURIComponentSafe(pairs[i].slice(eq + 1)).trim() : '';
      if (/^\d+$/.test(v) && Number(v) > 0) return v;
    }
  }
  return '';
}

function parseNeteaseUrl(rawInput) {
  var candidate = extractFirstUrl(rawInput);
  if (!candidate) return { matched: false };

  var shortMatch = candidate.match(/^https?:\/\/(163cn\.(?:tv|link))\/([A-Za-z0-9_-]+)(?:[/?#].*)?$/i);
  if (shortMatch) {
    var shortHost = shortMatch[1].toLowerCase();
    var code = shortMatch[2];
    return {
      matched: true,
      type: 'shortlink',
      id: code,
      normalizedUrl: 'https://' + shortHost + '/' + code,
      remoteId: 'short:' + code,
      kind: 'playlist'
    };
  }

  var hostMatch = candidate.match(/^https?:\/\/(?:y\.)?music\.163\.com(?::\d+)?(\/.*)?$/i);
  if (!hostMatch) return { matched: false };

  var tail = hostMatch[1] || '/';
  if (/^\/m(?=\/|#|$)/i.test(tail)) {
    tail = tail.slice(2) || '/';
  }
  if (/^\/?#\//.test(tail)) {
    tail = tail.replace(/^\/?#/, '');
  } else if (/^\/?#/.test(tail)) {
    tail = tail.replace(/^\/?#/, '/');
  }
  if (/^\/m(?=\/|\?|$)/i.test(tail)) {
    tail = tail.slice(2) || '/';
  }

  var hashIdx = tail.indexOf('#');
  if (hashIdx >= 0) {
    tail = tail.slice(0, hashIdx);
  }

  var qIdx = tail.indexOf('?');
  var pathPart = qIdx >= 0 ? tail.slice(0, qIdx) : tail;
  var queryPart = qIdx >= 0 ? tail.slice(qIdx + 1) : '';

  var pathMatch = pathPart.match(/^\/(playlist|album|song|artist)(?:\/(\d+))?\/?$/i);
  if (!pathMatch) return { matched: false };

  var resourceType = pathMatch[1].toLowerCase();
  var resourceId = pathMatch[2] || parseQueryParamId(queryPart);
  if (!resourceId || !/^\d+$/.test(resourceId) || Number(resourceId) <= 0) {
    return { matched: false };
  }

  var kind = resourceType === 'song' ? 'track' : 'playlist';
  return {
    matched: true,
    type: resourceType,
    id: resourceId,
    normalizedUrl: 'https://music.163.com/' + resourceType + '?id=' + resourceId,
    remoteId: resourceType + ':' + resourceId,
    kind: kind
  };
}

function canHandle(input) {
  var extracted = input && input.extractedUrl ? String(input.extractedUrl) : '';
  var raw = input && input.rawText ? String(input.rawText) : '';
  var parsed = parseNeteaseUrl(extracted);
  if (!parsed.matched && raw) {
    parsed = parseNeteaseUrl(raw);
  }
  if (!parsed.matched) {
    return { matched: false };
  }
  return {
    matched: true,
    normalizedUrl: parsed.normalizedUrl,
    remoteId: parsed.remoteId,
    kind: parsed.kind
  };
}

function resolveRelativeUrl(location, baseUrl) {
  var loc = String(location || '').trim();
  if (!loc) return '';
  if (/^https?:\/\//i.test(loc)) return loc;
  var baseOriginMatch = String(baseUrl || '').match(/^(https?:\/\/[^/?#]+)/i);
  if (!baseOriginMatch) return '';
  var origin = baseOriginMatch[1];
  if (loc.indexOf('//') === 0) {
    var scheme = origin.indexOf('https://') === 0 ? 'https:' : 'http:';
    return scheme + loc;
  }
  if (loc.charAt(0) === '/') {
    return origin + loc;
  }
  return origin + '/' + loc;
}

async function resolveShortLink(ctx, shortUrl) {
  var current = shortUrl;
  for (var hop = 0; hop < 5; hop++) {
    var res = await ctx.http.request({
      method: 'GET',
      url: current,
      headers: {
        'User-Agent': getClientProfile(ctx).userAgent,
        Referer: 'https://music.163.com/'
      },
      followRedirects: false,
      timeoutMs: 12000
    });

    if (res.status >= 300 && res.status < 400 && res.headers && res.headers.location) {
      var next = resolveRelativeUrl(res.headers.location, current);
      if (!next) break;
      var check = parseNeteaseUrl(next);
      if (check.matched && check.type !== 'shortlink') {
        return check;
      }
      current = next;
      continue;
    }

    if (res.finalUrl && res.finalUrl !== current) {
      var finalCheck = parseNeteaseUrl(res.finalUrl);
      if (finalCheck.matched && finalCheck.type !== 'shortlink') {
        return finalCheck;
      }
    }

    if (res.text) {
      var htmlMatch = res.text.match(
        /https?:\/\/(?:y\.)?music\.163\.com\/(?:(#\/)?(?:m\/)?(?:playlist|album|song|artist)(?:\?[^\s"'<>]+|\/\d+))/i
      );
      if (htmlMatch) {
        var htmlCheck = parseNeteaseUrl(htmlMatch[0]);
        if (htmlCheck.matched && htmlCheck.type !== 'shortlink') {
          return htmlCheck;
        }
      }
    }
    break;
  }
  throw extError('INVALID_URL', 'Could not resolve NetEase short link.');
}

function toHttpsUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  var trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (trimmed.indexOf('//') === 0) return 'https:' + trimmed;
  if (/^http:\/\//i.test(trimmed)) return 'https://' + trimmed.slice(7);
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function extractArtistNames(raw) {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    var names = [];
    for (var i = 0; i < raw.length; i++) {
      var item = raw[i];
      var n = '';
      if (typeof item === 'string') n = item.trim();
      else if (item && typeof item === 'object' && item.name) n = String(item.name).trim();
      if (n) names.push(n);
    }
    return names.join(' / ');
  }
  if (typeof raw === 'object' && raw.name) {
    return String(raw.name).trim();
  }
  return '';
}

function sanitizeFileSegment(raw) {
  var clean = String(raw || '')
    .replace(/[\\/:*?"<>|\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return clean || 'Untitled';
}

function normalizeTrack(song, trackNumber, pathIndex, totalCount, fallbackAlbum, fallbackArtwork) {
  if (!song || song.id === undefined || song.id === null) return null;
  var idStr = String(song.id).trim();
  if (!idStr) return null;

  var title = song.name ? String(song.name).trim() : 'Untitled';
  if (!title) title = 'Untitled';
  var artist = extractArtistNames(song.ar || song.artists) || 'Unknown Artist';
  var alObj = song.al || song.album || null;
  var albumName = alObj && alObj.name ? String(alObj.name).trim() : '';
  if (!albumName) albumName = fallbackAlbum || '';

  var durationMs = typeof song.dt === 'number' ? song.dt : typeof song.duration === 'number' ? song.duration : 0;
  var durationSec = durationMs > 0 ? durationMs / 1000 : 0;

  var rawArt = alObj ? alObj.picUrl || alObj.blurPicUrl : null;
  var artworkUrl = toHttpsUrl(rawArt) || toHttpsUrl(fallbackArtwork) || null;

  var resolvedTrackNumber =
    typeof trackNumber === 'number' && trackNumber > 0
      ? trackNumber
      : typeof song.no === 'number' && song.no > 0
        ? song.no
        : null;

  var width = totalCount >= 1000 ? 4 : totalCount >= 100 ? 3 : 2;
  var seqIndex = typeof pathIndex === 'number' && pathIndex > 0 ? pathIndex : resolvedTrackNumber;
  var prefix = seqIndex !== null ? padNum(seqIndex, width) + ' - ' : '';
  var relativePath = prefix + sanitizeFileSegment(title) + '.mp3';

  return {
    remoteTrackId: idStr,
    relativePath: relativePath,
    title: title,
    artist: artist,
    album: albumName || null,
    trackNumber: resolvedTrackNumber,
    durationSec: durationSec,
    artworkUrl: artworkUrl
  };
}

async function fetchSongDetailsChunk(ctx, ids, cookie) {
  var cPayload = [];
  for (var i = 0; i < ids.length; i++) {
    cPayload.push({ id: Number(ids[i]) });
  }
  var data = await callEapi(
    ctx,
    '/api/v3/song/detail',
    { c: JSON.stringify(cPayload) },
    cookie
  );
  return Array.isArray(data && data.songs) ? data.songs : [];
}

function savePlaylistState(ctx, playlistId, stateObj) {
  try {
    if (ctx && ctx.kv) {
      ctx.kv.set('pl_state:' + playlistId, JSON.stringify(stateObj), 600);
    }
  } catch (e) {
    // Ignore KV cache errors
  }
}

function loadPlaylistState(ctx, playlistId) {
  try {
    if (!ctx || !ctx.kv) return null;
    var raw = ctx.kv.get('pl_state:' + playlistId);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

async function fetchPlaylistCollection(ctx, playlistId, cookie, cursor) {
  var CHUNK_SIZE = 200;

  if (cursor) {
    var cm = String(cursor).match(/^pl:(\d+):(\d+)$/);
    if (!cm || cm[1] !== playlistId) {
      throw extError('INVALID_URL', 'Invalid playlist pagination cursor.');
    }
    var offset = parseInt(cm[2], 10);
    var state = loadPlaylistState(ctx, playlistId);

    if (!state) {
      var fresh = await callEapi(
        ctx,
        '/api/v6/playlist/detail',
        { id: String(playlistId), t: '0', n: 1000, s: 0 },
        cookie
      );
      if (!fresh || !fresh.playlist) {
        throw extError('EMPTY_COLLECTION', 'Playlist not found or unavailable.');
      }
      var freshPl = fresh.playlist;
      var freshInline = Array.isArray(freshPl.tracks) ? freshPl.tracks : [];
      var freshInlineMap = {};
      for (var fi = 0; fi < freshInline.length; fi++) {
        if (freshInline[fi] && freshInline[fi].id != null) {
          freshInlineMap[String(freshInline[fi].id)] = true;
        }
      }
      var freshAllIds = [];
      var seenFreshAll = {};
      var rawFreshTrackIds = Array.isArray(freshPl.trackIds) ? freshPl.trackIds : [];
      for (var fj = 0; fj < rawFreshTrackIds.length; fj++) {
        var ftid = rawFreshTrackIds[fj] && rawFreshTrackIds[fj].id != null ? String(rawFreshTrackIds[fj].id) : '';
        if (ftid && /^\d+$/.test(ftid) && !seenFreshAll[ftid]) {
          seenFreshAll[ftid] = true;
          freshAllIds.push(ftid);
        }
      }
      var freshMissing = [];
      for (var fk = 0; fk < freshAllIds.length; fk++) {
        if (!freshInlineMap[freshAllIds[fk]]) freshMissing.push(freshAllIds[fk]);
      }
      state = {
        title: freshPl.name ? String(freshPl.name).trim() : 'Playlist ' + playlistId,
        coverUrl: toHttpsUrl(freshPl.coverImgUrl),
        inlineCount: freshInline.length,
        totalCount: freshAllIds.length || freshInline.length,
        allIds: freshAllIds,
        missingIds: freshMissing
      };
      savePlaylistState(ctx, playlistId, state);
    }

    var startIdx = offset >= state.inlineCount ? offset - state.inlineCount : 0;
    var chunkIds = state.missingIds.slice(startIdx, startIdx + CHUNK_SIZE);
    if (chunkIds.length === 0) {
      return {
        remoteId: 'playlist:' + playlistId,
        title: state.title,
        tracks: [],
        nextCursor: null
      };
    }

    var chunkSongs = await fetchSongDetailsChunk(ctx, chunkIds, cookie);
    var songById = {};
    for (var cs = 0; cs < chunkSongs.length; cs++) {
      if (chunkSongs[cs] && chunkSongs[cs].id != null) {
        songById[String(chunkSongs[cs].id)] = chunkSongs[cs];
      }
    }

    var posMap = {};
    for (var pi = 0; pi < state.allIds.length; pi++) {
      posMap[state.allIds[pi]] = pi + 1;
    }

    var pagedTracks = [];
    for (var ci = 0; ci < chunkIds.length; ci++) {
      var cid = chunkIds[ci];
      var sObj = songById[cid];
      if (!sObj) continue;
      var pos = posMap[cid] || offset + ci + 1;
      var norm = normalizeTrack(sObj, pos, pos, state.totalCount, state.title, state.coverUrl);
      if (norm) pagedTracks.push(norm);
    }

    var nextMissingStart = startIdx + chunkIds.length;
    var nextCur = nextMissingStart < state.missingIds.length
      ? 'pl:' + playlistId + ':' + String(state.inlineCount + nextMissingStart)
      : null;

    return {
      remoteId: 'playlist:' + playlistId,
      title: state.title,
      tracks: pagedTracks,
      nextCursor: nextCur
    };
  }

  var data = await callEapi(
    ctx,
    '/api/v6/playlist/detail',
    { id: String(playlistId), t: '0', n: 1000, s: 0 },
    cookie
  );
  if (!data || !data.playlist) {
    throw extError('EMPTY_COLLECTION', 'Playlist not found or unavailable.');
  }
  var pl = data.playlist;
  var title = pl.name ? String(pl.name).trim() : 'Playlist ' + playlistId;
  var coverUrl = toHttpsUrl(pl.coverImgUrl);

  var rawTracks = Array.isArray(pl.tracks) ? pl.tracks : [];
  var rawTrackIds = Array.isArray(pl.trackIds) ? pl.trackIds : [];

  var allIds = [];
  var seenAll = {};
  for (var i = 0; i < rawTrackIds.length; i++) {
    var tid = rawTrackIds[i] && rawTrackIds[i].id != null ? String(rawTrackIds[i].id) : '';
    if (tid && /^\d+$/.test(tid) && !seenAll[tid]) {
      seenAll[tid] = true;
      allIds.push(tid);
    }
  }

  var totalCount = allIds.length > 0 ? allIds.length : rawTracks.length;
  var posById = {};
  for (var p = 0; p < allIds.length; p++) {
    posById[allIds[p]] = p + 1;
  }

  var inlineTracks = [];
  var inlineMap = {};
  for (var j = 0; j < rawTracks.length; j++) {
    var tObj = rawTracks[j];
    if (!tObj || tObj.id == null) continue;
    var idKey = String(tObj.id);
    if (inlineMap[idKey]) continue;
    inlineMap[idKey] = true;
    var trackPos = posById[idKey] || inlineTracks.length + 1;
    var normalized = normalizeTrack(tObj, trackPos, trackPos, totalCount, title, coverUrl);
    if (normalized) inlineTracks.push(normalized);
  }

  var missingIds = [];
  for (var m = 0; m < allIds.length; m++) {
    if (!inlineMap[allIds[m]]) {
      missingIds.push(allIds[m]);
    }
  }

  if (inlineTracks.length === 0 && missingIds.length === 0) {
    if (pl.privacy === 10 && !cookie) {
      throw extError('AUTH_REQUIRED', 'Private playlist requires a NetEase cookie.');
    }
    throw extError('EMPTY_COLLECTION', 'Playlist contains no playable tracks.');
  }

  if (inlineTracks.length === 0 && missingIds.length > 0) {
    var firstChunk = missingIds.slice(0, CHUNK_SIZE);
    var fetchedSongs = await fetchSongDetailsChunk(ctx, firstChunk, cookie);
    var fetchedById = {};
    for (var fsIdx = 0; fsIdx < fetchedSongs.length; fsIdx++) {
      if (fetchedSongs[fsIdx] && fetchedSongs[fsIdx].id != null) {
        fetchedById[String(fetchedSongs[fsIdx].id)] = fetchedSongs[fsIdx];
      }
    }
    for (var fcIdx = 0; fcIdx < firstChunk.length; fcIdx++) {
      var fcid = firstChunk[fcIdx];
      var fSong = fetchedById[fcid];
      if (!fSong) continue;
      var fPos = posById[fcid] || fcIdx + 1;
      var fNorm = normalizeTrack(fSong, fPos, fPos, totalCount, title, coverUrl);
      if (fNorm) inlineTracks.push(fNorm);
    }
    if (inlineTracks.length === 0 && missingIds.length <= CHUNK_SIZE) {
      throw extError('EMPTY_COLLECTION', 'Playlist contains no playable tracks.');
    }
    if (missingIds.length > CHUNK_SIZE) {
      savePlaylistState(ctx, playlistId, {
        title: title,
        coverUrl: coverUrl,
        inlineCount: 0,
        totalCount: totalCount,
        allIds: allIds,
        missingIds: missingIds
      });
      return {
        remoteId: 'playlist:' + playlistId,
        title: title,
        tracks: inlineTracks,
        nextCursor: 'pl:' + playlistId + ':' + String(CHUNK_SIZE)
      };
    }
    return {
      remoteId: 'playlist:' + playlistId,
      title: title,
      tracks: inlineTracks,
      nextCursor: null
    };
  }

  if (missingIds.length > 0) {
    savePlaylistState(ctx, playlistId, {
      title: title,
      coverUrl: coverUrl,
      inlineCount: inlineTracks.length,
      totalCount: totalCount,
      allIds: allIds,
      missingIds: missingIds
    });
    return {
      remoteId: 'playlist:' + playlistId,
      title: title,
      tracks: inlineTracks,
      nextCursor: 'pl:' + playlistId + ':' + String(inlineTracks.length)
    };
  }

  return {
    remoteId: 'playlist:' + playlistId,
    title: title,
    tracks: inlineTracks,
    nextCursor: null
  };
}

async function fetchAlbumCollection(ctx, albumId, cookie) {
  var data = await callEapi(ctx, '/api/v1/album/' + albumId, {}, cookie);
  var albumObj = (data && data.album) || {};
  var title = albumObj.name ? String(albumObj.name).trim() : 'Album ' + albumId;
  var coverUrl = toHttpsUrl(albumObj.picUrl || albumObj.blurPicUrl);
  var rawSongs = Array.isArray(data && data.songs) ? data.songs : [];

  var tracks = [];
  for (var i = 0; i < rawSongs.length; i++) {
    var song = rawSongs[i];
    var trackNo = song && typeof song.no === 'number' && song.no > 0 ? song.no : i + 1;
    var norm = normalizeTrack(song, trackNo, i + 1, rawSongs.length, title, coverUrl);
    if (norm) tracks.push(norm);
  }
  if (tracks.length === 0) {
    throw extError('EMPTY_COLLECTION', 'Album contains no playable tracks.');
  }
  return {
    remoteId: 'album:' + albumId,
    title: title,
    tracks: tracks,
    nextCursor: null
  };
}

async function fetchSingleSongCollection(ctx, songId, cookie) {
  var songs = await fetchSongDetailsChunk(ctx, [songId], cookie);
  if (songs.length === 0) {
    throw extError('EMPTY_COLLECTION', 'Song not found.');
  }
  var norm = normalizeTrack(songs[0], 1, 1, 1, null, null);
  if (!norm) {
    throw extError('EMPTY_COLLECTION', 'Song metadata unavailable.');
  }
  return {
    remoteId: 'song:' + songId,
    title: norm.title,
    tracks: [norm],
    nextCursor: null
  };
}

async function fetchArtistCollection(ctx, artistId, cookie) {
  var data = await callEapi(ctx, '/api/v1/artist/' + artistId, {}, cookie);
  var artistObj = (data && data.artist) || {};
  var title = artistObj.name ? String(artistObj.name).trim() : 'Artist ' + artistId;
  var fallbackArt = toHttpsUrl(artistObj.picUrl || artistObj.img1v1Url);
  var rawSongs = Array.isArray(data && data.hotSongs) ? data.hotSongs : [];

  if (rawSongs.length === 0) {
    var topData = await callEapi(ctx, '/api/artist/top/song', { id: Number(artistId) }, cookie);
    rawSongs = Array.isArray(topData && topData.songs) ? topData.songs : [];
  }

  var tracks = [];
  for (var i = 0; i < rawSongs.length; i++) {
    var norm = normalizeTrack(rawSongs[i], i + 1, i + 1, rawSongs.length, title, fallbackArt);
    if (norm) tracks.push(norm);
  }
  if (tracks.length === 0) {
    throw extError('EMPTY_COLLECTION', 'Artist has no playable tracks.');
  }
  return {
    remoteId: 'artist:' + artistId,
    title: title,
    tracks: tracks,
    nextCursor: null
  };
}

async function fetchCollection(ctx, req) {
  var rawUrl = String((req && req.url) || '').trim();
  var parsed = parseNeteaseUrl(rawUrl);
  if (!parsed.matched) {
    throw extError('INVALID_URL', 'Unsupported NetEase Cloud Music URL.');
  }

  if (parsed.type === 'shortlink') {
    ctx.log.info('Resolving NetEase short link: ' + parsed.id);
    parsed = await resolveShortLink(ctx, parsed.normalizedUrl);
  }

  ctx.log.info(
    'fetchCollection ' + parsed.type + ':' + parsed.id + (req && req.cursor ? ' cursor=' + String(req.cursor) : '')
  );

  var cookie = req && req.cookie ? String(req.cookie) : null;
  if (parsed.type === 'playlist') {
    return await fetchPlaylistCollection(ctx, parsed.id, cookie, req && req.cursor ? String(req.cursor) : null);
  }
  if (parsed.type === 'album') {
    return await fetchAlbumCollection(ctx, parsed.id, cookie);
  }
  if (parsed.type === 'song') {
    return await fetchSingleSongCollection(ctx, parsed.id, cookie);
  }
  if (parsed.type === 'artist') {
    return await fetchArtistCollection(ctx, parsed.id, cookie);
  }
  throw extError('INVALID_URL', 'Unsupported NetEase resource type.');
}

var NETEASE_QUALITY_META = {
  jymaster: { label: 'Master', kbps: 2400 },
  sky: { label: 'Spatial', kbps: 1411 },
  jyeffect: { label: 'Surround', kbps: 1411 },
  hires: { label: 'Hi-Res', kbps: 1920 },
  lossless: { label: 'FLAC', kbps: 999 },
  exhigh: { label: '320k', kbps: 320 },
  higher: { label: '192k', kbps: 192 },
  standard: { label: '128k', kbps: 128 }
};

function normalizeNeteaseQuality(raw, allowHighest) {
  var q = raw ? String(raw).trim().toLowerCase() : '';
  if (!q) return '';
  if (allowHighest && q === 'highest') return 'highest';
  return Object.prototype.hasOwnProperty.call(NETEASE_QUALITY_META, q) ? q : '';
}

function levelToBitrate(level) {
  var map = {
    highest: 999000,
    standard: 128000,
    higher: 192000,
    exhigh: 320000,
    lossless: 999000,
    hires: 999000,
    jyeffect: 999000,
    sky: 999000,
    jymaster: 999000
  };
  return map[level] || 320000;
}

function resolveNeteaseQualityMeta(chosen, triedLevel, fmt, requestedQuality) {
  var actual = normalizeNeteaseQuality(chosen && chosen.level, false) ||
    normalizeNeteaseQuality(triedLevel, false);
  if (!actual) {
    var brNum = chosen && typeof chosen.br === 'number' ? chosen.br : 0;
    if (fmt && fmt.fileExtension === 'flac') actual = 'lossless';
    else if (brNum >= 320000) actual = 'exhigh';
    else if (brNum >= 192000) actual = 'higher';
    else if (brNum > 0) actual = 'standard';
    else actual = requestedQuality === 'highest' ? 'exhigh' : (normalizeNeteaseQuality(requestedQuality, false) || 'standard');
  }
  var meta = NETEASE_QUALITY_META[actual] || NETEASE_QUALITY_META.standard;
  var kbps = chosen && typeof chosen.br === 'number' && isFinite(chosen.br) && chosen.br > 0
    ? Math.max(1, Math.round(chosen.br / 1000))
    : meta.kbps;
  return {
    actualQuality: actual,
    qualityLabel: meta.label,
    bitrateKbps: kbps
  };
}

function extractUrlExtension(urlStr) {
  var withoutQuery = String(urlStr || '').split('?')[0].split('#')[0];
  var lastDot = withoutQuery.lastIndexOf('.');
  var lastSlash = withoutQuery.lastIndexOf('/');
  if (lastDot > lastSlash && lastDot !== -1) {
    return withoutQuery.slice(lastDot + 1).toLowerCase();
  }
  return '';
}

function mapFormatInfo(item) {
  var rawType = item && item.type ? String(item.type).toLowerCase().replace(/^\./, '') : '';
  var ext = rawType || extractUrlExtension(item && item.url ? item.url : '') || 'mp3';
  if (ext === 'mp4') ext = 'm4a';

  var mimeMap = {
    mp3: 'audio/mpeg',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    aac: 'audio/aac',
    ogg: 'audio/ogg',
    wav: 'audio/wav'
  };
  return {
    fileExtension: ext,
    mimeType: mimeMap[ext] || 'audio/mpeg'
  };
}

async function negotiateHttpsCdnUrl(ctx, rawUrl, userAgent) {
  var urlStr = String(rawUrl || '').trim();
  if (!urlStr) return urlStr;
  if (/^https:\/\//i.test(urlStr)) return urlStr;
  if (!/^http:\/\//i.test(urlStr)) return urlStr;

  var httpsCandidate = 'https://' + urlStr.slice(7);
  var probeHeaders = {
    Referer: 'https://music.163.com/',
    'User-Agent': userAgent
  };

  try {
    var headRes = await ctx.http.request({
      method: 'HEAD',
      url: httpsCandidate,
      headers: probeHeaders,
      followRedirects: false,
      timeoutMs: 4000
    });
    if (headRes.status >= 200 && headRes.status < 400) {
      return httpsCandidate;
    }
    if (headRes.status === 405) {
      var rangeRes = await ctx.http.request({
        method: 'GET',
        url: httpsCandidate,
        headers: {
          Referer: 'https://music.163.com/',
          'User-Agent': userAgent,
          Range: 'bytes=0-0'
        },
        followRedirects: false,
        timeoutMs: 4000
      });
      if (rangeRes.status >= 200 && rangeRes.status < 400) {
        return httpsCandidate;
      }
    }
  } catch (e) {
    // TLS failure or unreachable over HTTPS: fall back to original HTTP URL
  }
  return urlStr;
}

async function queryPlayerUrlV1(ctx, numericId, level, cookie) {
  var payload = {
    ids: [numericId],
    level: level,
    encodeType: 'flac'
  };
  if (level === 'sky') {
    payload.immerseType = 'c51';
  }
  var res = await callEapi(ctx, '/api/song/enhance/player/url/v1', payload, cookie);
  var list = Array.isArray(res && res.data) ? res.data : [];
  return list.length > 0 ? list[0] : null;
}

async function queryPlayerUrlLegacy(ctx, numericId, br, cookie) {
  var res = await callEapi(
    ctx,
    '/api/song/enhance/player/url',
    { ids: [numericId], br: br },
    cookie
  );
  var list = Array.isArray(res && res.data) ? res.data : [];
  return list.length > 0 ? list[0] : null;
}

async function resolveStream(ctx, req) {
  var rawId = String((req && req.remoteTrackId) || '').trim();
  var idMatch = rawId.match(/^(?:song:)?(\d+)$/);
  if (!idMatch || Number(idMatch[1]) <= 0) {
    throw extError('NO_PLAYABLE_STREAM', 'Invalid NetEase track ID.');
  }
  var numericId = Number(idMatch[1]);
  var cookie = req && req.cookie ? String(req.cookie) : null;
  var authInfo = buildCookieAndHeader(ctx, cookie);

  var reqQuality = normalizeNeteaseQuality(req && req.quality, true);
  var settingQuality = ctx && ctx.settings ? normalizeNeteaseQuality(ctx.settings.get('quality'), true) : '';
  var purpose = req && req.purpose ? String(req.purpose).trim().toLowerCase() : '';
  var quality = reqQuality || settingQuality || (purpose === 'download' ? 'highest' : 'standard');
  var allowTrialSetting = ctx && ctx.settings ? ctx.settings.get('allowTrialPreview') : true;
  var allowTrialPreview =
    allowTrialSetting === null || allowTrialSetting === undefined
      ? true
      : allowTrialSetting !== false && allowTrialSetting !== 'false';

  ctx.log.info('resolveStream track=' + String(numericId) + ' level=' + quality);

  var levelsToTry;
  if (quality === 'highest') {
    levelsToTry = ['jymaster', 'hires', 'lossless', 'exhigh', 'standard'];
  } else {
    levelsToTry = [quality];
    if (quality !== 'exhigh' && quality !== 'higher' && quality !== 'standard') {
      levelsToTry.push('exhigh');
    }
    if (quality !== 'standard') {
      levelsToTry.push('standard');
    }
  }

  var chosen = null;
  var triedLevel = '';
  var sawBlockedTrial = false;
  var lastNetworkErr = null;

  for (var i = 0; i < levelsToTry.length; i++) {
    var candidate = null;
    try {
      candidate = await queryPlayerUrlV1(ctx, numericId, levelsToTry[i], cookie);
    } catch (err) {
      if (err && (err.code === 'AUTH_REQUIRED' || err.code === 'RATE_LIMITED')) {
        throw err;
      }
      lastNetworkErr = err;
      continue;
    }
    if (candidate && candidate.url) {
      var isTrial = candidate.freeTrialInfo !== null && candidate.freeTrialInfo !== undefined;
      if (isTrial && !allowTrialPreview) {
        sawBlockedTrial = true;
        continue;
      }
      chosen = candidate;
      triedLevel = levelsToTry[i];
      break;
    }
  }

  if (!chosen) {
    try {
      var legacyCandidate = await queryPlayerUrlLegacy(ctx, numericId, levelToBitrate(quality), cookie);
      if (legacyCandidate && legacyCandidate.url) {
        var legacyIsTrial = legacyCandidate.freeTrialInfo !== null && legacyCandidate.freeTrialInfo !== undefined;
        if (legacyIsTrial && !allowTrialPreview) {
          sawBlockedTrial = true;
        } else {
          chosen = legacyCandidate;
        }
      }
    } catch (legacyErr) {
      if (legacyErr && (legacyErr.code === 'AUTH_REQUIRED' || legacyErr.code === 'RATE_LIMITED')) {
        throw legacyErr;
      }
      if (!lastNetworkErr) lastNetworkErr = legacyErr;
    }
  }

  if (!chosen || !chosen.url) {
    if (sawBlockedTrial) {
      throw extError('AUTH_REQUIRED', 'Track only returned a VIP trial preview and trial previews are disabled.');
    }
    if (lastNetworkErr && !sawBlockedTrial) {
      throw lastNetworkErr;
    }
    if (!authInfo.hasUserAuth) {
      throw extError('AUTH_REQUIRED', 'Track requires a NetEase Cloud Music login cookie.');
    }
    throw extError('NO_PLAYABLE_STREAM', 'No playable audio URL returned for track ' + String(numericId) + '.');
  }

  var finalUrl = await negotiateHttpsCdnUrl(ctx, chosen.url, authInfo.profile.userAgent);
  var fmt = mapFormatInfo(chosen);
  var qMeta = resolveNeteaseQualityMeta(chosen, triedLevel, fmt, quality);
  var expiSec = typeof chosen.expi === 'number' && chosen.expi > 0 ? chosen.expi : 1200;

  var out = {
    url: finalUrl,
    headers: {
      Referer: 'https://music.163.com/',
      'User-Agent': authInfo.profile.userAgent
    },
    fileExtension: fmt.fileExtension,
    mimeType: fmt.mimeType,
    expiresAtMs: Date.now() + expiSec * 1000,
    actualQuality: qMeta.actualQuality,
    qualityLabel: qMeta.qualityLabel,
    bitrateKbps: qMeta.bitrateKbps
  };
  if (typeof chosen.size === 'number' && chosen.size > 0) {
    out.contentLength = chosen.size;
  }
  return out;
}

function mapSearchTrackItem(song) {
  if (!song || song.id == null) return null;
  var title = song.name ? String(song.name).trim() : '';
  if (!title) return null;
  var artist = extractArtistNames(song.ar || song.artists) || 'Unknown Artist';
  var alObj = song.al || song.album || null;
  var albumName = alObj && alObj.name ? String(alObj.name).trim() : null;
  var durationMs = typeof song.dt === 'number' ? song.dt : typeof song.duration === 'number' ? song.duration : 0;
  var artworkUrl = toHttpsUrl(alObj ? alObj.picUrl || alObj.blurPicUrl : null);

  return {
    kind: 'track',
    remoteTrackId: String(song.id),
    title: title,
    artist: artist,
    album: albumName || null,
    durationSec: durationMs > 0 ? durationMs / 1000 : 0,
    artworkUrl: artworkUrl,
    relativePath: sanitizeFileSegment(artist + ' - ' + title) + '.mp3'
  };
}

function mapSearchPlaylistItem(pl) {
  if (!pl || pl.id == null) return null;
  var title = pl.name ? String(pl.name).trim() : '';
  if (!title) return null;
  var idStr = String(pl.id);
  var creatorName = pl.creator && pl.creator.nickname ? String(pl.creator.nickname).trim() : null;
  return {
    kind: 'playlist',
    remoteId: 'playlist:' + idStr,
    title: title,
    artist: creatorName || null,
    artworkUrl: toHttpsUrl(pl.coverImgUrl),
    sourceUrl: 'https://music.163.com/playlist?id=' + idStr,
    trackCount: typeof pl.trackCount === 'number' ? pl.trackCount : null
  };
}

function mapSearchAlbumItem(al) {
  if (!al || al.id == null) return null;
  var title = al.name ? String(al.name).trim() : '';
  if (!title) return null;
  var idStr = String(al.id);
  var artist = extractArtistNames(al.artists) || extractArtistNames(al.artist) || null;
  return {
    kind: 'album',
    remoteId: 'album:' + idStr,
    title: title,
    artist: artist,
    artworkUrl: toHttpsUrl(al.picUrl || al.blurPicUrl),
    sourceUrl: 'https://music.163.com/album?id=' + idStr,
    trackCount: typeof al.size === 'number' ? al.size : null
  };
}

async function searchSingleType(ctx, cookie, query, searchTypeNum, offset, limit) {
  var payload = {
    s: query,
    type: searchTypeNum,
    offset: offset,
    limit: limit
  };

  var res = null;
  try {
    res = await callEapi(ctx, '/api/cloudsearch/pc', payload, cookie);
  } catch (err) {
    if (err && (err.code === 'AUTH_REQUIRED' || err.code === 'RATE_LIMITED')) {
      throw err;
    }
    ctx.log.warn('cloudsearch/pc failed, trying /eapi/search/get fallback: ' + String((err && err.message) || err));
    res = await callEapi(ctx, '/api/search/get', payload, cookie);
  }

  if (!res || !res.result) {
    res = await callEapi(ctx, '/api/search/get', payload, cookie);
  }

  var result = (res && res.result) || {};
  var items = [];
  var totalCount = null;
  var rawList;
  var i;

  if (searchTypeNum === 1) {
    rawList = Array.isArray(result.songs) ? result.songs : [];
    for (i = 0; i < rawList.length; i++) {
      var tr = mapSearchTrackItem(rawList[i]);
      if (tr) items.push(tr);
    }
    if (typeof result.songCount === 'number') totalCount = result.songCount;
  } else if (searchTypeNum === 1000) {
    rawList = Array.isArray(result.playlists) ? result.playlists : [];
    for (i = 0; i < rawList.length; i++) {
      var pl = mapSearchPlaylistItem(rawList[i]);
      if (pl) items.push(pl);
    }
    if (typeof result.playlistCount === 'number') totalCount = result.playlistCount;
  } else if (searchTypeNum === 10) {
    rawList = Array.isArray(result.albums) ? result.albums : [];
    for (i = 0; i < rawList.length; i++) {
      var al = mapSearchAlbumItem(rawList[i]);
      if (al) items.push(al);
    }
    if (typeof result.albumCount === 'number') totalCount = result.albumCount;
  }

  var hasMore =
    items.length > 0 &&
    (result.hasMore === true || (totalCount !== null && offset + items.length < totalCount));

  return {
    items: items,
    hasMore: hasMore
  };
}

async function search(ctx, req) {
  var query = String((req && req.query) || '').trim();
  if (!query) {
    return { items: [], nextCursor: null };
  }

  var kind = String((req && req.kind) || 'all').toLowerCase();
  var rawLimit = Number((req && req.limit) || 20);
  var limit = Math.max(1, Math.min(50, isNaN(rawLimit) ? 20 : Math.floor(rawLimit)));
  var cookie = req && req.cookie ? String(req.cookie) : null;

  var offset = 0;
  if (req && req.cursor) {
    var cm = String(req.cursor).match(/^off:(\d+)$/);
    if (cm) offset = parseInt(cm[1], 10);
  }

  ctx.log.info('search kind=' + kind + ' offset=' + String(offset) + ' limit=' + String(limit));

  if (kind === 'track' || kind === 'playlist' || kind === 'album') {
    var typeMap = { track: 1, album: 10, playlist: 1000 };
    var single = await searchSingleType(ctx, cookie, query, typeMap[kind], offset, limit);
    return {
      items: single.items,
      nextCursor: single.hasMore ? 'off:' + String(offset + single.items.length) : null
    };
  }

  var trackLimit = limit === 1 ? 1 : limit === 2 ? 1 : Math.max(1, Math.ceil(limit * 0.5));
  var rem = Math.max(0, limit - trackLimit);
  var playlistLimit = rem === 0 ? 0 : limit === 2 ? 1 : Math.max(1, Math.ceil(rem / 2));
  var albumLimit = Math.max(0, rem - playlistLimit);

  var trackOffset = Math.floor((offset * trackLimit) / limit);
  var playlistOffset = playlistLimit > 0 ? Math.floor((offset * playlistLimit) / limit) : 0;
  var albumOffset = albumLimit > 0 ? Math.floor((offset * albumLimit) / limit) : 0;

  var combined = [];
  var anyHasMore = false;
  var errors = [];

  var trackRes = await searchSingleType(ctx, cookie, query, 1, trackOffset, trackLimit).catch(function (e) {
    errors.push(e);
    return null;
  });
  if (trackRes) {
    for (var ti = 0; ti < trackRes.items.length; ti++) combined.push(trackRes.items[ti]);
    if (trackRes.hasMore) anyHasMore = true;
  }

  if (playlistLimit > 0) {
    var playlistRes = await searchSingleType(ctx, cookie, query, 1000, playlistOffset, playlistLimit).catch(function (e) {
      errors.push(e);
      return null;
    });
    if (playlistRes) {
      for (var pi = 0; pi < playlistRes.items.length; pi++) combined.push(playlistRes.items[pi]);
      if (playlistRes.hasMore) anyHasMore = true;
    }
  }

  if (albumLimit > 0) {
    var albumRes = await searchSingleType(ctx, cookie, query, 10, albumOffset, albumLimit).catch(function (e) {
      errors.push(e);
      return null;
    });
    if (albumRes) {
      for (var ai = 0; ai < albumRes.items.length; ai++) combined.push(albumRes.items[ai]);
      if (albumRes.hasMore) anyHasMore = true;
    }
  }

  var expectedCalls = 1 + (playlistLimit > 0 ? 1 : 0) + (albumLimit > 0 ? 1 : 0);
  if (errors.length === expectedCalls && errors.length > 0) {
    throw errors[0];
  }

  return {
    items: combined,
    nextCursor: combined.length > 0 && anyHasMore ? 'off:' + String(offset + limit) : null
  };
}

function splitSetCookieHeader(rawHeader) {
  if (!rawHeader || typeof rawHeader !== 'string') return [];
  var raw = rawHeader.trim();
  if (!raw) return [];
  var parts = raw.split(/,(?=\s*[^;=,\s]+=)/);
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var seg = parts[i].trim();
    if (seg) out.push(seg);
  }
  return out;
}

function extractCookiesFromResponse(res) {
  var list = [];
  if (res && Array.isArray(res.setCookies) && res.setCookies.length > 0) {
    for (var s = 0; s < res.setCookies.length; s++) {
      var expanded = splitSetCookieHeader(res.setCookies[s]);
      for (var e = 0; e < expanded.length; e++) {
        list.push(expanded[e]);
      }
    }
  } else if (res && res.headers && typeof res.headers['set-cookie'] === 'string') {
    list = splitSetCookieHeader(res.headers['set-cookie']);
  }

  var musicU = '';
  var csrf = '';
  for (var i = 0; i < list.length; i++) {
    var entry = String(list[i] || '').trim();
    if (!entry) continue;
    var semi = entry.indexOf(';');
    var firstPair = (semi >= 0 ? entry.slice(0, semi) : entry).trim();
    var eq = firstPair.indexOf('=');
    if (eq <= 0) continue;
    var name = firstPair.slice(0, eq).trim();
    var val = firstPair.slice(eq + 1).trim();
    if (!val) continue;
    if (name === 'MUSIC_U' && !musicU) {
      musicU = val;
    } else if (name === '__csrf' && !csrf) {
      csrf = val;
    }
  }

  return {
    musicU: musicU,
    csrf: csrf
  };
}

async function startQrLogin(ctx) {
  var data = await callEapi(ctx, '/api/login/qrcode/unikey', { type: '3' }, null);
  var unikey = data && typeof data.unikey === 'string' ? data.unikey.trim() : '';
  if (!unikey) {
    throw extError('NETWORK_ERROR', 'NetEase QR unikey response missing unikey.');
  }
  ctx.log.info('started NetEase QR login session');
  return {
    sessionId: unikey,
    qrContent: 'https://music.163.com/login?codekey=' + unikey,
    pollIntervalMs: 2000,
    expiresAtMs: Date.now() + 180000
  };
}

async function pollQrLogin(ctx, req) {
  var sessionId = req && req.sessionId ? String(req.sessionId).trim() : '';
  if (!sessionId) {
    return {
      status: 'error',
      message: 'Missing QR login sessionId.'
    };
  }

  var result = await callEapiWithResponse(
    ctx,
    '/api/login/qrcode/client/login',
    { key: sessionId, type: '3' },
    null,
    { allowNon200: true }
  );
  var data = result.data || {};
  var code = typeof data.code === 'number' ? data.code : 0;

  if (code === 801) {
    return {
      status: 'pending',
      message: typeof data.message === 'string' && data.message ? data.message : undefined
    };
  }

  if (code === 802) {
    var scannedNick = typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname.trim() : '';
    return {
      status: 'scanned',
      accountName: scannedNick || undefined,
      message: typeof data.message === 'string' && data.message ? data.message : undefined
    };
  }

  if (code === 800) {
    return {
      status: 'expired',
      message: typeof data.message === 'string' && data.message ? data.message : 'QR code expired.'
    };
  }

  if (code === 803) {
    var extracted = extractCookiesFromResponse(result.response);
    if (!extracted.musicU) {
      return {
        status: 'error',
        message: 'Login confirmed, but NetEase did not return a MUSIC_U session cookie.'
      };
    }

    var cookieParts = ['MUSIC_U=' + extracted.musicU];
    if (extracted.csrf) {
      cookieParts.push('__csrf=' + extracted.csrf);
    }
    var cookieStr = cookieParts.join('; ');

    var accountName = typeof data.nickname === 'string' && data.nickname.trim() ? data.nickname.trim() : '';
    if (!accountName) {
      try {
        var accountData = await callEapi(
          ctx,
          '/api/w/nuser/account/get',
          {},
          cookieStr,
          { timeoutMs: 5000, allowNon200: true }
        );
        if (accountData && accountData.profile && typeof accountData.profile.nickname === 'string') {
          accountName = accountData.profile.nickname.trim();
        }
      } catch (e) {
        // Account profile lookup is best-effort once MUSIC_U is captured.
      }
    }

    ctx.log.info('confirmed NetEase QR login');
    return {
      status: 'confirmed',
      cookie: cookieStr,
      accountName: accountName || undefined
    };
  }

  return {
    status: 'error',
    message: typeof data.message === 'string' && data.message
      ? data.message
      : 'Unexpected QR login status code ' + String(code)
  };
}

module.exports = {
  manifest: manifest,
  canHandle: canHandle,
  fetchCollection: fetchCollection,
  resolveStream: resolveStream,
  search: search,
  startQrLogin: startQrLogin,
  pollQrLogin: pollQrLogin
};
