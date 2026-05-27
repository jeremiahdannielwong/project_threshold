import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { useApp } from '../context';
import { rampColor, scoreFor, rampLabel } from '../utils';
import type { AdvisoryUrgency } from './../advisories';
import { TRANSIT_CORRIDORS, HYDRO_CORRIDORS, SERVICE_POINTS, SERVICE_VISUAL } from '../staticLayers';

function servicePointIcon(kind: keyof typeof SERVICE_VISUAL): L.DivIcon {
  const visual = SERVICE_VISUAL[kind];
  return L.divIcon({
    html: `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;background:rgba(250,250,247,0.95);border:0.5px solid #3F3F46;color:#3F3F46;font-family:Inter,sans-serif;font-size:9px;font-weight:500;line-height:1;">${visual.glyph}</div>`,
    className: '',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
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

const shelterHtml = `<div style="width:14px;height:14px;display:flex;align-items:center;justify-content:center;background:#FFFFFF;border:0.5px solid #0F172A;">
  <svg xmlns="http://www.w3.org/2000/svg" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#0F172A" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
</div>`;

const SHELTER_ICON = L.divIcon({
  html: shelterHtml,
  className: '',
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

const OUTAGE_ICON = L.divIcon({
  html: '<div style="width:6px;height:6px;border-radius:50%;background:#9A3412;border:0.5px solid #7C2D12;"></div>',
  className: '',
  iconSize: [6, 6],
  iconAnchor: [3, 3],
});

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
  const transitLayerRef = useRef<L.LayerGroup | null>(null);
  const hydroLayerRef   = useRef<L.LayerGroup | null>(null);
  const servicesLayerRef = useRef<L.LayerGroup | null>(null);

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
    markersRef.current = L.layerGroup().addTo(map);
    advisoryLayerRef.current = L.layerGroup().addTo(map);
    transitLayerRef.current  = L.layerGroup().addTo(map);
    hydroLayerRef.current    = L.layerGroup().addTo(map);
    servicesLayerRef.current = L.layerGroup().addTo(map);
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

  /* ─── Transit corridors ─── */
  useEffect(() => {
    if (!transitLayerRef.current) return;
    transitLayerRef.current.clearLayers();
    if (!layers.transit) return;
    TRANSIT_CORRIDORS.forEach(c => {
      L.polyline(c.path, {
        color: '#3F3F46',
        weight: 1.8,
        opacity: 0.65,
        dashArray: '4 4',
        lineCap: 'round',
      })
        .bindTooltip(c.name, { sticky: true, opacity: 1 })
        .addTo(transitLayerRef.current!);
    });
  }, [layers.transit]);

  /* ─── Hydro transmission ─── */
  useEffect(() => {
    if (!hydroLayerRef.current) return;
    hydroLayerRef.current.clearLayers();
    if (!layers.hydro) return;
    HYDRO_CORRIDORS.forEach(c => {
      L.polyline(c.path, {
        color: '#854D0E',
        weight: 1.4,
        opacity: 0.55,
        lineCap: 'square',
      })
        .bindTooltip(c.name, { sticky: true, opacity: 1 })
        .addTo(hydroLayerRef.current!);
    });
  }, [layers.hydro]);

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

      {/* Vulnerability legend — bottom-left */}
      <div className="absolute bottom-8 left-4 z-[1000] flex flex-col gap-1 pointer-events-none">
        <div className="text-[10px] uppercase tracking-[0.14em] text-ink-3">Vulnerability</div>
        <div className="flex h-[5px]">
          {['#52A873','#8DB84A','#C8A83C','#C07840','#BF4040','#8C2020'].map(c => (
            <span key={c} className="w-6" style={{ background: c }} />
          ))}
        </div>
        <div className="flex w-36 justify-between text-[10px] tabular text-ink-4">
          <span>Baseline</span><span>Critical</span>
        </div>
      </div>
    </div>
  );
}
