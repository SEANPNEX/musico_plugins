# Musico Plugins

Private Musico API v1 JavaScript extensions (`.musico.js` single-file scripts and `.musicoext` bundle builder) compatible with **iOS / iPadOS / macOS** (`JavaScriptCore`), **Android** (`QuickJS`), and **Windows** (`Jint`).

Licensed under the [MIT License](LICENSE).

## Plugins

| Plugin | ID | Version | Capabilities | Search Kinds | Entry File | Docs |
|---|---|---|---|---|---|---|
| **YouTube Search** | `youtube-search` | `1.0.0` | `search`, `playlist`, `stream`, `cookie`, `proxy` | `track`, `playlist`, `album` | [`plugins/youtube-search/youtube-search.musico.js`](plugins/youtube-search/youtube-search.musico.js) | [`plugins/youtube-search/README.md`](plugins/youtube-search/README.md) |
| **Bilibili Search** | `bilibili-search` | `1.0.0` | `search`, `playlist`, `stream`, `cookie`, `proxy` | `track`, `playlist` | [`plugins/bilibili-search/bilibili-search.musico.js`](plugins/bilibili-search/bilibili-search.musico.js) | [`plugins/bilibili-search/README.md`](plugins/bilibili-search/README.md) |
| **NetEase Cloud Music** | `com.seanpnex.musico.netease` | `1.1.1` | `playlist`, `stream`, `search`, `cookie`, `qr_login`, `proxy` | `track`, `playlist`, `album` | [`plugins/netease-cloud/netease-cloud.musico.js`](plugins/netease-cloud/netease-cloud.musico.js) | [`plugins/netease-cloud/README.md`](plugins/netease-cloud/README.md) |

## Installing in Musico

Single-file `*.musico.js` scripts can be imported directly into Musico without building a `.musicoext` zip archive, or you can import the packaged `.musicoext` archives generated under `dist/` (or attached to private GitHub Releases). Each manifest also includes an HTTPS `updateUrl` for Musico's extension auto-update checks.

- **iOS / iPadOS / macOS:** Open **Extensions** in the sidebar (or tap the puzzle-piece **Extensions** button in the **Folders** toolbar) → **Import from File…** (or **Import from HTTPS URL…**) → pick `youtube-search`, `bilibili-search`, or `netease-cloud` → review permissions and tap **Approve & Enable**.
- **Android:** Open **Folders** → tap the puzzle-piece **Extensions** icon in the top bar → **Import File** (or **Import URL**) → select the `.musico.js` or `.musicoext` file → review permissions and enable.
- **Windows:** Open **Extensions** in the left navigation pane → click **Import File…** (or paste an HTTPS URL and click **Import URL**) → select the `.musico.js` or `.musicoext` file → review permissions and enable.

After enabling:
- **Songs** search reveals the search source switcher to search tracks, playlists, and albums (Bilibili provides `track` and `playlist` scopes for 分P multi-part videos and 合集 collections).
- **Folders → Add Cloud Folder** accepts supported YouTube, Bilibili, and NetEase URLs.

## Cookies & Settings

- **Extension Cookie:** All three plugins declare `"cookie"` and provide a masked **Extension Cookie** field inside the extension's detail screen in Musico. This cookie is sent to `search`, ephemeral search previews, and ephemeral stream playback.
- **Per-Folder Cookie Isolation:** Mounted cloud folders maintain their own per-folder cookie, which takes precedence over the extension-level cookie.
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

## Local Development & Testing

Requires Node.js 18+ (plus `zip` and `unzip` for `npm run pack`). Zero npm dependencies.

```bash
# Run runner strict-VM self-tests, strict conformance checks on all plugins/*/*.musico.js,
# and all offline plugin test suites (plugins/*/*.test.mjs)
npm test

# Package each plugins/<slug>/<slug>.musico.js into dist/<slug>.musicoext and verify via unzip -l
npm run pack
```

Invoke hooks or strict portability checks directly via `scripts/runner.mjs`:

```bash
node scripts/runner.mjs --check plugins/youtube-search/youtube-search.musico.js
node scripts/runner.mjs --check plugins/bilibili-search/bilibili-search.musico.js
node scripts/runner.mjs plugins/youtube-search/youtube-search.musico.js can-handle "https://www.youtube.com/playlist?list=..."
node scripts/runner.mjs plugins/bilibili-search/bilibili-search.musico.js search "OST" --kind playlist --limit 10
node scripts/runner.mjs plugins/netease-cloud/netease-cloud.musico.js search "query" --kind track --limit 10
```
