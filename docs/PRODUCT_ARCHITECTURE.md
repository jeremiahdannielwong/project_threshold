# THRESHOLD — Product Architecture V2
## Civic Preparedness Intelligence Platform · Multi-Surface Operational Design

*Principal architecture brief. Supersedes the hybrid single-surface model. This document governs all design, engineering, and product decisions from this point forward.*

---

## 1. Brutally Honest Critique of the Current Architecture

The current Threshold interface has a confidence problem it has not yet named.

It presents itself as a multi-audience platform — four lenses, four stakeholders — but the lens system does almost nothing structurally meaningful. Switching from Operator to Community changes the ordering of advisory blocks in the dispatch card and shows or hides the restoration queue. That is the sum total of the audience adaptation. Every other element of the interface — the scoring system, the map interaction model, the information hierarchy, the advisory language, the panel structure, the toolbar, the keyboard shortcuts — is identical across all four audiences.

What exists is not a multi-surface platform. It is a single institutional interface with four cosmetic modes applied on top.

The consequences are concrete and damaging:

**For residents:** The interface opens on a choropleth map colored by PCA-derived vulnerability percentiles. Clicking a colored polygon produces a panel labeled with a census tract ID, a threshold score of 74.2, a CISR resilience index, a "preparedness posture" paragraph written in operations-center prose, and sixteen advisories segmented by "audience tier." None of this is usable by a person deciding whether to open their windows. The language assumes institutional literacy. The geography assumes familiarity with census units. The scoring assumes the user knows what a higher score means relative to a lower one.

**For operators:** The interface stops short of what serious operations software actually provides. There is no intervention sequencing beyond a restoration queue. There is no infrastructure propagation model. There is no district-level comparative prioritization dashboard. There is no temporal trend view. There is no scenario simulation with quantified downstream impact. The operator gets a fancier version of what a resident sees — more numbers, more advisories, an audit log — but not the systems-level operational surface that a utility or EOC actually requires.

**The dual failure:** The current system is too dense and institutional for residents. It is not dense or operational enough for institutions. It fails both audiences simultaneously by attempting to serve them through the same information architecture with minor cosmetic variation.

This is not a UI refinement problem. It is a product architecture problem.

---

## 2. Why the Current Hybrid Interface Feels Conflicted

The conflict is structural, not aesthetic. It runs through every layer of the product.

**Geographic unit mismatch.** The platform is organized around census tracts. Tracts are the correct unit for statistical analysis and institutional planning. They are the wrong unit for residents. A resident in Brampton thinks about their street, their intersection, their neighbourhood. "CT 5120432.00" communicates nothing to them. "Bramalea North" communicates something, but only if the resident already knows which neighbourhood they live in and whether it maps to what the platform calls Bramalea North.

**Scoring system opacity.** The threshold score, the CISR index, the PCA percentile — these are analytically correct and institutionally meaningful. They are completely opaque to the public. A resident cannot act on a score of 74.2. They can act on: "Your neighbourhood has limited cooling access during extreme heat."

**Language register collision.** The advisory system generates language calibrated for operations briefings: "Cooling accessibility deficit detected across 3 proximate tracts. Estimated 12,000 residents within affected zone. Operator action: dispatch mobile cooling infrastructure." This language is appropriate for an EOC. It is alienating for a household. The same rule engine fires for both audiences and produces the same institutional prose.

**Interaction model mismatch.** The platform assumes the user will click on a geographic area to receive intelligence about that area. This is the correct interaction model for spatial analysis. It is not how residents think. Residents do not spatially analyze their own neighbourhood. They ask questions: Am I at risk? What should I do? Where should I go?

**Information hierarchy inversion.** For residents, the most important information is: current conditions, immediate actions, nearby support. For operators, the most important information is: vulnerability distribution, intervention priority, systemic risk. The current hierarchy — map first, select a tract, receive a dispatch card — is the operator hierarchy. Residents are forced into an analytical workflow designed for institutions.

**Emotional register failure.** Institutional software is designed to be neutral, information-dense, and instrumentally useful. Public-facing civic infrastructure needs to be calm, clear, and emotionally trustworthy. A resident checking whether their family is at risk during a heat event should not be confronted with a dark-mode choropleth and a panel full of resilience scores. That register communicates alarm and complexity at the moment it should communicate clarity and guidance.

---

## 3. Full Multi-Lens Product Architecture Redesign

Threshold should be restructured as one intelligence engine powering two operationally distinct surfaces.

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  THRESHOLD CORE INTELLIGENCE ENGINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Ingestion:    Census 2021 · CISV · Open-Meteo
                Alectra outages · OEB rates · BoC CPI
                Brampton facilities registry
  
  Scoring:      PCA-derived vulnerability (baseline / heatwave / ice storm)
                CISR resilience index · EWEI · Stress index
  
  Rule engine:  16 deterministic advisory rules
                Resident / Community / Operator tiers
  
  Analysis:     City pattern detection (spatial clustering)
                Restoration queue (EWEI-weighted)
                24h deterministic forecast
                Energy poverty modeling
  
  Provenance:   Every value cited · Every rule exposed · No LLM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

           ↙                              ↘

  COMMUNITY SURFACE              OPERATOR SURFACE
  threshold.city/                threshold.city/ops
  (or ?mode=community)           (or ?mode=operator)

  Audience:                      Audience:
  Residents · Families           Utilities · Municipalities
  Community orgs · Nonprofits    Emergency managers
  Vulnerable populations         Infrastructure planners
                                 Resilience analysts
                                 Climate adaptation teams

  Goal:                          Goal:
  Preparedness + Clarity         Intervention + Prioritization
  "What should people do?"       "What should institutions prioritize?"
