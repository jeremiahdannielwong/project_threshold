# Threshold UI Redesign — Implementation Prompt

You are working on the Threshold civic preparedness platform: a React + TypeScript + Vite + Tailwind frontend with a FastAPI backend. The codebase is at `frontend/src/`. The design system uses CSS custom properties defined in `styles/index.css` — use these tokens, never raw hex values except for the explicit header theme maps.

Design tokens (the important ones):
- `var(--canvas)` = #FAFAF7, `var(--surface)` = #FFFFFF, `var(--surface-2)` = #F4F2EC
- `var(--hairline)` = #E8E4D8, `var(--ink)` = #0F172A, `var(--ink-2)` = #3F3F46, `var(--ink-3)` = #71717A, `var(--ink-4)` = #A1A1AA
- `var(--alert)` = #9A3412, `var(--alert-mid)` = #C2410C, `var(--alert-soft)` = #D5A878
- `var(--warning)` = #854D0E, `var(--positive)` = #3F6212
- Inter typeface, 0.5px hairlines, no drop shadows anywhere.

The current layout uses a 36px `LayerRail` on the far left, a full-viewport `MapPanel`, a floating `dispatch-card` (absolute, bottom-left, 420px wide, defined as `.dispatch-card` in index.css) rendered by `RightPanel.tsx` when a tract is selected, and a floating `IntelligencePanel` (absolute, bottom-right, 240px). This must be replaced with the proper 3-column layout described below.

---

## 1. Layout Restructure — `App.tsx` and `index.css`

Change the `Canvas` component in `App.tsx` from a single-layer absolute stack to a flex row:

```
LayerRail (36px, flex-shrink-0)
  LeftSidebar (conditional, 420px, flex-shrink-0) — only when tract selected
  MapPanel (flex-1, relative)
  RightSidebar (always visible, 280px, flex-shrink-0)
```

- Remove `<IntelligencePanel />` from Canvas — it is replaced by RightSidebar.
- `RightPanel.tsx` is renamed/refactored into `LeftSidebar.tsx` (same filename is fine, just structurally it moves).
- The `.dispatch-card` CSS class is no longer used for positioning — delete its `position: absolute`, `bottom`, `left`, `width` properties and replace with `height: 100%; display: flex; flex-direction: column; overflow: hidden;`. Keep its `background`, `border-right: 0.5px solid var(--hairline)` (replace border with border-right only), and `border-radius: 0`.
- `MapPanel` must lose any hardcoded left offset; it simply fills `flex-1`.
- `ForecastWidget` and `SuggestionBanner` remain absolutely positioned within `MapPanel`'s coordinate space (MapPanel is `position: relative`), so no changes needed there.
- The tray-aware left offset logic in `RightPanel.tsx` (the `cardLeft` variable) must be removed — trays (WatchlistTray, ActivityTray) now overlay the map, not the sidebar.
- `StatusStrip` stays at the bottom full-width.

---

## 2. Left Sidebar — Redesign `RightPanel.tsx`

This is the tract detail panel. It appears only when a tract is selected (`if (!selected) return null` then renders a sidebar, not a floating card). Full height, scroll internally.

### 2a. Header — colored by vulnerability tier

Keep the existing `HEADER_THEMES` map (Baseline / Elevated / Moderate / High / Critical / Severe). The header should:

```
[colored background, padding 16px 18px 20px]
  Row 1: Small square bullet (6×6px, theme.dot color) + neighbourhood name (18px, 600 weight, theme.fg) + right-aligned: score number (28px, 500 weight, theme.fg) / "SCORE" label (9px, theme.fg2)
  Row 2: CT number (10px, uppercase, theme.fg2) + right-aligned: tier badge pill ("MODERATE", 10px uppercase, theme.fg, theme.scoreBg background, 12px horizontal padding, 4px vertical, border-radius 12px)
  Gap 12px
  Narrative paragraph (12px, theme.fg2, line-height 1.65)
  [No separate score box — score is inline in row 1]
```

The `Bookmark`, `Printer`, and `X` action buttons move into a small 3-button row in the top-right of row 1, between the name and score. Use `theme.fg2` color, `background: none`, `border: none`.

### 2b. Preparedness Intelligence section

