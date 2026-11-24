# NetEase Cloud Music (`com.seanpnex.musico.netease`)

Single-file Musico API v1 extension for **NetEase Cloud Music** (`music.163.com`) supporting cloud playlists, albums, artists, single songs, short links (`163cn.tv` / `163cn.link`), cloud search, and EAPI stream resolution.

> **Lyrics note:** This extension intentionally omits the `"lyrics"` capability because Musico includes built-in NetEase lyrics search.

## Features

- **URL Recognition (`canHandle`) & Collection Loading (`fetchCollection`)**
  - Playlists: `music.163.com/playlist?id=...`, `/#/playlist?id=...`, `/m/playlist?id=...`, `/playlist/<id>`, `y.music.163.com` (automatically paginates playlists with >1000 or truncated tracks via `/eapi/v3/song/detail` in 200-track chunks)
  - Albums: `/album?id=...`, `/album/<id>`
  - Single Songs: `/song?id=...`, `/song/<id>`
  - Artists (Top Songs): `/artist?id=...`, `/artist/<id>`
  - Short Links: `https://163cn.tv/<code>` and `https://163cn.link/<code>`
- **Cloud Search (`search`)**
  - Search kinds: `track`, `playlist`, `album`, and `all`
  - Uses `/eapi/cloudsearch/pc` with automatic `/eapi/search/get` fallback and `off:<n>` pagination
- **Stream Resolution (`resolveStream`)**
  - Pure portable JS AES-128-ECB + EAPI signing/decryption (zero Node/DOM globals; compatible with Apple JavaScriptCore, Android QuickJS, and Windows Jint)
  - Primary `/eapi/song/enhance/player/url/v1` with automatic quality fallback and legacy `/eapi/song/enhance/player/url` fallback
  - Upgrades returned `http://` CDN stream URLs to `https://` when TLS succeeds, falling back cleanly if a CDN edge only serves HTTP

## Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `quality` | `select` | `exhigh` | Preferred audio quality (`standard`, `higher`, `exhigh`, `lossless`, `hires`, `jyeffect`, `sky`, `jymaster`) |
| `allowTrialPreview` | `boolean` | `true` | Allow 30s VIP trial previews when the account lacks VIP (when `false`, trial-only tracks throw `AUTH_REQUIRED`) |
| `customApiHeaderOs` | `select` | `pc` | EAPI client OS profile (`pc`, `android`, `ios`) |

## Cookie Authentication

Under **Extensions -> NetEase Cloud Music -> Cookie** (or per-folder cookie on a mounted Cloud Folder), you may provide either:
- A full browser/client cookie string containing `MUSIC_U=...; ...`, **or**
- A bare raw `MUSIC_U` token (automatically wrapped as `MUSIC_U=<token>`).

Cookies are never written to extension logs.

## Testing

```bash
# Run offline unit tests & strict portability checks
node plugins/netease-cloud/netease-cloud.test.mjs

# Validate via Musico mock-runner
node /Users/sean/workspace/musicplayer/docs/extensions/tools/mock-runner.mjs plugins/netease-cloud/netease-cloud.musico.js can-handle "https://music.163.com/#/playlist?id=6792103822"
```

## QR Code Login (v1.1.0)

`netease-cloud.musico.js` v1.1.0 declares the `"qr_login"` capability and exports `startQrLogin(ctx)` and `pollQrLogin(ctx, req)`:

- Open the extension card in Musico (**Sign In with QR Code**) and scan with the NetEase Cloud Music mobile app.
- On confirmation (`803`), Musico automatically extracts and saves your private session cookie (`MUSIC_U` / `__csrf`) without logging secrets.
- Manual cookie entry remains supported as a fallback.

Test QR login hooks locally with the conformance runner:

```bash
node ../../scripts/runner.mjs ./netease-cloud.musico.js start-qr-login
node ../../scripts/runner.mjs ./netease-cloud.musico.js poll-qr-login <sessionId>
```