```

The two surfaces share zero UI code. They share 100% of the intelligence engine. Both are served from the same API. Both update on the same feed cadences.

The existing `lens` parameter is renamed `mode`. It controls which surface renders, not which advisory block appears first. The word "lens" implied cosmetic variation. The word "mode" implies fundamentally different operational surfaces.

---

## 4. Community Mode Philosophy

Community Mode is built on a single thesis: **residents are not analysts, but they are capable of acting on clear information.**

The platform's job in Community Mode is not to expose its intelligence. Its job is to translate that intelligence into guidance a person can use. The difference is significant. Intelligence is descriptive. Guidance is directive.

The philosophical commitments of Community Mode:

**Clarity over completeness.** The full advisory set for a tract contains sixteen possible rules across three audience tiers. A resident needs to see the two or three things most relevant to them, expressed in terms they can act on immediately. Completeness is an institutional value. Clarity is a public value.

**Guidance over surveillance.** The platform knows a great deal about each neighbourhood's vulnerability profile. In Operator Mode, that depth is a feature — it enables prioritization. In Community Mode, that depth is a risk — it can feel like surveillance, and it can overwhelm rather than inform. The system offers guidance, not exposure.

**Geography residents recognize.** Neighbourhood names, streets, local landmarks, facility names. Not tract IDs, not centroids, not polygon geometries. If a resident knows they live near Kennedy Road South, the platform should speak that language.

**Calm authority.** The platform is a civic service. It should feel trustworthy in the way that a well-designed transit system or a public health website feels trustworthy — not because it hides complexity, but because it has done the work of translating complexity into accessible clarity. Panic is not useful. Clarity is.

**Actionability without condescension.** Every piece of information in Community Mode should carry an implied or explicit action. Not "humidex 42°C recorded" but "limit outdoor activity during afternoon hours." Not "cooling centre density below threshold" but "find your nearest public cooling centre." The system respects that residents will act on good information; it does not need to alarm them to motivate them.

---

## 5. Operator Mode Philosophy

Operator Mode is built on a different thesis: **vulnerability becomes harm through institutional inaction or misprioritization, and institutions need spatial intelligence to act before crisis peaks.**

The philosophical commitments of Operator Mode:

**Intervention-first.** The system exists to inform decisions, not merely to describe conditions. Every view, every panel, every advisory should imply a prioritized institutional response. The map shows where action is most needed. The dispatch card shows what action is recommended. The restoration queue shows what order that action should follow.

**Temporal awareness.** Operators do not only care about current conditions. They care about where conditions are heading and how quickly. The forecast layer, the stress index trajectory, the scenario simulation — these are not decorative features. They are the temporal dimension of operational planning.

**Systems thinking over point analysis.** A single tract with a high vulnerability score is a data point. A cluster of high-vulnerability tracts along a hydro corridor with an active outage is a systems pattern. Operator Mode surfaces the pattern, not just the point. Infrastructure is interconnected; the platform should model those connections visibly.

**Operational credibility.** Every advisory must cite its evidence. Every score must cite its source. Every recommendation must carry its confidence level, its authority, and its time horizon. Operators present this intelligence to decision-makers, regulators, and the public. It must be defensible. This is why the system is deterministic and rule-derived — not because LLMs are wrong, but because rule-derived intelligence is auditable.

**Prioritization support.** Observation without prioritization is journalism, not operations. Operator Mode supports triage: which tracts need attention first, which interventions have highest leverage, which populations are most exposed. The restoration queue, the intervention ROI estimates, the EWEI weighting — these are prioritization tools.

**Audit accountability.** Every operator action is logged. The hash-chained audit log is not a compliance afterthought. It is a core value proposition for institutions operating in regulated environments. Operators can defend their decisions because the system recorded them with cryptographic integrity.

---

## 6. Community Mode UX Redesign

Community Mode requires a fundamentally different shell architecture.

**Entry point:** The user lands not on a choropleth map but on a preparedness status screen for their neighbourhood. The first question the system answers is "how is my area doing right now?" — not "select a census tract to analyze."

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Threshold · Brampton Preparedness          [EN|PA|HI]│
├─────────────────────────────────────────────────────┤
│                                                     │
│  Your neighbourhood: Bramalea North                 │
│  [Change neighbourhood]                             │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  CONDITIONS ARE STABLE                       │   │
│  │  No immediate actions required               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  What to know today                                 │
│  ─────────────────                                  │
│  · Temperature reaching 31°C this afternoon.        │
│    Limit extended time outdoors during peak hours.  │
│                                                     │
│  · Your nearest public cooling centre is 1.2 km     │
│    away at Chinguacousy Wellness Centre.            │
│    Open until 9 PM today.                           │
│                                                     │
│  Preparedness guidance                              │
│  ─────────────────────                              │
│  · Keep water accessible for household members.     │
│  · Check on elderly neighbours during heat events.  │
│                                                     │
│  [View map of your area]     [Community resources]  │
└─────────────────────────────────────────────────────┘
```

