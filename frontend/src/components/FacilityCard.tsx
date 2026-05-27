import React, { useState, useEffect } from 'react';
import {
  X, MapPin, Clock, ExternalLink, Phone, Globe,
  Building2, BookOpen, Home, Package, Stethoscope, Snowflake, Sun,
  CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { useApp } from '../context';
import { FACILITY_DETAILS, KIND_LABEL, type FacilityKind } from '../facilityDetails';
import { haversineKm } from '../utils';
import { lookupPlace, isGooglePlacesConfigured, type PlaceData } from '../googlePlaces';

const GOOGLE_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

function kindAccent(kind: FacilityKind): string {
  return kind === 'shelter'           ? 'var(--alert-soft)'
       : kind === 'library'           ? 'var(--ink-2)'
       : kind === 'community-centre'  ? 'var(--warning)'
       : kind === 'food-bank'         ? 'var(--positive)'
       : /* clinic */                   'var(--alert-mid)';
}

/** Top of card — Google Street View when key configured, illustration fallback. */
function FacilityPhoto({
  lat, lng, kind, name,
}: { lat: number; lng: number; kind: FacilityKind; name: string }) {
  const [photoOk, setPhotoOk] = useState(false);
  const Icon =
    kind === 'shelter'           ? Home :
    kind === 'library'           ? BookOpen :
    kind === 'community-centre'  ? Building2 :
    kind === 'food-bank'         ? Package :
    /* clinic */                   Stethoscope;
  const accent = kindAccent(kind);
  const photoUrl = GOOGLE_KEY
    ? `https://maps.googleapis.com/maps/api/streetview` +
      `?size=400x200&location=${lat},${lng}&fov=90&heading=70&pitch=0&key=${GOOGLE_KEY}`
    : null;

  return (
    <div
      className="relative overflow-hidden"
      style={{ height: 160, background: 'var(--surface-2)', borderBottom: '0.5px solid var(--hairline)' }}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Icon size={40} strokeWidth={1.4} style={{ color: 'var(--ink-3)' }} />
      </div>
      {photoUrl && (
        <img
          src={photoUrl}
          alt={`Street view of ${name}`}
          loading="lazy"
          onLoad={() => setPhotoOk(true)}
          onError={() => setPhotoOk(false)}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: photoOk ? 1 : 0 }}
        />
      )}
      <div className="absolute bottom-0 left-0 right-0" style={{ height: 2, background: accent }} aria-hidden />
      {photoOk && (
        <span
          className="absolute top-2 right-2 text-[9px] uppercase tracking-[0.12em] px-1.5 py-0.5"
          style={{ background: 'rgba(255,255,255,0.88)', color: 'var(--ink-3)', border: '0.5px solid var(--hairline)' }}
        >
          Google Street View
        </span>
      )}
    </div>
  );
}

/**
 * VerifiedRow — a single field row that explicitly shows whether the value
 * was verified via Google Places or is a placeholder.
 */
function Row({
  icon, label, value, verified, placeholder,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string | null;
  verified?: boolean;
  placeholder?: string;
}) {
  const display = value && value.trim() ? value : (placeholder ?? '—');
  return (
    <div className="flex items-baseline gap-2.5 py-1.5 border-b border-hairline last:border-0">
      <span className="text-ink-3 shrink-0 mt-0.5" style={{ width: 14 }}>{icon}</span>
      <span className="text-[12px] text-ink-3 flex-1">{label}</span>
      <span className="text-[12px] text-right">
        {value && value.trim() ? (
          <span className="text-ink">{display}</span>
        ) : (
          <span className="text-ink-4 italic">{display}</span>
        )}
        {verified && (
          <span
            className="ml-1.5 inline-flex items-center gap-0.5 align-middle text-[9px] uppercase tracking-[0.1em]"
            style={{ color: 'var(--positive)' }}
            title="Verified via Google Places"
          >
            <ShieldCheck size={9} />
          </span>
        )}
      </span>
    </div>
  );
}

