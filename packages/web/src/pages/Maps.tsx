// Maps (spec §8.7): choropleth / graduated points of an indicator against
// targets. Org unit geometry comes from Dexie — the map works fully offline;
// values use the same cached-analytics path as dashboards.
import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RELATIVE_PERIODS,
  type Indicator,
  type RelativePeriod,
  type Target,
} from '@dodo/shared';
import { Field, Input, Select } from '../components';
import { getDb, hasDb } from '../db/db';
import { MapView, type MapDatum } from '../map/MapView';
import { useWidgetData } from '../dashboards/useWidgetData';
import { Page } from './Page';

export function Maps() {
  const indicators = useLiveQuery(
    () =>
      hasDb() ? (getDb().indicators.toArray() as unknown as Promise<Indicator[]>) : [],
    [],
  );
  const dataElements = useLiveQuery(
    () => (hasDb() ? getDb().dataElements.toArray() : []),
    [],
  );
  const geoOrgUnits = useLiveQuery(
    () =>
      hasDb()
        ? getDb()
            .orgUnits.filter((o) => o.geometry !== null)
            .toArray()
        : [],
    [],
  );
  const targets = useLiveQuery(
    () => (hasDb() ? (getDb().targets.toArray() as unknown as Promise<Target[]>) : []),
    [],
  );

  const [dxId, setDxId] = useState('');
  const [relativePeriod, setRelativePeriod] = useState<RelativePeriod>('THIS_YEAR');
  const [basemapUrl, setBasemapUrl] = useState(
    () => localStorage.getItem('dodo:basemapUrl') ?? '',
  );

  const ouIds = useMemo(() => (geoOrgUnits ?? []).map((o) => o.id), [geoOrgUnits]);
  const query = useMemo(
    () =>
      dxId && ouIds.length > 0
        ? {
            dx: [dxId],
            ouIds,
            ouMode: 'subtree' as const,
            relativePeriod,
            peTotal: true,
          }
        : null,
    [dxId, ouIds, relativePeriod],
  );
  const widget = useWidgetData(query, {});

  const data = useMemo(() => {
    const map = new Map<string, MapDatum>();
    if (!widget.result) return map;
    for (const ouId of ouIds) {
      const row = widget.result.rows.find(
        (r) => r.ou === ouId && (r.pe === 'TOTAL' || widget.periods.length === 1),
      );
      const target =
        (targets ?? []).find(
          (t) => t.indicatorId === dxId && t.orgUnitId === ouId && t.kind === 'target',
        )?.value ?? null;
      map.set(ouId, { orgUnitId: ouId, value: row?.value ?? null, target });
    }
    return map;
  }, [widget.result, widget.periods, ouIds, targets, dxId]);

  const dxOptions = [
    ...(indicators ?? []).map((i) => ({ id: i.id, name: `◆ ${i.name}` })),
    ...(dataElements ?? []).map((d) => ({
      id: d.id as string,
      name: String(d.name),
    })),
  ];

  return (
    <Page number="04" title="Maps">
      <div className="mb-3 flex max-w-4xl items-end gap-3">
        <Field label="Indicator / data element" className="w-72">
          <Select value={dxId} onChange={(e) => setDxId(e.target.value)}>
            <option value="">choose…</option>
            {dxOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Period">
          <Select
            value={relativePeriod}
            onChange={(e) => setRelativePeriod(e.target.value as RelativePeriod)}
          >
            {RELATIVE_PERIODS.map((p) => (
              <option key={p} value={p}>
                {p.toLowerCase().replaceAll('_', ' ')}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="PMTiles basemap URL (optional)" className="grow">
          <Input
            placeholder="https://…/region.pmtiles"
            value={basemapUrl}
            onChange={(e) => {
              setBasemapUrl(e.target.value);
              localStorage.setItem('dodo:basemapUrl', e.target.value);
            }}
          />
        </Field>
      </div>

      {(geoOrgUnits ?? []).length === 0 ? (
        <p className="text-sm text-ink-muted" data-testid="maps-empty">
          No org units with geometry yet — draw or import boundaries and points under
          Configure → Org units.
        </p>
      ) : (
        <div className="max-w-4xl">
          {widget.asOf ? (
            <p className="small-caps mb-1 text-ink-muted" data-testid="map-stamp">
              ◌ data as of {new Date(widget.asOf).toLocaleString()}
            </p>
          ) : widget.result ? (
            <p className="small-caps mb-1 text-ink-muted" data-testid="map-live">
              ● live data
            </p>
          ) : null}
          <MapView data={data} />
        </div>
      )}
    </Page>
  );
}
