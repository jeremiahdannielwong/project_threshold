# Threshold — Redesign Brief

A strategic critique and infrastructure-grade redesign direction for transforming Threshold from a hackathon prototype into a category-defining civic intelligence platform.

Written for the engineers, designers, and operators who will carry this forward.

---

## 1. Brutally honest critique of the current system

Threshold is doing the right thing structurally — it fuses real public datasets, applies dimensional reduction to produce a defensible vulnerability score, and exposes scenario-conditioned changes. That is the institutional core, and it is sound.

What undermines that core is the surface. The interface speaks in the cadence of a SaaS dashboard rather than an operations center. Three rigid panels (left list, center map, right detail) telegraph "data app." A pulsing green "live" indicator performs liveness without earning it. The lightning-bolt logo treats civic vulnerability with the visual register of a fitness tracker. Tier colors arrive in four saturated steps — emerald, amber, orange, rose — that read as a developer's first heatmap palette rather than a discipline of restraint. The choropleth fills every tract at 50% opacity, which means the entire city looks "vulnerable" in a uniformly noisy field. Nothing emerges. Nothing recedes. There is no operational focus.

The Triage view is sorted columns of numbers. It is a table, not a triage workflow. A real triage tool surfaces the next decision, not the next sortable field.

The scenarios — Baseline, Heatwave, Ice Storm — are toggle pills, treated as equally weighted siblings of the view switcher and the theme toggle. They should feel like atmospheric conditions descending on the city, not like checkbox states.

Most importantly: there is no intervention layer. The product detects but does not recommend. Detection without recommendation is observation. Observation does not get adopted by emergency operations centers.

## 2. What still feels "hackathon"

The lightning bolt. The "· Brampton Energy Vulnerability" subtitle (reads like marketing copy, not a system identifier). The pulsing "live" dot. The mono/dark toggle as a featured top-bar control (theming is not a primary operator action). The Map / Triage view switcher (they should not be peers). The four-tier categorical color legend. The stat cards in TriageView (icon + label + big number + accent color is a startup pattern, not an operations pattern). Rounded `rounded-lg` on every surface. Equal padding on every panel. The `accent-blue` "Generate report" button styled like a primary CTA on a landing page.

The fact that there is a button called something like "set scenario" instead of an atmospheric condition being applied to the city as a whole.

## 3. What already feels institutional

The Playfair "Threshold" wordmark — restrained, editorial, infrastructural. Keep it; treat it as the only display-typography moment in the entire product.

The CTUID-based tract identity (real Statistics Canada census geography, not invented zones).

The PCA-derived score with named contributors (renters, pre-1980 stock, low income, CISR resilience). That is the right methodological backbone — defensible to a municipal analyst, auditable to a federal program officer.

The data breadth itself: census + outages + shelters + weather + housing age + tenure. That is the foundation of a real civic intelligence layer. Almost nothing else needs to change about what the system *knows*. The work is in how it *speaks*.

## 4. UX/UI redesign philosophy

Single canvas. The map is the product. Everything else is summoned by spatial action.

Chrome retreats by default. A thin operational ribbon at the top (36px). A narrow layer rail on the left (32px). A status strip at the bottom (24px). That is the entire persistent UI surface — under 100 pixels of chrome on a 1080p display. Everything else appears in response to the operator's gaze.

When a tract is selected, a dispatch card surfaces — anchored bottom-left, not as a right rail. It contains a narrative first ("what is happening here"), metrics second, interventions third. It is dismissible. It does not persist when the operator moves on.

No tabs. No view switcher. The map *is* the view. The triage queue is a peelable left tray, not a separate page.

Restraint as care. Every pixel that does not serve a decision is removed.

## 5. Cartography redesign system

Move off the CARTO `light_all` raster tile and onto a custom Mapbox or MapLibre vector style. Reasons: raster tiles cannot be color-shifted on hover, cannot be data-conditionally restyled, and cannot harmonize with the choropleth's hue.

Style specifications:
- **Background:** warm off-white `#FAFAF7`, not pure white. Pure white is clinical, sterile, and reads as a screenshot. Warm off-white reads as a printed institutional document.
- **Land:** `#F4F2EC` with hillshade at 8% opacity (Brampton has gentle relief — let it whisper).
- **Water:** `#E5EBEF`, no border.
- **Major roads:** `#D6D2CA` at 1.25px, no casing.
- **Minor roads:** invisible below zoom 13. At zoom 14+, `#E8E5DE` at 0.75px.
- **Labels:** Inter Tight 11/13/15 in `#5B5A55`. Only neighbourhood names, ward boundaries, and arterials. No POIs, no business names, no transit labels until zoom 15.
- **Administrative boundaries:** ward and municipal lines as 0.5px hairlines at `#C8C4BA`, dotted for non-contiguous tracts.

Choropleth replaces the four-color categorical scale with a single-hue sequential ramp from neutral (`#E8E4D8`, indistinguishable from base) to alert (`#9A3412`, deep ember). The middle of the ramp is *deliberately invisible* — moderate tracts should not compete for attention. Only the upper quartile reads as colored.

Tract borders dissolve at low zoom. They appear only on hover focus, at 1px in the alert hue at 60% opacity. This is the cartographic equivalent of operational focus.

## 6. Typography system

One family: **Inter**, with **Inter Display** reserved for the wordmark and one editorial moment per view. **JetBrains Mono** for figures only (tabular alignment, no narrative use).

Type scale (px / line-height):
- micro · 11 / 16 · uppercase, +0.08em tracking · section markers, layer labels
- caption · 12 / 18 · provenance, timestamps, units
- body · 14 / 22 · narrative paragraphs
- subhead · 15 / 22 · -0.005em · dispatch card subheads
- title · 18 / 24 · -0.01em · tract names, intervention titles
- figure · 28 / 32 · tabular · primary metrics
- display · 48 / 52 · -0.02em · wordmark only

Weight discipline: 400 (body), 500 (emphasis, labels), 600 (titles). Never 700+. Never italic in UI.

All-caps reserved for micro labels only. Buttons are sentence case. Section titles are sentence case. Capital letters are a tool, not a decoration.

Numbers use tabular figures everywhere (`font-variant-numeric: tabular-nums`) so columns of metrics align. This is one of the highest-leverage trust signals in the entire system.

## 7. Motion system

Four duration tokens, one easing curve, almost no exceptions:
- **instant** · 80ms · hover state, focus ring
- **brisk** · 180ms · panel reveal, dropdown open
- **deliberate** · 320ms · scenario crossfade, selection focus
- **atmospheric** · 640ms · choropleth interpolation, map fly-to

Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (Apple-style decelerate). No springs. No overshoot. No bounce.

Choropleth color interpolation between scenarios uses a `requestAnimationFrame` loop driving a D3 `interpolateRgb` over the full 640ms window. Tracts do not snap; they bleed.

The only continuous motion in the entire system is the optional pulse on a *critical* tract that has changed state in the last 90 seconds — a 2-second sine breath at 70%→90% opacity, dampening to zero after 5 cycles. Used sparingly. Earns attention precisely because nothing else moves.

## 8. Spatial interaction redesign

- **Click** pins a tract; the dispatch card surfaces.
- **Click elsewhere** dismisses.
- **Hover** dims all other tracts to 35% opacity and softly raises the hovered one — no border thickening, only luminance shift.
- **Double-click** zooms to extent of the tract.
- **Cmd-click** adds to a comparison set (up to 3) — comparison drawer surfaces at the bottom edge.
- **Arrow keys** traverse adjacent tracts (Voronoi-of-centroids); preserves dispatch card.
- **Space** toggles the active scenario through the scenario cycle.
- **Cmd-K** opens a command palette: jump to ward, change scenario, open watchlist, export current view, toggle layer.
- **Esc** dismisses everything, returns to the calm canvas.

There is no zoom-in button. There is no "reset view" button. The map remembers, the keyboard recovers.

## 9. Information hierarchy redesign

The dispatch card reads as a paragraph before it reads as data.

> **Heart Lake West** · CT 5350123.03
> 14,200 residents. 47% renter. 62% of housing predates 1980. Two designated cooling centres lie beyond 2 km. Under the active heatwave scenario, projected vulnerability rises from *moderate* to *critical*.

Below the narrative, four sparkline rows show the contributing components — renter share, pre-1980 stock, low income share, resilience score — each with a 36-month historical line if archive data is available, otherwise a single dot. Each metric is hover-revealable to expose source and last refresh.

Below that, ranked interventions (Section 11).

Below that, provenance and methodology link.

This order is not negotiable: narrative, metric, intervention, provenance. The operator reads the situation before reading the numbers, and acts before audit.

## 10. Operational intelligence redesign

Three persistent operational artifacts, all minimal:

**Stress index strip** (top ribbon, right side): a single number, 0–100, representing the city-wide weighted vulnerability under the active scenario, with a 3-character delta versus baseline ("+18"). One glance, one number, calibrated to the scenario.

**Watchlist tray** (left edge, collapsible): tracts whose scenario-adjusted score has crossed a threshold the operator (or their org) configured. The watchlist is *organizational state*, not a UI element — it persists across sessions, syncs across operators, and exports to incident logs.

**Last refresh ledger** (bottom strip): per-data-source last-fetched timestamp + provenance. Census, outages, shelter status, weather — each has its own freshness clock. Stale data shows a faint amber dot. Operators must be able to glance and know what is current.

## 11. Intervention engine redesign

This is the single largest leap from "vulnerability detector" to "civic intelligence operating system."

Every selected tract surfaces a ranked, quantified intervention list drawn from a catalog. Each intervention has:
- a **name** ("Activate Earnscliffe Community Cooling Centre"),
- a **projected vulnerability delta** ("−18 points, moderate confidence"),
- a **population served** ("≈8,200 residents within 1.2 km"),
- a **cost / effort estimate** ("≈$4,200/day operational"),
- a **time-to-effect** ("operational within 90 minutes"),
- a **responsible authority** ("City of Brampton, Recreation Services"),
- a **dependency** ("requires staff activation, transit shuttle optional").

