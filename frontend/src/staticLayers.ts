/**
 * Static map layer data — transit, hydro, social services.
 *
 * Coordinates are simplified approximations of real Brampton infrastructure,
 * sufficient for the layer toggles to render something meaningful while a real
 * data pipeline catches up. Production deployment would replace these with:
 *   - Brampton Transit GTFS shapes (transit)
 *   - Alectra ArcGIS feeder topology (hydro)
 *   - Region of Peel community-services registry (services)
 *
 * Each corridor is a simple polyline; each service point is a [lat, lng] pair
 * with a label. The map renders them through Leaflet primitives — no GeoJSON
 * parsing overhead, no external fetch.
 */

export interface Polyline {
  id: string;
  name: string;
  path: [number, number][]; // [lat, lng]
}

export interface ServicePoint {
  id: string;
  name: string;
  kind: 'library' | 'community-centre' | 'food-bank' | 'clinic';
  lat: number;
  lng: number;
}

/** Major Brampton transit corridors — approximated from public route maps. */
export const TRANSIT_CORRIDORS: Polyline[] = [
  {
    id: 'queen-zum',
    name: 'Züm Queen · 501',
    path: [
      [43.6892, -79.8420], [43.6912, -79.8210], [43.6925, -79.8000],
      [43.6940, -79.7820], [43.6955, -79.7640], [43.6970, -79.7460],
      [43.6985, -79.7280],
    ],
  },
  {
    id: 'main-zum',
    name: 'Züm Main · 502',
    path: [
      [43.7560, -79.7600], [43.7440, -79.7600], [43.7320, -79.7610],
      [43.7180, -79.7620], [43.7000, -79.7635], [43.6860, -79.7650],
    ],
  },
  {
    id: 'steeles-zum',
    name: 'Züm Steeles · 505',
    path: [
      [43.6620, -79.8400], [43.6620, -79.8200], [43.6620, -79.8000],
      [43.6620, -79.7800], [43.6620, -79.7600], [43.6620, -79.7400],
      [43.6620, -79.7200],
    ],
  },
  {
    id: 'bovaird-zum',
    name: 'Züm Bovaird · 511',
    path: [
      [43.7600, -79.8420], [43.7595, -79.8200], [43.7590, -79.8000],
      [43.7585, -79.7800], [43.7580, -79.7600], [43.7575, -79.7400],
      [43.7570, -79.7200],
    ],
  },
  {
    id: 'bramalea',
    name: 'Bramalea · 15',
    path: [
      [43.7860, -79.7220], [43.7700, -79.7230], [43.7540, -79.7240],
      [43.7380, -79.7250], [43.7200, -79.7260], [43.6900, -79.7265],
      [43.6620, -79.7270],
    ],
  },
  {
    id: 'airport',
    name: 'Airport Road · 11',
    path: [
      [43.7860, -79.6900], [43.7600, -79.6920], [43.7340, -79.6940],
      [43.7080, -79.6960], [43.6820, -79.6980], [43.6620, -79.7000],
    ],
  },
];

/** Simplified Alectra hydro backbone — main north-south + east-west corridors. */
export const HYDRO_CORRIDORS: Polyline[] = [
  {
    id: 'backbone-ns',
    name: 'Hwy 410 corridor · 230 kV',
    path: [
      [43.7900, -79.7780], [43.7600, -79.7780], [43.7300, -79.7780],
      [43.7000, -79.7780], [43.6700, -79.7780], [43.6500, -79.7780],
    ],
  },
  {
    id: 'backbone-ew',
    name: 'Steeles tie · 115 kV',
    path: [
      [43.6650, -79.8400], [43.6650, -79.8100], [43.6650, -79.7800],
      [43.6650, -79.7500], [43.6650, -79.7200], [43.6650, -79.6900],
    ],
  },
  {
    id: 'feeder-north',
    name: 'Mayfield feeder · 27.6 kV',
    path: [
      [43.7900, -79.8000], [43.7900, -79.7500], [43.7900, -79.7000],
      [43.7900, -79.6700],
    ],
  },
  {
    id: 'feeder-central',
    name: 'Queen / Bovaird tie · 27.6 kV',
    path: [
      [43.7560, -79.8420], [43.7560, -79.7600], [43.7000, -79.7600],
      [43.6900, -79.7620],
    ],
  },
];

/**
 * Social-services anchor points beyond the cooling/warming centre registry.
 * These render when the Services layer is on — distinct from shelters.
 */
export const SERVICE_POINTS: ServicePoint[] = [
  { id: 'lib-four-corners', name: 'Four Corners Library',     kind: 'library',         lat: 43.6850, lng: -79.7600 },
  { id: 'lib-cyril-clark',  name: 'Cyril Clark Library',      kind: 'library',         lat: 43.7050, lng: -79.7390 },
  { id: 'lib-chinguacousy', name: 'Chinguacousy Library',     kind: 'library',         lat: 43.7300, lng: -79.7480 },
  { id: 'lib-springdale',   name: 'Springdale Library',       kind: 'library',         lat: 43.7570, lng: -79.7300 },
  { id: 'lib-south-fletch', name: 'South Fletcher\'s Library',kind: 'library',         lat: 43.6700, lng: -79.7270 },
  { id: 'cc-flower-city',   name: 'Flower City Comm. Centre', kind: 'community-centre',lat: 43.6960, lng: -79.7660 },
  { id: 'cc-knightsbridge', name: 'Knightsbridge Comm.',      kind: 'community-centre',lat: 43.7180, lng: -79.7060 },
  { id: 'food-knights-tbl', name: 'Knight\'s Table',          kind: 'food-bank',       lat: 43.6920, lng: -79.7610 },
  { id: 'food-regeneration',name: 'Regeneration Outreach',    kind: 'food-bank',       lat: 43.6855, lng: -79.7540 },
  { id: 'food-st-louise',   name: 'St. Louise Outreach',      kind: 'food-bank',       lat: 43.7460, lng: -79.7510 },
  { id: 'clinic-peel-pub',  name: 'Peel Public Health · Brampton', kind: 'clinic',     lat: 43.6905, lng: -79.7575 },
  { id: 'clinic-wise-east', name: 'Wise Elephant FHT · East', kind: 'clinic',          lat: 43.7340, lng: -79.7250 },
];

/** Visual tokens for each service kind. */
export const SERVICE_VISUAL: Record<ServicePoint['kind'], { glyph: string; label: string }> = {
  library:           { glyph: 'L', label: 'Library' },
  'community-centre':{ glyph: 'C', label: 'Community centre' },
  'food-bank':       { glyph: 'F', label: 'Food bank' },
  clinic:            { glyph: '+', label: 'Clinic' },
};
