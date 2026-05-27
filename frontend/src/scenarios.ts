/**
 * Scenario weather profiles.
 *
 * When a scenario is active, every tract's weather values are overridden with
 * the values that would obtain during a representative event of that type in
 * Brampton's climatic record. The numbers below are calibrated to recent
 * Environment Canada Brampton-area observations during real events:
 *
 *   - Heatwave reference:  July 2024 — peak humidex 42, daytime air 34, light
 *     SE wind, clear (WMO code 0).
 *   - Ice Storm reference: December 2013 — air at -12, wind chill -22, sustained
 *     wind 35 km/h with gusts to 65, freezing rain (WMO code 67), ~6 mm precip.
 *
 * The baseline scenario uses live data unchanged.
 *
 * Scenarios drive *displayed* conditions; the choropleth score uses the
 * pre-computed scenario-conditioned score (threshold_score_heatwave /
 * threshold_score_icestorm) which the backend pipeline already produces.
 */

import type { Scenario } from './types';

export interface WeatherProfile {
  temperature_c: number;
  humidex: number;          // apparent temperature (heat) or wind chill (cold)
  precipitation_mm: number;
  wind_speed_kmh: number;
  wind_gusts_kmh: number;
  weather_code: number;     // WMO code
  /** Short label for the weather-station banner. */
  banner: string;
  /** Long-form line used in the WeatherStation card and dispatch card. */
  advisory: string;
}

export const SCENARIO_PROFILE: Record<Scenario, WeatherProfile | null> = {
  Baseline: null,
  Heatwave: {
    temperature_c:    34,
    humidex:          42,
    precipitation_mm: 0,
    wind_speed_kmh:   8,
    wind_gusts_kmh:   15,
    weather_code:     0,
    banner:           'Heat advisory in effect',
    advisory:         'Humidex above 40°C. Sustained heat conditions modeled on the July 2024 event.',
  },
  'Ice Storm': {
    temperature_c:    -12,
    humidex:          -22,
    precipitation_mm: 6,
    wind_speed_kmh:   35,
    wind_gusts_kmh:   65,
    weather_code:     67,
    banner:           'Ice storm warning in effect',
    advisory:         'Freezing rain with sustained 35 km/h winds. Conditions modeled on the December 2013 event.',
  },
};

/**
 * Build the override values the backend's simulate endpoint expects.
 * Returns null when the scenario is Baseline (which means live values).
 */
export function simulateQuery(scenario: Scenario): string | null {
  const p = SCENARIO_PROFILE[scenario];
  if (!p) return null;
  const params = new URLSearchParams({
    simulate: 'true',
    temperature_c: String(p.temperature_c),
    humidex: String(p.humidex),
    precipitation_mm: String(p.precipitation_mm),
    wind_speed_kmh: String(p.wind_speed_kmh),
    wind_gusts_kmh: String(p.wind_gusts_kmh),
    weather_code: String(p.weather_code),
  });
  return params.toString();
}
