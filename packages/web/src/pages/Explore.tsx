// Explore (spec §8.2): ad-hoc pivot + chart over the analytics API.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  Button,
  Checkbox,
  Field,
  FieldGroup,
  Input,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../components';
import { useEntityList } from '../api/metadata';
import { fetchAnalytics, monthRange, type AnalyticsResult } from '../api/analytics';
import { ErrorNote } from './configure/common';
import { Page } from './Page';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

const PALETTE = ['#1F3FBF', '#9A6B00', '#2E6E3E', '#B3261E', '#6F6A5E'];

function Chart({
  result,
  periods,
  kind,
}: {
  result: AnalyticsResult;
  periods: string[];
  kind: 'bar' | 'line';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const seriesKeys = [...new Set(result.rows.map((r) => `${r.dx}|${r.ou}`))];
    chart.setOption({
      color: PALETTE,
      textStyle: { fontFamily: 'IBM Plex Sans' },
      tooltip: { trigger: 'axis' },
      legend: { top: 0, left: 0, icon: 'rect', itemHeight: 8, itemWidth: 8 },
      grid: { left: 48, right: 12, top: 36, bottom: 24 },
      xAxis: { type: 'category', data: periods, axisTick: { show: false } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#E3DFD4' } } },
      series: seriesKeys.map((key) => {
        const [dx, ou] = key.split('|');
        return {
          name: `${result.meta.names[dx!] ?? dx} — ${result.meta.names[ou!] ?? ou}`,
          type: kind,
          data: periods.map(
            (pe) =>
              result.rows.find((r) => r.dx === dx && r.ou === ou && r.pe === pe)?.value ??
              null,
          ),
        };
      }),
    });
    const onResize = () => chart.resize();
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      chart.dispose();
    };
  }, [result, periods, kind]);
  return <div ref={ref} className="h-72 w-full" data-testid="explore-chart" />;
}

export function Explore() {
  const dataElements = useEntityList('dataElements');
  const indicators = useEntityList('indicators');
  const orgUnits = useEntityList('orgUnits');

  const [dx, setDx] = useState<string[]>([]);
  const [ou, setOu] = useState<string[]>([]);
  const [subtree, setSubtree] = useState(true);
  const [from, setFrom] = useState('2026-01');
  const [to, setTo] = useState('2026-06');
  const [chartKind, setChartKind] = useState<'bar' | 'line'>('bar');
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const periods = useMemo(() => monthRange(from, to), [from, to]);
  const dxOptions = useMemo(
    () => [
      ...(indicators.data ?? []).map((i) => ({ id: i.id, name: `◆ ${i.name}` })),
      ...(dataElements.data ?? []).map((d) => ({ id: d.id, name: d.name })),
    ],
    [indicators.data, dataElements.data],
  );

  const toggle = (list: string[], setter: (v: string[]) => void, id: string) =>
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      setResult(
        await fetchAnalytics({
          dx,
          ou,
          pe: periods,
          ouMode: subtree ? 'subtree' : 'selected',
          peTotal: true,
        }),
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const cols = [...periods, 'TOTAL'];

  return (
    <Page number="05" title="Explore">
      <div className="grid max-w-5xl grid-cols-[260px_1fr] gap-8">
        <aside className="space-y-4 text-sm">
          <FieldGroup label={`data (${dx.length})`}>
            <div className="max-h-44 space-y-0.5 overflow-y-auto border border-hairline bg-surface p-2">
              {dxOptions.map((o) => (
                <Checkbox
                  key={o.id}
                  label={o.name}
                  checked={dx.includes(o.id)}
                  onChange={() => toggle(dx, setDx, o.id)}
                  className="block"
                />
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label={`org units (${ou.length})`}>
            <div className="max-h-44 space-y-0.5 overflow-y-auto border border-hairline bg-surface p-2">
              {orgUnits.data?.map((o) => (
                <Checkbox
                  key={o.id}
                  label={`${' '.repeat((o.level - 1) * 2)}${o.name}`}
                  checked={ou.includes(o.id)}
                  onChange={() => toggle(ou, setOu, o.id)}
                  className="block whitespace-pre"
                />
              ))}
            </div>
            <Checkbox
              label="Include subtrees"
              checked={subtree}
              onChange={(e) => setSubtree(e.target.checked)}
              className="mt-1"
            />
          </FieldGroup>
          <div className="grid grid-cols-2 gap-2">
            <Field label="From">
              <Input
                type="month"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </Field>
            <Field label="To">
              <Input type="month" value={to} onChange={(e) => setTo(e.target.value)} />
            </Field>
          </div>
          <Field label="Chart">
            <Select
              value={chartKind}
              onChange={(e) => setChartKind(e.target.value as 'bar' | 'line')}
            >
              <option value="bar">bar</option>
              <option value="line">line</option>
            </Select>
          </Field>
          <Button
            variant="primary"
            className="w-full justify-center"
            onClick={() => void run()}
            disabled={busy || dx.length === 0 || ou.length === 0 || periods.length === 0}
          >
            Run query
          </Button>
          <ErrorNote error={error} />
        </aside>

        <div>
          {result ? (
            <>
              <Chart result={result} periods={periods} kind={chartKind} />
              <div className="mt-4 overflow-x-auto">
                <Table data-testid="explore-pivot">
                  <THead>
                    <Tr>
                      <Th>Data</Th>
                      <Th>Org unit</Th>
                      {cols.map((pe) => (
                        <Th key={pe} numeric>
                          {pe}
                        </Th>
                      ))}
                    </Tr>
                  </THead>
                  <TBody>
                    {[...new Set(result.rows.map((r) => `${r.dx}|${r.ou}`))].map(
                      (key) => {
                        const [dxId, ouId] = key.split('|');
                        return (
                          <Tr key={key} className="hover:bg-surface">
                            <Td className="font-medium">
                              {result.meta.names[dxId!] ?? dxId}
                            </Td>
                            <Td className="text-ink-muted">
                              {result.meta.names[ouId!] ?? ouId}
                            </Td>
                            {cols.map((pe) => (
                              <Td key={pe} numeric>
                                {result.rows.find(
                                  (r) => r.dx === dxId && r.ou === ouId && r.pe === pe,
                                )?.value ?? '—'}
                              </Td>
                            ))}
                          </Tr>
                        );
                      },
                    )}
                  </TBody>
                </Table>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-muted">
              Pick data, org units, and a period range, then run the query. Explore is the
              online analytics path; dashboards (M5) cache results for offline.
            </p>
          )}
        </div>
      </div>
    </Page>
  );
}
