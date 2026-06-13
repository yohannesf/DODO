// Dashboard widgets (spec §8.6): each widget = a saved analytics query.
import { useEffect, useMemo, useRef } from 'react';
import * as echarts from 'echarts/core';
import { useLiveQuery } from 'dexie-react-hooks';
import type { DashboardItem, Target } from '@dodo/shared';
import { cx } from '../components';
import { getDb, hasDb } from '../db/db';
import { MapView, type MapDatum, achievementColor } from '../map/MapView';
import { useWidgetData, type GlobalFilters, type WidgetQuery } from './useWidgetData';

export interface WidgetConfig extends Partial<WidgetQuery> {
  title?: string;
  chartKind?: 'bar' | 'line';
  text?: string;
}

const PALETTE = ['#1F3FBF', '#9A6B00', '#2E6E3E', '#B3261E', '#6F6A5E'];

function Stamp({ asOf }: { asOf: string | null }) {
  if (!asOf) return null;
  return (
    <p className="small-caps text-ink-muted" data-testid="widget-stamp">
      ◌ data as of {new Date(asOf).toLocaleString()}
    </p>
  );
}

function widgetQuery(config: WidgetConfig): WidgetQuery | null {
  if (!config.dx?.length || !config.ouIds?.length || !config.relativePeriod) {
    return null;
  }
  return {
    dx: config.dx,
    ouIds: config.ouIds,
    ouMode: config.ouMode ?? 'subtree',
    relativePeriod: config.relativePeriod,
    peTotal: true,
  };
}