Interventions are ranked by *delta per dollar* by default, with toggle for *delta per minute* (during active incidents) and *delta per resident reached* (during planning).

The catalog: cooling centre activation, warming centre activation, mobile clinic deployment, transit shuttle to existing centre, prioritized power restoration sequencing, demand-response curtailment, door-to-door wellness check, neighbour-network activation, emergency cooling kit distribution.

Each intervention writes to an audit log: which operator, which scenario, which tract, which time, which projected delta, which actual outcome (when reconciled later). This is the substrate of a learning system.

## 12. Detail panel redesign

The right-rail panel is replaced by a **dispatch card**: a 420 × ~580 (variable) surface, anchored bottom-left, with a 32px gutter from the map edges, riding above the map at 8% atmospheric shadow (no drop shadow — use a 1px outline `#E8E4D8` and a subtle inner gradient).

Card structure top to bottom:
1. Place identity strip — tract name, CTUID, scenario badge
2. Narrative paragraph (2–4 sentences)
3. Contributing components (4 sparkline rows)
4. Interventions (3 ranked, "show more" reveals up to 8)
5. Provenance footer (data sources, last refresh, methodology link)

Card animation: slides up from `translateY(24px) opacity(0)` over 320ms. Slides down on dismiss. Never scales. Never rotates.

Card is always dismissible (Esc, click outside, X in corner). Never pinned. Never modal. The map remains interactive behind it.

## 13. Overlay redesign

Layer rail (left edge, 32px wide, ~140px tall). Six icons stacked vertically:
1. Tracts (always on, no toggle, no icon)
2. Cooling/warming centres
3. Active outages
4. Hydro transmission corridors
5. Transit lines
6. Social services (clinics, food banks, libraries acting as resilience hubs)

Each layer toggle is a 24px square with the layer's visual signature inside (a small shelter pictogram, a power-line abstraction, etc.) — no labels until hover, which reveals an Inter Tight 12 caption to the right.

Each layer has a distinct visual register:
- Centres: 14px white square, 1px alert-blue stroke, building pictogram inside. On hover: 200ms radial reach showing 1.5km accessibility.
- Outages: a 6px filled circle in deep ember, no glow, no halo. Pulse only if outage initiated within last 30 minutes.
- Hydro corridors: 1.5px line in `#8B8579` at 50% opacity. No labels.
- Transit: 1px `#7C8B9C` lines, dashed for off-peak. Routes labeled only at zoom 14+.
- Social services: 10px hollow circles with single-letter glyph (C clinic, F food, L library), in `#3F3F3F` at 70%.

No layer competes for hue with the choropleth. Color is reserved for vulnerability.

## 14. Map choreography

**Initial load** (~1.8s total):
1. Basemap fades in over 400ms.
2. Tract polygons fade in (opacity 0→1) over 600ms, stagger 8ms by centroid distance from city center (subtle ripple from downtown outward).
3. Choropleth color saturates over 400ms.
4. Layer rail and ribbon fade in over 200ms.

**Scenario change** (~800ms):
- Choropleth recolors via per-tract RGB interpolation over 640ms.
- Stress index number animates via odometer-style cycle, settling in 480ms.
- Watchlist re-evaluates and animates additions/removals at 320ms.

**Selection focus** (~700ms):
- Non-selected tracts dim to 35% over 320ms.
- Map pans toward selected centroid with deliberate easing over 640ms (not enough to disorient — typically <200px translate).
- Dispatch card slides up over 320ms, 80ms delay after pan completes.

**Hover** (~80ms):
- Hovered tract raises luminance by ~12%.
- Tooltip appears at 200ms hover-hold (no flicker on quick passes).

## 15. Visual language redesign

**Palette** (the entire system):
- `--canvas` `#FAFAF7` warm off-white
- `--surface` `#FFFFFF` panels, cards
- `--ink` `#0F172A` primary text, action affordances
- `--ink-2` `#3F3F46` secondary text
- `--ink-3` `#71717A` tertiary, captions
- `--hairline` `#E8E4D8` borders, dividers
- `--alert` `#9A3412` deep ember (the only chromatic color in the system)
- `--alert-soft` `#C2410C` for elevated states
- `--alert-quiet` `#FED7AA` low-end of choropleth ramp
- `--warning` `#854D0E` for stale data, advisory
- `--positive` `#3F6212` for restoration, intervention success (used sparingly)

Twelve values. That is the entire palette. No blues, no greens, no purples, no gradients.

**Surfaces:**
- 0.5px hairline borders (`--hairline`), never 1px.
- Radius: 4px max, 2px standard. No `rounded-lg`, no `rounded-xl`.
- No drop shadows. Atmospheric depth via 1px outline + 1px inner highlight.
- Backgrounds layer in three altitudes: canvas, surface, surface-elevated (canvas with 1px outline + +2% luminance).

## 16. Trust-building design changes

- Every metric reveals provenance on hover or focus: "Source: Statistics Canada Census 2021, table 98-10-0227-01, retrieved 2026-04-12, 4:32 EDT."
- Every projection shows a confidence band: "+18 ± 4."
- Every intervention shows the source of its delta estimate (model card, empirical study, expert elicitation).
- A persistent methodology link in the bottom strip opens a long-form document explaining PCA components, scenario assumptions, intervention modeling, and limitations.
- Build version + data version visible in bottom-right of bottom strip ("v0.7.2 · data 2026-05-26").
- A "show methodology" affordance is one keystroke away from every numeric display.
- The product never claims certainty it does not have. Phrases like "predicts" and "indicates" replace "shows" wherever appropriate.

## 17. Emotional design principles

1. **Restraint is care.** A flashing banner over a Critical tract trivializes the people who live there. Restraint signals that this system has been designed by people who understand the gravity of what they are showing.
2. **Numbers carry weight; do not decorate them.** A figure typeset in tabular Inter 28/32 next to a caption "residents at elevated risk" is more devastating than the same number in a colored stat card with an icon.
3. **Geography is the subject.** The map is not a chart. It is a place. Treat it with the gravity owed to a city.
4. **Vulnerability is human.** Avoid the language of percentages where the language of people will do. "8,200 residents in pre-1980 housing without nearby cooling" lands differently than "62% pre-1980 + low cooling access."
5. **Nothing is gamified.** No badges, no streaks, no leaderboards, no progress bars on resilience, no "achievement" of completion.
6. **The system is calm under pressure.** During an active incident, the UI gets *quieter*, not louder. Less chrome. Larger type. Fewer affordances visible. The product mirrors the operator's required state.

## 18. Long-term platform vision

Threshold is a multi-tenant civic operating system. Each municipality is a tenant with its own geography, data feeds, intervention catalog, and operational rituals. Each utility plugs in via API for outage telemetry and restoration sequencing. Each provincial emergency management office sees a cross-tenant view.

The data archive accumulates. Historical outages from 2018 forward, scenario evaluations every 15 minutes, intervention activations and their reconciled outcomes — all become the substrate of predictive models that estimate stress accumulation before the meteorological event arrives.

The platform exposes a federal lens: which municipalities are under-resourced relative to their vulnerability profile, where federal climate adaptation dollars would generate the highest resilience ROI. This is the path from civic tool to national infrastructure.

## 19. Infrastructure-grade feature roadmap

**Phase 1 — Deployable (next 8 weeks):**
- Custom vector basemap with the cartography in §5
- Single dispatch card, intervention engine with a 6-item catalog
- Watchlist (local persistence)
- Stress index + last-refresh ledger
- Cmd-K command palette
- Methodology document
- Audit log of operator actions (local JSON, sufficient for pilot)

**Phase 2 — Institutional (3–6 months):**
- Historical replay (scrub through last 90 days of scenarios)
- Scenario authoring (define a custom event: "Aug 14 derecho recurrence")
- Multi-operator presence with cursor/annotation
- Server-side audit log + signed exports
- Tenant configuration (per-municipality intervention catalog)
- Printable incident summary (PDF, 1-page)

**Phase 3 — Platform (6–18 months):**
- Predictive stress accumulation (LSTM or transformer on outage + weather + vulnerability history)
- Intervention impact reconciliation (compare projected vs actual delta)
- Cross-jurisdiction comparison view
- Federal program eligibility integration (DMAF, NDMP, GMF)
- Open API for external systems (CAD, GIS, utility OMS)
- Mobile field operations companion

## 20. Specific component-level implementation recommendations

In the current codebase:

- **Remove TopBar entirely.** Replace with `<Ribbon>` (36px): wordmark left, scenario as a single chip in the center (clickable to cycle), stress index right.
- **Remove LeftPanel and RightPanel.** Their content is reorganized into the dispatch card, watchlist tray, and command palette.
- **Remove TriageView as a separate route.** Its function — sortable tract list — becomes part of the watchlist tray with a "All tracts ▾" filter.
- **Remove the theme toggle.** Light is the canonical state. The mono variant can survive as an accessibility option behind a settings command, but it is not a top-bar control.
- **Remove the lightning bolt and "live" pulse.**
- **Replace the 4-color tier legend with a 7-stop sequential ramp legend.** Show only the upper three stops as labeled ("Elevated," "High," "Critical"). The lower stops are visually unlabeled — they fade into the canvas.
- **Replace MapPanel toggle buttons** ("Shelters," "Outages") with the layer rail.
- **Add `<DispatchCard>`** triggered by `selected` state.
- **Add `<Watchlist>`** as a left-edge tray, persisted to `localStorage` with a server-sync stub.
- **Add `<CommandPalette>`** triggered by Cmd-K.
- **Add `<StatusStrip>`** at the bottom (24px).

Internally, introduce a `useScenario()` hook with smooth interpolation rather than instant state replacement, so `MapPanel` can animate choropleth fills.

