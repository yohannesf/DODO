// MapLibre map (spec §8.7, design language §8): org unit geometry from the
// local Dexie mirror (fully offline). Polygons are the faint structural
// backdrop; indicator points carry the vs-target colour ramp. A self-hosted
// PMTiles basemap is optional context (download-once cache) — the map is
// self-sufficient with zero external tiles.
import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Protocol, PMTiles, FileSource } from 'pmtiles';
import { useLiveQuery } from 'dexie-react-hooks';
import type { OrgUnit } from '@dodo/shared';
import { Button } from '../components';
import { getDb, hasDb } from '../db/db';

const BASEMAP_KEY = '__basemap';
const BASEMAP_URL_KEY = 'dodo:basemapUrl';

// vs-target ramp (design language §8): achievement ratio → semantic colors.
// Concrete hexes (MapLibre paint can't read CSS vars); match §2 semantics.
export function achievementColor(value: number, target: number | null): string {
  if (target === null || target === 0) return '#79868F'; // ink-faint: no target
  const ratio = value / target;
  if (ratio >= 1) return '#2E7D32'; // ok
  if (ratio >= 0.7) return '#C77D11'; // warn
  return '#C0392B'; // danger
}

// resolve a CSS custom property to its concrete value (for map paint, which
// cannot use var()); adapts to light/dark at map-build time.
function mapVar(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  );
}

export interface MapDatum {
  orgUnitId: string;
  value: number | null;
  target: number | null;
}

let protocolRegistered = false;

type FeatureCollection = { features: Array<{ geometry: unknown }> };

/** Fit the map to a feature collection's bounds (spec §8.7: scoped bbox). */
function fitTo(map: maplibregl.Map, fc: FeatureCollection): void {
  if (fc.features.length === 0) return;
  const bounds = new maplibregl.LngLatBounds();
  const extend = (coords: unknown): void => {
    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === 'number' &&
      typeof coords[1] === 'number'
    ) {
      bounds.extend([coords[0], coords[1]] as [number, number]);
    } else if (Array.isArray(coords)) {
      for (const c of coords) extend(c);
    }
  };
  for (const f of fc.features) {
    extend((f.geometry as { coordinates: unknown } | null)?.coordinates);
  }
  if (!bounds.isEmpty()) {
    // padding must scale to the canvas: a fixed 48px eats a small dashboard
    // widget (96px of padding on a ~140px-tall canvas zooms everything out to
    // a dot). Cap at ~10% of the smaller dimension.
    const c = map.getCanvas();
    const pad = Math.max(6, Math.min(40, Math.min(c.clientWidth, c.clientHeight) * 0.1));
    map.fitBounds(bounds, { padding: pad, maxZoom: 10, duration: 0 });
  }
}

