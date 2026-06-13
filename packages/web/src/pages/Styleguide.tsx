// /dev/styleguide — renders every primitive, the Panel, the Sync Gauge in all
// states, a sample chart and table, in light + dark (design language §10.10).
// Dev-only visual reference; not linked from the app nav.
import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import {
  Button,
  Checkbox,
  DensityToggle,
  Field,
  Input,
  Panel,
  PanelIconButton,
  Select,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
  Textarea,
  cx,
} from '../components';
import { SyncGaugeView, type SyncGaugeState } from '../shell/SyncGauge';
import { chartBaseOption, SERIES_DEFAULTS, CHART_PALETTE } from '../charts/theme';

echarts.use([
  BarChart,
  LineChart,
  GridComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="type-h2">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, varName }: { name: string; varName: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="size-8 rounded-sm border border-border"
        style={{ background: `var(${varName})` }}
      />
      <span className="font-mono text-[11px] text-ink-muted">{name}</span>
    </div>
  );
}

function SampleChart({ theme }: { theme: 'light' | 'dark' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    const base = chartBaseOption({ legend: true });
    const periods = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];
    chart.setOption({
      ...base,
      xAxis: { ...base.xAxis, data: periods },
      series: [
        { ...SERIES_DEFAULTS, name: 'North', type: 'line', data: [30, 42, 38, 51, 49, 60] },
        { ...SERIES_DEFAULTS, name: 'South', type: 'line', data: [20, 24, 29, 27, 33, 31] },
        { ...SERIES_DEFAULTS, name: 'East', type: 'bar', data: [12, 18, 15, 22, 19, 25] },
      ],
    });
    const obs = new ResizeObserver(() => chart.resize());
    obs.observe(ref.current);
    return () => {
      obs.disconnect();
      chart.dispose();
    };
    // re-init on theme flip so axis/label colours re-read the CSS vars
  }, [theme]);
  return <div ref={ref} className="h-56 w-full" />;
}

const SYNC_STATES: Array<{ label: string; state: SyncGaugeState }> = [
  {
    label: 'online · synced',
    state: {
      online: true,
      status: 'idle',
      pending: 0,
      failed: 0,
      conflicts: 0,
      lastSyncAt: new Date(Date.now() - 120_000).toISOString(),
    },
  },
  {
    label: 'syncing (pulse)',
    state: {
      online: true,
      status: 'syncing',
      pending: 3,
      failed: 0,
      conflicts: 0,
      lastSyncAt: null,
    },
  },
  {
    label: 'offline · pending',
    state: {
      online: false,
      status: 'offline',
      pending: 14,
      failed: 0,
      conflicts: 0,
      lastSyncAt: null,
    },
  },
  {
    label: 'conflict',
    state: {
      online: true,
      status: 'attention',
      pending: 0,
      failed: 0,
      conflicts: 2,
      lastSyncAt: null,
    },
  },
];

