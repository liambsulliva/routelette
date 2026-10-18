# Bloomfield route fixtures

These fixtures preserve the routes behind the final Routelette mockups from Claude Code session `daa500fc-aa35-4e49-8eac-5a9a4712c50c`.

`routeOptions` contains G1, E2, and W1 as Route 1, Route 2, and Route 3. `savedRoutes` contains N1, A4, B2, D1, and G1 in the order recorded in `saved.json`.

Every route has `id`, `sourceKey`, `name`, `mode`, `distanceMeters`, `gainMeters`, `start`, `geometry`, `elevationsMeters`, `displayGeometry`, `displayDistanceMeters`, `snapshot`, `turns`, `metadataUnavailable`, and `provenance`.

All geometry uses GeoJSON LineString objects with `[longitude, latitude]` coordinates in WGS84. `elevationsMeters` aligns with the original `geometry` vertices.

Use `displayGeometry` and `snapshot` for the visual review. They reproduce the final desktop mockup. The display trace removes spurs and simplifies the original trace. Its coordinates remain geographic. `snapshot` preserves the recorded distance in miles, gain in feet, and duration in minutes. `displayDistanceMeters` keeps the source algorithm's unrounded measurement after spur removal.

Use `geometry`, `distanceMeters`, `gainMeters`, and `elevationsMeters` when inspecting the original BRouter response. The original measured lengths are 2,474 m, 3,416 m, and 3,100 m. The final cards show 1.54 mi, 1.55 mi, and 1.49 mi after spur removal. The recorded elevation gains were not recalculated after spur removal. There are no fabricated elevation samples for the display trace.

Only G1 has a matching recorded cue sheet. Its street names come from the source session's final `cues.py` result. Cue distances use that script's approximate local metric. Cue geometry follows the corresponding original trace vertices. This is a design preview cue sheet. Other routes leave `turns` empty and list the missing metadata.

The source files named `route1.json`, `route2.json`, `route3.json`, and `r1steps.json` describe earlier OSRM loops near 4700 Liberty Ave. They do not match the final start at 4900 Friendship Ave and are excluded.

All original traces used BRouter's trekking profile. The `mode` field follows the mockup and saved-row metadata. It does not establish bicycle suitability.

The JSON includes source file SHA-256 hashes, recording timestamps, source identifiers, and the reasons for unavailable metadata. No network requests run when the fixtures load.

Map data comes from OpenStreetMap contributors under ODbL 1.0. Preserve the attribution and license link in the JSON. See https://www.openstreetmap.org/copyright.
