# Musico Plugins

Private Musico API v1 JavaScript extensions (`.musico.js` single-file scripts and `.musicoext` bundle builder) compatible with **iOS / iPadOS / macOS** (`JavaScriptCore`), **Android** (`QuickJS`), and **Windows** (`Jint`).

## Plugins

| Plugin | ID | Capabilities | Entry File | Docs |
|---|---|---|---|---|
| **YouTube & Bilibili Search** | `com.seanpnex.musico.yt-bili-search` | `search`, `playlist`, `stream`, `cookie`, `proxy` | [`plugins/yt-bili-search/yt-bili-search.musico.js`](plugins/yt-bili-search/yt-bili-search.musico.js) | [`plugins/yt-bili-search/README.md`](plugins/yt-bili-search/README.md) |
| **NetEase Cloud Music** | `com.seanpnex.musico.netease` | `playlist`, `stream`, `search`, `cookie`, `proxy` | [`plugins/netease-cloud/netease-cloud.musico.js`](plugins/netease-cloud/netease-cloud.musico.js) | [`plugins/netease-cloud/README.md`](plugins/netease-cloud/README.md) |

## Installing in Musico

Single-file `*.musico.js` scripts can be imported directly into Musico without building a `.musicoext` zip archive (or run `npm run pack` to generate `.musicoext` archives under `dist/`).

- **iOS / iPadOS / macOS:** Open **Extensions** in the sidebar (or tap the puzzle-piece **Extensions** button in the **Folders** toolbar) → **Import from File…** (or **Import from HTTPS URL…**) → pick `yt-bili-search.musico.js` or `netease-cloud.musico.js` → review permissions and tap **Approve & Enable**.
- **Android:** Open **Folders** → tap the puzzle-piece **Extensions** icon in the top bar → **Import File** (or **Import URL**) → select the `.musico.js` file (or `.musicoext`) → review permissions and enable.
- **Windows:** Open **Extensions** in the left navigation pane → click **Import File…** (or paste an HTTPS URL and click **Import URL**) → select the `.musico.js` file (or `.musicoext`) → review permissions and enable.

After enabling:
- **Songs** search reveals the search source switcher to search tracks, playlists, and albums.
- **Folders → Add Cloud Folder** accepts supported YouTube, Bilibili, and NetEase URLs.

## Cookies & Settings

- **Extension Cookie:** Both plugins declare `"cookie"` and provide a masked **Extension Cookie** field inside the extension's detail screen in Musico. This cookie is sent to `search`, ephemeral search previews, and ephemeral stream playback.
- **Per-Folder Cookie Isolation:** Mounted cloud folders maintain their own per-folder cookie, which takes precedence over the extension-level cookie.
- **YouTube & Bilibili Search settings:**
  - `source` (`both` / `youtube` / `bilibili`): Active search provider(s).
  - `youtubeMode` (`music` / `youtube`): Search YouTube Music (`WEB_REMIX`) or YouTube Main (`WEB`).
  - `biliSearchOrder` (`totalrank` / `click` / `pubdate` / `stow`): Bilibili result sort order.
  - `cookieScope` (`auto` / `youtube` / `bilibili`): Disambiguate which service receives the configured cookie.
  - `youtubeAudioFormat` (`auto` / `m4a` / `opus`): Audio container preference (`auto` forces M4A/AAC on iOS/macOS and prefers Opus/M4A on Android/Windows).
- **NetEase Cloud Music settings:**
  - `quality` (`standard` / `higher` / `exhigh` / `lossless` / `hires` / `jyeffect` / `sky` / `jymaster`): Preferred stream quality tier (default `exhigh`).
  - `allowTrialPreview` (`boolean`, default `true`): Allow 30-second trial previews for VIP-gated tracks when unauthenticated/non-VIP (set `false` to raise `AUTH_REQUIRED`).
  - `customApiHeaderOs` (`pc` / `android` / `ios`, default `pc`): EAPI client OS header profile.
  - Cookie accepts either a full cookie header string (`MUSIC_U=...; ...`) or a bare `MUSIC_U` token.

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
node scripts/runner.mjs --check plugins/yt-bili-search/yt-bili-search.musico.js
node scripts/runner.mjs plugins/yt-bili-search/yt-bili-search.musico.js can-handle "https://www.youtube.com/playlist?list=..."
node scripts/runner.mjs plugins/netease-cloud/netease-cloud.musico.js search "query" --kind track --limit 10
node scripts/runner.mjs plugins/yt-bili-search/yt-bili-search.musico.js resolve-stream "yt:dQw4w9WgXcQ" --platform ios
```
