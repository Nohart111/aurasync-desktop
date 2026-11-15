# AuraSound

A hi-fi music workspace built with Next.js. Search YouTube and SoundCloud, stream or ingest tracks into a personal library, and play them through a custom audio engine with a 10-band EQ, peak limiter, spatial widener, DJ-style crossfades, synced lyrics and a queue.

## Getting started

Requires Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # then fill in the values you need
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command             | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Start the dev server (Turbopack)               |
| `npm run build`     | Production build                               |
| `npm run start`     | Serve the production build                     |
| `npm run lint`      | ESLint                                         |
| `npm run typecheck` | TypeScript type check, no output               |
| `npm test`          | Player/queue regression tests (`node --test`)  |

## Configuration

All variables are optional for local browsing; features that need them fail gracefully. See [`.env.example`](.env.example).

| Variable | Used for |
| --- | --- |
| `GITHUB_TOKEN`, `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_RELEASE_TAG` | Track storage in a GitHub repo's release assets, and triggering the cloud ingest workflow |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `NEXT_PUBLIC_R2_PUBLIC_URL` | Optional Cloudflare R2 storage |
| `SOUNDCLOUD_CLIENT_ID`, `SOUNDCLOUD_FALLBACK_CLIENT_ID` | SoundCloud search and streaming |
| `NEXT_PUBLIC_SOCKET_URL` | Listening-room sync server (defaults to `http://localhost:4000`) |

## Project layout

```
src/
  app/(desktop)/       Library and Explore pages
  app/api/             Search, stream, ingest, lyrics and storage routes
  components/          Layout, player and modal UI
  core/audio/          AudioEngine (Web Audio graph) and sound effects
  core/algorithms/     DoublyLinkedQueue and PlaylistSearchEngine
  store/               Zustand player store
  hooks/               Audio player, search and room-sync hooks
.github/workflows/     Cloud ingest workflow (yt-dlp → release assets)
data/catalog.json      Local track catalog
tests/                 Regression tests
```