export default function FacilityCard() {
  const { activeFacility, setActiveFacility, selected, scenario } = useApp();
  const [place, setPlace] = useState<PlaceData | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);

  // Esc dismissal
  useEffect(() => {
    if (!activeFacility) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActiveFacility(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activeFacility, setActiveFacility]);

  // Look up real Google Places data when a facility opens
  useEffect(() => {
    if (!activeFacility) { setPlace(null); return; }
    if (!isGooglePlacesConfigured()) return;
    setPlaceLoading(true);
    setPlace(null);
    let cancelled = false;
    lookupPlace(activeFacility.id, activeFacility.name, activeFacility.lat, activeFacility.lng)
      .then(p => { if (!cancelled) setPlace(p); })
      .finally(() => { if (!cancelled) setPlaceLoading(false); });
    return () => { cancelled = true; };
  }, [activeFacility]);

  if (!activeFacility) return null;

  const f = activeFacility;
  const meta = FACILITY_DETAILS[f.kind];
  const distance = selected ? haversineKm(selected.lat, selected.lng, f.lat, f.lng) : null;
  const mapsUrl = place?.googleMapsUrl
    ?? `https://www.google.com/maps/search/?api=1&query=${f.lat},${f.lng}`;

  const activated = meta.designatedShelter && (scenario === 'Heatwave' || scenario === 'Ice Storm');

  // Field resolution: prefer Google data when present.
  const address = place?.formattedAddress ?? f.address;
  const phone   = place?.formattedPhone;
  const website = place?.website;
  const hours   = place?.weekdayHours;

  return (
    <div
      className="fixed inset-0 z-[820] flex items-center justify-center px-4"
      style={{ background: 'rgba(15,23,42,0.30)', backdropFilter: 'blur(3px)' }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) setActiveFacility(null); }}
    >
      <article className="bg-surface border border-hairline overflow-hidden flex flex-col" style={{ width: 380, maxHeight: '82vh' }}>
        <FacilityPhoto lat={f.lat} lng={f.lng} kind={f.kind} name={f.name} />

        {/* Header */}
        <header className="px-5 pt-4 pb-3 border-b border-hairline">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">
                {KIND_LABEL[f.kind]}
              </div>
              <h2 className="text-[18px] font-medium tracking-tight mt-1 text-ink leading-tight">{f.name}</h2>
            </div>
            <button
              onClick={() => setActiveFacility(null)}
              className="text-ink-3 hover:text-ink transition-colors cursor-pointer shrink-0 mt-1"
              aria-label="Close"
            >
              <X size={14} />
            </button>
          </div>

          {activated && (
            <div
              className="mt-3 flex items-center gap-1.5 text-[11px] px-2 py-1.5"
              style={{
                background: scenario === 'Heatwave' ? 'rgba(154,52,18,0.06)' : 'rgba(63,98,18,0.06)',
                color: scenario === 'Heatwave' ? 'var(--alert)' : 'var(--positive)',
              }}
            >
              {scenario === 'Heatwave' ? <Sun size={11} /> : <Snowflake size={11} />}
              <span className="uppercase tracking-[0.12em] text-[10px] font-medium">Activated · {scenario}</span>
              <CheckCircle2 size={11} className="ml-auto" />
            </div>
          )}
        </header>

        <div className="overflow-y-auto flex-1">
          {/* Description (category-level, always true) */}
          <section className="px-5 py-3.5 border-b border-hairline">
            <p className="text-[13px] leading-[1.65] text-ink-2">{meta.description}</p>
          </section>

          {/* Hours — real when Google Places returns them */}
          <section className="px-5 py-3.5 border-b border-hairline">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-2 flex items-center gap-1.5">
              <Clock size={10} /> Hours of operation
              {hours && (
                <span className="ml-auto inline-flex items-center gap-0.5 text-[9px] tracking-[0.1em] normal-case" style={{ color: 'var(--positive)' }}>
                  <ShieldCheck size={9} /> Verified
                </span>
              )}
            </div>
            {placeLoading && !hours ? (
              <div className="text-[12px] text-ink-4 italic">Verifying with Google…</div>
            ) : hours && hours.length > 0 ? (
              <dl className="m-0">
                {hours.map((line, i) => {
                  const [day, value] = line.split(/:\s+/);
                  return (
                    <div key={i} className="flex items-baseline justify-between py-1 border-b border-hairline last:border-0">
                      <dt className="text-[12px] text-ink-3 tabular">{day}</dt>
                      <dd className="text-[12px] text-ink tabular">{value ?? '—'}</dd>
                    </div>
                  );
                })}
                {place?.openNow != null && (
                  <div className="text-[11px] mt-2" style={{ color: place.openNow ? 'var(--positive)' : 'var(--ink-3)' }}>
                    {place.openNow ? 'Open now' : 'Closed now'}
                  </div>
                )}
              </dl>
            ) : (
              <div className="text-[12px] text-ink-3 leading-relaxed">
                Hours vary by location. Confirm directly with the facility before referring residents.
              </div>
            )}
          </section>

          {/* Contact / Details */}
          <section className="px-5 py-3.5 border-b border-hairline">
            <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3 mb-2">Facility details</div>
            <Row
              icon={<MapPin size={11} />}
              label="Address"
              value={address}
              verified={!!place?.formattedAddress}
              placeholder="address not on file"
            />
            <Row
              icon={<Phone size={11} />}
              label="Phone"
              value={phone}
              verified={!!phone}
              placeholder={meta.genericContact}
            />
            <Row
              icon={<Globe size={11} />}
              label="Website"
              value={website}
              verified={!!website}
              placeholder="—"
            />
            {place?.rating != null && (
              <Row
                icon={<CheckCircle2 size={11} />}
                label="Public rating"
                value={`${place.rating.toFixed(1)} (${place.userRatingsTotal ?? 0} reviews)`}
                verified
              />
            )}
          </section>

          {/* Spatial context */}
          {distance != null && selected && (
            <section className="px-5 py-3 border-b border-hairline bg-surface-2">
              <div className="text-[11px] text-ink-2 leading-relaxed">
                <span className="tabular text-ink font-medium">{distance.toFixed(1)} km</span>{' '}
                from <span className="text-ink">{selected.neighbourhood}</span>
                {distance > 2.5 && (
                  <span className="text-warning"> · beyond 2.5 km accessibility radius</span>
                )}
              </div>
            </section>
          )}

          {/* External links */}
          <section className="px-5 py-3 border-b border-hairline flex items-center gap-4">
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-[12px] text-ink hover:text-ink-2 transition-colors"
            >
              <ExternalLink size={11} />
              {place?.googleMapsUrl ? 'View on Google Maps' : 'Open in maps'}
            </a>
            {website && (
              <a
                href={website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] text-ink hover:text-ink-2 transition-colors"
              >
                <Globe size={11} />
                Visit website
              </a>
            )}
          </section>

          {/* Provenance footer */}
          <section className="px-5 py-3 text-[11px] text-ink-4 leading-relaxed">
            Location · City of Brampton facilities registry.
            {isGooglePlacesConfigured()
              ? ' Hours, phone, website · Google Places. Photo · Google Street View Static. Fields marked with a shield are verified live; unmarked fields are placeholders pending data.'
              : ' Hours, phone, and operational specifics are not yet integrated. Configure VITE_GOOGLE_MAPS_API_KEY to enable verified live data from Google Places.'}
          </section>
        </div>
      </article>
    </div>
  );
}
