# YouTube Search (`youtube-search`)

Single-file Musico API v1 extension providing **YouTube / YouTube Music** cloud search, playlist/album/mix importing, and cross-platform audio stream resolution.

## Install & Auto-Update

- **Direct Extension URL (`.musicoext` / auto-update):** `https://github.com/SEANPNEX/musico_plugins/releases/latest/download/youtube-search.musicoext`
- **All-in-One Bundle (`.zip`):** `https://github.com/SEANPNEX/musico_plugins/releases/latest/download/musico-plugins-all.zip`

Import either URL in Musico via **Extensions → Import from HTTPS URL** (or download and import the file). The extension manifest includes `updateUrl` pointing to the `.musicoext` link above for automatic updates.

## Features

- **Cloud Search (`search`)**:
  - **YouTube Music (`WEB_REMIX`)** with automatic fallback to **YouTube Main (`WEB`)** for tracks (`track`), playlists (`playlist`), and albums (`album`).
  - Stateful cursor pagination with offset slicing and `ctx.kv` result caching (`ytsp:*`).
- **Collection Import (`canHandle` + `fetchCollection`)**:
  - Playlists (`PL...`, `OLAK5uy_...`, `UU...`), Albums (`MPREb_...`), Mixes (`RD...`), single videos, shorts, and `youtu.be` links.
- **Cross-Platform Stream Resolution (`resolveStream`)**:
  - Multi-client Innertube fallback (`VISIONOS`, `ANDROID`, `IOS`, `ANDROID_VR`, `WEB_EMBEDDED_PLAYER`) with `visitorData` caching and bounded range probes (`bytes=0-1023`, `bytes=1048576-1049599`).
  - Enforces **MP4/AAC-only** formats on Apple (`ios` / `macos`), while honoring `youtubeAudioFormat` (`auto`, `m4a`, `opus`) on Android & Windows.
  - Honors `req.quality` (`highest`, `high`, `standard`, `low`) and `req.purpose` (`"download"` -> `highest`, `"stream"` -> `standard`), returning `actualQuality`, `qualityLabel`, and `bitrateKbps`.

## Audio Qualities

Defaults: `defaultStreamQuality: "standard"`, `defaultDownloadQuality: "highest"`.

| ID | Label | Badge | Format Preference |
|---|---|---|---|
| `highest` | Best Available | `Best` | `141` (256k M4A) / `251` (160k Opus) |
| `high` | High | `High` | `140` / `251` |
| `standard` | Standard | `Std` | `140` (128k M4A) / `250` (70k Opus) |
| `low` | Low (Data Saver) | `Low` | `139` (48k M4A) / `249` (50k Opus) |

## Settings

| Key | Default | Options | Description |
|---|---|---|---|
| `youtubeMode` | `music` | `music`, `youtube` | Use YouTube Music (`WEB_REMIX`) or YouTube Main (`WEB`) |
| `youtubeAudioFormat` | `auto` | `auto`, `m4a`, `opus` | Audio format preference on non-Apple platforms (Apple always uses M4A/MP4) |

## Testing

```bash
node --test plugins/youtube-search/youtube-search.test.mjs
node scripts/runner.mjs plugins/youtube-search/youtube-search.musico.js can-handle "https://www.youtube.com/playlist?list=PL1234567890"
```