```
Section header row:
  Left: shield icon (Lucide `Shield`, size 13, ink-3) + "PREPAREDNESS INTELLIGENCE" (10px, uppercase, tracking-[0.14em], ink-3)
  Right: "{n} ADVISORIES" badge — background rgba(154,52,18,0.07) if n>0 else rgba(63,98,18,0.06), text color var(--alert) if n>0 else var(--positive), 10px uppercase, border-radius 4px, px-2 py-0.5

Posture sentence (13px, ink, mb-3) — the preparednessPosture(advisories).sentence

Audience blocks: for each audience in audienceOrder with items.length > 0:
  Audience header: icon (Users size 11 for community_orgs, Home size 11 for residents, Wrench size 11 for municipal_utility) + AUDIENCE_LABEL (10px, uppercase, tracking-[0.14em], ink-3) + " · {count}"
  Advisory items (not full AdvisoryCard — compact format):
    Indented row (pl-4): urgency left-bar (2px wide, urgColor) | headline (13px, ink, font-medium) | ROUTINE/ELEVATED/CRITICAL badge (10px, uppercase, urgColor) | ChevronRight icon (size 12, ink-4) on far right
    Detail paragraph (12px, ink-3, leading-relaxed, mt-1, pl-4)
    Trigger pills (11px, ink-2, tabular, mt-1.5, pl-4)
    Impact row (11px, tabular, ink-2, border-t hairline, mt-2, pt-2, pl-4) — only if a.impact exists
    Timeframe + authority footer (10px, uppercase, tracking, ink-4, mt-1.5, pl-4)
    border-b hairline between items, last:border-0
```

### 2c. Contributing Factors section

Section header: "CONTRIBUTING FACTORS" (10px, uppercase, tracking-[0.14em], ink-3)

Each factor row now has a leading icon (size 13, ink-3) before the label:
- Renter households → `Users` icon
- Pre-1980 housing → `Home` icon  
- Low-income share → `TrendingDown` icon
- Median income → `DollarSign` icon
- Resilience (CISR) → `Shield` icon

Row layout:
```
[icon 13px, ink-4, w-5 flex-shrink-0] [label 12px, ink-2, flex-1] [bar: flex-1 max-w-[80px] h-[3px] bg-hairline > filled div] [value 13px, tabular, ink, w-12, text-right]
```

Bar fill color: same `barColor` (= `rampColor(p)`). CISR row: no bar, value colored var(--positive) if ≥ 0, var(--alert-mid) if < 0.

### 2d. Current Conditions section

Replace the 2×2 grid with a **4-tile horizontal row**: Temperature | Humidity | Wind | Cooling access

Each tile:
```
[icon: Thermometer/Droplets/Wind/Snowflake, size 14, ink-3]
[label: 10px, uppercase, tracking, ink-3]
[value: 18px, font-medium, tabular, ink]
[sub: 10px, ink-4 — only if relevant, e.g. "heat-stress threshold"]
```

Tiles are equal-width (`flex-1`), separated by `border-r border-hairline last:border-0`. Tile background: `var(--surface-2)`, padding 10px 12px, no border-radius (the section itself has the border).

For "Cooling access" tile: value = `"{shelterCount} within 2.5 km"` or `"None"`. Icon = Snowflake (heatwave) or Flame (ice storm) or MapPin (baseline).

Stale indicator: if weatherStale, show a tiny amber dot (4×4px, warning color, border-radius 50%) next to the "CURRENT CONDITIONS" section header.

---

## 3. Right Sidebar — Rewrite `IntelligencePanel.tsx`

Replace the floating card with a proper fixed sidebar. Structure:

```tsx
<aside
  className="flex flex-col bg-surface border-l border-hairline overflow-hidden flex-shrink-0"
  style={{ width: 280 }}
>
  {/* Scrollable body */}
  <div className="flex-1 overflow-y-auto min-h-0">
    <ActiveAdvisories />
    <InterventionTools />
    <SystemStatus />
    <DataSources />
  </div>
</aside>
```

**No absolute positioning, no animation** — it is a flex child of Canvas.

### 3a. Active Advisories

```
Section header (px-4 pt-4 pb-2):
  "ACTIVE ADVISORIES" (10px, uppercase, tracking-[0.2em], ink-3) + right-aligned count badge (same style as dispatch card advisory badge)
  Collapse chevron button (ChevronUp/Down, size 14, ink-4) — toggles section open/closed

Advisory cards (when expanded):
  For each unique advisory headline from the city-wide feed (take rollupByTract, flatten to unique top-N by urgency, max 6):
  Card (px-4 py-3, border-b border-hairline, hover:bg-surface-2/50):
    Row 1: [Icon: Sun for heat, Zap for outage/power, CloudSnow for ice, AlertTriangle for generic] (size 16, color = URGENCY_COLOR[urgency]) | headline (13px, ink, font-medium, leading-snug) | ChevronRight (size 13, ink-4) far right
    Row 2: description/detail (12px, ink-3, leading-relaxed, mt-1, ml-6)
    Row 3 (if timeframe): "Valid until…" or timeframe text (10px, ink-4, mt-1.5, ml-6, uppercase tracking)

When 0 advisories: "No active advisories. Standing readiness." (12px, ink-3, px-4 py-3)
```

The advisory data for this panel comes from the existing `rollupByTract` Map and `citywideCounts` from `useApp()`. Deduplicate by taking the `topHeadline` per rollup entry, sorted by urgency (critical first), max 6 rows.

### 3b. Intervention Tools

