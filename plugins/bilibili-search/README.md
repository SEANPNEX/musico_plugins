# Bilibili Search (`bilibili-search`)

Single-file Musico API v1 extension providing **Bilibili** cloud search (songs, multi-part 分P videos, and 合集 `ugc_season` collections), collection importing, and audio stream resolution.

## Features

- **Cloud Search (`search`)**:
  - Searches `track` and `playlist` scopes (no `album` concept on Bilibili).
  - Supports WBI-signed `/x/web-interface/wbi/search/type` with unsigned fallback, automatic `buvid3` / WBI `mixinKey` caching, HTML tag/entity cleanup, and selectable sort order (`totalrank`, `click`, `pubdate`, `stow`).
  - **Playlist Discovery (`playlist` / `all`)**: Probes `/x/web-interface/view?bvid=<bvid>` (with `/x/player/pagelist` fallback) using `ctx.kv` cache (`blvi:<bvid>`, 24h TTL), bounded concurrency `<= 4`, and `3s` timeout:
    - **Multi-part videos (分P):** When `pages.length > 1`, emits `kind: 'playlist'` (`bili:video:<bvid>`), loading all parts via `fetchCollection`.
    - **Collections (合集 / `ugc_season`):** Emits a deduplicated `kind: 'playlist'` (`bili:season:<mid>:<seasonId>`), loading all episodes via `fetchCollection`.
- **Collection Import (`canHandle` + `fetchCollection`)**:
  - Single & multi-part videos (`BV...` / `av...`), favlists (`fid` / `media_id` / `ml...`), space collections (`season_id`), series (`series_id`), and `b23.tv` short links.
- **Stream Resolution (`resolveStream`)**:
  - WBI-signed `playurl` (with unsigned fallback), DASH audio quality selection across `30251` (Hi-Res FLAC), `30280` (192k), `30232` (132k), and `30216` (64k), and `durl` fallback.
  - Honors `req.quality` and `req.purpose` (`"download"` -> `highest`, `"stream"` -> `standard`), returning `actualQuality`, `qualityLabel`, and `bitrateKbps`.

## Audio Qualities

Defaults: `defaultStreamQuality: "standard"`, `defaultDownloadQuality: "highest"`.

| ID | Label | Badge | Lossless | Stream Priority |
|---|---|---|---|---|
| `highest` | Hi-Res / 192k | `FLAC` | `true` | `30251` → `30280` → `30232` → `30216` |
| `high` | High (192k) | `192k` | — | `30280` → `30232` → `30216` → `30251` |
| `standard` | Standard (132k) | `132k` | — | `30232` → `30280` → `30216` → `30251` |
| `low` | Low (64k) | `64k` | — | `30216` → `30232` → `30280` → `30251` |

## Settings

| Key | Default | Options | Description |
|---|---|---|---|
| `biliSearchOrder` | `totalrank` | `totalrank`, `click`, `pubdate`, `stow` | Bilibili search sort order |

## Testing

```bash
node --test plugins/bilibili-search/bilibili-search.test.mjs
node scripts/runner.mjs plugins/bilibili-search/bilibili-search.musico.js can-handle "https://www.bilibili.com/video/BV19Dq6BcEwW"
```
