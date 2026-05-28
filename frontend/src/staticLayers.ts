/**
 * Static map layer data — social services.
 *
 * Each service point is a [lat, lng] pair with a label. The map renders them
 * through Leaflet primitives — no GeoJSON parsing overhead, no external fetch.
 */

export interface ServicePoint {
  id: string;
  name: string;
  kind: 'library' | 'community-centre' | 'food-bank' | 'clinic';
  lat: number;
  lng: number;
}

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

/**
 * Visual tokens for each service kind.
 *
 * `svg` is the inner markup of a 24×24 Lucide-format viewBox — stroke uses
 * `currentColor` so the icon picks up the accent on render. Each kind has a
 * distinct icon AND a distinct accent colour so they remain legible at scale.
 */
export const SERVICE_VISUAL: Record<
  ServicePoint['kind'],
  { svg: string; label: string; color: string }
> = {
  library: {
    label: 'Library',
    color: '#3F3F46',
    // Lucide · library-big (book spines)
    svg:
      '<rect width="8" height="18" x="3" y="3" rx="1"/>' +
      '<path d="M7 3v18"/>' +
      '<path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z"/>',
  },
  'community-centre': {
    label: 'Community centre',
    color: '#0F172A',
    // Lucide · landmark (civic building with columns)
    svg:
      '<line x1="3" x2="21" y1="22" y2="22"/>' +
      '<line x1="6" x2="6" y1="18" y2="11"/>' +
      '<line x1="10" x2="10" y1="18" y2="11"/>' +
      '<line x1="14" x2="14" y1="18" y2="11"/>' +
      '<line x1="18" x2="18" y1="18" y2="11"/>' +
      '<polygon points="12 2 20 7 4 7"/>',
  },
  'food-bank': {
    label: 'Food bank',
    color: '#854D0E',
    // Lucide · shopping-bag (grocery handle bag)
    svg:
      '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/>' +
      '<path d="M3 6h18"/>' +
      '<path d="M16 10a4 4 0 0 1-8 0"/>',
  },
  clinic: {
    label: 'Clinic',
    color: '#9A3412',
    // Lucide · cross (medical, balanced cross)
    svg:
      '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2h-2z"/>',
  },
};