export function Styleguide() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    return () => root.classList.remove('dark');
  }, [theme]);

  return (
    <div className="min-h-dvh bg-canvas px-8 py-6 text-ink">
      <div className="mx-auto max-w-5xl space-y-10">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="type-h1">DODO styleguide</h1>
            <p className="text-sm text-ink-muted">
              Field Instrument design language — every primitive in {theme}.
            </p>
          </div>
          <Button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}>
            {theme === 'light' ? 'Dark theme' : 'Light theme'}
          </Button>
        </header>

        <Section title="Surfaces & ink">
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {[
              ['canvas', '--canvas'],
              ['panel', '--panel'],
              ['panel-raised', '--panel-raised'],
              ['sunken', '--sunken'],
              ['border', '--border'],
              ['border-strong', '--border-strong'],
              ['ink', '--ink'],
              ['ink-muted', '--ink-muted'],
              ['ink-faint', '--ink-faint'],
              ['primary', '--primary'],
              ['primary-tint', '--primary-tint'],
              ['ok', '--ok'],
              ['warn', '--warn'],
              ['danger', '--danger'],
            ].map(([n, v]) => (
              <Swatch key={v} name={n!} varName={v!} />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {CHART_PALETTE.map((c) => (
              <span
                key={c}
                className="size-6 rounded-xs border border-border"
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
        </Section>

        <Section title="Typography">
          <div className="space-y-1">
            <p className="type-display">Display 2.0 — 102,459</p>
            <p className="type-h1">Heading 1</p>
            <p className="type-h2">Heading 2</p>
            <p className="type-body">Body — the quick brown fox jumps over 13 boreholes.</p>
            <p className="type-data">data 0123456789 · tabular mono</p>
            <p className="type-label text-ink-muted">label / eyebrow</p>
          </div>
        </Section>

        <Section title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button size="sm" variant="primary">
              Compact
            </Button>
          </div>
        </Section>

        <Section title="Inputs">
          <div className="grid max-w-2xl grid-cols-2 gap-4">
            <Field label="Text input" hint="a helpful hint">
              <Input placeholder="type here…" />
            </Field>
            <Field label="With error" error="required field">
              <Input defaultValue="bad" />
            </Field>
            <Field label="Select">
              <Select defaultValue="b">
                <option value="a">Option A</option>
                <option value="b">Option B</option>
              </Select>
            </Field>
            <Field label="Textarea">
              <Textarea rows={2} placeholder="notes…" />
            </Field>
          </div>
          <div className="flex gap-4">
            <Checkbox label="Checkbox on" defaultChecked />
            <Checkbox label="Checkbox off" />
          </div>
        </Section>

        <Section title="Tabs">
          <nav className="flex gap-4 border-b border-border">
            {['Overview', 'Org units', 'Datasets'].map((tab, i) => (
              <span
                key={tab}
                className={cx(
                  'border-b-2 pb-1.5 text-sm',
                  i === 0
                    ? 'border-primary font-medium text-ink'
                    : 'border-transparent text-ink-muted',
                )}
              >
                {tab}
              </span>
            ))}
          </nav>
        </Section>

        <Section title="Status">
          <p className="flex gap-4">
            <span className="type-label text-ok">● online</span>
            <span className="type-label text-warn">◌ unsynced</span>
            <span className="type-label text-danger">▲ conflict</span>
          </p>
        </Section>

        <Section title="KPI stat block">
          <div className="grid max-w-2xl grid-cols-3 gap-3">
            <Panel title="People reached" noFullscreen>
              <p className="type-display tnum text-ok">102,459</p>
              <span
                className="type-label mt-1 inline-flex rounded-xs px-1.5 py-0.5 text-ok"
                style={{ background: 'color-mix(in srgb, var(--ok) 14%, transparent)' }}
              >
                ▲ 108% of target
              </span>
              <svg width="104" height="26" viewBox="0 0 104 26" className="mt-1.5 block">
                <path
                  d="M3 20 L23 16 L43 18 L63 9 L83 11 L101 5"
                  fill="none"
                  stroke="var(--primary)"
                  strokeWidth="1"
                />
                <circle cx="101" cy="5" r="2" fill="var(--primary)" />
              </svg>
            </Panel>
            <Panel title="Boreholes" noFullscreen>
              <p className="type-display tnum text-danger">312</p>
              <span
                className="type-label mt-1 inline-flex rounded-xs px-1.5 py-0.5 text-danger"
                style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}
              >
                ▼ 62% of target
              </span>
            </Panel>
            <Panel title="Water points" noFullscreen>
              <p className="type-display tnum text-ink-faint">45</p>
              <span className="type-label text-ink-faint">no target</span>
            </Panel>
          </div>
        </Section>

        <Section title="Panel">
          <Panel
            title="Panel with toolbar"
            toolbar={
              <>
                <PanelIconButton label="Download">
                  <span aria-hidden>⤓</span>
                </PanelIconButton>
                <PanelIconButton label="View as table">
                  <span aria-hidden>▦</span>
                </PanelIconButton>
              </>
            }
            footer="source: demo seed · data as of just now"
            className="max-w-xl"
          >
            <p className="text-sm text-ink-muted">
              Header strip (panel-raised) with a label-caps title and ghost toolbar
              actions revealed on hover/focus; body on panel; hairline footer.
            </p>
          </Panel>
        </Section>

        <Section title="Sync Gauge — all states">
          <div className="flex flex-wrap gap-4">
            {SYNC_STATES.map(({ label, state }) => (
              <div key={label} className="space-y-1">
                <SyncGaugeView {...state} />
                <p className="type-label text-ink-faint">{label}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Chart (legend outside the plot)">
          <Panel title="People reached, monthly" className="max-w-2xl" noFullscreen>
            <SampleChart theme={theme} />
          </Panel>
        </Section>

        <Section title="Table">
          <Panel
            title="Coverage"
            toolbar={<DensityToggle />}
            className="max-w-2xl"
            noFullscreen
          >
            <Table>
              <THead>
                <Tr>
                  <Th>Org unit</Th>
                  <Th numeric>Reached</Th>
                  <Th numeric>Target</Th>
                  <Th numeric>%</Th>
                </Tr>
              </THead>
              <TBody>
                {[
                  ['North Region', 8421, 8000, 105],
                  ['South Region', 5102, 7000, 73],
                  ['East Region', 3960, 7000, 57],
                ].map((r) => (
                  <Tr key={r[0]}>
                    <Td>{r[0]}</Td>
                    <Td numeric>{r[1]!.toLocaleString()}</Td>
                    <Td numeric>{r[2]!.toLocaleString()}</Td>
                    <Td numeric>{r[3]}%</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </Panel>
        </Section>

        <Section title="Empty state">
          <Panel title="Enter data" className="max-w-xl" noFullscreen>
            <p className="text-sm text-ink-muted">
              No dataset selected. Choose a dataset to begin entry.
            </p>
            <div className="mt-2">
              <Select defaultValue="">
                <option value="">choose…</option>
                <option>Monthly water report</option>
              </Select>
            </div>
          </Panel>
        </Section>
      </div>
    </div>
  );
}
