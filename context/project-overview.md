# Threshold

## Overview

Threshold is a civic data fusion platform for community energy vulnerability. It ingests structural, seasonal, and real-time data from city governments, utilities, and federal agencies — currently siloed across the City of Toronto, Alectra, Esri Canada, Statistics Canada, NRCan, and Environment Canada — normalizes them into a shared spatial ontology, and produces traceable, quantitative recommendations that emergency managers, utility planners, and community organizations can act on together.

The product surface is a dark, mission-control choropleth of Toronto's neighbourhoods. The fusion layer, ML models, and LLM reasoning stack sit underneath. Built for Seneca Energy Hackathon 2026, Theme 3 (Community Energy, Equity & Sustainability), addressing all three problem statements in Challenge Set 03.

## Product Axiom

**Every recommendation Threshold makes is traceable to a number, and every number is traceable to a public dataset.** This is non-negotiable. The LLM writes prose around numbers; it never invents numbers. ML models produce numbers; they cite the data they were trained on. The map renders numbers; clicking any colour reveals the score and its inputs in two clicks or fewer.

## Goals

1. Fuse at least 8 public datasets across City of Toronto, Alectra, Esri Living Atlas, Statistics Canada, NRCan, and Environment Canada into a single neighbourhood-keyed ontology.
2. Train and ship at least one real ML model (outage probability or vulnerability composite) with documented training data, architecture, and validation.
3. Render Toronto's neighbourhoods on a dark choropleth where colour, score, and tier are legible in under 5 seconds.
4. Generate per-neighbourhood recommendation cards with traceable numbers (predicted impact, cost, confidence) and human-readable briefings produced by an LLM reasoning layer.
5. Demonstrate scenario switching (Baseline, Heatwave, Ice Storm) that re-weights factors and recolours the map in under 1 second.

## Core User Flow

1. User opens Threshold. Toronto renders as a dark choropleth with all neighbourhoods coloured by current Threshold Score.
2. User hovers a neighbourhood — tooltip surfaces name, score, and tier.
3. User clicks a neighbourhood — detail panel opens with radar chart, factor breakdown, source citations, and an LLM-generated briefing.
4. User switches scenario (Baseline → Heatwave → Ice Storm) — map recolours in under 1 second, sidebar top-10 list refreshes.
5. User opens the Recommendation panel — sees ranked, quantitatively justified actions ("pre-position cooling bus in Rexdale-Kipling by 4pm Tuesday — projected to prevent 10 ER visits, cost $1,800").
6. User toggles overlays — cooling centres, current outages, active weather advisories, air quality.

## Features

### Data Fusion Layer

- Three-tier ingestion: Tier A structural (yearly, build-time), Tier B seasonal (daily, cron), Tier C live (5–15 min, polling).
- Shared spatial ontology: Neighbourhood, Building, GridFeeder, Shelter, WeatherCell, PollutionSource.
- Source-to-entity mapping with provenance recorded on every field.

### Intelligence Layer

- Scoring engine: weighted composite of normalized factor scores per scenario.
- Custom neural network(s) for prediction (outage probability or vulnerability composite — first one trained, others scaffolded as v0 heuristics).
- LLM reasoning: Gemini for long-context synthesis and briefings; DeepSeek for chain-of-thought critique of ML outputs.
- Recommendation engine: ranks actions by projected impact, cost, and confidence.

### Presentation Layer

- Mapbox GL choropleth, dark theme, four-tier colour ramp.
- Scenario controls (Baseline, Heatwave, Ice Storm).
- Detail panel with radar chart, factor bars, source citations, LLM briefing.
- Recommendation panel with per-card anatomy: action, why (numbers), how we know (sources), who should act.
- Live overlays: cooling centres, current outages, weather advisories, air quality.

## Scope

### In Scope (MVP — must ship for hackathon submission May 26 23:59)

- Fusion of 5–8 real data sources keyed to Toronto neighbourhoods.
- Scoring engine with three scenarios.
- Dark choropleth map with scenario switching and detail panel.
- One trained ML model with documented validation.
- LLM-generated briefings for clicked neighbourhoods.
- Recommendation cards with traceable numbers.
- Live weather overlay (Environment Canada GeoMet).
- Deployed at a public URL, working on mobile.

### Stretch (ship if time allows)

- Outage overlay from Toronto Hydro / Alectra.
- Pollution / air quality layer addressing Theme 3 PS3.
- DeepSeek critique layer wired alongside Gemini.
- Methodology modal explaining the score.
- Compare-scenarios view.

### Out of Scope (explicitly not building)

- User accounts, login, personalization. The map is the product.
- Chatbot / conversational interface. Threshold is spatial intelligence with traceable numbers.
- Predictions invented by an LLM. LLMs explain numbers, they do not produce them.
- Carbon tracking or sustainability gamification.
- A spreadsheet/table primary view.
- Generic dashboards that aggregate without scoring.

## Success Criteria

1. Map loads and renders all Toronto neighbourhoods with correct tier colours in under 3 seconds.
2. Scenario switching recolours the map in under 1 second.
3. Clicking any neighbourhood opens a detail panel with score, factor radar, source citations, and LLM briefing.
4. Every recommendation card shows: action, ≥3 quantitative inputs, source list, target actor.
5. At least one ML model is trained on real data with documented accuracy, and its predictions appear in the UI.
6. Deployed to a public URL accessible on mobile.
7. Theme 3 Challenge Set 03 PS1 and PS2 are demonstrably addressed; PS3 addressed if pollution layer ships.
