// MapLibre map (spec §8.7): org unit boundaries/points from the local Dexie
// mirror (fully offline), choropleth coloured against target thresholds,
// optional self-hosted PMTiles basemap with a download-once offline cache.
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

// thresholds vs target (spec §8.7): achievement ratio → semantic colors
export function achievementColor(value: number, target: number | null): string {
  if (target === null || target === 0) return '#1F3FBF'; // cobalt: no target
  const ratio = value / target;
  if (ratio >= 1) return '#2E6E3E'; // on-track green
  if (ratio >= 0.7) return '#9A6B00'; // ochre
  return '#B3261E'; // off-track red
}

export interface MapDatum {
  orgUnitId: string;
  value: number | null;
  target: number | null;
}

let protocolRegistered = false;

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
              : '#6F6A5E',
        },
      };
    });
    return { type: 'FeatureCollection' as const, features };
  }, [orgUnits, data]);

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
          { id: 'bg', type: 'background', paint: { 'background-color': '#FAF8F4' } },
        ],
      },
      center: [20, 5],
      zoom: 2,
      attributionControl: false,
    });
    mapRef.current = map;
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
                paint: { 'fill-color': '#F1EDE4' },
              },
              'bg',
            );
          } catch {
            /* basemap optional — data layers still render */
          }
        }

        map.addSource('orgunits', { type: 'geojson', data: geojson });
        map.addLayer({
          id: 'ou-fill',
          type: 'fill',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'fill-color': ['get', 'color'], 'fill-opacity': 0.55 },
        });
        map.addLayer({
          id: 'ou-line',
          type: 'line',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Polygon'],
          paint: { 'line-color': '#1C1A15', 'line-width': 0.8 },
        });
        map.addLayer({
          id: 'ou-points',
          type: 'circle',
          source: 'orgunits',
          filter: ['==', ['geometry-type'], 'Point'],
          paint: {
            'circle-color': ['get', 'color'],
            'circle-radius': 7,
            'circle-stroke-color': '#1C1A15',
            'circle-stroke-width': 1,
          },
        });

        // fit to the scoped data (spec §8.7: scoped bbox)
        if (geojson.features.length > 0) {
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
          for (const f of geojson.features) {
            extend((f.geometry as { coordinates: unknown }).coordinates);
          }
          if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 48, maxZoom: 10 });
        }

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

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rebuild on data identity
  }, [geojson, basemapUrl]);

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
        className={`${heightClass} w-full border border-hairline`}
      />
      <div className="absolute top-2 left-2 border border-hairline bg-surface px-2 py-1.5 text-[11px]">
        <p className="small-caps mb-1 text-ink-muted">vs target</p>
        <p>
          <span className="text-ontrack">●</span> ≥ 100%{' '}
          <span className="ml-2 text-ochre">●</span> 70–99%{' '}
          <span className="ml-2 text-offtrack">●</span> &lt; 70%{' '}
          <span className="ml-2 text-cobalt">●</span> no target
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