## 21. CSS direction

Move away from utility-class soup toward a small set of semantic primitives, while keeping Tailwind as the underlying engine.

Introduce semantic CSS classes for structural surfaces:
```
.ribbon          /* 36px top operational strip */
.layer-rail      /* 32px left edge */
.status-strip    /* 24px bottom edge */
.dispatch-card   /* the summoned tract panel */
.watchlist-tray  /* left collapsible tray */
.command-palette /* Cmd-K modal */
.metric-row      /* tabular metric line item */
.intervention    /* ranked intervention item */
```

Spacing tokens as CSS variables:
```
--space-1: 4px;  --space-2: 8px;  --space-3: 12px;
--space-4: 16px; --space-5: 24px; --space-6: 32px;
--space-7: 48px; --space-8: 64px;
```

Type tokens (per §6) as variables. Color tokens (per §15) as the entire palette layer.

Strip all `rounded-lg`, `rounded-xl`, `shadow-md`, `border-2` defaults. Replace with the radius/border discipline in §15.

## 22. Animation direction

- Choropleth color interpolation: D3 `interpolateLab` (perceptually uniform) on a `requestAnimationFrame` loop over the active scenario transition.
- Panel motion: CSS `transform` + `opacity` only, per the easing in §7.
- Stress index odometer: a small component that animates each digit independently with `translateY` on a 10-row character strip.
- Hover luminance shifts: CSS-only `filter: brightness(1.08)`.
- No JavaScript animation library required for v1. Framer Motion is reasonable for v2 (multi-operator cursors, scenario authoring drag interactions).
- Honor `prefers-reduced-motion`: durations collapse to 80ms, choropleth interpolation becomes instant.

## 23. Layout direction

```
┌─────────────────────────────────────────────────────────────┐
│  Threshold        [Heatwave ◯]              Stress 68 +18   │  36px ribbon
├──┬──────────────────────────────────────────────────────────┤
│■ │                                                          │
│■ │                                                          │
│■ │                   MAP (full-bleed)                       │
│■ │                                                          │
│■ │                                                          │
│■ │  ┌────────────────────┐                                  │
│  │  │  Heart Lake West   │ ← dispatch card (summoned)       │
│  │  │  Narrative…        │                                  │
│  │  │  Metrics…          │                                  │
│  │  │  Interventions…    │                                  │
│  │  └────────────────────┘                                  │
├──┴──────────────────────────────────────────────────────────┤
│  Census 2021 · Outages 2m · Weather 4m  ·  v0.7.2 · 26 May │  24px status
└─────────────────────────────────────────────────────────────┘
```

The watchlist tray slides out from the left edge over the layer rail when invoked, ~280px wide, with a 0.5px hairline.

The dispatch card occupies bottom-left when active, 420 × ~580. It never overlaps the layer rail (it sits 32px right of it).

The command palette modal centers at 600 × variable, dimming the canvas to 70%.

## 24. Palette refinement

The current palette uses 12 named colors across two themes. Reduce to the 12 in §15, single theme. Vulnerability is the only thing that gets to be colored.

The choropleth ramp:
```
0–25th percentile:  #EFEAE0 (≈canvas, intentionally invisible)
25–50th:            #E8D8B9
50–75th:            #D5A878
75–90th:            #B86C3F
90–97th:            #9A3412
97–100th:           #7C2D12
```

Critical tracts are scarce by design. Most of the city should read as canvas. Vulnerability that *emerges* is more legible than vulnerability that is *labeled*.

## 25. Exact design references

- **Palantir Gotham** (2018–2022 era): operational density, restrained chrome, narrative-first dispatch.
- **ArcGIS Mission Manager / Dashboard for ArcGIS** (operations templates): layer discipline, status surfaces.
- **Mapbox Streets Mono** and **Mapbox Light v11**: cartographic restraint, label density discipline.
- **Stamen Toner Lite**: typographic-cartographic harmony in monochrome.
- **Apple Maps in privacy mode / Apple Look-Around UI**: weighted panning, atmospheric depth.
- **Bloomberg Terminal** (color palette and figure typography, not density).
- **Linear** (motion restraint, command palette pattern, dispatch card affordance).
- **Are.na** (typographic calm, restraint, editorial register).
- **NYT Graphics: "Where the Heat Is" and "The Hidden Toll" outage maps** (sequential single-hue ramps, narrative captions over choropleth).
- **Reuters Graphics: "A Year of Drought"** (cartographic editorial discipline).
- **Stripe Atlas dashboard** (single accent color, hairline borders).
- **Figma's right-rail when collapsed** (the discipline of contextual reveal).
- **The Browser Company's Arc onboarding screens** (warm off-white, restrained motion).

## 26. Exact interaction references

- **Linear's Cmd-K command palette**: model for the Threshold command surface.
- **Figma's Cmd-click multi-select**: model for tract comparison.
- **Mapbox GL `flyTo` with deliberate easing**: model for selection focus pan.
- **Notion's slash-command surface**: model for layer/intervention quick-actions.
- **Apple Maps look-around panning weight**: model for map drag inertia.
- **Datadog's metric tooltips** (delayed hover, no flicker): model for tract hover.
- **Are.na's channel transitions**: model for dispatch card slide-up.
- **Discord's `Esc` returns-to-quiet pattern**: model for global dismiss.
- **VS Code's quick-pick fuzzy match**: model for command palette result ranking.

## 27. What Palantir would remove

- The theme toggle.
- The "Triage" view as a separate route.
- The four-color categorical tier scheme.
- Stat cards.
- The "Brampton Energy Vulnerability" subtitle in the header.
- The scenario buttons as visible pills (would become a single state chip + Cmd-K).
- The pulsing "live" dot.
- The lightning bolt icon.
- All `rounded-lg` defaults.
- Every drop shadow.
- The accent-blue "primary action" button styling.
- The right-rail panel layout entirely.

## 28. What Apple would simplify

- Two persistent side panels → one summoned card.
- Two view modes (Map, Triage) → one canvas with a watchlist tray.
- Three scenarios as buttons → one atmospheric state chip you click to cycle.
- Six visual signatures across overlays → unify around hairline weight and single accent.
- Three font families (Inter, JetBrains Mono, Playfair) → Inter as canonical, Inter Display for one editorial moment, JetBrains Mono for figures.
- Color tokens reduced from twelve named hues across two themes to twelve total, one theme.
- Every icon-plus-label-plus-color trio → pick one signal per element.

## 29. What emergency managers actually need

Spoken to municipal coordinators, utility operators, and Red Cross dispatch leads, these are the operational requirements that recur:

1. **What is the situation right now?** A single-glance answer at the city level. The stress index satisfies this.
2. **Who is most exposed at this moment?** A sorted, filterable list — the watchlist plus a "All tracts ▾" affordance.
3. **What can I do about it?** Ranked, quantified, costed interventions — the intervention engine.
4. **Who do I call?** Responsible-authority metadata on every intervention.
5. **How do I tell the story upward?** One-keystroke export to a printable 1-page incident summary with map screenshot, narrative, and interventions taken.
6. **What did we do last time?** Historical archive of past scenarios + activations.
7. **How do we explain this decision?** Methodology + provenance + audit trail.
8. **How do we know this is current?** Last-refresh ledger per data source.
9. **How do we coordinate with other operators?** Multi-user awareness and annotations (Phase 2).
10. **What did our intervention actually do?** Reconciled before/after vulnerability (Phase 3).

Notice what is absent: dashboards, AI chat, fancy visualizations, gamification. Operators want answers, audit, and action.

## 30. Final refined product vision

Threshold is a calm room with a city on the wall.

The city is rendered in warm off-white and graphite hairlines, a piece of editorial cartography that breathes with the conditions descending on it. As the meteorological state changes, the choropleth bleeds slowly between configurations — a heatwave saturates the city's pre-1980 rental quartiles in ember; an ice storm draws color toward areas of compounded electrical exposure and elderly residency.

A coordinator enters the room. The interface offers nothing it does not need to. A thin ribbon at the top names the active scenario and the city-wide stress index. A narrow rail at the left holds the layers, dormant. A strip at the bottom shows when each data feed last spoke.

She moves the cursor over a tract. The surrounding city dims. The tract glows by a few percent. A tooltip names it.

She clicks. A dispatch card surfaces from the bottom of the canvas.

> **Heart Lake West.** Fourteen thousand two hundred residents. Forty-seven percent renter. Sixty-two percent pre-1980 housing. Two cooling centres beyond two kilometres. Under the active heatwave scenario, projected vulnerability rises from moderate to critical.

Below the paragraph, four sparkline rows show the contributors. Below that, three ranked interventions:

> Activate Earnscliffe Cooling Centre.
> Projected −18 vulnerability points. Reaches 8,200 residents. Operational in 90 minutes. $4,200/day.

She presses Cmd-K, types "act," selects "Activate Earnscliffe." The audit log captures her decision. The watchlist updates. Two minutes later, the choropleth softly recolors as the projection refreshes.

She has not opened a dashboard. She has not interpreted a heatmap. She has read a sentence about a place and made a decision about people.

That is Threshold.

The product is not the map. The product is the moment in which a coordinator, looking at a city on a wall, sees where invisible vulnerability is about to become visible suffering — and is given the language, the numbers, and the levers to act before it does.

Everything else is just chrome to be removed.

---

*Version 0.1 — Strategic redesign brief. To be reviewed with engineering, design, and a working coordinator from a partner municipality before Phase 1 implementation begins.*

---

# Addendum · Preparedness Intelligence Layer

*Appended after the move from observation to preparedness.*

## A1. Why this is the most important shift in the product

For its first release, Threshold *observed* vulnerability. The map showed where a heatwave or ice storm would land hardest, and a coordinator could read the conditions of a place.

