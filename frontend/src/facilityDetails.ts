/**
 * Facility kind metadata.
 *
 * IMPORTANT: This module contains ONLY category-level facts that are
 * honestly true of every facility of a given kind. It does NOT contain
 * fabricated per-facility specifics (hours, capacity, phone). Those
 * fields come from the Google Places integration in `./googlePlaces.ts`
 * when an API key is configured, or remain "Confirm directly" otherwise.
 *
 * Earlier versions of this file invented hours and capacity per kind.
 * Those defaults were misleading — branch hours of Brampton Library vary
 * significantly, food bank hours are not uniform, etc. Removed.
 */

export type FacilityKind =
  | 'shelter'           // designated cooling / warming centre (rec centre)
  | 'library'           // public library branch
  | 'community-centre'  // community hall, faith centre, civic space
  | 'food-bank'
  | 'clinic';

export interface FacilityKindMeta {
  kind: FacilityKind;
  kindLabel: string;
  /** Category-level description — true of every facility of this kind. */
  description: string;
  /** Whether this kind serves as a designated cooling/warming centre during scenarios. */
  designatedShelter: boolean;
  /** Suggested generic contact for residents — used only when no facility-specific line is verified. */
  genericContact: string;
}

export const FACILITY_DETAILS: Record<FacilityKind, FacilityKindMeta> = {
  shelter: {
    kind: 'shelter',
    kindLabel: 'Designated cooling / warming centre',
    description:
      'Operated by City of Brampton Recreation Services as a designated cooling or warming centre during heat and cold advisories. Provides air-conditioning or heat, water, washrooms, and seating. Welcomes residents without ID requirement during advisories.',
    designatedShelter: true,
    genericContact: '311 · City of Brampton',
  },
  library: {
    kind: 'library',
    kindLabel: 'Brampton Library branch',
    description:
      'Branch of Brampton Library: free public space with study seating, computers, meeting rooms, and public Wi-Fi. Activated as informal respite during heat or cold advisories.',
    designatedShelter: false,
    genericContact: '905-793-4636 · Brampton Library',
  },
  'community-centre': {
    kind: 'community-centre',
    kindLabel: 'Community centre',
    description:
      'Civic, faith, or community-operated space hosting recreation, programming, and gathering. May serve as informal respite during advisories through coordination with Emergency Management.',
    designatedShelter: false,
    genericContact: '311 · City of Brampton',
  },
  'food-bank': {
    kind: 'food-bank',
    kindLabel: 'Food bank · community pantry',
    description:
      'Provides emergency food assistance to residents experiencing food insecurity. Intake hours and distribution windows vary by operator — confirm before referring a resident.',
    designatedShelter: false,
    genericContact: '211 · Region of Peel',
  },
  clinic: {
    kind: 'clinic',
    kindLabel: 'Health clinic',
    description:
      'Public health or family health team clinic. May offer walk-in service for heat-related illness during advisories, vaccination, and wellness checks. Confirm walk-in availability before referring residents.',
    designatedShelter: false,
    genericContact: '905-799-7700 · Peel Public Health',
  },
};

/** Resolve a facility role string to a FacilityKind. */
export function resolveKind(role: string | undefined): FacilityKind {
  if (!role) return 'shelter';
  const r = role.toLowerCase();
  if (r.includes('library')) return 'library';
  if (r.includes('community') || r.includes('faith')) return 'community-centre';
  if (r.includes('food')) return 'food-bank';
  if (r.includes('clinic') || r.includes('health')) return 'clinic';
  return 'shelter';
}

export const KIND_LABEL: Record<FacilityKind, string> = {
  shelter:           'Cooling / Warming Centre',
  library:           'Library',
  'community-centre':'Community Centre',
  'food-bank':       'Food Bank',
  clinic:            'Clinic',
};
