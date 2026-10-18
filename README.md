# Routelette

A Vue route planner built with Nuxt 4, TypeScript, Tailwind 4 and MapLibre. The design is in [Figma](https://www.figma.com/design/AQ4efreQvchgfyRpFU7i2H). Product behavior is in [docs/spec.md](docs/spec.md).

## Run locally

Use Node.js 24 and npm.

```sh
npm install
npm run dev
```

Open `http://127.0.0.1:3000`. The Preview Bloomfield button loads the recorded routes used in Figma. You can also open `/?preview=results&theme=light`, `/?preview=results&theme=dark&expanded=1`, or `/?preview=saved`.

```sh
npm run check
npm run build
npm run preview
```

## Current stage

The first stage implements the interface, a live map, place search, route presentation, local saving and route links. Route generation uses the recorded Bloomfield fixtures in `app/data`. These fixtures show the design and exercise cancellation. They do not apply distance, surface, elevation or access costs to calculate new routes. Reversal and joint editing report that routing snapshots are required. Strava import is not connected yet.

The default preview mode is explicit in the interface. Set `NUXT_PUBLIC_FIXTURE_MODE=false` to disable recorded generation.

## Routing integration

`app/domain/planner.ts` defines the route model and `PlanningService`. The controller gives each request an identity and abort signal, retains existing results while work runs, and rejects stale results. A deliberate selection during generation restores the selected route's stored settings and geometry.

`app/map/adapter.ts` draws routes independently of the planner. After the camera settles, the main line draws for 300 ms. Alternate lines then fade in for 200 ms. Reduced motion shows the completed scene.

The next stage will implement `PlanningService` in a browser worker using versioned OSM graph snapshots for Pittsburgh and DC Metro. `app/services/graph-provider.ts` defines the static manifest and tile loading interface. Snapshots must preserve mode access, direction and turn restrictions. Live traffic and construction feeds are outside scope.

The proposed free deployment uses Vercel for Nuxt and static graph files on Cloudflare Pages. This checkout has not been deployed. No commits or pushes run automatically.
