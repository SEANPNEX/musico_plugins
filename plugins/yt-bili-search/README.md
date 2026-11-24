# YouTube & Bilibili Search (`com.seanpnex.musico.yt-bili-search`)

Single-file Musico API v1 extension providing combined **YouTube / YouTube Music** and **Bilibili** search, playlist/collection importing, and cross-platform audio stream resolution.

## Features

- **Cloud Search (`search`)**:
  - **YouTube Music (`WEB_REMIX`)** with automatic fallback to **YouTube Main (`WEB`)** for songs, albums, and playlists.
  - **Bilibili WBI Search** with automatic `buvid3` / WBI `mixinKey` caching, HTML tag/entity cleanup, and selectable sort order (`totalrank`, `click`, `pubdate`, `stow`).
  - **Combined Mode (`both`)**: Queries YouTube and Bilibili concurrently, interleaves tracks cleanly, handles single-source failures gracefully, and encodes stateful `v1:yt=...:bili=...` pagination cursors.
- **Collection Import (`canHandle` + `fetchCollection`)**:
  - **YouTube / YouTube Music**: Playlists (`PL...`, `OLAK5uy_...`, `UU...`), Albums (`MPREb_...`), Mixes (`RD...`), single videos, shorts, and `youtu.be` links.
  - **Bilibili**: Single & multi-part videos (`BV...` / `av...`), favlists (`fid` / `media_id` / `ml...`), space collections (`season_id`), series (`series_id`), and `b23.tv` short links.
- **Cross-Platform Stream Resolution (`resolveStream`)**:
  - **YouTube**: Multi-client Innertube fallback (`VISIONOS`, `ANDROID`, `IOS`, `ANDROID_VR`, `WEB_EMBEDDED_PLAYER`) with `visitorData` caching and bounded range probes (`bytes=0-1023`, `bytes=1048576-1049599`). Enforces **MP4/AAC-only** formats on Apple (`ios` / `macos`), while honoring `youtubeAudioFormat` (`auto`, `m4a`, `opus`) on Android & Windows.
  - **Bilibili**: WBI-signed `playurl` (with unsigned fallback), DASH audio quality priority (`30280 > 30232 > 30216 > 30251`, including Hi-Res FLAC), and `durl` fallback.

## Settings

| Key | Default | Options | Description |
|---|---|---|---|
| `source` | `both` | `both`, `youtube`, `bilibili` | Choose which platforms to search |
| `youtubeMode` | `music` | `music`, `youtube` | Use YouTube Music (`WEB_REMIX`) or YouTube Main (`WEB`) |
| `biliSearchOrder` | `totalrank` | `totalrank`, `click`, `pubdate`, `stow` | Bilibili search sort order |
| `cookieScope` | `auto` | `auto`, `youtube`, `bilibili` | Isolate extension-level cookie to the intended site |
| `youtubeAudioFormat` | `auto` | `auto`, `m4a`, `opus` | Audio format preference on non-Apple platforms (Apple always uses M4A/MP4) |

## Installation in Musico

1. Open **Musico → Extensions**.
2. Import [`yt-bili-search.musico.js`](yt-bili-search.musico.js) directly (or pack to `.musicoext` via `npm run pack`).
3. Optionally paste a YouTube or Bilibili cookie in the masked **Extension Cookie** field (credentials are never logged).

## Testing

```bash
# Offline unit + strict portability VM suite
node --test plugins/yt-bili-search/yt-bili-search.test.mjs

# Official Musico runner checks
node /Users/sean/workspace/musicplayer/docs/extensions/tools/mock-runner.mjs plugins/yt-bili-search/yt-bili-search.musico.js can-handle "https://www.youtube.com/playlist?list=PL1234567890"
```