**What Community Mode removes entirely:**
- Census tract IDs
- Threshold scores and percentiles
- CISR resilience index
- Stress index (as a number)
- Advisory audience tiers
- Operator-tier advisories
- Restoration queue
- Command palette
- Watchlist / activity tray
- Scenario switching (resident does not simulate heatwaves)
- Wall Display, Situation Report, Decision Replay, Cross-Jurisdiction
- Keyboard shortcuts (not applicable to public)
- Operational ledger / audit log

**What Community Mode adds:**
- Neighbourhood selector (search by address or name, not by clicking a polygon)
- Preparedness status expressed in plain language
- Condition summary (temperature, feels-like, any active weather advisory)
- Nearest cooling/warming centres with names, distances, hours
- Actionable preparedness checklist appropriate to current conditions and scenario
- Emergency contact and resource links
- Language switcher (English, Punjabi, Hindi — already in i18n.ts, now surfaced prominently)
- Simple map view (optional, secondary to the text content) showing only: user's neighbourhood boundary, nearest cooling/warming centres, active outages if any

**What the map looks like in Community Mode:**
- Single neighbourhood highlighted, not a choropleth of all tracts
- Cooling/warming centres shown as named markers, not as a data layer
- No vulnerability colour ramp
- No advisory pips
- No layer controls
- Zoom is fixed on the user's neighbourhood; panning is limited

---

## 7. Operator Mode UX Redesign

Operator Mode retains and deepens the current architecture's strengths while adding the operational depth it currently lacks.

**What stays and improves:**
- The choropleth map with vulnerability ramp (the primary operational surface)
- Advisory pips on tracts
- Dispatch card (but with enhanced operator-tier content)
- Watchlist tray (tracts / advisories / restoration / outreach modes)
- Stress index in the ribbon
- Advisory counts in the ribbon
- Scenario switching (now more prominent)
- Intelligence Panel (bottom-right)
- Audit log / activity tray
- Wall Display, Situation Report, Decision Replay
- Cross-Jurisdiction comparison

**What Operator Mode adds or deepens:**

*Infrastructure overlay:* Hydro backbone corridors and service points (currently in staticLayers but underused) become a primary operational layer. When an outage is active, the system draws the propagation path along the hydro network, highlighting which vulnerable tracts lie downstream.

*Vulnerability clustering panel:* A dedicated view in the watchlist tray (new mode: "clusters") that groups spatially proximate high-vulnerability tracts and presents them as intervention zones, not individual points. Each cluster has: tract count, combined affected population, shared vulnerability factors, recommended intervention type.

*District prioritization view:* The Cross-Jurisdiction panel is renamed and repurposed as a district comparison view. Instead of peer city snapshots, it shows Brampton's own districts (North, South, Central, East, West) ranked by current vulnerability load, with the ability to drill into any district.

*Intervention confidence scores:* Each operator-tier advisory now displays a quantified intervention opportunity: estimated population reached, estimated cost per person, time to effect, regulatory authority. These already exist in the advisory model — they need to be surfaced more prominently in the dispatch card and in a sortable intervention list view.

*Temporal trend strip:* The current 24h forecast widget shows a stress trajectory. Extend this to a 7-day view accessible from the dispatch card, showing projected vulnerability under different weather scenarios.

*Resilience delta simulation:* A modal (new) that lets operators ask "if we deploy X intervention in tract Y, what is the projected change in vulnerability score?" — answered deterministically from the rule engine, not speculatively.

---

## 8. Community Preparedness Intelligence Redesign

The preparedness intelligence layer in Community Mode must be completely rewritten — same engine, entirely different output.

**Translation rules:**

The rule engine fires 16 rules against tract conditions, scenario, and finance data. In Operator Mode, each rule produces an institutional advisory with triggers, evidence, timeframe, authority, and confidence level. In Community Mode, each rule produces a single human sentence followed by an action.

Rule C1 (cooling access deficit) in Operator Mode:
> "Cooling accessibility gap identified. Three or fewer cooling centres within 2.5km radius. Estimated 12,000 residents underserved. Action: coordinate mobile cooling deployment."

Rule C1 in Community Mode:
> "Public cooling access in your area is limited. If temperatures continue rising, your nearest option is Chinguacousy Wellness Centre (1.2 km). Consider making note of it now."

Rule R3 (heat-stress exposure, high humidex) in Operator Mode:
> "Humidex 42°C recorded. Heat-stress threshold breached. Elevated risk for elderly and medically vulnerable populations. Immediate: activate heat response protocol."

Rule R3 in Community Mode:
> "Today feels significantly hotter than the temperature suggests. Limit time outdoors between noon and 6 PM. Check on elderly family members or neighbours."

**Community advisory categories:**

Replace the resident / community / operator audience tier structure with three simple preparedness categories:

