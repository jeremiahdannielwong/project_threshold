import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useApp } from '../context';
import { rampColor, scoreFor, rampLabel } from '../utils';
import type { AdvisoryUrgency } from './../advisories';
import { SERVICE_POINTS, SERVICE_VISUAL } from '../staticLayers';

/**
 * Location-pin primitive — teardrop with the kind's icon nested in the head.
 * White interior + coloured stroke reads as a proper map marker (the
 * "this thing is here" affordance) rather than a flat tile.
 *
 * Pin viewBox is 24×28; tip sits at (12, 26.5) so iconAnchor lands on the
 * geographic coordinate. Subtle drop-shadow gives it lift over the choropleth
 * without competing with it.
 */
function pinIcon(color: string, innerSvg: string): L.DivIcon {
  return L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="42" viewBox="0 0 24 28"
      style="filter:drop-shadow(0 2px 3px rgba(15,23,42,0.30));">
      <path d="M12 1.5C6.5 1.5 2 6 2 11c0 6.5 10 15.5 10 15.5S22 17.5 22 11c0-5-4.5-9.5-10-9.5z"
        fill="#FFFFFF" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
      <g transform="translate(7.5 4.5) scale(0.375)"
        fill="none" stroke="${color}" stroke-width="3"
        stroke-linecap="round" stroke-linejoin="round">${innerSvg}</g>
    </svg>`,
    className: '',
    iconSize: [36, 42],
    iconAnchor: [18, 40],
  });
}

function servicePointIcon(kind: keyof typeof SERVICE_VISUAL): L.DivIcon {
  const v = SERVICE_VISUAL[kind];
  return pinIcon(v.color, v.svg);
}

/** Visual urgency tokens for the on-map advisory pips. */
const URG_COLOR: Record<AdvisoryUrgency, string> = {
  critical: '#7C2D12',
  elevated: '#C2410C',
  routine:  '#71717A',
};
const URG_SIZE: Record<AdvisoryUrgency, number> = {
  critical: 10,
  elevated: 8,
  routine:  6,
};

function advisoryIcon(urg: AdvisoryUrgency, count: number): L.DivIcon {
  const size = URG_SIZE[urg];
  const color = URG_COLOR[urg];
  // A small filled square with a 0.5px outline. Restraint over alarm.
  return L.divIcon({
    html: `<div style="
      width:${size}px;height:${size}px;background:${color};
      border:0.5px solid rgba(15,23,42,0.45);
      box-shadow:0 0 0 1px rgba(255,255,255,0.7);
      ${count > 3 ? 'outline:1px solid ' + color + '40;outline-offset:2px;' : ''}
    "></div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Shelter / cooling centre — same location-pin shape as services so the
// whole map shares a single marker vocabulary. Deep-ink stroke marks them
// as the operational anchor without going dark/heavy.
const SHELTER_ICON = pinIcon(
  '#0F172A',
  '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/>' +
  '<path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'
);

const OUTAGE_ICON = L.divIcon({
  html: '<div style="width:6px;height:6px;border-radius:50%;background:#9A3412;border:0.5px solid #7C2D12;"></div>',
  className: '',
  iconSize: [6, 6],
  iconAnchor: [3, 3],
});

// Hospital — red medical cross. ER anchors for heat/cold surge planning.
const HOSPITAL_ICON = pinIcon(
  '#B91C1C',
  '<path d="M11 2a2 2 0 0 0-2 2v5H4a2 2 0 0 0-2 2v2c0 1.1.9 2 2 2h5v5c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2v-5h5a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-5V4a2 2 0 0 0-2-2z"/>'
);

// Long-term care home — bed glyph. The most heat/cold-fragile residents.
const LTC_ICON = pinIcon(
  '#7C3AED',
  '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>'
);

// AQHI band → tint. Mirrors Canada's Air Quality Health Index colour scale.
function aqhiColor(band: string | undefined): string {
  switch (band) {
    case 'Low':       return '#22C55E';
    case 'Moderate':  return '#F59E0B';
    case 'High':      return '#EF4444';
    case 'Very High': return '#7F1D1D';
    default:          return '#94A3B8';
  }
}

interface MapPoint { name: string; lat: number; lng: number; meta: string; }
interface AqhiCell { aqhi: number; band: string; pm25: number | null; }

// Census CTUIDs arrive as "5350573.06" in both the API and the static geojson;
// normalise to a plain string key so the AQHI join is exact.
const ctKey = (v: unknown): string => String(v ?? '').trim();

export default function MapPanel() {
  const {
    tracts, facilities, selected, setSelected, scenario, percentiles, layers,
    rollupByTract, setActiveFacility, tenant,
  } = useApp();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const geoRef = useRef<L.GeoJSON | null>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);
  const advisoryLayerRef = useRef<L.LayerGroup | null>(null);
  const servicesLayerRef = useRef<L.LayerGroup | null>(null);
  const hospitalsLayerRef = useRef<L.LayerGroup | null>(null);
  const ltcLayerRef = useRef<L.LayerGroup | null>(null);
  const aqhiLayerRef = useRef<L.LayerGroup | null>(null);

  // Static layer data — fetched once from the pipeline-built geojson in /public.
  const [hospitals, setHospitals] = React.useState<MapPoint[]>([]);
  const [ltcHomes, setLtcHomes] = React.useState<MapPoint[]>([]);
  const [aqhiByCt, setAqhiByCt] = React.useState<Map<string, AqhiCell>>(new Map());

  // Initialize map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: tenant.centre,
      zoom: tenant.zoom,
      zoomControl: false,
      attributionControl: true,
    });
    // CARTO Positron — quiet, neutral, institutional. No labels-only variant needed.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap · © CARTO',
      maxZoom: 19,
      opacity: 0.55,
    }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      opacity: 0.8,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    // AQHI tint sits directly above the risk choropleth (both polygons); the
    // marker groups are added after so their pins float above every fill.
    aqhiLayerRef.current = L.layerGroup().addTo(map);
    markersRef.current = L.layerGroup().addTo(map);
    advisoryLayerRef.current = L.layerGroup().addTo(map);
    servicesLayerRef.current = L.layerGroup().addTo(map);
    hospitalsLayerRef.current = L.layerGroup().addTo(map);
    ltcLayerRef.current = L.layerGroup().addTo(map);
    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pan the map when tenant changes; invalidate size on layout transitions.
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(tenant.centre, tenant.zoom, { animate: true });
  }, [tenant.id]);

  // Leaflet must be told to re-measure when its container resizes (e.g.,
  // entering/leaving wall display). Trigger after a tick to let layout settle.
  useEffect(() => {
    const id = setTimeout(() => mapRef.current?.invalidateSize(), 120);
    return () => clearTimeout(id);
  });

  // Choropleth — sequential single-hue ramp, percentile-keyed, hover dimming.
  useEffect(() => {
    if (!mapRef.current || tracts.length === 0) return;
    if (geoRef.current) { geoRef.current.remove(); geoRef.current = null; }

    const tractMap = new Map(tracts.map(t => [t.ctuid, t]));

    const geojson = {
      type: 'FeatureCollection' as const,
      features: tracts.map(t => ({
        type: 'Feature' as const,
        geometry: t.geometry as unknown as GeoJSON.Geometry,
        properties: { ctuid: t.ctuid },
      })),
    };

    const baseStyle = (ctuid: string | undefined) => {
      const t = ctuid ? tractMap.get(ctuid) : undefined;
      if (!t) return { fillOpacity: 0, weight: 0 };
      const p = percentiles.get(t.ctuid) ?? 0;
      const fill = rampColor(p);
      const isSel = selected?.ctuid === t.ctuid;
      const dimmed = !!selected && !isSel;
      return {
        fillColor: fill,
        fillOpacity: dimmed ? 0.22 : 0.72,
        color: isSel ? '#0F172A' : '#E8E4D8',
        weight: isSel ? 1.5 : 0.5,
      };
    };

    const layer = L.geoJSON(geojson, {
      style: (feat) => baseStyle(feat?.properties?.ctuid as string | undefined),
      onEachFeature: (feat, lyr) => {
        const ctuid = feat.properties?.ctuid as string | undefined;
        const t = ctuid ? tractMap.get(ctuid) : undefined;
        if (!t) return;

        lyr.on('mouseover', () => {
          const p = percentiles.get(t.ctuid) ?? 0;
          const score = scoreFor(t, scenario);
          const rollup = rollupByTract.get(t.ctuid);
          (lyr as L.Path).setStyle({ fillOpacity: 0.85, weight: 1, color: '#0F172A' });
          const lines = [
            `<span style="color:#0F172A;font-weight:500">${t.neighbourhood}</span>`,
            `<span style="color:#71717A;font-size:11px">${score.toFixed(0)} · ${rampLabel(p)}</span>`,
          ];
          if (rollup && rollup.total > 0) {
            const urg = rollup.maxUrgency ?? 'routine';
            const urgColor =
              urg === 'critical' ? '#7C2D12' :
              urg === 'elevated' ? '#C2410C' : '#71717A';
            lines.push(
              `<span style="color:${urgColor};font-size:11px;display:block;margin-top:4px;border-top:0.5px solid #E8E4D8;padding-top:4px">` +
              `${rollup.byUrgency.critical > 0 ? rollup.byUrgency.critical + ' critical · ' : ''}` +
              `${rollup.total} ${rollup.total === 1 ? 'advisory' : 'advisories'}` +
              `</span>`
            );
            if (rollup.topHeadline) {
              lines.push(
                `<span style="color:#3F3F46;font-size:11px;display:block;max-width:240px;line-height:1.4">${rollup.topHeadline}</span>`
              );
            }
          }
          lyr.bindTooltip(lines.join(''), { sticky: true, opacity: 1 }).openTooltip();
        });
        lyr.on('mouseout', () => layer.resetStyle(lyr as L.Path));
        lyr.on('click', () => setSelected(selected?.ctuid === t.ctuid ? null : t));
      },
    });

    layer.addTo(mapRef.current);
    geoRef.current = layer;
  }, [tracts, scenario, selected, percentiles, setSelected]);

  // Fly to selected tract bounds so watchlist clicks zoom the map to the neighbourhood
  useEffect(() => {
    if (!selected || !mapRef.current || !geoRef.current) return;
    geoRef.current.eachLayer(lyr => {
      const feat = (lyr as any).feature;
      if (feat?.properties?.ctuid !== selected.ctuid) return;
      const poly = lyr as unknown as L.Polygon;
      const bounds = typeof poly.getBounds === 'function' ? poly.getBounds() : null;
      if (bounds?.isValid?.()) {
        mapRef.current!.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 0.7 });
      }
    });
  }, [selected?.ctuid]);

  // Overlay markers from layer rail
  useEffect(() => {
    if (!markersRef.current) return;
    markersRef.current.clearLayers();

    if (layers.shelters) {
      const seen = new Set<string>();
      facilities.forEach(f => {
        const key = `${f.lat.toFixed(3)},${f.lng.toFixed(3)}`;
        if (seen.has(key)) return;
        seen.add(key);
        L.marker([f.lat, f.lng], { icon: SHELTER_ICON })
          .bindTooltip(f.name, { opacity: 1 })
          .on('click', () => setActiveFacility({
            id: `shelter-${key}`,
            name: f.name,
            kind: 'shelter',
            lat: f.lat,
            lng: f.lng,
            address: f.address,
            role: f.role,
          }))
          .addTo(markersRef.current!);
      });
    }

    if (layers.outages) {
      tracts.filter(t => t.active_outages > 0).forEach(t => {
        L.marker([t.lat, t.lng], { icon: OUTAGE_ICON })
          .bindTooltip(`Outage · ${t.customers_affected.toLocaleString()} customers`, { opacity: 1 })
          .addTo(markersRef.current!);
      });
    }
  }, [tracts, facilities, layers, setActiveFacility]);

  /* ─── Ambient advisory pips — one per tract with active advisories ─── */
  useEffect(() => {
    if (!advisoryLayerRef.current) return;
    advisoryLayerRef.current.clearLayers();
    if (!layers.advisories) return;

    tracts.forEach(t => {
      const r = rollupByTract.get(t.ctuid);
      if (!r || !r.maxUrgency || r.total === 0) return;
      const top = r.topHeadline ?? '';
      const opActions = r.operatorActions > 0 ? ` · ${r.operatorActions} operator action${r.operatorActions === 1 ? '' : 's'}` : '';
      const html =
        `<span style="color:#0F172A;font-weight:500">${t.neighbourhood}</span><br/>` +
        `<span style="color:${URG_COLOR[r.maxUrgency]};font-size:11px">` +
          `${r.byUrgency.critical > 0 ? r.byUrgency.critical + ' critical · ' : ''}` +
          `${r.total} ${r.total === 1 ? 'advisory' : 'advisories'}${opActions}` +
        `</span>` +
        (top ? `<br/><span style="color:#3F3F46;font-size:11px;display:block;max-width:260px;line-height:1.4">${top}</span>` : '');

      L.marker([t.lat, t.lng], { icon: advisoryIcon(r.maxUrgency, r.total), interactive: true, keyboard: false })
        .bindTooltip(html, { opacity: 1, sticky: true, offset: [10, 0] })
        .on('click', () => setSelected(selected?.ctuid === t.ctuid ? null : t))
        .addTo(advisoryLayerRef.current!);
    });
  }, [tracts, rollupByTract, layers.advisories, selected, setSelected]);

  /* ─── Social services points ─── */
  useEffect(() => {
    if (!servicesLayerRef.current) return;
    servicesLayerRef.current.clearLayers();
    if (!layers.services) return;
    SERVICE_POINTS.forEach(p => {
      const visual = SERVICE_VISUAL[p.kind];
      L.marker([p.lat, p.lng], { icon: servicePointIcon(p.kind) })
        .bindTooltip(`<span style="color:#0F172A;font-weight:500">${p.name}</span><br/><span style="color:#71717A;font-size:11px">${visual.label}</span>`, { opacity: 1 })
        .on('click', () => setActiveFacility({
          id: p.id,
          name: p.name,
          kind: p.kind,
          lat: p.lat,
          lng: p.lng,
        }))
        .addTo(servicesLayerRef.current!);
    });
  }, [layers.services, setActiveFacility]);

  /* ─── Load static pipeline layers once (hospitals, LTC, AQHI) ─── */
  useEffect(() => {
    let cancelled = false;
    const toPoints = (gj: any, meta: (p: any) => string): MapPoint[] =>
      (gj?.features ?? [])
        .filter((f: any) => f?.geometry?.coordinates?.length === 2)
        .map((f: any) => ({
          name: f.properties?.name ?? '',
          lng: f.geometry.coordinates[0],
          lat: f.geometry.coordinates[1],
          meta: meta(f.properties ?? {}),
        }));
    (async () => {
      try {
        const [h, l, full] = await Promise.all([
          fetch('/data/hospitals.geojson').then(r => r.json()),
          fetch('/data/ltc_homes.geojson').then(r => r.json()),
          fetch('/data/brampton_full.geojson').then(r => r.json()),
        ]);
        if (cancelled) return;
        setHospitals(toPoints(h, p => p.emergency_24_7 ? '24/7 emergency' : (p.type ?? 'Hospital')));
        setLtcHomes(toPoints(l, p => p.beds ? `${p.beds} beds` : 'Long-term care'));
        const m = new Map<string, AqhiCell>();
        (full?.features ?? []).forEach((f: any) => {
          const p = f.properties ?? {};
          if (p.aqhi != null) m.set(ctKey(p.CTUID), { aqhi: p.aqhi, band: p.aqhi_band ?? '—', pm25: p.pm25 ?? null });
        });
        setAqhiByCt(m);
      } catch {
        /* static layers are best-effort; map still works without them */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ─── Hospitals (ER anchors) ─── */
  useEffect(() => {
    if (!hospitalsLayerRef.current) return;
    hospitalsLayerRef.current.clearLayers();
    if (!layers.hospitals) return;
    hospitals.forEach(p => {
      L.marker([p.lat, p.lng], { icon: HOSPITAL_ICON })
        .bindTooltip(`<span style="color:#0F172A;font-weight:500">${p.name}</span><br/><span style="color:#B91C1C;font-size:11px">${p.meta}</span>`, { opacity: 1 })
        .on('click', () => setActiveFacility({ id: `hospital-${p.name}`, name: p.name, kind: 'clinic', lat: p.lat, lng: p.lng }))
        .addTo(hospitalsLayerRef.current!);
    });
  }, [layers.hospitals, hospitals, setActiveFacility]);

  /* ─── Long-term care homes ─── */
  useEffect(() => {
    if (!ltcLayerRef.current) return;
    ltcLayerRef.current.clearLayers();
    if (!layers.ltc) return;
    ltcHomes.forEach(p => {
      L.marker([p.lat, p.lng], { icon: LTC_ICON })
        .bindTooltip(`<span style="color:#0F172A;font-weight:500">${p.name}</span><br/><span style="color:#7C3AED;font-size:11px">${p.meta}</span>`, { opacity: 1 })
        .on('click', () => setActiveFacility({ id: `ltc-${p.name}`, name: p.name, kind: 'community-centre', lat: p.lat, lng: p.lng }))
        .addTo(ltcLayerRef.current!);
    });
  }, [layers.ltc, ltcHomes, setActiveFacility]);

  /* ─── AQHI choropleth tint (toggleable overlay above the risk ramp) ─── */
  useEffect(() => {
    if (!aqhiLayerRef.current) return;
    aqhiLayerRef.current.clearLayers();
    if (!layers.aqhi || tracts.length === 0) return;

    const geojson = {
      type: 'FeatureCollection' as const,
      features: tracts.map(t => ({
        type: 'Feature' as const,
        geometry: t.geometry as unknown as GeoJSON.Geometry,
        properties: { ctuid: t.ctuid },
      })),
    };

    const layer = L.geoJSON(geojson, {
      style: (feat) => {
        const a = aqhiByCt.get(ctKey(feat?.properties?.ctuid));
        const color = aqhiColor(a?.band);
        return { fillColor: color, fillOpacity: a ? 0.5 : 0, color, weight: 0.5 };
      },
      onEachFeature: (feat, lyr) => {
        const a = aqhiByCt.get(ctKey(feat.properties?.ctuid));
        if (!a) return;
        lyr.bindTooltip(
          `<span style="color:#0F172A;font-weight:500">AQHI ${a.aqhi} · ${a.band}</span>` +
          (a.pm25 != null ? `<br/><span style="color:#71717A;font-size:11px">PM2.5 ${a.pm25} µg/m³</span>` : ''),
          { sticky: true, opacity: 1 }
        );
      },
    });
    layer.addTo(aqhiLayerRef.current);
    layer.bringToFront();
  }, [layers.aqhi, tracts, aqhiByCt]);

  const activeLayerCount = Object.values(layers).filter(Boolean).length;
  const allPrimaryOn = layers.shelters && layers.outages && layers.advisories;

  return (
    <div className="flex-1 relative overflow-hidden bg-canvas">
      <div ref={containerRef} className="w-full h-full" />

      {/* Operational layers badge — top-center of map */}
      <div className="absolute top-3 left-1/2 z-[700] pointer-events-none" style={{ transform: 'translateX(-50%)' }}>
        <div className="flex items-center gap-1.5 bg-surface border border-hairline px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
          </svg>
          <span className="text-[11px] uppercase tracking-[0.12em] text-ink-3">
            {allPrimaryOn ? 'All operational layers' : `${activeLayerCount} layer${activeLayerCount !== 1 ? 's' : ''} active`}
          </span>
        </div>
      </div>

    </div>
  );
}