// real inline sparkline (§6): 1px --primary line + single end dot
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 104;
  const h = 26;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * (w - 2 * pad);
    const y = h - pad - ((v - min) / span) * (h - 2 * pad);
    return [x, y] as const;
  });
  const d = pts
    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`)
    .join(' ');
  const last = pts[pts.length - 1]!;
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden
      className="mt-1.5 block overflow-visible"
    >
      <path d={d} fill="none" stroke="var(--primary)" strokeWidth="1" />
      <circle cx={last[0]} cy={last[1]} r="2" fill="var(--primary)" />
    </svg>
  );
}

export function KpiWidget({
  config,
  filters,
}: {
  config: WidgetConfig;
  filters: GlobalFilters;
}) {
  const { result, asOf, error } = useWidgetData(widgetQuery(config), filters);
  const targets = useLiveQuery(
    () => (hasDb() ? (getDb().targets.toArray() as unknown as Promise<Target[]>) : []),
    [],
  );
  if (error) return <p className="text-[12px] text-ink-muted">▲ {error}</p>;
  const dx = config.dx?.[0];
  const ou = filters.ouId ?? config.ouIds?.[0];
  const total = result?.rows.find((r) => r.dx === dx && r.ou === ou && r.pe === 'TOTAL');
  const series = (result?.rows ?? []).filter(
    (r) => r.dx === dx && r.ou === ou && r.pe !== 'TOTAL',
  );
  const target =
    (targets ?? []).find(
      (t) => t.indicatorId === dx && t.orgUnitId === ou && t.kind === 'target',
    )?.value ?? null;
  const value = total?.value ?? null;
  const color = value !== null ? achievementColor(value, target) : 'var(--ink-faint)';
  const pct = value !== null && target ? Math.round((value / target) * 100) : null;

  return (
    <div>
      <p className="type-display tnum" style={{ color }}>
        {value === null ? '—' : value.toLocaleString('en-US')}
      </p>
      {pct !== null ? (
        <span
          className="type-label mt-1 inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5"
          style={{
            color,
            backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
          }}
        >
          {pct >= 100 ? '▲' : '▼'} {pct}% of target
        </span>
      ) : (
        <span className="type-label text-ink-faint">no target</span>
      )}
      <Sparkline values={series.map((s) => s.value ?? 0)} />
      <Stamp asOf={asOf} />
    </div>
  );
}

export function ChartWidget({
  config,
  filters,
}: {
  config: WidgetConfig;
  filters: GlobalFilters;
}) {
  const { result, periods, asOf, error } = useWidgetData(widgetQuery(config), filters);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current || !result) return;
    const chart = echarts.init(ref.current);
    const keys = [
      ...new Set(
        result.rows.filter((r) => r.pe !== 'TOTAL').map((r) => `${r.dx}|${r.ou}`),
      ),
    ];
    chart.setOption({
      color: PALETTE,
      textStyle: { fontFamily: 'IBM Plex Sans' },
      tooltip: { trigger: 'axis' },
      legend:
        keys.length > 1
          ? { type: 'scroll', top: 0, left: 0, right: 0, icon: 'rect', itemHeight: 8 }
          : undefined,
      grid: { left: 40, right: 8, top: keys.length > 1 ? 32 : 12, bottom: 20 },
      xAxis: { type: 'category', data: periods, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#E3DFD4' } } },
      series: keys.map((key) => {
        const [dx, ou] = key.split('|');
        return {
          name: result.meta.names[dx!] ?? dx,
          type: config.chartKind ?? 'bar',
          data: periods.map(
            (pe) =>
              result.rows.find((r) => r.dx === dx && r.ou === ou && r.pe === pe)?.value ??
              null,
          ),
        };
      }),
    });
    const obs = new ResizeObserver(() => chart.resize());
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      chart.dispose();
    };
  }, [result, periods, config.chartKind]);

  if (error) return <p className="text-[12px] text-ink-muted">▲ {error}</p>;
  return (
    <div className="flex h-full flex-col">
      <div ref={ref} className="min-h-0 grow" />
      <Stamp asOf={asOf} />
    </div>
  );
}

export function TableWidget({
  config,
  filters,
}: {
  config: WidgetConfig;
  filters: GlobalFilters;
}) {
  const { result, periods, asOf, error } = useWidgetData(widgetQuery(config), filters);
  if (error) return <p className="text-[12px] text-ink-muted">▲ {error}</p>;
  if (!result) return null;
  const keys = [...new Set(result.rows.map((r) => `${r.dx}|${r.ou}`))];
  const cols = [...periods, 'TOTAL'];
  return (
    <div className="h-full overflow-auto">
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="small-caps border-b border-ink pb-0.5 text-left font-medium text-ink-muted">
              data
            </th>
            {cols.map((pe) => (
              <th
                key={pe}
                className="small-caps border-b border-ink pb-0.5 text-right font-medium text-ink-muted"
              >
                {pe}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const [dx, ou] = key.split('|');
            return (
              <tr key={key} className="border-b border-hairline">
                <td className="py-0.5 pr-2">
                  {result.meta.names[dx!] ?? dx}
                  {keys.length > 1 ? (
                    <span className="text-ink-muted"> · {result.meta.names[ou!]}</span>
                  ) : null}
                </td>
                {cols.map((pe) => (
                  <td key={pe} className="tnum py-0.5 text-right">
                    {result.rows.find((r) => r.dx === dx && r.ou === ou && r.pe === pe)
                      ?.value ?? '—'}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      <Stamp asOf={asOf} />
    </div>
  );
}

export function TextWidget({ config }: { config: WidgetConfig }) {
  return (
    <p className="text-sm leading-relaxed whitespace-pre-wrap">{config.text ?? ''}</p>
  );
}

export function MapWidget({
  config,
  filters,
}: {
  config: WidgetConfig;
  filters: GlobalFilters;
}) {
  const dx = config.dx?.[0];
  // a coverage map colours EVERY geo org unit by its own subtree value, so it
  // queries all of them — not the widget's configured root (which would leave
  // every site grey). Mirrors the standalone Maps page.
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
  const ouIds = useMemo(() => (geoOrgUnits ?? []).map((o) => o.id), [geoOrgUnits]);
  const query = useMemo<WidgetQuery | null>(
    () =>
      dx && ouIds.length > 0
        ? {
            dx: [dx],
            ouIds,
            ouMode: 'subtree',
            relativePeriod: config.relativePeriod ?? 'THIS_MONTH',
            peTotal: true,
          }
        : null,
    [dx, ouIds, config.relativePeriod],
  );
  const { result, periods, asOf, error } = useWidgetData(query, filters);
  if (error) return <p className="text-[12px] text-ink-muted">▲ {error}</p>;

  const data = new Map<string, MapDatum>();
  for (const row of result?.rows ?? []) {
    if (row.dx !== dx) continue;
    if (!(row.pe === 'TOTAL' || periods.length === 1)) continue;
    const target =
      (targets ?? []).find(
        (t) => t.indicatorId === dx && t.orgUnitId === row.ou && t.kind === 'target',
      )?.value ?? null;
    data.set(row.ou, { orgUnitId: row.ou, value: row.value, target });
  }
  return (
    <div className="h-full">
      <MapView data={data} heightClass="h-full min-h-40" />
      <Stamp asOf={asOf} />
    </div>
  );
}

export function Widget({
  item,
  filters,
}: {
  item: DashboardItem;
  filters: GlobalFilters;
}) {
  const config = item.config as WidgetConfig;
  switch (item.kind) {
    case 'kpi':
      return <KpiWidget config={config} filters={filters} />;
    case 'chart':
      return <ChartWidget config={config} filters={filters} />;
    case 'table':
      return <TableWidget config={config} filters={filters} />;
    case 'text':
      return <TextWidget config={config} />;
    case 'map':
      return <MapWidget config={config} filters={filters} />;
  }
}

export function widgetTitle(item: DashboardItem): string {
  const config = item.config as WidgetConfig;
  return config.title ?? item.kind;
}

export const widgetBorder = cx('border border-hairline bg-surface');