- **Today** — Immediate conditions and actions (today's weather, current outages, urgent cooling access)
- **Be Ready** — Near-term preparedness (what to have on hand, neighbourhood-level risks)
- **Your Community** — Neighbourhood resources and support (facilities, programs, contact points)

No advisory tier labels. No urgency classifications presented to residents. The system surfaces what is most relevant for today's conditions first, quietly ranking by urgency behind the scenes.

**Metric translation table:**

| Engine metric | Community language |
|---|---|
| Humidex ≥ 38°C | "Extreme heat conditions" |
| Threshold score ≥ 70th percentile | (not shown) |
| Cooling centres < 3 within 2.5km | "Limited public cooling nearby" |
| Active outages > 0 | "Power disruption in your area" |
| Wind chill ≤ -22°C | "Dangerous cold conditions" |
| Renter share > 70% | (not shown to residents) |
| Energy poverty flag | "Energy costs are relatively high in your area" |
| CISR < 0.4 | (not shown to residents) |

Scores are never shown. Percentiles are never shown. Index values are never shown.

---

## 9. Operator Intervention Intelligence Redesign

The operator advisory system should evolve from a passive bulletin board into an active intervention sequencer.

**Current state:** Advisories list with headline, detail, triggers, impact, timeframe. Read-only.

**Target state:** Advisory → Intervention pathway.

Each operator advisory should have an explicit intervention pathway:

```
ADVISORY (existing)
  Headline: Heat-stress threshold breached
  Urgency: Critical
  Evidence: Humidex 42°C · Population 28,000
  
  ↓

INTERVENTION OPTIONS (new)
  Option A: Mobile cooling unit deployment
    Cost: $2,400/day | Time to effect: 4h | Population reached: ~8,000
    Authority: City of Brampton Emergency Management
    Precedent: July 2023 heat event
    
  Option B: Extended facility hours (Chinguacousy Wellness)
    Cost: $180/day | Time to effect: 2h | Population reached: ~4,500
    Authority: Brampton Parks & Recreation
    
  [Log intervention decision] [Add to restoration queue] [Export advisory]
```

The intervention options are static and rule-derived — not generated. They come from a pre-populated intervention library keyed to advisory rule IDs. This maintains the deterministic, auditable character of the system while making the advisory actionable.

**New operator intelligence surfaces:**

*Vulnerability propagation view:* When an outage is active and tracts are selected, show a spatial model of which adjacent tracts are likely to experience compounding vulnerability based on shared infrastructure, population characteristics, and access patterns. This is deterministic — not predictive AI — based on topology and CISV adjacency.

*Intervention sequencer:* A drag-sortable list of pending interventions across all active advisories, with estimated collective population reach, combined cost, and time-to-effect. Operators can prioritize, assign, and log interventions as a sequence, which writes to the audit log.

*Comparative resilience board:* A table view of all tracts ranked by vulnerability delta — the difference between their current score and their baseline. Tracts with large positive deltas (worsening faster than others) rise to the top. This surfaces emerging vulnerability before it becomes critical.

---

## 10. Map Behavior Differences by Lens

The map is the emotional and operational core of the product in both modes, but its behaviour must be calibrated to each audience's relationship with geographic information.

**Community Mode map:**

The map is secondary to the text content. A resident's primary interface is the preparedness status screen. The map is accessible via "View map of your area" and defaults to a zoomed-in view of the selected neighbourhood — approximately a 2km radius. The choropleth is not shown. The map shows:
- Neighbourhood boundary (subtle outline, not filled)
- Cooling/warming centres as named markers (icon + name label)
- Active outages as a simple indicator (not a data visualization)
- Street labels prominent (residents navigate by street)

No layer controls. No scenario switching from the map view. No tract selection (clicking the map does nothing; facilities can be clicked for hours/location). Pan and zoom are allowed but the initial view is neighbourhood-scoped.

**Operator Mode map:**

The map is the primary operational surface. The choropleth is the default view. Scenario switching changes the colour ramp in real time. Operator Mode map additions:
- Outage propagation overlay: when outages are active, draw corridors showing affected infrastructure
- Advisory pips per tract (already implemented)
- Cluster boundaries: when city patterns are detected, draw a subtle convex hull around the clustered tracts
- Facility layer shows capacity status (open / closed / reduced hours) when available
- Layer rail controls all overlays independently
- Scenario banner on WeatherStation (already implemented)
- Selection behaviour: click a tract, summon dispatch card; click a facility, summon facility card

**Shared map properties** (both modes):
- Leaflet base with warm off-white canvas
- Hairline tile borders
- No satellite imagery
- Geographic restraint — no decorative labels, no marketing overlays
- Responsive to live data (outage dots appear/disappear as feed updates)

---

## 11. Information Hierarchy Redesign

**Community Mode hierarchy:**
1. Preparedness status (one sentence, one colour register)
2. What to know today (2–4 items maximum, plain language)
3. Nearby support infrastructure (facilities, hours, distance)
4. Preparedness guidance (checklist)
5. Map (optional, secondary)

**Operator Mode hierarchy:**
1. City-wide posture (ribbon: stress index, advisory counts, scenario)
2. Map (primary spatial surface)
3. Intelligence Panel (ambient: posture, weather, patterns, top advisories)
4. Dispatch card (selected tract: full advisory suite, intervention options, metrics)
5. Watchlist tray (ranked tract list / advisory roster / restoration queue / outreach)
6. Activity tray (audit log)

The critical difference: Community Mode leads with the answer. Operator Mode leads with the question (the map) and lets the operator surface the answer.

---

## 12. Typography Redesign

The current type system (Inter, 10–48px, tabular numerals, restrained tracking) is correct for Operator Mode and should be preserved exactly.

For Community Mode, the same typeface but different calibration:

- Minimum body size increases from 12px to 14px (accessibility baseline)
- Neighbourhood name: 22px, weight 500 — the strongest typographic element
- Status line: 17px, weight 400, sentence-cased
- Advisory items: 15px, weight 400, line-height 1.7
- Labels: 12px, weight 400 (not uppercase small-caps — uppercase reads as institutional)
- No tabular figures in Community Mode (tabular numerals signal data tables; Community Mode has no data tables)
- Tracking reduced (`.08em` maximum) — tight tracking reads as institutional; looser tracking reads as accessible

The single design token change that most immediately humanises Community Mode: **remove uppercase tracking from all body text**. Keep it only for header labels and navigation.

---

## 13. Narrative Redesign

**Operator narrative model (current, preserve):**
The dispatch card narrative begins with the preparedness posture sentence (rule-derived, deterministic), followed by a statistical summary of the tract's vulnerability characteristics. This is correct for operators. It is an information-dense briefing.

**Community narrative model (new):**
There is no "narrative" in the operator sense. Community Mode does not generate prose about census data. Instead:

- Status statement: single sentence, present tense, plain language — "Conditions in Bramalea North are currently stable."
- Condition note: one or two sentences on the most relevant current factor — "It will feel significantly warmer than the temperature indicates this afternoon due to humidity."
- Action guidance: 2–4 bullet points, imperative mood — "Stay hydrated. Limit outdoor activity between noon and 6 PM."

No statistics in Community Mode text. No percentages, no indices, no scores. If a number must appear, it should be concrete and meaningful: "1.2 km to the nearest cooling centre" — not "cooling centre accessibility index: 0.62."

---

## 14. Preparedness Language Redesign

The preparedness language guide for Community Mode. Each entry shows the banned formulation and its replacement.

| ❌ Banned | ✅ Replacement |
|---|---|
| Preparedness thresholds recalculated | Conditions remain stable |
| Cooling accessibility deficit detected | Public cooling access is limited nearby |
| Humidex threshold breached | Extreme heat conditions today |
| Resilience index below threshold | Your neighbourhood has fewer support resources than average |
| Energy poverty flag active | Energy costs are relatively high in your area |
| Restoration sequence initiated | Power restoration is underway |
| Advisory confidence: high | (confidence level not shown to residents) |
| Operator action: deploy mobile cooling | (operator actions not shown to residents) |
| CT 5120432.00 | Bramalea North |
| Threshold score: 74.2 | (not shown) |
| 71st percentile vulnerability | (not shown) |
| Engage vulnerable seniors | Check on elderly neighbours |
| Infrastructure stress detected | (translated into specific condition) |
| CISR 0.41 | (not shown) |

The governing principle: if the sentence could appear in an operations bulletin, it is wrong for Community Mode. If the sentence could appear in a public health bulletin from a city, it is right.

---

## 15. Operational Language Redesign

For Operator Mode, the language standard is institutional precision — not jargon for its own sake, but terminology that is accurate, specific, and defensible.

The current advisory language is largely correct. Three refinements:

**Add regulatory grounding.** Each operator advisory already cites authority. This should be more explicit: "Ontario Energy Board Emergency Measures Code s.4.1" — not just "OEB."

**Add temporal specificity.** "Immediate" and "within 24 hours" are too vague for operations. Replace with: "Action within next 4 hours: [X]" and "Action within next 24 hours: [Y]."

**Distinguish observation from recommendation.** Current advisories sometimes blur these. The rule engine observes a condition and fires an advisory. The advisory should clearly delineate: "Observed: humidex 42°C across 8 tracts. Threshold: 38°C. Recommended: activate heat response protocol per City Emergency Management Plan Annex C."

---

## 16. Interaction Redesign

**Community Mode interactions:**

- Primary: neighbourhood search/select → system responds with preparedness status for that neighbourhood
- Secondary: tap a facility → facility card (name, hours, phone, distance, map)
- Tertiary: expand a guidance item → fuller preparedness detail
- No hover states on mobile (touch-first design)
- No keyboard shortcuts (consumer product)

**Operator Mode interactions (additions to current):**

- Click a tract → dispatch card (existing)
- Click a pattern cluster boundary → cluster summary panel (new)
- Hover a tract in watchlist → map pans to that tract (new)
- Drag intervention item in sequencer → reorder priority (new)
- Click advisory → expand to show intervention options (new)
- Command palette: add commands for "go to district X", "simulate heatwave in cluster Y", "export intervention plan"

---

## 17. Motion Redesign

**Community Mode:**
Motion should be minimal and calming. No sudden changes. Status updates fade in gently. Facility cards slide up from below. Nothing blinks, pulses, or animates attention-seeking.

Specific: remove advisory pip pulse from Community Mode map. Pulsing dots communicate urgency and operational awareness. They are correct for Operator Mode. In Community Mode they communicate anxiety.

**Operator Mode:**
The current motion system (80/180/320/640ms, `cubic-bezier(0.22, 1, 0.36, 1)`) is correct. Preserve it.

Potential addition: when a new advisory fires (feed update causes a rule to cross threshold that wasn't crossed before), the Intelligence Panel advisory feed briefly highlights the new item with a 640ms background fade. This is the only animated attention signal in Operator Mode — restrained, meaningful.

Note: the atmospheric map effects (outage pulse, advisory pip pulse, choropleth transitions) were reverted previously. Do not reintroduce them without explicit instruction.

---

## 18. Contextual Attention Redesign

**Community Mode:** Attention is directed by reading order (top to bottom), not by spatial selection. The most important information is always at the top. The user's attention follows the natural reading flow of the preparedness status screen. Nothing on the map competes for attention.

**Operator Mode:** Attention is directed by spatial signal (the map) and ambient intelligence (the Intelligence Panel). The map draws attention to where conditions are most severe via the vulnerability ramp. The Intelligence Panel's posture badge communicates systemic severity. The ribbon's advisory counts communicate aggregate load. The dispatch card focuses attention on a selected tract. This layered attention hierarchy — ambient → spatial → focused — is the correct operator model.

The critical contextual attention principle: **in both modes, the system should never compete with itself for attention.** Two things should never simultaneously demand the operator's focus. The SuggestionBanner (scenario recommendation), advisory pips, Intelligence Panel, and dispatch card are layered so that the operator processes them in sequence, not simultaneously.

---

## 19. Atmospheric Refinement

The design register — warm off-white canvas, hairline borders, ember alert register, no drop shadows, geometric focus ring, Inter tabular — is correct and should be preserved in both modes.

Community Mode applies the same tokens with one significant difference: **background luminosity increases slightly.** The warm canvas `#FAFAF7` becomes the page background, but section backgrounds use `#FFFFFF` (pure surface) more generously. The Operator Mode reads slightly darker and more dense. Community Mode reads slightly lighter and more open. Same palette, different compositional weight.

The single chromatic register (ember `--alert`) should be used even more sparingly in Community Mode. In Operator Mode, ember is a data signal — it communicates vulnerability intensity. In Community Mode, amber/ember communicates danger, which can produce anxiety. Reserve it for genuine emergencies. For elevated-but-not-critical conditions, consider `--warning` (amber) instead of `--alert` (ember).

---

## 20. Panel Redesign

**Community Mode panels:**
- No watchlist tray
- No activity tray
- No dispatch card (no tract selection workflow)
- One panel: the preparedness status screen (full-width, text-primary, not a floating card)
- One optional panel: facility detail card (tap a marker → slide-up card with hours, phone, distance)
- Language switcher: integrated into the header, three buttons (EN / PA / HI)

**Operator Mode panels (additions):**
- Dispatch card: add intervention pathway section below the advisory list
- Watchlist tray: add "clusters" mode (spatial groupings with intervention priority)
- Intelligence Panel: promote to always-visible; add a toggle to expand it to 320px (full advisory detail) or collapse to 180px (posture + weather only)
- New: Intervention Sequencer modal (triggered from dispatch card or command palette)
- New: District Prioritization panel (replaces/repurposes Cross-Jurisdiction)

---

## 21. Advisory System Redesign

The 16-rule advisory engine is architecturally correct. The redesign is in its output layer, not its logic.

**One engine, two output renderers:**

```
advisoriesFor(tract, scenario, finance)
  → returns Advisory[]
  → Advisory has: id, audience, urgency, headline, detail,
                  triggers, impact, timeframe, sources

Community renderer:
  → filters to audience: 'resident'
  → translates headline using communityLanguage(advisory.id)
  → presents as: preparedness checklist item
  → shows: translated headline + one action sentence
  → hides: triggers, evidence, impact, authority, confidence

Operator renderer (current):
  → filters by lens audiences
  → presents as: intelligence bulletin
  → shows: full advisory card with all fields
```

The `communityLanguage()` function is a static lookup table: advisory rule ID → resident-facing sentence + action. This is not generated text. It is curated, reviewed, and updated by a person familiar with the communities served. The rule engine ensures the advisory fires at the right moment; the language table ensures it says the right thing in the right register.

---

## 22. Intervention System Redesign

Operator Mode needs a formal intervention system. Currently, the operator can: read advisories, flag interventions, export a brief, view the restoration queue. That is awareness, not operability.

**Intervention system components:**

*Intervention library:* A static JSON dataset mapping advisory rule IDs to available intervention types. Each intervention has: type, estimated cost range, time to effect, estimated population reach formula, regulatory authority, precedent events. Approximately 30–40 interventions covering the 16 advisory rules.

*Intervention matcher:* When a tract has active advisories, the dispatch card surfaces the 2–3 highest-leverage interventions from the library, ranked by (population reach × urgency) / cost.

*Intervention logger:* A form in the dispatch card that lets the operator record: intervention selected, rationale, responsible party, target date. This writes to the audit log with hash chaining.

*Intervention summary:* Accessible from the command palette, lists all logged interventions for the current session with their combined metrics.

This is the difference between a decision support tool and an operational platform.

---

## 23. Trust-Building Redesign

Trust is built differently by each audience.

**Community Mode trust:**

Residents trust a system that is honest about uncertainty, consistent in its communication, and visibly connected to real infrastructure (not a startup). Trust signals:
- City of Brampton branding or partnership acknowledgement
- Named data sources (Statistics Canada, Open-Meteo, Alectra) explained in plain language
- "We update this information every 5 minutes" — not "live feed active"
- Plain-language explanation of what the system is and is not: "Threshold uses public data to give you a picture of preparedness in your neighbourhood. It is not an emergency alert system."
- Offline or low-connectivity consideration: static preparedness guide available as PDF

**Operator Mode trust:**

Operators trust a system that is auditable, citable, and accurate. Trust signals:
- Every advisory cites its triggering value and threshold: "Humidex: 42°C (threshold: 38°C)"
- Every score cites its methodology: "PCA-derived from Statistics Canada 2021 variables; see methodology panel"
- Cryptographic audit log: "This log is tamper-evident; see verification"
- Data provenance panel (existing Methodology overlay, should be expanded)
- Feed health indicators with explicit staleness timestamps

---

## 24. Long-Term Platform Architecture

Threshold's platform architecture should be designed to support five categories of institutional deployment within three years.

**Category 1 — Utility integration (Year 1)**
Alectra or peer utility connects their OMS (Outage Management System) via API instead of the current scrape-based feed. Real-time outage data replaces the 2-minute polling approximation. The platform becomes a utility-grade situational awareness layer.

**Category 2 — Municipal emergency management (Year 1–2)**
A municipality configures Threshold with their facility registry, district boundaries, and emergency contact database. The system generates a pre-configured EOC dashboard with their specific intervention authorities and response protocols.

**Category 3 — Public health integration (Year 2)**
Public health agencies connect heat-illness surveillance data. The platform adds a health outcomes layer: emergency department visits, heat-related calls, shelter utilization. Vulnerability scores are validated against real outcomes data.

**Category 4 — Community organization tooling (Year 2)**
Community organizations (food banks, warming centres, mosques, churches, community centres) access a simplified operator interface scoped to their neighbourhood. They can see which residents are most vulnerable, log their outreach, and coordinate with the municipal layer.

**Category 5 — Resident mobile application (Year 3)**
Community Mode becomes a Progressive Web App with push notifications, offline preparedness guides, and neighbourhood-level preparedness score. A resident registers their address; the system notifies them when their neighbourhood crosses a preparedness threshold.

**Platform requirements for this roadmap:**
- Multi-tenant architecture (each municipality is a tenant, not a deployment)
- Role-based access control (operator vs community vs admin)
- Data ingestion API (replace static pipeline with partner data feeds)
- White-label capability (Brampton runs threshold.brampton.ca; Hamilton runs threshold.hamilton.ca)

---

## 25. Institutional Scalability Strategy

The product's value proposition to institutions is: **we have already built the intelligence layer; you bring the data and the operational context.**

The intelligence engine (scoring, rule engine, spatial analysis, forecast) is jurisdiction-agnostic. It is parameterized by:
- Census geographies (available for every Canadian municipality)
- Weather API (Open-Meteo covers all of Canada)
- Facility registry (provided by the municipality)
- Outage feed (provided by the utility)
- Rate data (OEB-regulated utilities follow the same rate structure)

Scaling to a new municipality is primarily a data onboarding problem, not an engineering problem.

**Pricing architecture for institutional deployment:**
- Community tier: free, public-facing, city-branded
- Operator tier: SaaS, per-seat or per-municipality, annual contract
- Integration tier: enterprise, custom OMS/CAD integration, SOC 2, Protected B

---

## 26. Product Positioning Evolution

**Current implicit positioning:** "A vulnerability map for Brampton built at a hackathon."

**Target positioning:** "Threshold is civic preparedness intelligence infrastructure — the operational layer between climate data and institutional action."

The positioning shift is from descriptive to infrastructural. Threshold does not describe what is happening. It enables what institutions and residents should do about what is happening.

**Comparison set:**
- Palantir Gotham: operational intelligence for complex institutions (too expensive, too opaque, too surveillance-oriented)
- Bloomberg Terminal: financial intelligence infrastructure (correct model: one engine, many surfaces, institutional trust)
- ArcGIS Mission Manager: spatial operations for emergency management (correct spatial model, wrong accessibility profile)
- Everbridge: mass notification and emergency management (correct institutional market, wrong intelligence depth)

**Threshold's differentiation:** deterministic, auditable, open-data civic intelligence that runs on public datasets with full provenance, designed for both institutions and the public they serve, with both an operational depth that professional tools respect and an accessibility that public tools require.

---

## 27. Exact Implementation Recommendations

In priority order, the concrete changes that move the product from current state to this architecture:

**Priority 1 — Mode split (1–2 weeks)**
- Rename `lens` to `mode`; support `?mode=community` and `?mode=operator`
- Default `?mode=operator` at current URL; redirect `/community` to `?mode=community`
- Current `ResidentView` becomes the Community Mode shell; it needs full rebuild (see Priority 2)
- Operator Mode shell = current `Shell` component; minimal changes

**Priority 2 — Community Mode rebuild (2–3 weeks)**
- Replace `ResidentView` with a fully-featured community preparedness screen
- Neighbourhood selector: free-text search against a list of neighbourhood → tract mappings
- Preparedness status component: single sentence, colour-coded by posture
- Advisory renderer: community language table (30–40 translated advisory strings)
- Facility card: nearest facility by type, distance from neighbourhood centroid, hours, phone
- Language switcher: already in `i18n.ts`, promote to Community Mode header
- Remove all of: LayerRail, TopBar (operator chrome), WatchlistTray, ActivityTray, CommandPalette, DecisionReplay, CrossJurisdiction, WallDisplay, SituationReport from Community Mode

**Priority 3 — Community language table (1 week)**
- Add `communityLanguage.ts`: advisory rule ID → resident-facing sentence + action
- This is editorial work, not engineering work; requires someone who knows the communities

**Priority 4 — Operator Mode deepening (2–4 weeks)**
- Intervention library: `interventions.ts` with 30–40 entries keyed to advisory rule IDs
- Intervention pathway section in dispatch card
- Intervention logger: form → audit log
- Cluster boundary overlay: convex hull around city pattern members on the map

**Priority 5 — Multi-tenant infrastructure (4–8 weeks)**
- Extract tenant config from `tenant.ts` into a database
- Add facility registry ingestion API
- Add municipality onboarding flow

---

## 28. Exact UI Reduction Recommendations

Elements to remove from Community Mode (not from codebase, just from rendering):

| Element | Operator Mode | Community Mode |
|---|---|---|
| Census tract ID (CT XXXX) | Show | Hide |
| Threshold score number | Show | Hide |
| CISR index | Show | Hide |
| Percentile rank | Show | Hide |
| Stress index (ribbon) | Show | Hide |
| Advisory counts (ribbon) | Show | Hide |
| Lens/mode selector | Operator only | Remove |
| Scenario selector (ribbon) | Show | Hide |
| Watchlist tray | Show | Hide |
| Activity tray / audit log | Show | Hide |
| Command palette | Show | Hide |
| Wall Display (F key) | Show | Hide |
| Situation Report (R key) | Show | Hide |
| Decision Replay (Shift+R) | Show | Hide |
| Cross-Jurisdiction (Shift+C) | Show | Remove |
| Restoration queue | Show | Hide |
| Outreach mode (watchlist) | Show | Simplify |
| Operator-tier advisories | Show | Hide |
| Advisory triggers/evidence | Show | Hide |
| Advisory impact estimates | Show | Hide |
| Advisory authority/confidence | Show | Hide |
| ForecastWidget | Show | Simplify to 1 line |
| Intelligence Panel | Full | Simplified version |
| Map layer rail | Show | Hide (or minimal) |

---

## 29. Exact Feature Separation Recommendations

Features that belong in exactly one mode:

**Community Mode only:**
- Address/neighbourhood search
- Community language advisory renderer
- Preparedness checklist
- Facility finder (nearest, with hours and distance)
- Language selector (EN/PA/HI as primary navigation, not a setting)
- Simple map (neighbourhood-scoped, no choropleth)
- PDF preparedness guide download

**Operator Mode only:**
- Vulnerability choropleth
- Advisory pip overlays
- Stress index
- Restoration queue
- Audit log / activity tray
- Wall Display / EOC view
- Situation Report (printable)
- Decision Replay
- Cross-Jurisdiction / district comparison
- Intervention sequencer
- Intervention library
- Cluster boundary overlays
- Scenario simulation
- Energy cost exposure (LEAP/DR targeting)
- Export functions (CSV rosters, incident briefs)
- Command palette

**Shared (both modes, different presentation):**
- Weather summary (dense in Operator, one line in Community)
- Active outage indicator (detailed in Operator, plain-language in Community)
- Preparedness posture (institutional in Operator, human in Community)
- Cooling/warming centre list (data table in Operator, named + distance in Community)
- Language support (header control in Community, setting in Operator)

---

## 30. Final Evolved Product Philosophy

Threshold exists because climate disasters are not democratic.

The same heatwave that is an inconvenience in one neighbourhood is a medical emergency in another. The same power outage that disrupts one household's evening is a life-threatening event for another household's elderly resident on medical equipment. The same ice storm that slows one district's commute cuts off another district's access to shelter.

Infrastructure stress becomes human vulnerability unevenly across cities. The distribution of that unevenness is not random. It follows the lines of income, tenure, housing age, language, access to transportation, and proximity to the infrastructure that protects or fails to protect people.

Threshold's purpose is to make that unevenness visible before it becomes harm — and to equip both the communities experiencing it and the institutions responsible for responding to it with the intelligence they need to act.

For communities: clarity, guidance, and the quiet assurance that the infrastructure of the city is paying attention.

For institutions: spatial intelligence, operational depth, and the accountability that comes from a system that records every decision in a tamper-evident chain.

The platform is not a climate app. It is not a dashboard. It is not a chatbot. It is civic preparedness infrastructure — the operational layer between the data that tells us where vulnerability lives and the people who must act on that knowledge.

It should feel, in both of its modes, like the kind of infrastructure that a city is proud to have built: calm under pressure, honest about uncertainty, operationally credible, and designed with equal care for the resident checking whether their family is safe and the operator deciding where to send resources first.

That is what Threshold is.

---

*Document version: 2.0 · Generated from strategic review session · May 2026*
*Supersedes: THRESHOLD_REDESIGN_BRIEF.md and all addenda*
*Next document: COMMUNITY_MODE_SPEC.md (detailed implementation specification for Priority 2)*
