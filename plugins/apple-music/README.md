# Apple Music (`com.seanpnex.musico.applemusic`)

Search songs, albums, and playlists, import Apple Music URLs, stream audio, and search synced lyrics in Musico by connecting to your own self-hosted Apple Music companion server implementing the HTTP contract below.

## Install & Auto-Update

- **Direct Extension URL (`.musicoext` / auto-update):** `https://github.com/SEANPNEX/musico_plugins/releases/latest/download/apple-music.musicoext`
- **All-in-One Bundle (`.zip`):** `https://github.com/SEANPNEX/musico_plugins/releases/latest/download/musico-plugins-all.zip`

Import either URL in Musico via **Extensions → Import from HTTPS URL** (or download and import the file). The extension manifest includes `updateUrl` pointing to the `.musicoext` link above for automatic updates.

## Settings

| Setting | Type | Default | Description |
|---|---|---|---|
| `serverUrl` | `server_url` | `""` | Base URL of your companion server (e.g. `http://127.0.0.1:8787` or `https://am.example.com`). Musico dynamically allows requests and audio streams to this exact host. |
| `codec` | `select` | `aac-web` | Preferred codec (`aac-web`, `aac-he-web`, `alac`, `atmos`). Lossless and Atmos codecs require a companion server configured with those formats enabled. |

If your companion server requires a Bearer token (`AM_SERVER_API_TOKEN`), paste the token into the extension's **Cookie** field in Musico Extension Manager.

## Audio Qualities

Defaults: `defaultStreamQuality: "aac-web"`, `defaultDownloadQuality: "aac-web"`.

`resolveStream` honors `req.quality` before `ctx.settings.get('codec')` (supporting `req.purpose: "stream" | "download"`) and returns `actualQuality`, `qualityLabel`, and `bitrateKbps`.

| ID | Label | Badge | Lossless |
|---|---|---|---|
| `aac-he-web` | HE-AAC | `HE-AAC` | — |
| `aac-web` | AAC 256k | `256k` | — |
| `alac` | ALAC Lossless | `ALAC` | `true` |
| `atmos` | Dolby Atmos | `Atmos` | — |

## Companion Server API Contract

Any server exposing these 4 endpoints works with this extension:

- `GET /v1/search?q=<query>&kind=<all|track|playlist|album>&limit=<n>&cursor=<offset>`
  - Returns `{ "items": ExtSearchResult[], "nextCursor": string | null }`.
- `GET /v1/collection?url=<apple_music_url>&cursor=<cursor>`
  - Returns `{ "remoteId": string, "title": string, "tracks": ExtTrack[], "nextCursor": string | null }`.
- `GET /v1/tracks/{remoteTrackId}/stream?codec=<codec>&refresh=<0|1>`
  - Returns playable `.m4a` (`audio/mp4`) audio streams with HTTP `Range` (`206 Partial Content`) support.
- `GET /v1/lyrics?title=<title>&artist=<artist>&album=<album>&durationSec=<sec>`
  - Returns `ExtLyricsCandidate[]` (or `404` when none found).

If `Authorization: Bearer <token>` is configured on the server, return HTTP `401` when missing/invalid.
