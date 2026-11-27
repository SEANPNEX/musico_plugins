# Musico Plugins

[![CI](https://github.com/SEANPNEX/musico_plugins/actions/workflows/ci.yml/badge.svg)](https://github.com/SEANPNEX/musico_plugins/actions/workflows/ci.yml)
[![Latest Release](https://img.shields.io/github/v/release/SEANPNEX/musico_plugins)](https://github.com/SEANPNEX/musico_plugins/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Community Musico API v1 JavaScript extensions (`.musico.js` single-file scripts and `.musicoext` bundles) compatible with **iOS / iPadOS / macOS** (`JavaScriptCore`), **Android** (`QuickJS`), and **Windows** (`Jint`).

## Quick Install — All Plugins (Unified Pack & Auto-Update)

Paste this single HTTPS URL into Musico's **Import from HTTPS URL** to install **all 4 plugins** at once:

```text
https://github.com/SEANPNEX/musico_plugins/releases/latest/download/musico-plugins-all.zip
```

- **Direct Download:** [`musico-plugins-all.zip`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/musico-plugins-all.zip) · [Latest Release](https://github.com/SEANPNEX/musico_plugins/releases/latest) · [`plugins.json`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/plugins.json) · [`SHA256SUMS.txt`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/SHA256SUMS.txt)
- **Automatic Updates:** Every extension inside `musico-plugins-all.zip` includes a manifest `updateUrl` (`https://github.com/SEANPNEX/musico_plugins/releases/latest/download/<slug>.musicoext`), so once installed, Musico automatically checks for and upgrades each plugin whenever a new release is published.

## Plugins & Direct Links

| Plugin | ID | Version | Capabilities | Search Kinds | Download / Auto-Update (`.musicoext`) | Source (`.musico.js`) | Docs |
|---|---|---|---|---|---|---|---|
| **YouTube Search** | `youtube-search` | `1.2.1` | `search`, `playlist`, `stream`, `cookie`, `web_login`, `proxy` | `track`, `playlist`, `album` | [`youtube-search.musicoext`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/youtube-search.musicoext) | [`youtube-search.musico.js`](plugins/youtube-search/youtube-search.musico.js) | [README](plugins/youtube-search/README.md) |
| **Bilibili Search** | `bilibili-search` | `1.2.1` | `search`, `playlist`, `stream`, `cookie`, `qr_login`, `proxy` | `track`, `playlist` | [`bilibili-search.musicoext`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/bilibili-search.musicoext) | [`bilibili-search.musico.js`](plugins/bilibili-search/bilibili-search.musico.js) | [README](plugins/bilibili-search/README.md) |
| **NetEase Cloud Music** | `com.seanpnex.musico.netease` | `1.2.0` | `playlist`, `stream`, `search`, `cookie`, `qr_login`, `proxy` | `track`, `playlist`, `album` | [`netease-cloud.musicoext`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/netease-cloud.musicoext) | [`netease-cloud.musico.js`](plugins/netease-cloud/netease-cloud.musico.js) | [README](plugins/netease-cloud/README.md) |
| **Apple Music** | `com.seanpnex.musico.applemusic` | `1.0.0` | `search`, `playlist`, `stream`, `lyrics`, `cookie`, `proxy` | `track`, `playlist`, `album` | [`apple-music.musicoext`](https://github.com/SEANPNEX/musico_plugins/releases/latest/download/apple-music.musicoext) | [`apple-music.musico.js`](plugins/apple-music/apple-music.musico.js) | [README](plugins/apple-music/README.md) |

Individual HTTPS URLs for Musico's **Import from HTTPS URL** (and each plugin's `updateUrl`):

```text
https://github.com/SEANPNEX/musico_plugins/releases/latest/download/youtube-search.musicoext
https://github.com/SEANPNEX/musico_plugins/releases/latest/download/bilibili-search.musicoext
https://github.com/SEANPNEX/musico_plugins/releases/latest/download/netease-cloud.musicoext
https://github.com/SEANPNEX/musico_plugins/releases/latest/download/apple-music.musicoext
```

## How to Install in Musico

You can import `musico-plugins-all.zip`, an individual `.musicoext` bundle, or a single-file `.musico.js` script:

- **iOS / iPadOS / macOS:** Open **Extensions** in the sidebar (or tap the puzzle-piece **Extensions** button in the **Folders** toolbar) → **Import from HTTPS URL…** (or **Import from File…**) → paste `musico-plugins-all.zip` or a plugin `.musicoext` URL → review permissions and tap **Approve & Enable**.
- **Android:** Open **Folders** → tap the puzzle-piece **Extensions** icon in the top bar → **Import URL** (or **Import File**) → paste/select the `.zip`, `.musicoext`, or `.musico.js` → review permissions and enable.
- **Windows:** Open **Extensions** in the left navigation pane → click **Import URL** (or **Import File…**) → paste/select the `.zip`, `.musicoext`, or `.musico.js` → review permissions and enable.

After enabling:
- **Songs** search reveals the search source switcher to search tracks, playlists, and albums (Bilibili provides `track` and `playlist` scopes for 分P multi-part videos and 合集 collections).
- **Folders → Add Cloud Folder** accepts supported YouTube, Bilibili, NetEase Cloud Music, and Apple Music URLs.

## Cookies, Audio Qualities & Settings

- **Extension Cookie:** All four plugins declare `"cookie"` and provide a masked **Extension Cookie** field inside the extension's detail screen in Musico. This cookie is sent to `search`, ephemeral search previews, and ephemeral stream playback.
- **Per-Folder Cookie Isolation:** Mounted cloud folders maintain their own per-folder cookie, which takes precedence over the extension-level cookie.
- **Audio Quality Selection (`qualities`):** All four plugins declare `qualities`, `defaultStreamQuality`, and `defaultDownloadQuality` in their manifest, honor `req.quality` and `req.purpose` (`"stream"` / `"download"`) in `resolveStream`, and return `actualQuality`, `qualityLabel`, and `bitrateKbps`.
- **YouTube Search settings:**
  - `youtubeMode` (`music` / `youtube`): Search YouTube Music (`WEB_REMIX`) or YouTube Main (`WEB`).
  - `youtubeAudioFormat` (`auto` / `m4a` / `opus`): Audio container preference (`auto` forces M4A/AAC on iOS/macOS and prefers Opus/M4A on Android/Windows).
- **Bilibili Search settings:**
  - `biliSearchOrder` (`totalrank` / `click` / `pubdate` / `stow`): Bilibili video search sort order.
- **NetEase Cloud Music settings:**
  - `quality` (`standard` / `higher` / `exhigh` / `lossless` / `hires` / `jyeffect` / `sky` / `jymaster`): Preferred stream quality tier (default `exhigh`).
  - `allowTrialPreview` (`boolean`, default `true`): Allow 30-second trial previews for VIP-gated tracks when unauthenticated/non-VIP (set `false` to raise `AUTH_REQUIRED`).
  - `customApiHeaderOs` (`pc` / `android` / `ios`, default `pc`): EAPI client OS header profile.
  - Cookie accepts either a full cookie header string (`MUSIC_U=...; ...`), a bare `MUSIC_U` token, or **Sign In with QR Code** (`qr_login`).
- **Apple Music settings:**
  - `serverUrl` (`server_url`): Base URL of your self-hosted companion server implementing the HTTP contract in [`plugins/apple-music/README.md`](plugins/apple-music/README.md).
  - `codec` (`aac-web` / `aac-he-web` / `alac` / `atmos`, default `aac-web`): Preferred audio codec.
  - If your companion server requires Bearer auth, paste the token into the extension's **Cookie** field.

## Local Development, Testing & Packaging

Requires Node.js 18+ (plus `zip` and `unzip` for `npm run pack` / `npm run build:release`). Zero npm dependencies.

```bash
# Run runner strict-VM self-tests, strict conformance checks on all plugins/*/*.musico.js,
# and all offline plugin test suites (plugins/*/*.test.mjs)
npm test

# Package each plugins/<slug>/<slug>.musico.js into dist/<slug>.musicoext
# and bundle them all into dist/musico-plugins-all.zip
npm run pack

# Validate release metadata and build dist/ with *.musicoext, musico-plugins-all.zip,
# plugins.json, SHA256SUMS.txt, and release-notes.md
npm run check:release
npm run build:release
```

Invoke hooks or strict portability checks directly via `scripts/runner.mjs`:

```bash
node scripts/runner.mjs --check plugins/youtube-search/youtube-search.musico.js
node scripts/runner.mjs --check plugins/bilibili-search/bilibili-search.musico.js
node scripts/runner.mjs plugins/youtube-search/youtube-search.musico.js can-handle "https://www.youtube.com/playlist?list=..."
node scripts/runner.mjs plugins/bilibili-search/bilibili-search.musico.js search "OST" --kind playlist --limit 10
node scripts/runner.mjs plugins/netease-cloud/netease-cloud.musico.js search "query" --kind track --limit 10
```

## CI/CD & Releases

- **CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml))**: Runs `npm test` and `npm run build:release` with SHA-256 verification on Node `20` and `22` for every push/PR to `main`, uploading `musico-plugins-dist` artifacts.
- **Unified Releases ([`.github/workflows/release.yml`](.github/workflows/release.yml))**: Runs on pushes to `main`, `v*` tags, or manual `workflow_dispatch`. Publishes a unified UTC CalVer release (`vYYYY.MM.DD`) marked `Latest` containing `musico-plugins-all.zip`, all `*.musicoext` bundles, `plugins.json`, and `SHA256SUMS.txt`, and tags any new `<slug>-v<version>`.
- **Auto-Update URLs**: Every plugin manifest sets `updateUrl` to `https://github.com/SEANPNEX/musico_plugins/releases/latest/download/<slug>.musicoext` so Musico checks against the latest unified release.

## Disclaimer

These extensions are independent community plugins for Musico and are not affiliated with, endorsed by, or sponsored by YouTube/Google, Bilibili, NetEase Cloud Music, or Apple. Users are responsible for complying with applicable laws and the terms of service of any connected platforms or self-hosted servers.

## License

Licensed under the [MIT License](LICENSE).