Observation alone does not change outcomes. Outcomes change when residents prepare, when community organizations mobilize, and when operators act. The new layer turns the system from *visualization* to *infrastructure*.

The frame is not "AI assistant." It is **derived intelligence**: a deterministic rule engine that converts the tract's actual measured values, the active scenario, and live finance/climate context into a structured set of advisories addressed to specific audiences.

The distinction is everything. An advisory that reads "based on the 47% renter share and 62% pre-1980 housing in this tract, identify your nearest cooling facility before the next heat advisory" lands as civic guidance. The same sentence prefaced with "Ask Threshold" or "AI suggests" lands as a chatbot output. Trust collapses on the second framing.

## A2. Three product positions to refuse

| What it must not feel like | Why |
|---|---|
| ChatGPT-style assistant | Anthropomorphism trivializes the gravity of the data and the stakes of the decision. |
| "Ask Threshold" search bar | Implies the system has a model behind it improvising answers. Operators rely on systems whose outputs are reproducible. |
| AI-generated narrative briefings | Cannot be cited, cannot be audited, cannot be defended to a council member. |
| Sparkle icons, avatars, chat bubbles | Visual register of a consumer assistant. Wrong category. |

## A3. What it must feel like instead

- **Civic advisory layer.** The same register as a public-health notice, a heat advisory, a tenancy bulletin.
- **Operational recommendations.** Each one cites the threshold it crossed.
- **Preparedness intelligence.** Not a question-answering interface; a recommendation surface that fires when the underlying conditions warrant it.

## A4. Architecture — the rule engine

Pure functions, no model. Each rule is a named threshold cross over the tract's value space, conditioned by scenario and live feeds.

```
Rule → fires when (tract values + scenario + finance) cross a defined threshold
     → emits Advisory {
         id, audience, urgency, headline, detail,
         triggers: [{ label, value, source }],     ← the *evidence*
         timeframe,
         impact?: { delta, population, cost, ... }, ← operator-tier only
         sources: [dataset names]
       }
```

The advisory carries its own evidence. The interface does not need a separate "why is this firing" panel — every fact that triggered the rule appears as a chip beneath the headline, with the dataset that supplied it.

This is the difference between a recommendation and a generated suggestion: the operator can read the rule, the values, and the source in one motion, and reconstruct the entire reasoning chain without trusting a black box.

## A5. Three audiences, one engine

The same engine emits advisories tagged by audience. The dispatch card partitions them into three blocks:

1. **Residents.** Personal preparedness language. "Identify your nearest cooling facility before the next heat advisory." Timeframes in human terms ("before peak heat days"). No costs, no projections.
2. **Community organizations.** Coordination language. "Deploy temporary hydration stations." "Coordinate door-to-door wellness rounds via the community network." Timeframes in operational terms ("within 24 hours of advisory"). No quantified deltas — community work is harder to project numerically.
3. **Municipal & utility operators.** Quantified intervention language. The full operator-tier card carries projected vulnerability delta, population reached, cost per day, time to effect, responsible authority, and confidence level. These are sorted by impact-per-dollar for restoration sequencing and resource allocation.

Sorting respects urgency first (critical → elevated → routine) and audience second (resident → community → operator). The reasoning: a resident-facing critical advisory and an operator-facing critical advisory are *both* critical, but the resident reads their advisory through their own lens; surfacing critical resident advisories first respects whose decision is most time-bound.

## A6. The city-wide pattern layer

A tract-by-tract advisory engine cannot see what happens between tracts. The pattern detector runs spatial clustering over the full set:

- **Cooling deserts** — contiguous clusters of 2+ adjacent tracts with no cooling/warming centre within 2.5 km. Mobile-unit deployment optimizes population-served per deployment when targeted here.
- **Vulnerable seniors · low access** — clusters where high CISV quintile, pre-1980 housing, and minimal shelter access overlap geographically. Door-to-door coordination is most efficient when sequenced across these adjacent tracts together.
- **Outage corridors** — clusters of tracts with simultaneous active outages from the Alectra feed. Restoration dispatch can treat the corridor as a single sequencing problem rather than independent feeders.
- **Renter-pressure zones** — contiguous tracts of renter-dense, income-constrained households. Tenant-rights outreach and demand-response enrollment land best as a single targeted campaign across the whole zone.

These patterns surface in the **Advisories** mode of the watchlist tray. Each city pattern lists its member tracts as clickable chips — so a coordinator looking at a cooling desert can click directly into any tract in the cluster and read the per-tract advisories.

## A7. Visual treatment — restraint as care, applied to recommendations

Every advisory uses the same visual register as the rest of the system:

- 2px left bar in urgency color (deep ember for critical, mid ember for elevated, neutral graphite for routine). The only chromatic signal.
- Headline in Inter 14, regular weight. No bold, no italics, no exclamation.
- Detail in 12, line-height 1.65, deliberately readable.
- Evidence chips in 11 tabular figures, with the label muted and the value at full ink. The data does the talking.
- A footer line in 10 uppercase tracked, naming timeframe and (for operator-tier) authority + confidence.

No avatars. No sparkle icons. No "Generated by AI" tags. No chat bubble framing. No "Send" buttons. The advisory is rendered the same way a printed civic notice would be — because that is what it is.

The dispatch-card footer carries the only line that addresses the system itself: *"Preparedness intelligence is rule-derived: each advisory cites the threshold it crossed and the values that fired it. No language model is invoked."*

That one sentence does more institutional work than any feature in the layer.

## A8. The rule catalog (initial)

Eleven rules ship in the first cut, distributed across audiences:

| ID | Audience | Headline (paraphrased) | Triggers |
|---|---|---|---|
| R1 | Resident | Identify cooling facility before next advisory | renter > 40% · pre-1980 > 50% |
| R2 | Resident | Prepare battery backup for medical devices | low-income > 20% · outage present or Ice Storm |
| R3 | Resident | Check on elderly or isolated neighbours | CISV quintile ≥ 4 · pre-1980 > 45% |
| R4 | Resident | Request portable cooling from landlord | renter > 50% · Heatwave |
| R5 | Resident | Prepare alternative heating | pre-1980 > 40% · Ice Storm |
| R6 | Resident | Apply for LEAP energy-assistance grant | energy share of income ≥ 6% |
| C1 | Community | Deploy temporary hydration stations | Heatwave · centres within 2.5 km < 2 |
| C2 | Community | Coordinate door-to-door wellness rounds | Heatwave/Ice Storm · CISV ≥ 4 |
| C3 | Community | Extend cooling-access hours along transit corridor | Heatwave · 0 centres · low-income > 20% |
| C4 | Community | Coordinate faith centres for respite hours | 0 centres · Heatwave/Ice Storm |
| C5 | Community | Distribute tenant-rights guidance | renter > 40% · low-income > 20% |
| O1 | Operator | Elevate feeder in restoration queue | active outages > 0 |
| O2 | Operator | Deploy mobile cooling/warming unit | 0 centres · Heatwave/Ice Storm |
| O3 | Operator | Extend hours at nearest centre | centres ≥ 1 · Heatwave/Ice Storm |
| O4 | Operator | Activate transit shuttle | centres ≥ 1 · low-income > 20% · Heatwave/Ice Storm |
| O5 | Operator | Targeted demand-response enrollment | Heatwave · renter > 35% |

The catalog is intentionally small. Every rule must justify its inclusion against the question: *would a coordinator believe this advisory if they saw it produced by the system on a Tuesday at 2 p.m.?*

Rules that cannot meet that bar do not ship.

## A9. How the rules will evolve

The catalog is not generated by a model. It is curated, versioned, and reviewed.

Each rule has a stable `id`. Each rule's parameter thresholds (the 40% renter cutoff, the 6% energy-poverty threshold, the 2.5 km accessibility radius) are owned by named subject-matter experts and reviewed at least annually. A rule's introduction or modification is a versioned change — the system can report which version of the rule catalog produced any past advisory.

This makes the engine **auditable**. A council member asking "why did this tract receive this advisory in July?" can be answered exactly: the rule that fired, the threshold it crossed, the values it observed, and the dataset vintage that supplied them.

That is the property a model-based system cannot match.

## A10. Long-term: where this leads

The rule engine is the foundation. Around it, two extensions follow naturally:

**Empirical calibration.** Once the system has accumulated history (interventions activated, outcomes reconciled), rule thresholds can be calibrated against observed impact. The 40% renter cutoff was reasoned from policy; with a year of data it becomes empirical. Calibration is transparent and versioned.

**Resident-facing surfaces.** Today the advisories live inside the coordinator's dispatch card. The same engine can drive a public-facing surface — a tract-level resilience advisory anyone can pull up for their own neighbourhood, with the same evidence-first treatment. No login. No model. Just structured advisories pulled by tract.

That is when Threshold finishes its transition from "observation tool used by operators" to "civic preparedness layer the city is built on top of."

---

*Addendum version 1.0 — Preparedness Intelligence Layer. Rule catalog v1, 16 rules across three audiences, four city-wide pattern detectors. Shipped in the same release as the live data layer.*

---

# Addendum · Stakeholder Surfaces

*Appended when the product gained explicit surfaces for each of the stakeholders Threshold serves: Alectra, the municipality, community organizations, and residents.*

## B1. The lens as the central UX abstraction

The same map, the same rule engine, the same live feeds — but the operator decides which institutional position they are reasoning from. The lens chip lives next to the scenario chip in the ribbon. Clicking it cycles through:

> Utility · Alectra  |  Municipal operations  |  Community network  |  Resident view

The lens does four things. (1) It reorders the audience blocks in the dispatch card so the most relevant advisories surface first for the active stakeholder. (2) It controls which watchlist modes appear — Restoration only appears under Utility/Municipal; Outreach is always visible; Resident view collapses the entire UI into a public surface. (3) It is written into the URL (`?lens=…`) so a coordinator can deep-link a colleague directly into the right view. (4) Every lens change writes an entry to the audit log, so the record of "who was looking at what, in which capacity, when" is reconstructible.

