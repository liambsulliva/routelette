# Routelette

A Vue route planner built with Nuxt 4, TypeScript, Tailwind 4 and MapLibre. The design is in [Figma](https://www.figma.com/design/AQ4efreQvchgfyRpFU7i2H). Product behavior is in [docs/spec.md](docs/spec.md).

## Run locally

Use Node.js 24 and npm.

```sh
npm install
npm run dev
```

Routing needs the regional graph snapshot in `public/graph/`, which git ignores. Build it once before planning routes:

```sh
mkdir -p .data/osm/pbf
for state in pennsylvania district-of-columbia maryland virginia; do curl -fL -o .data/osm/pbf/$state.osm.pbf https://download.geofabrik.de/north-america/us/$state-latest.osm.pbf; done
npm run graph:build
```

The four Geofabrik extracts total about 1 GB. The build takes under a minute and writes about 80 MB of tiles.

Open `http://127.0.0.1:3000`. Set `NUXT_PUBLIC_FIXTURE_MODE=true` to bring back the Preview Bloomfield button and the recorded routes used in Figma, including `/?preview=results&theme=light`, `/?preview=results&theme=dark&expanded=1` and `/?preview=saved`.

```sh
npm run check
npm run build
npm run preview
```

## Current stage

Routes are calculated in the browser for Pittsburgh and the DC Metro area. Generation, Roll, stops, joint reshaping and legal reversal on a shared route use the regional graph snapshot. The engine also reverses result cards, but the planner has no Reverse control for them yet. Saved-route reversal, the saved-routes novelty penalty, URL persistence and Strava import are not connected yet.

## Routing

`scripts/graph/build-graph.ts` reads the PBF extracts with a small reader in `scripts/graph/pbf.ts`. It keeps routable ways, derives per-mode access, one-way rules and cost tags in `scripts/graph/tags.ts`, and keeps barrier nodes and bicycle turn restrictions. `scripts/graph/assemble.ts` splits ways at junctions and writes 0.05 degree tiles in the binary format from `app/engine/format.ts`. Coverage boxes live in `scripts/graph/regions.ts`.

`app/workers/planner.worker.ts` implements `PlanningService` off the main thread. It loads the tiles around a request, caches them in IndexedDB, and samples AWS Terrarium elevation tiles. The engine in `app/engine/` snaps points to the network, runs A* with exact handling of via-node turn restrictions, builds loops leg by leg, removes out-and-back spurs, scores 12 candidates per seed and returns up to three distinct routes.

`app/domain/planner.ts` defines the route model and `PlanningService`. The controller gives each request an identity and abort signal, retains existing results while work runs, and rejects stale results. A deliberate selection during generation restores the selected route's stored settings and geometry.

`app/map/adapter.ts` draws routes independently of the planner. After the camera settles, the main line draws for 300 ms. Alternate lines then fade in for 200 ms. Reduced motion shows the completed scene.

`tests/engine.test.ts` builds tiles from a small Bloomfield extract in `tests/fixtures/` and covers tag rules, cost multipliers, turn restrictions, loops, stops, reversal, reshaping and spur removal. `scripts/graph/extract-fixture.ts` regenerates the extract.

The proposed free deployment uses Vercel for Nuxt and static graph files on Cloudflare Pages. This checkout has not been deployed. No commits or pushes run automatically.
