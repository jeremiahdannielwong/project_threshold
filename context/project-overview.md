# Threshold

## Overview

Threshold is a civic data fusion platform for community energy vulnerability. It ingests structural, seasonal, and real-time data — currently siloed across Alectra Utilities, the City of Brampton, Esri Canada, Statistics Canada, Open-Meteo (weather + Copernicus GloFAS flood), and Environment Canada — normalizes them into a shared spatial ontology, and produces traceable, quantitative recommendations that emergency managers, utility planners, and community organizations can act on together.

The product surface is a dark, mission-control choropleth of communities (census tracts) across the Alectra service territory. The fusion layer, ML models, and LLM reasoning stack sit underneath. Built for **Seneca Energy Hackathon 2026, Theme 3 (Community Energy, Equity & Sustainability)**, addressing all three problem statements in Challenge Set 03.

## Geographic scope

- **MVP demo city: Brampton** — 122 census tracts, 100% real data coverage (census, CISV/CISR, weather, facilities, neighbourhood names).
- **Alectra territory covered in pipeline:** 569 CTs across Brampton + Mississauga + Hamilton — all scored and in `master_cts.geojson`, but demo focuses on Brampton where data is fully real.
- **Why Brampton:** Best open-data coverage — Brampton's own ESRI ArcGIS FeatureServer provides all CT-level census layers. Mississauga blocks programmatic access; Hamilton has partial coverage.
- **Sponsor alignment:** Brampton is inside Alectra Utilities service territory; data sources align with the Alectra + Esri Canada sponsor stack.
- **Post-MVP expansion path:** Mississauga and Hamilton once census data gaps are resolved, then the remaining 14 Alectra communities.

## Product Axiom

**Every recommendation Threshold makes is traceable to a number, and every number is traceable to a public dataset.** This is non-negotiable. The LLM writes prose around numbers; it never invents numbers. ML models produce numbers; they cite the data they were trained on. The map renders numbers; clicking any colour reveals the score and its inputs in two clicks or fewer.

## Pitch framing

> Threshold is the community equity and vulnerability layer that Alectra's innovation portfolio doesn't have yet, built on Esri Canada infrastructure.

This sentence threads both sponsors and identifies a real gap. It belongs in the demo opening and the final slide.

## Goals

1. Fuse at least 8 public datasets across Alectra, Mississauga / Brampton / Hamilton Open Data, Esri Living Atlas, Esri Canada Climate Hub, Statistics Canada, NRCan, and Environment Canada into a single census-tract-keyed ontology.
2. Stream Alectra's live outage feed (ArcGIS Hub) as a Tier C overlay; build a historical archive by polling across the hackathon window.
3. Train and ship at least one real ML model (vulnerability composite or outage-area prediction) with documented training data, architecture, and held-out validation.
4. Render the Alectra service territory as a dark choropleth where colour, score, and tier are legible in under 5 seconds.
5. Generate per-community recommendation cards with traceable numbers (predicted impact, cost, confidence) and human-readable briefings produced by an LLM reasoning layer.
6. Demonstrate scenario switching (Baseline, Heatwave, Ice Storm) that re-weights factors and recolours the map in under 1 second.

## Core User Flow

1. User opens Threshold. The Alectra service territory renders as a dark choropleth with all communities (census tracts in Mississauga + Brampton + Hamilton) coloured by current Threshold Score.
2. User hovers a community — tooltip surfaces municipal label, score, and tier.
3. User clicks a community — detail panel opens with radar chart, factor breakdown, source citations, and an LLM-generated briefing.
4. User switches scenario (Baseline → Heatwave → Ice Storm) — map recolours in under 1 second; sidebar top-10 list refreshes.
5. User opens the Recommendation panel — sees ranked, quantitatively justified actions ("pre-position cooling bus in Beasley by 4pm Tuesday — projected to prevent 10 ER visits, cost $1,800").
6. User toggles overlays — Alectra live outages, cooling centres, current weather, active advisories, air quality.

## Features

### Data Fusion Layer

- Three-tier ingestion: **Tier A** structural (yearly, build-time), **Tier B** seasonal (daily, cron), **Tier C** live (5–15 min, polling).
- Shared spatial ontology: `Community` (Census Tract), `Building`, `GridFeeder`, `Shelter`, `WeatherCell`, `PollutionSource`, `Outage`, `Advisory`.
- Source-to-entity mapping with provenance recorded on every field.
- Census Tract is the analytical unit; municipal neighbourhood / planning-area / ward labels overlay where they exist.

### Intelligence Layer

- Scoring engine: weighted composite of normalized factor scores per scenario.
- Custom neural network(s) for prediction (vulnerability composite or outage-area probability — first one trained and validated; others scaffolded as v0 heuristics).
- LLM reasoning: Gemini for long-context synthesis and briefings; DeepSeek for chain-of-thought critique of ML outputs (stretch).
- Recommendation engine: ranks actions by projected impact, cost, and confidence.

### Presentation Layer

- Mapbox GL choropleth, dark theme, four-tier colour ramp, Alectra service area clipped.
- Scenario controls (Baseline, Heatwave, Ice Storm).
- Detail panel with radar chart, factor bars, source citations, LLM briefing.
- Recommendation panel with per-card anatomy: action, why (numbers), how we know (sources), who should act.
- Live overlays: Alectra outages, cooling centres, weather, GloFAS river-discharge anomaly, weather advisories, air quality.

## Scope

### In Scope (MVP — must ship for hackathon submission **2026-05-26 23:59 ET**)

- Fusion of 5–8 real data sources keyed to communities (Census Tracts) across Mississauga + Brampton + Hamilton.
- Alectra live outage feed wired as a Tier C overlay.
- Scoring engine with three scenarios.
- Dark choropleth map with scenario switching and detail panel.
- One trained ML model with documented validation.
- LLM-generated briefings for clicked communities.
- Recommendation cards with traceable numbers.
- Live weather overlay (Open-Meteo) and live flood/river-discharge overlay (Open-Meteo Flood / GloFAS).
- Deployed at a public URL, working on mobile.

### Stretch (ship if time allows)

- Pollution / air quality layer (AQHI) addressing Theme 3 PS3.
- DeepSeek critique layer wired alongside Gemini.
- Methodology modal explaining the score.
- Compare-scenarios view.
- Expansion to a fourth Alectra community as a demonstration of geographic generalization.

### Out of Scope (explicitly not building)

- User accounts, login, personalization. The map is the product.
- Chatbot / conversational interface.
- Predictions invented by an LLM. LLMs explain numbers, they do not produce them.
- Carbon tracking or sustainability gamification.
- A spreadsheet/table primary view.
- Generic dashboards that aggregate without scoring.
- Coverage of Alectra communities outside MVP scope (Vaughan, Markham, Guelph, Barrie, etc.) — Phase 2.

## Success Criteria

1. Map loads and renders all MVP communities with correct tier colours in under 3 seconds.
2. Scenario switching recolours the map in under 1 second.
3. Clicking any community opens a detail panel with score, factor radar, source citations, and LLM briefing.
4. Every recommendation card shows: action, ≥3 quantitative inputs, source list, target actor.
5. At least one ML model is trained on real data with documented accuracy, and its predictions appear in the UI.
6. The Alectra live outage feed is visibly refreshing in the demo.
7. Deployed to a public URL accessible on mobile.
8. Theme 3 Challenge Set 03 PS1 and PS2 are demonstrably addressed; PS3 addressed if pollution layer ships.