Resident is not a "view-only mode" — it is a different product surface entirely. The other three share the operator chrome but address different audiences within it.

## B2. Surfaces that serve Alectra

**The Restoration Queue.** A new watchlist mode (Utility and Municipal lenses) ranking every tract under active outage by a vulnerability-weighted composite — log-scaled customer count, CISV score, aging housing, income constraint, lack of cooling access, current heat-stress. The dispatcher sees sequence numbers, the reasons each tract earned its priority, and three actions per row: mark in progress · mark restored · reopen. Each action writes to the audit log so the regulator's question "why did you restore feeder X before feeder Y on July 14" has a literal answer.

The queue exports as CSV so it can flow into Alectra's existing OMS or sequencing tools without an integration build.

**The Equity-Weighted Exposure Index (EWEI).** A snapshot metric in the status strip showing the customers currently without power weighted by tract-level social vulnerability, with an "average vulnerability multiplier" tail (e.g. `EWEI 9,840 (1.4×)` — meaning the affected population is 1.4× more vulnerable than the territory average). The metric only renders when an operator/municipal lens is active. The naming is deliberate: not SAIDI — SAIDI requires duration history we don't yet have — but the same architectural pattern accumulates into proper equity-adjusted SAIDI once the archive matures. EWEI is what we can compute honestly today.

**The DR / CDM Targeting Roster.** Renter-dense tracts ranked by reachable enrollment population, with estimated reach figures and CSV export. Closes both an equity gap and a peak-load problem, indexed to Alectra's existing CDM budget categories.

**The LEAP Outreach Roster.** Tracts where the energy-cost share of median income exceeds the 6% energy-poverty threshold at current OEB rates. Sorted by share, exported as CSV for hardship-program outreach. The list is regenerated every hour as the finance feed refreshes.

**The Audit Log.** Every consequential operator action — tract selected, scenario changed, lens changed, restoration sequenced, intervention flagged, brief exported — writes a structured entry with timestamp, lens, action, target, and operator note. Persists locally in v1 (`threshold.audit.v1` in `localStorage`), with the data shape designed to swap to a signed server-side log when the platform goes multi-tenant. Accessible via the Activity icon in the layer rail or the `a` keyboard shortcut.

**Operator notes (annotations) on tracts.** Free-text notes attached to a tract, persisting locally per device with timestamp and authoring lens. Surfaces in the dispatch card "Operator note" section. Every write fires an audit entry. Designed to become a multi-operator coordination surface once a backend store is in place.

**Print-to-PDF incident brief.** A printer icon in the dispatch-card header invokes the browser's native print pipeline through a tuned print stylesheet. Everything but the dispatch card is hidden; the card promotes to full-page; a print-only header reading "Threshold · Incident Brief · {timestamp}" is added. The output is one Letter page, signable, emailable, regulator-fileable. No client-side PDF library — keeps the bundle small and the output identical to screen.

## B3. Surfaces that serve the municipality

The Municipal lens shares most of its surface with Alectra's because the operational decisions converge. What changes is emphasis: cooling/warming centre placement, mobile-unit deployment, transit-shuttle activation, faith-space coordination — these are the actions a municipal Operations Centre owns, and they sit at the top of the dispatch card's advisory order under this lens.

The City-wide patterns view (in Advisories mode of the watchlist) is most useful here. Cooling deserts tell a city's emergency-services team where the next mobile-unit deployment will reach the most residents per truck-hour. The senior-burdened low-access cluster routes door-to-door volunteer hours. The outage corridor frames a restoration sequencing decision that crosses both Alectra's and the City's purview.

The Operator note becomes a multi-team coordination surface in this lens: a Recreation Services lead can leave a note on a tract recording that a community centre is opening 8 a.m. – 11 p.m., visible to the EOC coordinator and to the Alectra dispatcher next time anyone reads that tract.

## B4. Surfaces that serve community organizations

The Community lens reorders the dispatch card so community advisories sit first. The Operations Centre's interventions are still visible — the community organizer needs to know what the city has decided in order to coordinate around it — but the community-audience advisories (hydration stations, door-to-door coordination, cooling-corridor extension, faith-space activation, tenant-rights outreach) take the upper register.

The Outreach mode in the watchlist (LEAP and DR rosters) is where a community organization plans where to spend volunteer hours and flyer distribution. The CSV export integrates with the tools community orgs actually use — Google Sheets, Mailchimp lists, paper printouts.

City patterns, again, are the unit of work: not "Heart Lake West needs help," but "this contiguous cluster of three tracts is the cooling desert this season — we should coordinate one campaign across all three."

## B5. Surfaces that serve residents

The Resident view is a wholly different surface. No ribbon, no rail, no map, no chrome. A single-column layout, max-width 640 pixels, mobile-first. The header is a single line: *Threshold · Brampton · Preparedness*. The body is structured exactly like a public-health advisory.

> *Heart Lake West* · CT 5350123.03 · 14,200 residents
>
> Under the active Heatwave, vulnerability registers as Elevated. 47% renter households. 62% of housing predates 1980. 2 cooling centres lie within 2.5 km.
>
> **Preparedness for residents · 3**
>
> | Identify your nearest cooling facility before the next heat advisory | ELEVATED |
> Older rental units cool slowly and often lack central air. A walk- or transit-based plan to a cooling centre should be settled before peak temperature days, not during them.
> Renter share 47% · Pre-1980 housing 62% · Nearest centres 2 < 2.5 km
> *Before the next heat advisory*
>
> | Request portable cooling from your landlord if your unit lacks AC | ELEVATED |
> ...
>
> **What is being recommended for your area**
> Extend cooling hours · Earnscliffe Community Centre — *Municipal / utility*
> Activate transit shuttle to designated centre — *Transit Operations*
>
> **About your neighbourhood**
> Renter households · 47%
> Pre-1980 housing · 62%
> Low-income share · 23%
> Cooling / warming centres within 2.5 km · 2

The provenance footer reads as a civic notice: *"These advisories are derived from public data — the 2021 Statistics Canada census, the Social Vulnerability Index, the Alectra live outage feed, Open-Meteo weather, the Ontario Energy Board Regulated Price Plan, and the Bank of Canada CPI series — applied to your tract under the active scenario. Each advisory cites the values that triggered it. No language model is invoked. This page is a public preparedness surface, not a chat interface."*

Reachable at any URL with `?lens=resident` — including pre-built `?lens=resident&ctuid=…` deep links a community organization or social-services worker can text to a resident. The empty state, when no ctuid is selected, offers a neighbourhood search.

The product behaves identically across lenses below the surface: same engine, same data, same provenance. What changes is who is being addressed. That property is the entire civic-infrastructure claim.

## B6. The flywheel made explicit

Each surface earns adoption by a different stakeholder and reinforces the next one's case.

Alectra adopts the operator surface because the Restoration Queue and the EWEI metric let them justify equity-adjusted sequencing decisions to the OEB. The Audit Log makes their decisions defensible. The DR roster makes their CDM dollars more efficient. The LEAP roster makes their hardship-program outreach measurable.

The City adopts the Municipal lens because Alectra is already running on the same intelligence layer, which removes the procurement friction of buying a separate platform. The cooling-centre placement decisions and the City-pattern view make the EOC measurably more effective during major events.

Community organizations get a free surface that integrates with Alectra and the City's posture — same engine, same rule catalog, same provenance — so their door-to-door routing and outreach campaigns operate on the same evidence the institutions are using.

Residents see all of it converge in the public Resident view: the same advisories the City is acting on, written for them, with the same provenance. They do not read "AI says you should…"; they read "the energy share of income in your tract is above the 6% threshold according to current OEB rates."

The four surfaces are not features. They are the four faces of one intelligence layer that becomes harder to displace each quarter a new stakeholder consumes it.

---

*Addendum version 1.1 — Stakeholder Surfaces. Lens system, Restoration Queue, EWEI, LEAP and DR rosters, audit log, operator annotations, print incident brief, Resident view. Shipped together as the institutional-credibility release.*

---

# Addendum C · Refinement Brief

*Appended when the platform was past the prototype stage but not yet inevitable. The instructions in this addendum are surgical, not architectural. Nothing in here should be implemented without prioritization; the system as it stands is already strong.*

## C1. Brutally honest critique

The product has crossed the threshold from observation to preparedness. The lens system, the rule-derived advisory engine, the institutional audit log, the EWEI metric, the resident-view public surface — these establish the *category*. What remains is the *register*.

The current implementation still reads as a prototype in a small number of recognizable ways. The polygon layer is destroyed and rebuilt on every state change, which means scenario flips snap rather than bleed; the map is correct but mechanical. The dispatch card exposes seven approximately equal-weight sections rather than narrative-first hierarchy; an operator's eye has nowhere obvious to land first. The watchlist's mode-switch row uses bare lowercase tab labels separated by gaps — readable as a tab control, but tab controls are a SaaS pattern. The legend in the lower-right of the map says "Vulnerability" — a generic word rather than a calibrated caption. The status strip's per-source freshness dots are 5px and either green, amber, or red — readable but slightly traffic-light. The "Refresh" affordance reads as a consumer browser action. The lens chip text "Utility · Alectra" is wordier than it needs to be. The body type is set at 14/22, which is web-default rather than editorial.

None of these are defects. They are the artifacts of a prototype that prioritized correctness over surface. The work now is to refine surface without diluting what is already right.

## C2. What still feels prototype-level

