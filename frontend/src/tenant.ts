/**
 * Multi-tenant configuration.
 *
 * Each tenant carries its own brand identity and the geography it covers.
 * v1 ships a single tenant (Brampton Pilot); the shape supports the white-
 * label deployment pattern without architectural changes.
 *
 * Apply a tenant's theme by writing its overrides into CSS custom
 * properties on document.documentElement. The rest of the product reads
 * from those variables and adapts automatically.
 */

export interface TenantConfig {
  id: string;
  name: string;            // City / utility name
  wordmark: string;        // Display brand name in the ribbon
  subtitle: string;        // Microcopy under the wordmark
  /** CSS variable overrides — applied at boot. */
  theme?: Partial<Record<'canvas' | 'ink' | 'alert' | 'positive', string>>;
  /** Approximate centre for the initial map view. */
  centre: [number, number]; // [lat, lng]
  zoom: number;
  /** Population scale used for benchmarking. */
  population: number;
}

export const TENANTS: Record<string, TenantConfig> = {
  'brampton-pilot': {
    id: 'brampton-pilot',
    name: 'Brampton',
    wordmark: 'Threshold',
    subtitle: 'Brampton · Operational',
    centre: [43.72, -79.77],
    zoom: 11,
    population: 656_480,
  },
  'mississauga-demo': {
    id: 'mississauga-demo',
    name: 'Mississauga',
    wordmark: 'Threshold',
    subtitle: 'Mississauga · Operational',
    centre: [43.59, -79.64],
    zoom: 11,
    population: 717_961,
  },
  'hamilton-demo': {
    id: 'hamilton-demo',
    name: 'Hamilton',
    wordmark: 'Threshold',
    subtitle: 'Hamilton · Operational',
    centre: [43.25, -79.87],
    zoom: 11,
    population: 569_353,
  },
  'surrey-demo': {
    id: 'surrey-demo',
    name: 'Surrey',
    wordmark: 'Threshold',
    subtitle: 'Surrey · Operational',
    centre: [49.18, -122.85],
    zoom: 11,
    population: 568_322,
  },
};

export const DEFAULT_TENANT_ID = 'brampton-pilot';

export function applyTenantTheme(tenant: TenantConfig): void {
  if (!tenant.theme || typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(tenant.theme)) {
    if (value) root.style.setProperty(`--${key}`, value);
  }
}
