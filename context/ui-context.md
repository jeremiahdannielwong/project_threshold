# UI Context

## Theme

Dark only. No light mode. The visual language is mission-control: near-black backgrounds, layered surfaces, vivid signal colours reserved for vulnerability tiers and active state. Darkness communicates seriousness — emergency managers and utility planners are the users. The map is the product; the interface is everything that does not get in its way.

Reference products in spirit:

- **Linear** — dark interface, immediacy as a feature, no decorative motion.
- **Bloomberg Terminal** — information density without ornament.
- **Apple Maps (night mode)** — spatial data as the primary surface.
- **ArcGIS StoryMaps** — geospatial narrative without GIS expertise.

## Colours

All colours are exposed as CSS custom properties on `:root`. Components reference tokens, never hex literals.

| Role                  | CSS Variable          | Value     | Use                                                          |
| --------------------- | --------------------- | --------- | ------------------------------------------------------------ |
| Page background       | `--bg-base`           | `#0D0D0D` | Outermost surface, map underlay                              |
| Surface raised        | `--bg-surface`        | `#161616` | Sidebar, detail panel, recommendation cards                  |
| Surface raised-hi     | `--bg-surface-hi`     | `#1F1F1F` | Hover states, nested panels                                  |
| Primary text          | `--text-primary`      | `#F5F5F5` | Headings, scores, primary labels                             |
| Muted text            | `--text-muted`        | `#8A8A8A` | Captions, source citations, secondary metadata               |
| Border default        | `--border-default`    | `#2A2A2A` | Panel separators, card edges                                 |
| Brand blue            | `--accent-primary`    | `#1A56DB` | Interactive accent, scenario active state, link              |
| Tier critical         | `--tier-critical`     | `#C62828` | Score ≥ 0.75. Pre-cognitive danger.                          |
| Tier high             | `--tier-high`         | `#EF6C00` | Score 0.55–0.75. Caution / watchlist.                        |
| Tier medium           | `--tier-medium`       | `#F9A825` | Score 0.35–0.55. Elevated but not critical.                  |
| Tier low              | `--tier-low`          | `#2E7D32` | Score < 0.35. Lower relative vulnerability.                  |
| State success         | `--state-success`     | `#2E7D32` | Healthy data feed, model loaded                              |
| State error           | `--state-error`       | `#C62828` | Data fetch failed, model unavailable                         |
| Overlay scrim         | `--overlay-scrim`     | `rgba(0,0,0,0.6)` | Modal backdrop                                       |

Tier colours are also exposed as pale fills (12% alpha) on `--tier-*-pale` for choropleth fills under non-emphasized states.

## Typography

| Role        | Font              | CSS Variable   |
| ----------- | ----------------- | -------------- |
| UI text     | Inter             | `--font-sans`  |
| Wordmark    | Playfair Display  | `--font-serif` |
| Numeric     | JetBrains Mono    | `--font-mono`  |

- UI runs in `--font-sans` at 14px base, 1.5 line height.
- The Threshold wordmark uses `--font-serif`. Reserved for header and footer only. Do not use Playfair for body copy.
- Scores, percentages, and any other numeric value rendered prominently use `--font-mono` to make values feel computed, not narrated.

## Border Radius

| Context           | Class       | Value |
| ----------------- | ----------- | ----- |
| Inline / chips    | `rounded`   | 4px   |
| Buttons / inputs  | `rounded-md`| 6px   |
| Cards / panels    | `rounded-lg`| 10px  |
| Modals / overlays | `rounded-xl`| 14px  |

No custom radii outside this scale.

## Component Library

shadcn/ui on top of Tailwind. Components live in `frontend/src/components/ui/`. Add new components via the shadcn CLI rather than authoring from scratch. Override the default shadcn theme to use the colour tokens above — never accept shadcn's default greys.

Custom components live in `frontend/src/components/` (PascalCase, one per file).

## Layout Patterns

- **App shell**: full-viewport split. Map takes the entire viewport. Sidebar overlays the right edge with a subtle border separator (`--border-default`). Scenario controls and stats bar are absolutely positioned over the map.
- **Sidebar**: fixed width 380px. Tabs: Top 10, Detail, Recommendations. Background `--bg-surface`. Vertical scroll within the active tab.
- **Detail panel**: slides in over the Top 10 tab when a neighbourhood is selected. Header with neighbourhood name + score + tier chip. Radar chart. Factor bars. Source citations footer. LLM briefing block.
- **Recommendation card**: fixed anatomy — Action header, Why (numbered bullets), How we know (source list), Who should act (target actors). Each card is `--bg-surface-hi` over `--bg-surface`.
- **Scenario controls**: top-left of the map. Three pill buttons, active state filled `--accent-primary`.
- **Stats bar**: bottom-left of the map. Two compact stat cards rotating per active scenario.
- **Overlay toggles**: top-right of the map. Icon buttons with a subtle backdrop blur over the map.

## Map Conventions

- Choropleth fill uses `--tier-*` colours at 70% opacity. Borders use `--border-default` at 1px.
- Selected neighbourhood: full-opacity fill + `--text-primary` border, 2px.
- Hovered neighbourhood: fill brightens 10%, no border change.
- Overlays (cooling centres, outages) use distinctive marker icons. Markers are never the same colour as a tier fill.

## Interaction Principles

- **Data-first.** First frame must show the complete choropleth. No skeletons, no spinners, no loading splash. If a tier of data is not yet loaded, render what is available and progressively enhance.
- **Hover reveals, click commits.** Hover surfaces a tooltip with name + score + tier. Click opens the detail panel and persists selection.
- **Scenario switching is instantaneous.** All scenario score sets are pre-loaded; the recolour transition is under 200ms.
- **Layers are additive.** Toggling an overlay never replaces existing data — it adds.
- **No modals for primary content.** The detail panel and recommendation cards live in the sidebar, not in modal overlays. Modals are reserved for methodology explanations and confirmation flows.
- **Numbers never appear without a source path within two clicks.** A score in the UI is always one click away from its factor breakdown, and one more from its source citations.

## Icons

Lucide React. Stroke-based. Sizes: `h-4 w-4` for inline, `h-5 w-5` for buttons, `h-6 w-6` for prominent surface chrome. Never fill an icon with a tier colour — icons are neutral chrome.

## Accessibility

- All interactive elements have a visible focus ring using `--accent-primary` at 2px offset.
- Tier colours are paired with a tier label everywhere they appear. Colour is reinforcement, not the only signal.
- Map keyboard navigation: arrow keys pan, +/- zoom, tab cycles through clickable overlay controls. (Stretch for MVP.)
- Minimum text contrast: 4.5:1 against background. Verify `--text-muted` against `--bg-base` per surface.