- The polygon redraw is mechanical because the layer is torn down and rebuilt on every state change, leaving no SVG element for the browser to transition.
- The dispatch card is structurally seven panels, not one narrative.
- The Watchlist tab control reads as tabs rather than mode declarations.
- The map legend uses the word "Vulnerability."
- The Activity icon in the layer rail looks like a clipboard rather than an archival affordance.
- "+ Add an operator note for this tract" reads as a button microcopy.
- The "Recommend" verb on intervention sections suggests a model; the engine doesn't recommend, it derives.
- The status strip's "refresh" link is a consumer browser metaphor.
- The Brampton subtitle in the resident view says "Brampton · Preparedness" — informational, when it could be editorial.
- The empty-state copy in the watchlist is short but reads as developer placeholder.
- The dispatch-card animation slides in once and stops; there is no quiet ongoing life.
- Critical advisory pips on the map are static dots rather than restrained signals.

## C3. What already feels institutional-grade

- The palette: twelve colors, single warm off-white canvas, one chromatic register reserved for vulnerability.
- The typography system, anchored in Inter with a tight scale and tabular figures throughout.
- The hairline border discipline (0.5px everywhere, no shadows, no glow).
- The lens architecture: four stakeholder views from one engine, URL-shareable, audit-logged.
- The rule-derived advisory engine with evidence chips that name their source datasets.
- The provenance footer that ends every dispatch card and the resident view.
- The single-canvas layout with under 100 pixels of persistent chrome.
- The choice to compute EWEI rather than claim SAIDI we don't yet have.
- The deterministic, no-LLM framing of the entire intelligence layer.
- The audit log structure designed to swap to a server-side store without UI changes.
- The print-to-PDF pipeline that uses the browser's native print rather than a client-side library.

These are the load-bearing decisions. They should not move.

## C4. Map atmosphere refinements

The map should feel framed rather than infinite. A radial vignette (transparent at 60% of the radius to `rgba(15,23,42,0.04)` at 100%) applied as a `pointer-events: none` overlay communicates a held boundary; an operator's eye stops at the city limits rather than drifting outward.

The base tile opacity should drop from 55 to 45, and the labels-only tile from 80 to 65. The canvas — the warm off-white — should carry slightly more weight than the basemap. The basemap exists to ground the polygons in geography; it should not compete with them for attention.

Under Heatwave, a 1% warm tint overlay (e.g. `rgba(154,52,18,0.012)`) applied to the canvas. Under Ice Storm, a 1% cool tint (`rgba(63,98,18,0.010)`). Imperceptible at the conscious level. Operators report the second instance feeling "different" without knowing why. Atmosphere lives in the unspoken layer.

## C5. Cartography refinements

Soften tract borders: drop the hairline color from `#E8E4D8` to `#EFEBE0` and the default weight from 0.5 to 0.4. Polygons should read as filled regions, not bordered cells. The hairline reappears at full weight only on hover and selection.

Suppress all labels except neighbourhood names below zoom 12; roads invisible. Above zoom 14, allow major arterials at 50% opacity. The cartography should change with zoom, not lay all information at all scales.

The bottom-right legend caption should change from "Vulnerability" to "Composite stress index". Three words, calibrated, declarative. Or remove the legend entirely below 1280px viewport width — it's the kind of artifact a printed atlas omits.

Critical zones should *not* glow. They should sit at the top of the choropleth ramp, distinguishable by deep ember saturation, with the hairline border surfacing only on hover. The signal is the colour, not motion.

## C6. Motion refinements

Reintroduce CSS transitions on `.leaflet-interactive`, but *only* on `fill` at 640ms and `fill-opacity` at 320ms with the institutional easing. Do not transition stroke, stroke-width, or stroke-opacity — those should remain snap-responsive so selection and hover feel decisive rather than lagged.

Pair the transition with the architectural fix that unlocks it: build the GeoJSON layer exactly once when tracts first arrive, and re-style in place via `layer.eachLayer` + `setStyle` on subsequent state changes. The SVG paths persist; the browser sees attribute changes; the transitions apply. The CSS is inert without this refactor; both must ship together.

Dispatch-card slide-up stays at 320ms. Mode-switch active-state transition: 180ms. Lens chip hover border: 80ms. No new animations beyond these.

## C7. Hover choreography refinements

Hovering a tract should dim *other* tracts to 65% of their current opacity — not 35%. Thirty-five-percent is the selection-pinned state; hover is softer because hover is exploratory. Tracts within ~1.5 km of the hovered centroid dim to 80%, communicating spatial neighbourhood without drawing relationship lines.

Hover-hold delay before applying the dim: 100ms. Tooltip-appear delay: 220ms. Both prevent flicker on cursor sweeps and reduce visual noise.

While hover is active, the labels-only tile layer bumps from 65% to 78% opacity. The map sharpens slightly under focused attention. Once hover releases, it relaxes.

## C8. Typography refinements

Body type drops from 14/22 to 13.5/22. The half-pixel reduction reads as editorial restraint without sacrificing legibility.

Dispatch-card title from 18 → 17, tracking from -0.01 to -0.012. Stress Index figure from 16 → 17, tracking -0.006. Tabular figures throughout get a slight tightening with `letter-spacing: -0.005em` to compensate for Inter's tabular-figure default width.

All-caps micro-labels: tighten tracking from 0.14em to 0.12em where they sit in clusters (the ribbon right side, the dispatch card section headers). Keep 0.14em for standalone section markers.

Drop `font-weight: 500` from anything titled. Inter at 400 weight in size 17 with -0.012em tracking carries the same emphasis as 500/16 without the SaaS density.

## C9. Spacing refinements

Dispatch card section padding: drop from `py-4` to `py-3.5`. Tighter vertical rhythm reads as institutional rather than dashboard.

Narrative paragraph line-height from 1.65 to 1.7. The sentences breathe.

Add 14 pixels of vertical space before the Preparedness Intelligence section to mark it as the dispatch card's anchor point. Reduce inter-advisory spacing within an audience block by 2 pixels. The block becomes a denser, more legible unit.

Status strip horizontal padding: 16 → 20. Per-source chips get room.

Ribbon height: 36 → 40. One pixel of breath around the wordmark; the strip stops feeling compressed.

## C10. Preparedness intelligence refinements

Every tract should always carry a one-sentence preparedness posture in the dispatch card's narrative — even under baseline conditions, even when zero rules fire. The text is rule-derived (lookup by computed tier), never generated. Examples:

> *Baseline*  Preparedness posture stable. Cooling access and infrastructure redundancy remain within tolerance ranges under current conditions.

> *Elevated*  Localized heat vulnerability detected among renter households in aging housing stock. Preparedness monitoring recommended during prolonged heat events.

> *High*  Elevated exposure detected. Limited cooling accessibility combined with high social vulnerability may increase emergency response pressure during sustained heat conditions.

> *Critical*  Severe compounded vulnerability. Restoration sequencing and door-to-door wellness coordination warranted at first indication of event onset.

This posture sits as the lead of the narrative paragraph, *before* the demographic facts and *before* the rule-derived advisories. The operator's first read is the posture; the supporting evidence sits below.

Three of these tier strings are appropriate to ship in the first refinement. The fourth (the Critical line) needs a SME review before going live — the language carries operational weight.

## C11. Intervention intelligence refinements

The current intervention catalog is correct in shape — quantified delta, population reached, cost, time-to-effect, authority, confidence — but stops at recommendation. The next step is *activation*.

When an operator marks an intervention activated, the system should:

1. Apply a projected vulnerability delta to the tract's score for the duration of the active scenario (visible in the map and watchlist).
2. Record the activation in the audit log with the activating operator, lens, timestamp, and projected impact.
3. Surface a small "activated interventions" chip in the status strip showing the count active citywide.
4. Reconcile against actual outcome when the scenario ends — the operator confirms or amends the actual impact, building the empirical calibration loop the rule catalog needs.

Phase 2 introduces a "what if" preview: hovering an unactivated intervention temporarily shows the projected post-intervention choropleth for 8 seconds. Reserved.

The vocabulary throughout should shift from "recommend" to "derive". The engine doesn't recommend. It derives. The distinction matters institutionally.

## C12. Operational trust refinements

Methodology accessible from a single keystroke (`?`). The overlay is a calm reading surface — six paragraphs explaining the PCA composite, the scenario weighting, the rule catalog, the data sources, the limitations, the version. Designed to be linkable; designed to be defensible to a council member who reads it on a phone in a hallway.

Every numeric value reveals dataset vintage and last-refresh timestamp on hover. Implementation: a `title` attribute is the minimum; a styled tooltip is better.

Build version + rule catalog version stamped on every exported incident brief. The brief should be reproducible: a reader 14 months from now should be able to identify exactly which version of the engine produced it.

Operator notes accept an optional signature line. Set once per session in a "session identity" prompt at first action. Stored locally only; cleared on session end. Future server-side audit log promotes this to actual auth.

## C13. Temporal system refinements

The status strip's per-source freshness chips currently show 5px coloured dots. Reduce to 3px. Add a 200ms in-flight flicker (opacity to 0.5 and back) when a poll is in flight — communicates active work without animating idle state.

The right edge of the ribbon carries a 0.5px hairline that briefly flashes (opacity 0 to 0.6 to 0 over 280ms) on each polling cycle completion. The flash is below the threshold of conscious notice; an operator sitting with the screen for ten minutes will register that something is happening every two-to-five minutes without ever consciously seeing the flash.

The "refresh" link is renamed "resync" or removed entirely (the auto-poll covers it).

The dispatch card carries a small timestamp at the top — "Recalculated 47s ago" — that updates every ten seconds. The number quietly rolls forward. It tells the operator the engine is alive.

## C14. Live infrastructure refinements

The current product is operationally accurate but psychologically static. The fix is not animation; it is *evidence of continuous awareness*.

Replace "Activity log" (the tray header) with "Operational ledger". The phrase carries institutional weight without being grandiose.

The status strip's source chips read in the present tense: "Outage feed · 12s ago", "Weather sync · active", "Preparedness · recalculated 41s ago". Each phrase has a state, not a generic timestamp. Operators glance and read meaning.

Add an unobtrusive "Threshold re-evaluation cycle: every 90s" line at the bottom of the methodology overlay so operators understand the system's pulse. Honesty about cadence builds trust.