```
Section header (px-4 pt-4 pb-2): "INTERVENTION TOOLS" (10px, uppercase, tracking-[0.2em], ink-3)

Tool cards (these are static/placeholder — real routing to be wired later):
  Three tools, each (px-4 py-3, border-b border-hairline, cursor-pointer, hover:bg-surface-2/50):
    [Icon: MapPin/ArrowUpRight/BarChart3, size 14, ink-3] | title (13px, ink, font-medium) | ChevronRight (size 13, ink-4)
    subtitle (11px, ink-3, mt-0.5, ml-6)

Tools:
  1. MapPin | "Deploy temporary cooling site" | "Simulate impact and coverage"
  2. ArrowUpRight | "Priority restoration planning" | "Optimize restoration sequence"  
  3. BarChart3 | "Resilience scenario modeling" | "Compare intervention outcomes"

"View all tools" link (px-4 py-2, 11px, ink-3, hover:text-ink, uppercase tracking-[0.1em])
```

### 3c. System Status

```
Section header (px-4 pt-4 pb-2): "SYSTEM STATUS" (10px, uppercase, tracking-[0.2em], ink-3)

Three status rows (px-4 py-2, border-b border-hairline last:border-0):
  [Dot: 6×6px, border-radius 50%, color based on feed status] | label (12px, ink-2) | right-aligned: "Active · {elapsed}s ago" or "Error" or "Stale" (11px, ink-3 or warning or alert)

Rows:
  - "Outage feed" → feeds.outages
  - "Weather feed" → feeds.weather  
  - "Finance" → feeds.finance

Dot color: green (var(--positive)) if not stale + no error, amber (var(--warning)) if stale, red (var(--alert)) if error.
Elapsed seconds: compute from feed.lastUpdated timestamp if available, else show "—".
```

### 3d. Data Sources

```
Section header (px-4 pt-4 pb-2, flex justify-between):
  "DATA SOURCES" (10px, uppercase, tracking-[0.2em], ink-3) | "View all" button (10px, ink-3, hover:text-ink, uppercase tracking)

Source list (px-4 pb-3):
  Static list, 11px, ink-3, leading-loose:
  - Statistics Canada (2021)
  - Alectra Utilities
  - Open-Meteo
  - Ontario Energy Board
  - Bank of Canada
  "+{n} more" in ink-4

Bottom spacer: h-4
```

---

## 4. TopBar — Enhance `TopBar.tsx`

Replace the single status pip with three inline indicators in the left cluster (after the wordmark):

```
[green/amber/red dot 5×5] "Live data active" (10px, ink-3)  [separator ·]  [Clock icon size 10] "Weather sync · {elapsed}s ago" (10px, ink-3)
```

In the right cluster, change the advisory display:
- If critical > 0 OR elevated > 0: show `"ADVISORIES"` label + `"{critical + elevated} active"` in var(--alert) color
- If none: `"ADVISORIES"` label + `"none active"` in ink-4
- Remove the separate crit/elev breakdown from the topbar (it's now in the right sidebar)

The scenario button: add a ChevronDown (size 10, ink-3) after the scenario name.
The lens button: show `"LENS"` label + `"{LENS_LABEL[lens]}"` value — if lens is 'operator' show `"Utility · Alectra"` as a special-case display string (you can hardcode this for now).

---

## 5. Tray Overlap Handling

`WatchlistTray` (width 320px, `position: absolute, left: 36px`) and `ActivityTray` now overlay the map, not the left sidebar. Both should have `z-index: 550` (already correct). No left-offset changes needed in `ForecastWidget` or `SuggestionBanner` — they are relative to the MapPanel which starts after the 36px LayerRail + 420px left sidebar = 456px from viewport left. Update `ForecastWidget`'s `left` offset accordingly: when no tray open, `left: 16`; when tray open, `left: 16 + 320 = 336` (relative to MapPanel, not viewport).

---

## 6. TypeScript Verification

After all changes, run `npx tsc --noEmit` and fix any type errors before finishing. The component must compile with zero errors. Do not use `any` types. All props must be typed.

---

## Key Constraints

- **No drop shadows** anywhere. Elevation is expressed only through hairline borders.
- **No border-radius** on the sidebar itself or its section dividers. Only the score badge pill and advisory count badge use border-radius.
- **No LLM invocations** — all advisory text comes from the deterministic rule engine (`advisoriesFor()` in `advisories.ts`).
- **Intervention tools are static UI** — they render but clicking them does nothing yet (just `onClick={() => {}}` or a TODO comment).
- **System status feed data**: use `feeds.weather.lastUpdated`, `feeds.outages.lastUpdated`, `feeds.finance.lastUpdated` from `useApp()` to compute elapsed seconds. If `lastUpdated` is null, show `"—"`.
- Import only from existing files. Do not create new utility files. All new helper functions go inside the component file they're used in.
- Use only Lucide React icons already imported in the project, plus: `Shield`, `Users`, `Home`, `TrendingDown`, `DollarSign`, `Thermometer`, `Droplets`, `Wind`, `Snowflake`, `Sun`, `Zap`, `MapPin`, `BarChart3`, `ArrowUpRight`, `Clock`, `ChevronDown`, `ChevronRight`, `ChevronUp`.
