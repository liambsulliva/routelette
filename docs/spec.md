# Routelette spec

Status: decisions recorded through the design interview on 2026-10-16, the Figma overhaul on 2026-10-18, and the first implementation interview on 2026-10-18. Design lives in the [Routelette Figma file](https://www.figma.com/design/AQ4efreQvchgfyRpFU7i2H). Code follows the Figma file, not the other way around. Once tests exist, they outrank this document: where the two disagree, the tests win.

Routelette is a loop planner. Pick a start, a mode and a distance, and it finds up to three circular routes that come back to where you began. Don't like them? Roll for another set.

The name is route plus roulette.

## 0. Figma file

| Page | Contents |
|---|---|
| Cover | Index |
| Components | Icons, Logo/Mark, Logo/Lockup, IconButton, Tab, ModeSegment, SearchField, StopRow, DistanceBlock, ElevationTile, SurfacePicker, Toggle, PreferenceRow, DiceButton, RouteCard, SavedRouteRow, RouteThumb (5), StravaImportButton, PanelHeader, LegendChip, TurnRow, Legend, Footer, ErrorLine, Marker/Start, Marker/Route selected, Marker/Route unselected, Marker/Stop, Marker/Joint, Map/Bloomfield/{Light,Dark}/{Desktop,Mobile} |
| Desktop (1440×900) | Empty, Results and Saved, each in Light and Dark |
| Mobile (390×844) | Empty, Results, Bar expanded and Saved, each in Light and Dark |
| Shared route | Desktop, Light and Dark |
| Foundations, Motion | Not built yet |

**Styles, so fonts and colors can be swapped in one place.** Every text node uses a text style, and every fill and stroke uses a color style.

- Text styles are bound to the `Typography` variables `font/display` and `font/text`, so changing one variable swaps the family everywhere.
- Color styles (`Color/*`, `Map/*`) are bound to the `Color` variables, which have Light and Dark modes.
- Dark frames are clones with the `Color` collection set to Dark and the dark basemap swapped in.

**Mockup maps are real.** The basemap images are MapLibre captures of OpenFreeMap Positron (light) and Dark over Bloomfield, Pittsburgh, at @2x. The three route lines are real loops from the OSM foot router (BRouter, `trekking` profile), projected onto the captures with the same camera. The selected route's legend comes from reverse-geocoding each leg. The numbers on the cards are the measured lengths.

## 1. Visual language

- **Quiet surface, loud numbers.** Neutral charcoal and white everywhere. Copper is kept for a few things: the big numbers, the selected route (its line, marker, card outline and card text), the selected mode, the Roll button and the logo. Red is for errors only.
- **Floating panels over a full-bleed map.** The planning panel, route cards and legend float above the map with the same surface: `bg` fill, `line` hairline, `Elevation/Panel` shadow, and 16 px corners with 60% smoothing, matching macOS 27 windows.
- **Icons do the talking.** Every control leads with an icon. Text appears in labels, tooltips and numbers.

### 1.1 Color tokens

| Token | Light | Dark | Use |
|---|---|---|---|
| `bg` | `#FFFFFF` | `#16171A` | Panels, cards |
| `fg` | `#1F2124` | `#F2F1EF` | Text, icons, toggles when on, slider fill |
| `muted` | `#6B6E73` | `#9A9DA2` | Secondary text, unselected routes |
| `line` | `#E4E4E2` | `#2A2C30` | Hairlines |
| `line-strong` | `#C9CAC7` | `#3D4045` | Field borders, toggles when off |
| `hover` | `#F4F4F2` | `#1F2124` | Hover and selected-tile surface, slider track |
| `accent` | `#C85A17` | `#E0763A` | See the list above |
| `accent-text` | `#B4500F` | `#E0763A` | Copper text under 18 px |
| `inverse` | `#FFFFFF` | `#16171A` | Text and icons on copper |
| `danger` | `#C42B2B` | `#FF6B5E` | Errors and delete |

`accent` on `bg` is 4.26:1 in light mode, enough only for large or bold text, so copper text below 18 px uses `accent-text` (5.13:1).

### 1.2 Type

| Face | Role | Use |
|---|---|---|
| Sora (400, 600, 700) | `font/display` | Wordmark, headings, labels, buttons, every number |
| Instrument Sans (400, 500, italic) | `font/text` | Body text, field values, street and place names, map labels |
| Geist Mono (500) | `font/mono` | Unit suffixes and coordinates. Every suffix stays lowercase. |

Sora gives the wide letterforms. Instrument Sans stands in for Strava's body face. All three are free on Google Fonts. Sentence case everywhere. Geist Mono suffixes stay lowercase.

### 1.3 Icons

[Phosphor](https://phosphoricons.com), regular weight (MIT), through `@nuxt/icon` as `ph:*`. Glyphs are 20 px in 36 px hit areas, at 80% opacity rising to 100% on hover, with a tooltip 4 px below. The selected mode's glyph switches to `inverse` to match its label.

| Role | Phosphor name |
|---|---|
| Bike, run, walk | `person-simple-bike`, `person-simple-run`, `person-simple-walk` |
| Roll | `dice-five` |
| Locate, search | `crosshair-simple`, `magnifying-glass` |
| Add, remove, close | `plus`, `minus-circle`, `x` |
| Reverse | `arrows-counter-clockwise` |
| Save, share, delete, rename | `bookmark-simple`, `export`, `trash`, `pencil-simple` |
| Lock order, drag | `lock-simple` / `lock-simple-open`, `dots-six-vertical` |
| Start, Plan tab | `map-pin`, `map-trifold` |
| Any, Flat, Hilly, Steep, Custom | `infinity`, `minus`, `wave-sine`, `mountains`, `sliders-horizontal` |
| Paved, Mixed, Trail | `road-horizon`, `shuffle`, `tree-evergreen` |
| Distance, time | `path`, `timer` |
| Light, dark, system | `sun`, `moon`, `circle-half` |
| Reduce motion | `pause-circle` |
| Legend, expand, collapse | `list-numbers`, `caret-up`, `caret-down` |
| Turns | `arrow-up`, `arrow-up-left`, `arrow-bend-up-left`, `arrow-down-left`, the right-hand equivalents, `arrow-u-down-left`, `flag-checkered` |
| Error, info | `warning-circle`, `info` |

Units has no icon. The button shows `mi` or `km` in the mono face.

### 1.4 Spacing and shape

Spacing scale 4, 8, 12, 16, 24, 32, 48, 64. Radius 4 for controls, 16 with 60% smoothing for floating surfaces (`radius/panel`), full for chips and toggles. Floating surfaces keep 16 px from the viewport edges and from each other on desktop, 8 px on mobile. Their bottom edges line up. Focus ring 1.5 px `accent`, offset 2.

### 1.5 Logo

Placeholder: a wheel that reads as both a bike wheel and a roulette wheel. A copper ring with eight copper spokes that stop just short of a black hub. The wordmark "Routelette" in Sora Bold sits beside it, trimmed to cap height so the letters center on the hub. Center the actual wheel artwork in the lockup's 28 px mark wrapper. Its 32 px SVG sits at y = -2 px so the hub and text share a vertical center. The mark alone is the favicon.

## 2. Modes

Each route is planned for one mode. The mode sets the following:

| | Bike | Run | Walk |
|---|---|---|---|
| Default distance | 15 mi | 5 mi | 2 mi |
| Range | 5 to 60 mi | 1 to 26 mi | 0.5 to 10 mi |
| Slider step | 1 mi | 0.5 mi | 0.25 mi |
| Default pace | 12 mph | 9:30 /mi | 20:00 /mi |
| Allowed ways | Roads, cycleways, tracks. No steps, no footway unless `bicycle=yes`. | Everything walkable, including trails and paths. | Same as run. |
| Second preference | Prefer bike lanes | Prefer sidewalks | Prefer sidewalks |

Each mode also has a surface preference: Paved, Mixed (default) or Trail. Pace is edited from the time estimate on a route card and saved per mode.

Switching mode while routes are on screen regenerates them with the same seed and the new mode's settings. The distance carries over if it fits the new range, otherwise it is clamped.

Every committed change to routing settings regenerates the routes with the current seed. This includes the start, mode, distance, stops, elevation, surface and preference switches. The distance slider commits on release. Roll chooses a new seed. Selecting an existing result uses its stored geometry and settings rather than calculating another route. Joint edits update only the selected route on drop, as described in section 5.3.

## 3. Desktop layout

Full-bleed map. The planning panel floats at the left, 360 px wide, 16 px from the top, left and bottom edges.

Panel, top to bottom:

1. **Header.** Logo on the left. Icon buttons on the right: theme (light, dark, system), units (mi or km), reduce motion.
2. **Tabs.** Plan and Saved. Hover puts the light gray fill behind the label only. The active underline jumps from the current tab to the one that was clicked.
3. **Mode.** Bike, Run, Walk. The selected one is a copper pill.
4. **Start.** Search field with a locate button inside it.
5. **Stops.** Up to 5 checkpoints and "Add a stop".
6. **Distance.** Big copper number with its unit suffix, neutral slider below.
7. **Elevation.** Five tiles and a caption (section 4.5).
8. **Surface.** Paved, Mixed and Trail in matching icon tiles, directly below Elevation (section 4.6).
9. **Preferences.** Two switches, both on by default (section 4.7).
10. **Roll.** One large copper button.
11. **Footer.** "Icons by Phosphor · Map data © OpenStreetMap · Tiles by OpenFreeMap · Search by Photon".

The planning controls scroll when they exceed the available height. Roll and the footer stay fixed below them. The header and tabs stay fixed above them.

The three route cards float in a row along the bottom of the map, 16 px from the panel, with their bottom edges in line with the panel's. The legend chip sits in the top right corner and opens downward as a dropdown. MapLibre's compact attribution control stays on the map, bottom right.

### 3.1 Empty state

Before a start is set, show the map and planning controls without a floating prompt or onboarding explainer. Roll is visibly disabled. Setting a start moves the camera to it.

## 4. Planning

### 4.1 Start

Three ways to set it: type in the search field (Photon results as you type), tap the locate button (asks for location permission at that moment and never before), or click the map. While location is resolving, only the locate icon spins. Its gray hover fill stays still and stays hidden until the spinner stops. A start that lands far from any usable way snaps to the nearest one, and the panel says so: "Moved 40 ft to the nearest path."

After a start exists, clicking empty map space does nothing unless start placement is active. Clicking the Start label enters that mode. An active Add a stop action takes priority over route selection or joint placement. Otherwise, clicking the selected route adds a joint and clicking another route selects it.

### 4.2 Stops

Optional checkpoints the loop must pass through. Up to 5.

- Add one from a search result, with "Add a stop" followed by a map click, or with a long press on mobile.
- The app orders stops by bearing around the start so the loop doesn't cross itself. Drag a stop row to reorder the list, or drag its map marker to move that checkpoint. Either drag locks the order. The lock button does the same without moving a stop.
- A lock button beside the Stops heading enables manual ordering. Adding a stop from the sidebar triggers generation and the route-drawing animation through the new point.
- If the shortest loop through every stop is more than 10% over the target, Routelette shows only that loop, explains it ("Your stops need at least 7.2 mi") and disables Roll.

### 4.3 Distance

The slider covers the mode's usual range in the mode's step. The number above it is the largest thing in the panel.

Tap the number to type a distance (`DistanceBlock`, State=Editing). The number becomes a text field with a copper underline and caret. Typed values can go past the slider's range, up to a cap per mode: run 50 mi, walk 30 mi, bike 150 mi. Past the slider's range, the thumb pins to the end of the track. Enter or blur commits. Escape restores the previous value. Values below the mode's minimum clamp to it. Editing does not add helper text, and the block keeps the same height.

### 4.4 Units

Miles or kilometers, defaulting from the browser locale. Elevation follows: feet with miles, meters with kilometers. Every internal value is in meters.

### 4.5 Elevation

Gain scales with distance, so presets are rates. The options are a row of five icon tiles. A 24 px row under the picker stays in place for every option, so changing a choice does not shift the controls. Any shows "Any: Elevation is not scored". Flat, Hilly and Steep show their total gain range for the current distance.

| Option | Rate | Caption at 5 mi |
|---|---|---|
| Any (default) | Not scored | Any: Elevation is not scored |
| Flat | 20 ft/mi or less | Under 100 ft |
| Hilly | 40 to 80 ft/mi | 200 to 400 ft |
| Steep | 100 ft/mi or more | 500 ft or more |
| Custom | A total you type | Your number |

Selecting Custom reveals a gain field below the elevation picker. Commit the value inline without opening a popup.

If elevation data is unavailable, gray out the Flat, Hilly, Steep and Custom buttons and mark them "Unavailable". Any stays available. With Any selected, routes can still appear and gain reads "Unavailable", never zero. If a constrained elevation choice fails, keep the previous results and offer Retry or Any. Do not silently remove the constraint.

### 4.6 Surface

Paved, Mixed and Trail sit directly below Elevation. They reuse the elevation tile design and its neutral selection border. Align them to the first three columns of Elevation's five-column grid, with the same gaps at each panel width. The Phosphor icons are `road-horizon`, `shuffle` and `tree-evergreen`. Mixed is selected by default.

### 4.7 Preferences

Two switches, both on by default and remembered per device.

- **Avoid busy roads.** Keeps loops off arterials. Crossing them is fine.
- **Prefer sidewalks** (run, walk) or **Prefer bike lanes** (bike). The label follows the mode.

Section 9.2 covers how each one changes the cost.

### 4.8 Roll

Rolling picks a new random seed and replaces the available routes. There is no history. While generation runs, a spinner replaces the dice and the Roll label, and the button turns grey. The spinner uses the same 800 ms rotation as the Strava button. Reduced motion holds it still.

The dice and the label sit 4 px apart. On hover, the dice moves 0.25 rem left and rotates 90 degrees over 300 ms with CSS ease. It returns over the same duration when hover ends. The label stays put. Reduced motion disables the icon transform.

Existing results remain visible during generation. Clicking or tapping one cancels the pending generation, restores that result's planning settings and redraws its stored geometry from the start. Hovering does not cancel generation. The UI follows the latest deliberate selection. Cancelled or superseded work cannot replace it later. A generation failure leaves the previous results visible with the error message.

## 5. Results

### 5.1 Route cards

Up to three cards titled Route 1, 2 and 3 float in a row along the bottom of the map. Show only the available routes. Do not add duplicate cards or explain why fewer than three are available. Each shows distance as a big number, plus gain and estimated time, and a save button. A click or keyboard activation selects a card. Hovering a card, its route line, or its numbered marker fills that card with the same gray as an icon button and lightens that route's line. Hover does not change the selection. The selected card keeps a 1.5 px copper outline and copper text. Saving fills the bookmark glyph and leaves the button background clear.

Clicking a time estimate opens a small inline pace editor beside it. Save the value per mode and update time estimates from that pace. Use an inline editor rather than a popup.

### 5.2 Route lines

- Selected route: solid `accent`, 5 px.
- The other two: `muted` at 55%, 3.5 px. Hovering their card lightens that line a little. It stays 3.5 px.
- Each line has a small numbered marker at its farthest point from the start, kept clear of stop markers. Clicking a line selects it.

### 5.3 Joints

Click on or near the selected route to add a joint, then drag it. Moving the joint does not regenerate the route set or start the generation animation. On drop, update only the selected route through the joint and then update its distance. Routelette keeps the new distance and shows how far off target it is under the big number, such as "+0.6 mi over". The other routes stay unchanged. Joints are kept in the URL and in saved routes.

Preserve the selected route's joints across changes to routing settings. Roll clears the joints when it introduces a new seed.

### 5.4 Legend

Collapsed, the legend is a chip: "8 turns · 39 ft". On desktop it sits in the top right corner and drops down, with a downward chevron. On mobile it sits above the cards and opens upward, with an upward chevron. Open, it shows the selected route's elevation profile, then the turn list: turn icon, street name, distance to the next turn. Unnamed ways read as "path" or "trail" depending on their OSM tags. Hovering a step highlights that stretch on the map. Open height is at most 45% of the viewport; it scrolls past that.

### 5.5 Reverse

Calculate a legal route in the opposite direction. Check one-way streets, mode access and turn restrictions rather than reversing the coordinate array. If legality requires different geometry, use the new route and show an informational toast: "Route adjusted to follow road rules." Update the distance and turns from the calculated result. The line redraws from the start in its new direction.

## 6. Saved routes

The Saved tab replaces the planning controls in the panel. A header gives the count ("5 saved routes") and says where they live ("Saved on this device only."). Below it, one row per saved route, newest first.

Each row (`SavedRouteRow`) shows:

- **Thumbnail.** A 40 px tile with the route's real shape.
- **Name.** In `Title`.
- **Specs.** The mode icon, then distance, gain and estimated time as `Number/S` values with mono unit suffixes. The time uses the pace saved for that mode.

Clicking a row selects it. The map then shows that route alone, in copper, with its start marker and legend chip ("16 turns · 115 ft"). No result cards appear in this tab.

- **Selected row.** Copper outline, copper name and numbers, copper thumbnail line, plus a row of icon buttons with tooltips: Rename, Reverse, Share, Delete. Delete is the only red control.
- **Name.** Defaults to the street the route spends the most distance on, plus "loop": "Kincaid St loop". Renaming edits the name in place ("Saturday long run").
- **Delete.** Removes the row at once and leaves a gray placeholder in its place ("Cedarville St loop deleted", with Undo) for 5 seconds.
- **Mobile.** The bar opens to half height so the selected route stays visible above it; the list scrolls.
- **Storage.** IndexedDB on this device only. No accounts. A saved route keeps its geometry, not its seed, so later changes to the map data don't alter it. A legal reverse can change the geometry, so retain the original and the calculated reverse rather than storing only a direction flag.

Saved routes also nudge new results somewhere new: candidates that reuse roads from saved routes rank lower. There is no toggle for this.

### 6.1 Import from Strava

A one-time import of recent loops from Strava. It doesn't stay connected and doesn't sync.

**Button.** "IMPORT FROM STRAVA" is a full-width copper button pinned to the bottom of the Saved list (`StravaImportButton`):

- **Default:** "IMPORT FROM" in uppercase Sora SemiBold, followed by the Strava wordmark. Both use the inverse color on copper, white in light mode and `#16171A` in dark mode. The corner radius is 4 px. The label and wordmark align on their baselines with a 6 px gap. The layout follows Strava's Connect button. The colors match Routelette.
- **Loading:** a spinner in place of the label. It appears on tap and stays through the Strava sign-in and back, until the import finishes. The spinner turns every 800 ms. With reduced motion on, it holds still.
- **Done:** a checkmark for 2 s, then back to Default.

Imported loops join the list as ordinary saved routes.

**Flow.**

1. Tap the button. `GET /api/strava/start` sets a short-lived httpOnly `state` cookie and redirects to `https://www.strava.com/oauth/authorize` with `response_type=code`, `scope=activity:read`, `approval_prompt=auto` and a `redirect_uri` back to `/saved`.
2. Strava sends the user back with `code`, `scope` and `state`, or with `error=access_denied`. The Saved tab reopens with the button in Loading and posts the code to `POST /api/strava/import`.
3. That server route checks `state`, exchanges the code at `https://www.strava.com/oauth/token`, and reads `GET /athlete/activities?per_page=100` (one request). It then revokes the token at `https://www.strava.com/oauth/revoke` and returns the loops it found. No Strava token is stored anywhere: not in a cookie, a database or the browser.
4. The browser saves the loops to IndexedDB and the button shows Done.

**Scope.** Public data only: `activity:read`. Activities visible only to the athlete are not imported, and Strava trims each activity's start and end inside the athlete's privacy zones. If the user unticks the scope on Strava's consent screen, the returned `scope` lacks `activity:read`. The button then returns to Default and the panel shows: "Strava didn't share your activities, so nothing was imported."

**Which activities become saved routes.**

- **Mode:** `sport_type` Run and TrailRun → Run; Walk and Hike → Walk; Ride, GravelRide, MountainBikeRide, EBikeRide and EMountainBikeRide → Bike. Everything else, and every Virtual type, is skipped.
- **Shape:** activities with no `map.summary_polyline` are skipped.
- **Loops only:** the end must be within 200 m of the start. Because privacy zones trim both ends, a gap of up to 1 km also counts when it is under 15% of the activity's distance. The engine then closes the gap with the shortest walkable or rideable path.
- **No duplicates:** an activity already imported, matched by its Strava id, is skipped, including one the user deleted afterwards.

**What a saved import keeps.** The decoded summary polyline, `distance`, `total_elevation_gain`, the mapped mode, the Strava activity name ("Morning Run") and the Strava activity id. Time is computed from the user's pace for that mode, not taken from Strava. Imported rows show a small muted "Strava" tag after their specs. Otherwise they behave like any saved route: rename, reverse, share and delete all work, and edits are local.

**Results.**

- Found loops: the button shows Done and the header count updates.
- No loops: "No loops in your last 100 Strava activities." Nothing changes.
- Strava unreachable or rate-limited (HTTP 429): "Strava isn't responding. Try again in a few minutes." with Retry.

**Limits and terms.**

- Each import uses 2 Strava requests (the token exchange and one activities read) plus a revoke call. The read limit is 100 per 15 minutes and 1,000 per day per app.
- New Strava API apps start in single-player mode (only the developer's account can connect). A self-service upgrade raises that to 10 athletes; more needs Strava's review. Creating an API app requires a Strava subscription.
- The Strava API Agreement allows a user's Strava data to be shown only to that user, which matches local-only storage. It also bars apps that *"compete with or replicate Strava functionality"*. Revisit that clause before applying for review.
- Strava's brand rules are optional here. The official Connect with Strava button and the "Powered by Strava" logo carry rules only if an app chooses to use them, and Routelette uses neither. The button does show the Strava wordmark, so the guidelines apply to it: white only (or black or Strava orange), unmodified, never animated, never part of the app icon, and no more prominent than Routelette's own name.

## 7. Sharing

Only routes are shared, never a planning session. Share opens the system share sheet (or copies the link) with a read-only link: `/r#<encoded polyline and stats>`. The page shows that one route on the map with its legend. The panel has no tabs. It shows a "Shared route" label, the route name, the mode and area, big copper distance, gain and time, and one line of context ("A loop from 4900 Friendship Ave."). At the bottom are a copper "Plan your own" button, which opens the planner at the same start and mode, and outline buttons for Copy link and Reverse. Nothing is stored on a server; the link carries the route.

## 8. Mobile (below 768 px)

Full-bleed map with floating surfaces inset 8 px.

- **Header:** a floating bar at the top with the logo and the three header buttons.
- **Bottom bar, collapsed:** mode, distance and Roll in one row. Before a start is set, it also shows the search field. Do not add onboarding explainer text.
- **Route cards:** a row above the bar that scrolls sideways.
- **Bottom bar, expanded:** the full panel, including Preferences. It expands only when tapped, never on its own.
- **Legend:** a chip above the cards that opens upward when tapped.
- **Stops:** long press the map to add one.

Only one mobile panel expands at a time. Opening the planning sheet closes the legend. The sheet opens and closes over about 250 ms, with a restrained spring. Opening either panel leaves the camera still. The next route fit accounts for the open panel. The expanded sheet scrolls its planning controls and keeps Roll fixed below them.

## 9. Routing engine

### 9.1 Graph

Launch coverage is Pittsburgh and the DC Metro area. Keep coverage configurable so more regions can be added later. The exact routing boundaries belong to the regional graph data, and the UI must not imply coverage beyond them.

A replaceable graph provider supplies versioned fixed tiles with node coordinates, routing tags, street names and restrictions. The browser caches tiles in IndexedDB. The worker asks for tiles as the search grows, so a 60 mi bike loop never needs one giant query.

Prepare regional OSM graph snapshots ahead of time and serve their versioned tiles as static files. Routes are calculated in the browser worker from those graph snapshots. Live construction, traffic and continuously updated infrastructure are outside the project scope. A persistent Overpass server is not required.

Keep graph access behind a replaceable provider. Each planning request uses one manifest version and fetches immutable tile URLs from that version. Preserve data age and coverage metadata. Build the complete regional network, including cross-tile turn restrictions, before splitting it into browser tiles. An owned live graph provider can be added later without changing route controls or worker messages.

Kept tags: `highway`, `surface`, `access`, `foot`, `bicycle`, `sidewalk`, `sidewalk:left`, `sidewalk:right`, `sidewalk:both`, `footway`, `cycleway`, `cycleway:left`, `cycleway:right`, `cycleway:both`, `bicycle_road`, `lit`, `maxspeed`, `lanes`, `name`.

Also retain ordered way nodes and original way IDs, direction tags including `oneway`, `oneway:bicycle`, `oneway:foot` and `junction`, access hierarchy tags including `vehicle`, and directional or conditional access variants. Keep tagged barrier nodes and their access rules. Fetch turn-restriction relations with their ordered members, via nodes or ways, mode exceptions and conditional restrictions. Tile boundaries must preserve the information needed to resolve those relations. Routing results record graph coverage and data age so missing graph data cannot be mistaken for no available route.

**Snapshot build.** `npm run graph:build` reads Geofabrik PBF extracts (Pennsylvania for Pittsburgh; DC, Maryland and Virginia for the DC Metro area) because the public Overpass server rejects bulk automated queries. The launch boxes are lon -80.20 to -79.75, lat 40.30 to 40.62 for Pittsburgh and lon -77.40 to -76.80, lat 38.70 to 39.15 for DC Metro. Ways split at junctions, barriers and restriction via nodes. Tiles are 0.05 degrees square, and each edge lives in the tile of its first node. The build derives per-mode access and direction, cost flags and barrier rules from the tags above. Turn restrictions apply to bicycles only, honoring `restriction:bicycle` and `except=bicycle`. Conditional restrictions are not applied. The first build is 237 tiles and 78.5 MB.

### 9.2 Cost

Edge cost is length × a mode multiplier. The multiplier is built from highway type, surface and access, then the two preferences, then the surface preference.

**Avoid busy roads** (on by default):

| `highway` | On | Off |
|---|---|---|
| `motorway`, `trunk` | Excluded | Excluded |
| `primary` | ×4 | ×1.2 |
| `secondary` | ×2.5 | ×1.1 |
| `tertiary` | ×1.4 | ×1 |
| Residential, service, paths | ×1 | ×1 |

`maxspeed` above 35 mph and `lanes` of 4 or more add ×1.3 each while the switch is on.

**Prefer sidewalks** (run and walk, on by default):

- ×0.8 for a road with `sidewalk=both|left|right|separate` or a `sidewalk:*` side tag set to yes or separate.
- ×0.75 for `highway=footway` (including `footway=sidewalk`), `pedestrian`, `living_street` and `path` with foot access.
- ×1.6 for a road tagged `sidewalk=no` that isn't residential or living street.
- Off: all of these are ×1.

**Prefer bike lanes** (bike, on by default):

- ×0.7 for `highway=cycleway`, `cycleway=track` (or a side variant) and `bicycle_road=yes`.
- ×0.8 for `cycleway=lane` (or a side variant) and `bicycle=designated`.
- ×0.95 for `cycleway=shared_lane`.
- ×1.5 for `primary` or `secondary` roads with no cycleway tag.
- Off: all of these are ×1.

Elevation adds a grade term: Flat penalizes climbing, Steep rewards it. The A* heuristic is straight-line distance scaled by the smallest multiplier the profile can produce, so it stays admissible.

### 9.3 Loops

A* finds paths between two points, so loops are built from legs:

1. Place 2 to 4 waypoints on a rough circle whose perimeter matches the target. Stops replace waypoints and fix the polygon's shape.
2. Snap each waypoint to the graph. Snap to corners, not mid-block, because a mid-block waypoint makes the loop walk to it and turn back.
3. Run A* leg by leg, start to start. Edges already used in this loop get a penalty, so legs don't retrace each other.
4. Remove out-and-back spurs: any stretch that leaves a point and returns to it while enclosing almost no area.
5. Scale the radius and retry until the total lands within ±10%.

Spur removal also catches an out-and-back that returns on a parallel way, such as up one sidewalk and back down the other. Stops, starts and generated waypoints snap only to the largest connected part of the network. An unnamed sidewalk takes the name of the street beside it in the turn list.

Reverse and joint edits route through anchor junctions along the existing line, and roads on that line cost 35% of normal, so the result stays on it wherever the rules allow.

Each seed produces 12 candidates. Score each by distance error, overlap and out-and-back stretches, the mode's cost, elevation fit, and overlap with the other picks. Then re-rank on this device using the saved-routes novelty penalty and keep up to 3 distinct routes. If only one or two qualify, return those without a limited-results explanation.

The seeded generator makes results repeatable: same start, settings, seed and map data, same routes. The URL carries all of that so a reload restores the screen. Map data can change between visits, so this is close, not exact, and that is acceptable.

Design-time note: with both preferences on, quiet loops from 4900 Friendship Ave came out at about 1.5 mi per neighborhood quadrant (Garfield, Friendship, west Bloomfield). Longer targets will mostly come from loops that cross a neighborhood boundary, so overlap with the other picks matters more there.

### 9.4 Elevation

AWS Terrarium DEM tiles, sampled in the worker every 20 m along a route. Gain is smoothed with a small threshold so noise doesn't inflate it.

## 10. Map and data

- **Renderer:** MapLibre GL JS behind a small `MapAdapter` interface, written by us, so tests can swap in a fake.
- **Tiles:** OpenFreeMap. Positron for light, Dark for dark, recolored toward the `Map/*` tokens.
- **Search:** Photon, through a server route that debounces, caches and allows swapping providers later. Reverse geocoding goes through the same route and also names the legs in the turn list.

## 11. Motion

Shared with the personal site and Kingdra:

- `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)` and `--ease-spring: cubic-bezier(0.34, 2.1, 0.5, 1)`.
- Hover changes are instant except Roll's 300 ms dice-icon transform, borrowed from the personal site's `#dice-button`.
- Press: scale to 0.95 over 90 ms ease-out, release over 460 ms spring.
- Theme switch: tokens registered with `@property` so they tween over 300 ms.

Routelette's own:

| Moment | Motion |
|---|---|
| Routes appear | The selected line draws from the start back into it over 300 ms. Then the alternate routes fade in over 200 ms, fully drawn, to 55% opacity. |
| Selecting a card | A click selects the route and restyles the lines without redraw. Hover only lightens the line and fills the card gray. During generation, a click cancels the pending request and redraws the chosen stored route. |
| Reverse | The selected line redraws in its new direction. |
| Roll | Spinner replaces the dice and label while generating, on a grey button. Hover moves the dice left 0.25 rem and rotates it 90 degrees over 300 ms. No loading tumble. |
| Camera | Ease-out fit to the results. Short fly when the start changes. |
| Legend | Drops down from the chip on desktop, rises from it on mobile. |

When results arrive, the generation spinner stops and the cards appear without an entrance animation. The camera fits the results over about 450 ms. Once the camera settles, the selected line draws from the start and closes back into it over 300 ms. Then the alternate routes fade in over 200 ms, fully drawn, to 55% opacity. The numbered markers appear after the fade.

Interactions apply immediately during animation. Selecting a route finishes the current reveal and applies the selection style. Dragging the map cancels the camera movement while the lines continue drawing. Conflicting animations are cancelled rather than queued.

Reverse keeps the camera fixed. Once its legal route is ready, the selected stroke disappears and redraws in the new direction over 300 ms. The turn list updates with that result and the other routes stay unchanged.

Reduced motion is a toggle in the header, seeded from `prefers-reduced-motion`. When on, none of the above runs and lines appear fully drawn.

## 12. Errors

Errors use one line in the panel plus an action. No modals. Use an informational toast when Reverse adjusts a route for legality. Editors stay inline unless a popup is explicitly needed.

| Case | Copy | Action |
|---|---|---|
| Location denied | "Location is off. Search for a start instead." | Focuses search |
| No loop in range | "No loops near 5 mi from here. Closest is 6.1 mi." | Show it · Try 6 mi |
| No quiet loop | "No quiet loops near 5 mi from here." | Allow busy roads |
| Map data unavailable | "Can't load map data right now." | Retry |
| Elevation data unavailable | "Unavailable" on disabled elevation choices and missing gain values | Retry or Any |
| Start off the network | "Moved 40 ft to the nearest path." | None |
| Stops over budget | "Your stops need at least 7.2 mi." | None, Roll disabled |

## 13. Persistence

| What | Where |
|---|---|
| Start, mode, distance, elevation, stops, joints, seed | URL query |
| Saved routes, including Strava imports and the ids of imported activities | IndexedDB |
| Strava tokens | Nowhere. Exchanged, used once and revoked inside a single server request |
| Graph tiles | IndexedDB, plus Nitro cache on the server |
| Theme, units, reduced motion, pace per mode, preference switches | localStorage |

## 14. Stack

Nuxt 4, Vue, TypeScript, npm, Node 24, Tailwind v4 with CSS variable tokens mapped through `@theme inline`. `@nuxt/icon` with the Phosphor set. MapLibre GL JS renders the map.

Prefer Vercel for the Nuxt application and its Nitro endpoints. Target free hosting and work within free-tier limits, reducing functionality or scope when needed. The user asked whether the service can run for at most $5 per month and prefers free. Do not assume the earlier $50 proposal is accepted.

Use static regional graph snapshots. Prefer Cloudflare Pages for direct graph-asset delivery within its free limits, with the Nuxt app and small server endpoints on Vercel. Measure generated file sizes, tile count and browser memory before publishing coverage. Build graph artifacts separately from the app deployment. Exact coverage polygons and snapshot refresh cadence can be configured without changing the planner UI. Do not provision paid infrastructure for the initial release.

Use OpenFreeMap for map tiles, Photon for search and Terrarium for elevation. Keep data providers configurable. Strava needs a client id and secret in server-only runtime config: `NUXT_STRAVA_CLIENT_ID`, `NUXT_STRAVA_CLIENT_SECRET`.

## 15. Tests

Vitest for everything.

- **Engine:** graph building, A*, loop generation, spur removal, scoring, both preference multipliers, elevation gain, unit conversion. Runs against a small OSM extract checked into the repo, so a given seed always gives the same answer.
- **Flows:** `@nuxt/test-utils` in jsdom, with the fake `MapAdapter`. Covers set start, pick mode, type a distance past the slider, toggle each preference, roll, select, add stop, add joint, reverse, save, rename, delete with undo, share.
- **Strava import:** the server route against recorded Strava responses (no network). Covers state check, consent without `activity:read`, sport-type mapping, the loop rule including privacy-zone gaps, duplicate skipping, 429 handling, and that the token is revoked and never returned to the browser.

## 16. Not in v1

GPX export, time-based targets, keyboard shortcuts, accounts and sync, image share cards, point-to-point routes.

## 17. Implementation stages

Build and review the Nuxt interface first, with a live MapLibre map and the real Bloomfield route fixtures. Add the live routing engine next, then saved routes, sharing and Strava.

The live engine now runs by default. `NUXT_PUBLIC_FIXTURE_MODE=true` restores the recorded Bloomfield preview for design review.

The first stage defines the route data model and a cancellable planning service that the worker engine can implement later. Components must not depend on fixture-specific route shapes, timings or counts. Planning requests carry identities so stale results cannot replace newer state. Keep map rendering separate from route generation through the specified MapAdapter.

Do not commit or push automatically. At a useful commit point, stop and prompt the user to commit.


## 18. Icon button tooltips

Use the tooltip behavior in Kingdra's `src/components/ui/IconButton.tsx` for every icon-only control. The Figma `Tooltip` component is `77:234`; its light and dark examples are in `78:2335`. Header, location, save, stop removal, route details and saved-route controls use the shared `IconButton` component.

- Show the action label immediately on mouse hover or keyboard focus. Use the same label as the button's accessible name.
- Use 14/20 Instrument Sans Medium, inverted foreground and background colors, a 4 px radius, 8 px horizontal padding and 4 px vertical padding. Do not add an arrow or entrance animation.
- Place the tooltip 4 px below the button. Place route-card tooltips above. Clamp the tooltip to the viewport and flip it above when needed.
- Render tooltips outside scrolling containers. Hide on pointer leave, blur, Escape, scroll or activation. Touch-only layouts keep accessible names without hover tooltips.
- Reflect the current action. Examples include "Switch to kilometers", "Switch to miles", "Pause animations", "Resume animations", "Lock stop order" and "Unlock stop order".