## C15. Narrative UX refinements

Dispatch card lead paragraph re-composes from three stacked elements (place name, CTUID + tier, narrative) into one continuous editorial unit:

> *Heart Lake West* · CT 5350123.03. 14,200 residents. Forty-seven percent renter. Sixty-two percent pre-1980 housing. Two designated cooling centres within 2.5 km. Preparedness posture under the active heatwave: elevated.

The score figure remains in its right cluster; everything else flows as prose. The composition reads as a dispatch, not a card.

Contributing factors collapse from five MetricRows into a 2 × 3 dense grid with smaller type, freeing vertical real estate for the Preparedness Intelligence section to anchor the card.

Empty states throughout shift from "No tracts match." to quiet sentences: "No tracts cross the elevated threshold under the active scenario."

## C16. Emotional design refinements

Critical and Elevated urgency labels are typeset in the same `--ink` color as everything else. The 2px urgency bar carries the chromatic signal. Color in text is the SaaS pattern; color reserved to a single architectural element is the institutional pattern.

The word "active" disappears from labels where it implies action. "Active outages" becomes "Outages". "Active scenario" stays — there it carries semantic meaning.

Numeric figure weight one step lighter than its label: figure at 400 weight, label at 500. Inverts the dashboard convention where numbers shout and labels whisper. In an institutional register, *meaning* carries weight and *numbers* sit calm.

Empty states are sentences, not illustrations. Loading states are sentences, not spinners. The system has the patience that the data demands.

## C17. Panel refinements

Dispatch card width: 420 → 440. Slight increase gives the narrative paragraph room to breathe and the contributing-factors grid room to compress.

Watchlist tray: 320 → 300. Slightly tighter, more focused.

Activity tray: matches the watchlist at 300, and is renamed "Operational ledger" per §C14.

Status strip height: 24 → 28. Per-source chips at slightly larger type, more legible at glance.

Ribbon height: 36 → 40. One pixel of breath around the wordmark.

All four numbers chosen to maintain the proportional rhythm of the original layout while easing density.

## C18. Hierarchy refinements

Dispatch card section order should be:

1. Identity strip (place name, CTUID, score)
2. Narrative paragraph (with preparedness posture as the lead sentence)
3. **Preparedness intelligence** (rule-derived advisories, audience-grouped)
4. Contributing factors (compressed 2×3 grid)
5. Current conditions
6. Energy-cost exposure
7. Operator note
8. Provenance footer

The reorder puts the operational answer immediately after the narrative. Metrics support the answer; they do not lead. Operators read the dispatch card and within four sentences know what is happening, what it means, and what is being recommended.

## C19. Animation timing recommendations

Existing tokens (`--dur-instant: 80ms`, `--dur-brisk: 180ms`, `--dur-deliberate: 320ms`, `--dur-atmospheric: 640ms`) stay. Easing: `cubic-bezier(0.22, 1, 0.36, 1)`.

New constraints:

- Choropleth fill interpolation: 640ms atmospheric easing
- Choropleth fill-opacity (hover, selection dim): 320ms
- Stroke/border weight: snap (no transition)
- Dispatch card slide-up: 320ms (existing)
- Mode-switch tab transition: 180ms
- Lens chip hover border: 80ms
- Tooltip appear: 220ms hover-hold delay, then 80ms fade
- Source-chip in-flight flicker: 200ms
- Ribbon hairline flash on poll completion: 280ms
- `prefers-reduced-motion`: all durations collapse to 80ms; no animations, no flickers

No springs. No bounce. No overshoot.

## C20. Opacity systems

Canvas vignette: radial gradient transparent at 60% radius, `rgba(15,23,42,0.04)` at 100%.

Base tile layer: 45%. Labels-only tile layer: 65%.

Tract polygon fill opacity by percentile and state:

| State | Lower quartile (≤25%) | Upper quartiles | Hovered | Selected | Dimmed (non-selected) |
|---|---|---|---|---|---|
| At rest | 0.22 | 0.55 | — | — | — |
| Hover | +0.18 relative | +0.18 relative | (target) | — | 0.65 of current |
| Selection pinned | 0.18 | 0.18 | — | 0.55 | 0.18 |

Stroke colors: default `#EFEBE0` (0.4px), hover `rgba(15,23,42,0.45)` (1px), selected `#0F172A` (1.2px) with a 1px outer ring at `rgba(15,23,42,0.08)`.

Advisory pip background: full alert color at 100%, with `box-shadow: 0 0 0 1px rgba(255,255,255,0.7)` for canvas separation. No pulse. No glow.

## C21. Layer hierarchy

Leaflet pane ordering, top to bottom of the visual stack:

1. Tooltip (z=700)
2. Advisory pips (z=620)
3. Outage pins (z=615)
4. Shelter pins (z=610)
5. Vignette overlay (z=420, pointer-events: none)
6. Tract polygons (z=400, the GeoJSON pane)
7. Labels-only tiles (z=350)
8. Base tiles (z=200)

UI overlay z-stack:

1. Command palette modal (z=900, Phase 2)
2. Methodology overlay (z=800)
3. Activity tray / Operational ledger (z=700)
4. Dispatch card (z=600)
5. Watchlist tray (z=550)
6. Layer rail (z=500)
7. Status strip + Ribbon (z=400)

## C22. Operational UX improvements

The next operational affordances, ranked by institutional return:

1. **Cmd-K command palette.** Linear-style modal: search neighbourhoods, change scenario, change lens, open watchlist, export brief, open methodology. Single keystroke, every key consequential.
2. **Cmd-P** prints the active dispatch card from anywhere.
3. **? key** opens methodology.
4. **Right-click on a tract** opens contextual menu: pin to watchlist · add note · export brief · copy CTUID.
5. **Multi-tract comparison** via Cmd-click (Phase 2): up to three tracts compared side-by-side in a peelable bottom drawer.
6. **Replay scrubber** (Phase 2): scrub through the last 90 days of scenario evaluations, watching the choropleth evolve.

## C23. CSS recommendations

The single CSS change that unlocks the most refinement-per-line:

```css
.leaflet-interactive {
  transition:
    fill         640ms cubic-bezier(0.22, 1, 0.36, 1),
    fill-opacity 320ms cubic-bezier(0.22, 1, 0.36, 1);
}
```

Paired with the architectural fix in §C6, this single rule turns mechanical recolours into atmospheric ones.

Vignette overlay as a single absolutely-positioned element in MapPanel, `pointer-events: none`, `background: radial-gradient(ellipse at center, transparent 60%, rgba(15,23,42,0.04) 100%)`. Total cost: nine lines including the closing brace.

Default border-radius drops to 3px. Eliminates the residual SaaS softness at corners.

Numeric typography utility:

```css
.tabular {
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.005em;
}
```

Reduce the existing `.figure` and dispatch-card title weights from 500 to 400, sizes by 1px, tracking tightened by 0.002–0.004em.

## C24. Interaction refinements

Click a tract → dispatch card. Pan toward centroid *only* when the centroid sits in the outer 20% of the viewport — avoids fidgety pans during exploration, applies weighted focus during distant selection.

Esc dismisses dispatch card → if no dispatch open, dismisses watchlist → if neither, dismisses dialogs. Stacked dismissal, predictable.

Cycle scenario via Space. Cycle lens via L. Open watchlist via W. Open Operational ledger via A. Open methodology via ?. Open command palette via Cmd-K. None of these are required for use; all of them reduce friction for daily operators.

Hover and selection both honour the dim choreography in §C7.

## C25. Implementation priorities (the surgical ten)

In order of return-per-pixel-of-change:

1. **Map atmosphere unlock** — refactor MapPanel to build the GeoJSON layer once and restyle in place; add CSS transitions on `fill` and `fill-opacity` only. The choropleth begins to bleed between scenarios. Single biggest perceptual upgrade.
2. **Preparedness posture sentence** — rule-derived, never empty, leads the narrative paragraph in the dispatch card.
3. **Dispatch card section reorder** — Preparedness Intelligence anchored immediately after the narrative; metrics demoted.
4. **Map vignette + tile-opacity reduction** — three CSS changes; the canvas reads as framed and warm.
5. **Numeric typography tightening** — `tabular-nums` + `-0.005em` letter-spacing on every tabular figure.
6. **Terminology pass** — "Active outages" → "Outages"; "Recommend" → "Derive"; "Refresh" → "Resync"; "Activity log" → "Operational ledger"; "Vulnerability" (legend) → "Composite stress index" or removed.
7. **Source chip refinement** — 5px → 3px dots; 200ms in-flight flicker; ribbon hairline 280ms flash on poll completion.
8. **Hover choreography** — dim others to 65% (not 35%); 100ms hover-hold; 220ms tooltip delay.
9. **Cmd-K command palette skeleton** — modal with six commands; expandable later.
10. **Methodology overlay** — `?` key opens a calm reading surface; pageless, dismissible, linkable.

Each item is one to four hours of careful work. Together they move the product from "excellent prototype" to "this could ship to a municipality on Monday."

## C26. Palantir-grade refinements

The institutional ones:

- Methodology is a first-class surface, opened with a single key.
- Rule catalog version stamped on every export.
- Audit-log entries timestamped to the millisecond.
- Source citation accessible from every numeric value.
- Stable IDs (`ctuid`, advisory `id`, intervention `id`) used consistently for cross-system reference.
- Multi-tenant configuration shape declared in code, even if v1 is single-tenant (`tenant: 'brampton-pilot'`).
- A "decision" data model that captures operator + time + lens + conditions + action + reason. The substrate of a learning system.
- Server-side audit log (Phase 2). The localStorage shape ports directly.
- Read-only API for the rule catalog so it can be cited by external systems (Phase 2).

## C27. Apple-grade refinements

The restraint ones:

