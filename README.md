# Spotify Playlist Generator

Daily-updated genre discovery playlists, driven by `config.yaml` and run by GitHub Actions at 04:00 UTC.

Each run, per playlist:

1. Fetches current playlist contents.
2. Diffs against the last-known state — anything you removed manually goes into `blacklist.yaml` and will never be added back.
3. Discovers candidate tracks via Spotify search (genre + year), Spotify-curated category playlists, and new releases.
4. Filters by year, popularity, and duration; drops blacklisted tracks.
5. Replaces the playlist with the top-N picks (refresh mode).

## Setup

### 1. Create a Spotify app

1. Go to https://developer.spotify.com/dashboard and create an app.
2. Add redirect URI: `http://127.0.0.1:8888/callback`.
3. Note the **Client ID** and **Client Secret**.

### 2. Get a refresh token (one-time, locally)

```sh
bun install
SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... bun run authorize
```

Visit the printed URL, approve, copy the printed `SPOTIFY_REFRESH_TOKEN`.

### 3. Configure playlists

Create the playlists in Spotify (must be owned by the authorising user). Copy each playlist ID (the part after `/playlist/` in the share URL) into `config.yaml`.

Each playlist accepts:

| field            | description                                              |
| ---------------- | -------------------------------------------------------- |
| `id`             | Spotify playlist ID                                      |
| `name`           | Label used in logs and blacklist entries                 |
| `genres`         | List of genre strings used for search/filtering          |
| `sources`        | Subset of `[search, categories, new_releases]`           |
| `filters`        | `year_from/to`, `popularity_min/max`, `duration_ms_min/max` |
| `tracks_per_run` | Overrides `defaults.tracks_per_run` (default 10)         |

### 4. GitHub Actions secrets

In your repo settings → Secrets and variables → Actions, add:

- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REFRESH_TOKEN`

### 5. Run it

- Manually: Actions tab → "Update playlists" → Run workflow.
- Locally (dry run, no writes):
  ```sh
  SPOTIFY_CLIENT_ID=... SPOTIFY_CLIENT_SECRET=... SPOTIFY_REFRESH_TOKEN=... \
    bun run start --dry-run
  ```

## How the blacklist works

After the first successful run, `state/<playlist_id>.json` records the track IDs the script just put in the playlist. On the next run, anything in that snapshot but no longer in the live playlist was removed by you — the script appends it to `blacklist.yaml` (id, name, artists, removed-at, source playlist) and never adds it again.

To un-blacklist a track, edit `blacklist.yaml` by hand.

## Schedule

Cron: `0 4 * * *` (04:00 UTC). That's 05:00 Amsterdam in winter (CET), 06:00 in summer (CEST). Adjust the cron in `.github/workflows/update.yml` if you want different DST behaviour.
