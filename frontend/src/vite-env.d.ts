/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Google Maps Platform API key — Street View Static + Maps Static APIs.
   * When unset, the FacilityCard falls back to the kind-specific illustration.
   * See https://developers.google.com/maps/documentation/streetview
   */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