- Half the visible affordances on the resting screen, without halving capability.
- Single typeface (Inter — already done).
- Three weights maximum (400 / 500 / no others).
- One alert hue (deep ember — already done).
- No drop shadows anywhere.
- No rounded corners beyond 4px.
- Empty states are sentences, not illustrations.
- Loading states are sentences, not spinners.
- The interface does nothing on its own that the operator did not invite.

The combined Palantir-and-Apple property: a system where every visible element is institutionally defensible *and* aesthetically restrained. They are not opposed; they share a discipline.

## C28. Final evolved product philosophy

Threshold is the room where the city's stress state becomes visible.

The chrome of the room is as quiet as the room itself. The intelligence is as legible as the source data behind it. Every advisory is reproducible from the threshold it crossed; every choropleth value is defensible at a city council hearing; every operator action is captured in a ledger that survives the operator.

The map is the product. Everything else is summoned by the operator's spatial gaze and dismissed when their attention moves on. The interface gets *quieter* under pressure, not louder. The system has the patience that the data demands.

The product evolves not by adding features but by removing chrome and refining the existing surface. Each release should reduce the visible affordance count while increasing the engine's depth. The interface is finished when an operator cannot tell whether it was designed in 2026 or 2031 — it should feel like it always existed, because the work it is doing always mattered.

The product is finished when an operator can no longer remember what the interface looks like, only what the city looks like through it.

---

*Addendum C — Refinement Brief. Surgical recommendations to move Threshold from excellent prototype to deployable civic infrastructure. None of the recommendations in this addendum should be implemented without explicit prioritization; the surgical-ten in §C25 is the suggested order.*

---

# Addendum D · Billion-Dollar Feature Roadmap

*Appended after the platform built nine of the thirteen billion-dollar surfaces in one sprint. This addendum catalogs what shipped, what's deferred, and the institutional path for each.*

## D1. What shipped in the billion-dollar release

Nine of the thirteen features identified as compounding moats are now live in the codebase.

**Predictive stress forecast** (`forecast.ts`, `ForecastWidget.tsx`). Deterministic 24-hour citywide stress projection at 0/6/12/24 hour horizons. Each forecast point carries a stress index, equity-weighted exposure, a driver phrase, and a confidence tier. The model is calibrated to scenario-specific pressure coefficients (heatwave peaks at +12h, ice storm ramps and persists), with outage acceleration decaying over time. Forecast widget anchors top-left of the map and feeds the situation report. Phase 2 swaps the deterministic model for an LSTM trained on historical events; the UI consumer doesn't change.

**Wall Display mode** (`WallDisplay.tsx`). Toggle via `F` key or command palette. Full-screen operations view: strips all chrome, map fills 70% of the width, right column carries large editorial type — citywide stress index in 64px, advisory counts, the top six urgent tracts each with their lead advisory, the 24-hour forecast. Designed to be projected onto an EOC wall during an event. The "looks expensive, looks inevitable" surface that institutionalizes the product in city operations.

**24-hour Situation Report** (`SituationReport.tsx`). Toggle via `R` key or command palette. Six-section printable institutional briefing: executive summary, forecast table, city-wide patterns, ranked operator interventions by impact-per-dollar, active restoration queue, signoff with versioning. Uses the browser's native print pipeline for one-keystroke PDF generation. The document the operations chief brings to morning briefing — sticky workflow that converts pilots to contracts.

**Decision Replay** (`DecisionReplay.tsx`). Toggle via `Shift+R`. Timeline scrubber over the operational ledger. Pin a position and the cursor entry shows exactly which lens was active, what action was taken, on what target, with what optional note. Includes play/pause autoplay, prev/next stepping, and a window of surrounding entries. Carries a chain-intact indicator that reads from the cryptographic hash chain. **The single feature that wins regulator conversations.**

**Cross-Jurisdiction comparison** (`CrossJurisdiction.tsx`). Toggle via `Shift+C`. Side-by-side benchmarking against placeholder peer cities (Mississauga, Hamilton, Surrey) on stress index, critical tract count, cooling centres per 100k, outage EWEI. Percentile rank of the active tenant on each metric. The network-effect surface that makes the platform inevitable across municipal markets.

**Multilingual i18n** (`i18n.ts`). English, Punjabi (ਪੰਜਾਬੀ), Hindi (हिन्दी) translation tables for the Resident view chrome and provenance language. Locale switcher in the resident header. URL-shareable via `?lang=pa` or `?lang=hi`. Addressable-market expansion: Brampton is 25% Punjabi-speaking; Surrey, Edmonton, and most GTA municipalities have similar demographics.

**Tenant theming layer** (`tenant.ts`). Multi-tenant configuration with name, wordmark, subtitle, theme overrides, geographic centre/zoom, and population. Four tenant slots configured (Brampton pilot live, Mississauga / Hamilton / Surrey demo). CSS variable swap on tenant change. URL-shareable via `?tenant=brampton-pilot`. The white-label foundation that scales the same code to fifty municipal SKUs.

**Signed audit log hash chain** (`auditLog.ts`). Every audit entry now carries a SHA-256 hash of its content combined with the previous entry's hash. Tamper-evident chain. The Decision Replay surface reads the chain integrity status. External anchoring to a public timestamping service is the next step toward regulatory-grade attestation; the chain structure is the substrate.

**Command palette + keyboard shortcuts** for all of the above. `Cmd-K` opens the palette with every new surface listed. Keyboard bindings: `F` Wall Display, `R` Situation Report, `Shift+R` Decision Replay, `Shift+C` Cross-Jurisdiction, `?` Methodology, `W` Watchlist, `A` Operational Ledger, `Space` cycle scenario. Esc walks a strict dismissal stack across all overlays.

## D2. What was deferred and why

Four features in the billion-dollar plan were deliberately not implemented. Each requires partner systems, customer contracts, or infrastructure work that cannot be honestly faked.

**Native OMS / CAD integrations.** Requires partnership with Alectra (or another utility) to access their Outage Management System and the City of Brampton to integrate with their Computer-Aided Dispatch. These integrations are 12–14 week engagements per partner, including their security review and data-sharing agreement. **Path forward:** the operator-tier intervention catalog already has the data shape Alectra would consume (`{intervention, ctuid, projectedDelta, populationReached, costPerDay, timeToEffect, authority, confidence}`); a small adapter writes this to OMS attribute tables once the integration is signed. The Cross-Jurisdiction surface demonstrates the federation pattern that makes this an inevitable conversation.

**Compliance certifications (SOC 2, FedRAMP, Protected B).** Each takes 6–12 months and significant external auditor budget. **Path forward:** ship Phase 1 with the audit-log hash chain in place (done), then engage a compliance firm in parallel with the first commercial pilot. SOC 2 Type II is the right first certification; it unlocks municipal procurement at scale.

**Resident push notifications.** Requires a service-worker-backed PWA or native app, push notification server infrastructure, and per-tract subscriber registry. The Resident view (`ResidentView.tsx`) is the substrate — same engine, same advisories, same translation layer. **Path forward:** add `manifest.json` + service worker, integrate with Web Push protocol, build a small server-side subscriber-registry-by-tract service. Estimated 4–6 weeks. Should ship together with at least one production-deployed tenant.

**Insurance / re-insurance data API.** Requires a customer contract before infrastructure investment — reinsurers want SLAs, data licensing terms, and audit posture in their procurement gate. **Path forward:** the data shape exists internally already (every tract carries CISV/CISR scores, demographic factors, scenario-conditioned stress); a read-only signed API surface is a 6-week build once the contract is in motion. SwissRe and MunichRe both have public RFP processes for civic risk data.

## D3. The 18-month strategic sequence

The shipped features unlock a clear go-to-market sequence:

**Months 1–3.** Convert the Brampton operational pilot into a five-municipality reference deal using the Wall Display and Situation Report as the demo-closing surfaces. Each new tenant lights up the Cross-Jurisdiction comparison and increases the gravitational pull on the sixth.

**Months 4–6.** Engage Alectra on the native OMS integration. The operator-tier intervention catalog has the shape; the contract has the friction. Parallel SOC 2 Type II engagement starts now.

**Months 7–12.** Ship the LSTM-based predictive forecast (real history backs the model), the resident PWA with push notifications, and the federal-program-eligibility module (CMHC / DMAF / NDMP integration). Win the first FEMA-funded mid-sized US municipal pilot.

**Months 13–18.** Insurance API as the first revenue line independent of municipal procurement cycles. White-label deployment for the second utility customer. Federated tenancy at the provincial level (Ontario Emergency Management at minimum).

The Series A is at month 6 — five tenants, Alectra integration in motion, SOC 2 imminent. Eighty-to-one-twenty million pre-money. The Series B is at month 14 — ten tenants, two utility integrations, insurance line live, FedRAMP in process. Three-hundred-to-five-hundred million pre-money. The path to $1B+ enterprise value runs through Series C at month 24.

## D4. The defensibility property

What makes this thirteen-feature plan billion-dollar is that each feature compounds the moat of the next. Wall Display sells the platform into an EOC. Situation Report makes the EOC dependent on the daily ritual. Decision Replay makes the platform defensible to regulators. Cross-Jurisdiction makes adjacent municipalities feel left out. The audit-log hash chain makes the system pass federal procurement. The tenant theming layer makes "their" version of Threshold theirs. Multilingual makes Threshold the only product that actually reaches the affected populations.

No single feature is the moat. The moat is the property that ten years of municipal procurement cycles produces: a deeply-integrated, deeply-audited, deeply-multilingual civic operations layer that every adjacent stakeholder consumes through their own surface, and that no replacement can credibly displace without re-running every audit.

That is the property worth a billion dollars.

---

*Addendum D — Billion-Dollar Roadmap. Nine of thirteen surfaces shipped in this release. Four deferred for partner / compliance / customer-contract reasons. The 18-month sequence to Series C documented; the defensibility property articulated.*