export function MapView({
  data,
  heightClass = 'h-[480px]',
}: {
  /** value+target per org unit; org units with geometry come from Dexie */
  data: Map<string, MapDatum>;
  heightClass?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [basemapState, setBasemapState] = useState<'none' | 'remote' | 'cached'>('none');
  const basemapUrl = localStorage.getItem(BASEMAP_URL_KEY) ?? '';

  const orgUnits = useLiveQuery(
    () =>
      hasDb()
        ? getDb()
            .orgUnits.filter((o) => o.geometry !== null)
            .toArray()
        : [],
    [],
  );

  const geojson = useMemo(() => {
    const features = (orgUnits ?? []).map((o: OrgUnit) => {
      const datum = data.get(o.id);
      return {
        type: 'Feature' as const,
        geometry: o.geometry,
        properties: {
          id: o.id,
          name: o.name,
          value: datum?.value ?? null,
          color:
            datum?.value != null
              ? achievementColor(datum.value, datum.target)
              : '#79868F', // ink-faint: no data
        },
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [orgUnits, data]);

  // latest geojson available to the (basemap-scoped) create-once effect
  const geojsonRef = useRef(geojson);
  geojsonRef.current = geojson;
  const loadedRef = useRef(false);
  const userInteractedRef = useRef(false);

  // Create the map once per basemap; data updates flow through setData below.
  // (Recreating the map on every data change races MapLibre's async load and
  // leaves a blank canvas.)
  useEffect(() => {
    if (!container.current) return;
    if (!protocolRegistered) {
      maplibregl.addProtocol('pmtiles', new Protocol().tile);
      protocolRegistered = true;
    }

    const map = new maplibregl.Map({
      container: container.current,
      style: {
        version: 8,
        sources: {},
        layers: [
          {
            id: 'bg',
            type: 'background',
            paint: { 'background-color': mapVar('--panel', '#f8fafb') },
          },
        ],
      },
      center: [20, 5],
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current = map;
    // stop auto-fitting once the user pans/zooms by hand (their gestures carry
    // an originalEvent; programmatic camera moves do not)
    const markInteracted = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent) userInteractedRef.current = true;
    };
    map.on('dragstart', markInteracted);
    map.on('zoomstart', markInteracted);
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }));
    // protomaps basemaps are ODbL — attribution required (ADR 001)
    map.addControl(
      new maplibregl.AttributionControl({
        compact: false,
        customAttribution: basemapUrl
          ? '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> (ODbL), <a href="https://protomaps.com">Protomaps</a>'
          : 'DODO',
      }),
    );

    map.on('load', () => {
      void (async () => {
        // basemap: cached blob first (offline), remote second
        if (basemapUrl) {
          try {
            const cached = hasDb() ? await getDb().widgetCache.get(BASEMAP_KEY) : null;
            if (cached?.data instanceof Blob) {
              const file = new File([cached.data], 'basemap.pmtiles');
              new Protocol().add(new PMTiles(new FileSource(file)));
              setBasemapState('cached');
            } else {
              setBasemapState('remote');
            }
            map.addSource('basemap', {
              type: 'vector',
              url: `pmtiles://${basemapUrl}`,
            });
            map.addLayer(
              {
                id: 'basemap-land',
                type: 'fill',
                source: 'basemap',
                'source-layer': 'earth',
                paint: { 'fill-color': mapVar('--panel', '#f8fafb') },
              },
              'bg',
            );
          } catch {
            /* basemap optional — data layers still render */
          }
        }

        map.addSource('orgunits', { type: 'geojson', data: geojsonRef.current });
        // polygons are the geographic backdrop (§8): faint primary fill, ink
        // hairline outline — not value-coloured. The data lives on the points.
        map.addLayer({
          id: 'ou-fill',
          type: 'fill',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'fill-color': mapVar('--primary', '#1c4e80'),
            'fill-opacity': 0.08,
          },
        });
        map.addLayer({
          id: 'ou-line',
          type: 'line',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: {
            'line-color': mapVar('--border-strong', '#94a2ad'),
            'line-width': 1,
          },
        });
        // indicator points carry the vs-target ramp (green/ochre/red,
        // ink-faint when no target/data)
        map.addLayer({
          id: 'ou-points',
          type: 'circle',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 6,
            'circle-stroke-color': mapVar('--ink', '#141a20'),
            'circle-stroke-width': 1,
          },
        });

        loadedRef.current = true;
        // resize first: the container may have laid out after map creation, so
        // fitBounds needs the true canvas size to compute the right zoom
        map.resize();
        fitTo(map, geojsonRef.current);

        const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false });
        for (const layer of ['ou-points', 'ou-fill']) {
          map.on('mousemove', layer, (e) => {
            const f = e.features?.[0];
            if (!f) return;
            const v = f.properties?.value;
            popup
              .setLngLat(e.lngLat)
              .setHTML(
                `<strong>${String(f.properties?.name)}</strong><br/>${
                  v === null || v === 'null' || v === undefined ? 'no data' : String(v)
                }`,
              )
              .addTo(map);
          });
          map.on('mouseleave', layer, () => popup.remove());
        }
      })();
    });

    // MapLibre does not auto-resize — keep the canvas matched to its container.
    // Re-fit after a resize (e.g. a dashboard grid cell laying out, which the
    // initial fitBounds may have missed at zero size) until the user takes over.
    const ro = new ResizeObserver(() => {
      map.resize();
      if (loadedRef.current && !userInteractedRef.current) {
        fitTo(map, geojsonRef.current);
      }
    });
    ro.observe(container.current);

    return () => {
      ro.disconnect();
      loadedRef.current = false;
      map.remove();
      mapRef.current = null;
    };
  }, [basemapUrl]);

  // Push new colours/geometry into the existing map without recreating it.
  // If the data arrives before the style finishes loading, apply on load.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = (): boolean => {
      const src = map.getSource('orgunits') as maplibregl.GeoJSONSource | undefined;
      if (!src) return false;
      src.setData(geojson as never);
      map.resize();
      fitTo(map, geojson);
      return true;
    };
    if (!apply()) map.once('load', apply);
  }, [geojson]);

  async function downloadBasemap() {
    if (!basemapUrl) return;
    const res = await fetch(basemapUrl);
    if (!res.ok) return;
    const blob = await res.blob();
    await getDb().widgetCache.put({
      key: BASEMAP_KEY,
      data: blob,
      fetchedAt: new Date().toISOString(),
    });
    setBasemapState('cached');
  }

  return (
    <div className="relative">
      <div
        ref={container}
        data-testid="map-canvas"
        className={`${heightClass} w-full rounded-sm border border-border`}
      />
      <div className="absolute top-2 left-2 rounded-sm border border-border bg-panel px-2 py-1.5 text-[11px]">
        <p className="type-label mb-1 text-ink-muted">vs target</p>
        <p>
          <span className="text-ok">●</span> ≥ 100%{' '}
          <span className="ml-2 text-warn">●</span> 70–99%{' '}
          <span className="ml-2 text-danger">●</span> &lt; 70%{' '}
          <span className="ml-2 text-ink-faint">●</span> no target
        </p>
      </div>
      {basemapUrl ? (
        <div className="absolute right-2 bottom-8">
          {basemapState !== 'cached' ? (
            <Button size="sm" onClick={() => void downloadBasemap()}>
              Download basemap for offline
            </Button>
          ) : (
            <span className="small-caps border border-hairline bg-surface px-2 py-1 text-ink-muted">
              ● basemap cached
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}
