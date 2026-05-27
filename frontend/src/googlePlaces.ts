/**
 * Google Places integration — real per-facility data.
 *
 * Strategy: lazy-load the Google Maps JavaScript API with the Places library
 * the first time a FacilityCard opens. The Places JS SDK runs CORS-safe in
 * the browser (unlike the REST Places API which requires a backend proxy).
 *
 * Per facility we make two calls:
 *   1. findPlaceFromQuery — match by name biased to the facility's lat/lng
 *   2. getDetails — fetch hours, phone, formatted address, website
 *
 * Cost (Google Maps Platform billing):
 *   - findPlaceFromQuery: $17 / 1000
 *   - Place Details (Basic+Contact): ~$20 / 1000
 *   - $200/month free credit covers a development demo entirely.
 *
 * If no key is configured or a match is not found, callers get null and the
 * UI keeps the "Confirm directly" placeholder. No fabricated values.
 */

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

let scriptPromise: Promise<unknown> | null = null;

/** Cache by facility id so repeated card opens don't refetch. */
const placeCache = new Map<string, PlaceData | null>();

export interface PlaceData {
  formattedAddress?: string;
  formattedPhone?: string;
  website?: string;
  weekdayHours?: string[];  // ["Monday: 10:00 AM – 9:00 PM", ...] from Google
  openNow?: boolean;
  rating?: number;
  userRatingsTotal?: number;
  googleMapsUrl?: string;
}

/** Lazy-load Google Maps JS with the Places library. Idempotent. */
function loadGoogleMaps(): Promise<unknown> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (!API_KEY) return Promise.reject(new Error('no api key'));
  const g = (window as any).google;
  if (g?.maps?.places) return Promise.resolve(g);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const cbName = `__threshold_maps_loaded_${Date.now()}`;
    (window as any)[cbName] = () => {
      delete (window as any)[cbName];
      resolve((window as any).google);
    };
    const script = document.createElement('script');
    script.src =
      `https://maps.googleapis.com/maps/api/js` +
      `?key=${API_KEY}&libraries=places&loading=async&callback=${cbName}`;
    script.async = true;
    script.onerror = (e) => {
      delete (window as any)[cbName];
      scriptPromise = null;
      reject(e);
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * Look up real Google Places data for a facility.
 *
 * @param id     stable identifier — used for cache key
 * @param name   facility name (e.g., "Four Corners Library")
 * @param lat    latitude (used to bias the search)
 * @param lng    longitude
 * @returns place data, or null if no match / no API key
 */
export async function lookupPlace(
  id: string,
  name: string,
  lat: number,
  lng: number,
): Promise<PlaceData | null> {
  if (!API_KEY) return null;
  if (placeCache.has(id)) return placeCache.get(id) ?? null;

  try {
    const google = (await loadGoogleMaps()) as any;
    // PlacesService requires an HTMLDivElement attribute target.
    const service = new google.maps.places.PlacesService(document.createElement('div'));

    const placeId = await new Promise<string | null>((resolve) => {
      service.findPlaceFromQuery(
        {
          query: `${name} Brampton`,
          fields: ['place_id'],
          locationBias: new google.maps.Circle({
            center: { lat, lng },
            radius: 800,
          }),
        },
        (results: any, status: any) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK) return resolve(null);
          resolve(results?.[0]?.place_id ?? null);
        },
      );
    });

    if (!placeId) {
      placeCache.set(id, null);
      return null;
    }

    const details = await new Promise<PlaceData | null>((resolve) => {
      service.getDetails(
        {
          placeId,
          fields: [
            'formatted_address',
            'formatted_phone_number',
            'website',
            'opening_hours',
            'rating',
            'user_ratings_total',
            'url',
          ],
        },
        (place: any, status: any) => {
          if (status !== google.maps.places.PlacesServiceStatus.OK || !place) {
            return resolve(null);
          }
          resolve({
            formattedAddress:  place.formatted_address,
            formattedPhone:    place.formatted_phone_number,
            website:           place.website,
            weekdayHours:      place.opening_hours?.weekday_text,
            openNow:           place.opening_hours?.isOpen ? place.opening_hours.isOpen() : undefined,
            rating:            place.rating,
            userRatingsTotal:  place.user_ratings_total,
            googleMapsUrl:     place.url,
          });
        },
      );
    });

    placeCache.set(id, details);
    return details;
  } catch (e) {
    console.warn('[threshold] Google Places lookup failed', e);
    placeCache.set(id, null);
    return null;
  }
}

export function isGooglePlacesConfigured(): boolean {
  return !!API_KEY;
}
