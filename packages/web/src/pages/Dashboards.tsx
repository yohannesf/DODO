// Dashboards (spec §8.6): 12-column grid with drag-to-move / resize, five
// widget kinds, global filters cascading into widgets, offline rendering
// from the Dexie mirror + widget cache.
import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  RELATIVE_PERIODS,
  WIDGET_KINDS,
  uuidv7,
  type Dashboard,
  type DashboardItem,
  type RelativePeriod,
  type WidgetKind,
} from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  FieldGroup,
  Input,
  Panel,
  PanelIconButton,
  Select,
  Textarea,
  cx,
} from '../components';
import { useEntityList, useEntityMutations } from '../api/metadata';
import { getDb, hasDb } from '../db/db';
import { Widget, widgetTitle, type WidgetConfig } from '../dashboards/widgets';
import type { GlobalFilters } from '../dashboards/useWidgetData';
import { ErrorNote } from './configure/common';
import { Page } from './Page';

const ROW_PX = 72;

function WidgetConfigForm({
  item,
  onSave,
  onClose,
}: {
  item: DashboardItem;
  onSave: (item: DashboardItem) => void;
  onClose: () => void;
}) {
  const dataElements = useLiveQuery(
    () => (hasDb() ? getDb().dataElements.toArray() : []),
    [],
  );
  const indicators = useLiveQuery(
    () => (hasDb() ? getDb().indicators.toArray() : []),
    [],
  );
  const orgUnits = useLiveQuery(
    () => (hasDb() ? getDb().orgUnits.orderBy('path').toArray() : []),
    [],
  );
  const config = item.config as WidgetConfig;
  const [title, setTitle] = useState(config.title ?? '');
  const [dx, setDx] = useState<string[]>(config.dx ?? []);
  const [ouIds, setOuIds] = useState<string[]>(config.ouIds ?? []);
  const [relativePeriod, setRelativePeriod] = useState<RelativePeriod>(
    config.relativePeriod ?? 'LAST_6_MONTHS',
  );
  const [chartKind, setChartKind] = useState(config.chartKind ?? 'bar');
  const [text, setText] = useState(config.text ?? '');

  const dxOptions = [
    ...(indicators ?? []).map((i) => ({
      id: i.id as string,
      name: `◆ ${String(i.name)}`,
    })),
    ...(dataElements ?? []).map((d) => ({ id: d.id as string, name: String(d.name) })),
  ];

  function save() {
    const next: WidgetConfig =
      item.kind === 'text'
        ? { title, text }
        : {
            title,
            dx: item.kind === 'kpi' || item.kind === 'map' ? dx.slice(0, 1) : dx,
            ouIds,
            ouMode: 'subtree',
            relativePeriod,
            ...(item.kind === 'chart' ? { chartKind } : {}),
          };
    onSave({ ...item, config: next as Record<string, unknown> });
    onClose();
  }

  return (
    <div className="mt-4 space-y-3">
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      </Field>
      {item.kind === 'text' ? (
        <Field label="Text">
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </Field>
      ) : (
        <>
          <FieldGroup
            label={
              item.kind === 'kpi' || item.kind === 'map'
                ? 'indicator / data element (one)'
                : 'data'
            }
          >
            <div className="max-h-36 space-y-0.5 overflow-y-auto border border-hairline bg-paper p-2">
              {dxOptions.map((o) => (
                <Checkbox
                  key={o.id}
                  label={o.name}
                  checked={dx.includes(o.id)}
                  onChange={() =>
                    setDx((ids) =>
                      ids.includes(o.id)
                        ? ids.filter((x) => x !== o.id)
                        : item.kind === 'kpi' || item.kind === 'map'
                          ? [o.id]
                          : [...ids, o.id],
                    )
                  }
                  className="block"
                />
              ))}
            </div>
          </FieldGroup>
          <FieldGroup label="org units">
            <div className="max-h-36 space-y-0.5 overflow-y-auto border border-hairline bg-paper p-2">
              {orgUnits?.map((o) => (
                <Checkbox
                  key={String(o.id)}
                  label={`${' '.repeat(((o.level as number) - 1) * 2)}${String(o.name)}`}
                  checked={ouIds.includes(o.id as string)}
                  onChange={() =>
                    setOuIds((ids) =>
                      ids.includes(o.id as string)
                        ? ids.filter((x) => x !== o.id)
                        : [...ids, o.id as string],
                    )
                  }
                  className="block whitespace-pre"
                />
              ))}
            </div>
          </FieldGroup>
          <div className="grid grid-cols-2 gap-3">
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
            {item.kind === 'chart' ? (
              <Field label="Chart kind">
                <Select
                  value={chartKind}
                  onChange={(e) => setChartKind(e.target.value as 'bar' | 'line')}
                >
                  <option value="bar">bar</option>
                  <option value="line">line</option>
                </Select>
              </Field>
            ) : null}
          </div>
        </>
      )}
      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button variant="primary" onClick={save}>
          Save widget
        </Button>
      </div>
    </div>
  );
}

export function Dashboards() {
  const dashboards = useEntityList('dashboards');
  const { create, update, remove } = useEntityMutations('dashboards');
  // offline fallback: Dexie mirror
  const mirror = useLiveQuery(
    () =>
      hasDb() ? (getDb().dashboards.toArray() as unknown as Promise<Dashboard[]>) : [],
    [],
  );
  const list = dashboards.data ?? mirror ?? [];

  const [selectedId, setSelectedId] = useState('');
  const [newDash, setNewDash] = useState({ name: '', code: '' });
  const [editMode, setEditMode] = useState(false);
  const [items, setItems] = useState<DashboardItem[] | null>(null);
  const [configuring, setConfiguring] = useState<DashboardItem | null>(null);
  const [filters, setFilters] = useState<GlobalFilters>({});
  const orgUnits = useLiveQuery(
    () => (hasDb() ? getDb().orgUnits.orderBy('path').toArray() : []),
    [],
  );

  const dashboard = list.find((d) => d.id === selectedId) ?? list[0] ?? null;
  const liveItems = items ?? dashboard?.items ?? [];

  const drag = useRef<{
    id: string;
    mode: 'move' | 'resize';
    startX: number;
    startY: number;
    orig: DashboardItem;
  } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current || !gridRef.current) return;
    const colPx = gridRef.current.clientWidth / 12;
    const dCol = Math.round((e.clientX - drag.current.startX) / colPx);
    const dRow = Math.round((e.clientY - drag.current.startY) / ROW_PX);
    const { orig, mode, id } = drag.current;
    setItems((prev) =>
      (prev ?? liveItems).map((i) => {
        if (i.id !== id) return i;
        if (mode === 'move') {
          return {
            ...i,
            gridX: Math.max(0, Math.min(11, orig.gridX + dCol)),
            gridY: Math.max(0, orig.gridY + dRow),
          };
        }
        return {
          ...i,
          gridW: Math.max(2, Math.min(12 - orig.gridX, orig.gridW + dCol)),
          gridH: Math.max(2, orig.gridH + dRow),
        };
      }),
    );
  }

  function saveLayout(next?: DashboardItem[]) {
    if (!dashboard) return;
    update.mutate({ id: dashboard.id, patch: { items: next ?? liveItems } });
  }

  function addWidget(kind: WidgetKind) {
    const item: DashboardItem = {
      id: uuidv7(),
      kind,
      config: {},
      gridX: 0,
      gridY: Math.max(0, ...liveItems.map((i) => i.gridY + i.gridH)),
      gridW: kind === 'kpi' ? 3 : 6,
      gridH: kind === 'kpi' ? 2 : 4,
    };
    const next = [...liveItems, item];
    setItems(next);
    setConfiguring(item);
  }

  return (
    <Page number="03" title="Dashboards">
      <div className="mb-4 flex max-w-5xl flex-wrap items-end gap-3">
        <Field label="Dashboard">
          <Select
            value={dashboard?.id ?? ''}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setItems(null);
              setEditMode(false);
            }}
            className="w-56"
          >
            {list.length === 0 ? <option value="">none yet</option> : null}
            {list.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Input
          placeholder="New dashboard name"
          value={newDash.name}
          onChange={(e) => setNewDash({ ...newDash, name: e.target.value })}
          className="w-44"
        />
        <Input
          placeholder="Code"
          value={newDash.code}
          onChange={(e) => setNewDash({ ...newDash, code: e.target.value })}
          className="w-28"
        />
        <Button
          disabled={!newDash.name || !newDash.code}
          onClick={() =>
            create.mutate(newDash, {
              onSuccess: () => setNewDash({ name: '', code: '' }),
            })
          }
        >
          Create
        </Button>
        {dashboard ? (
          <>
            <span className="grow" />
            <Field label="Filter: org unit">
              <Select
                value={filters.ouId ?? ''}
                onChange={(e) => setFilters({ ...filters, ouId: e.target.value || null })}
                className="w-44"
              >
                <option value="">widget default</option>
                {orgUnits?.map((o) => (
                  <option key={String(o.id)} value={String(o.id)}>
                    {String(o.name)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Filter: period">
              <Select
                value={filters.relativePeriod ?? ''}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    relativePeriod: (e.target.value || null) as RelativePeriod | null,
                  })
                }
                className="w-40"
              >
                <option value="">widget default</option>
                {RELATIVE_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {p.toLowerCase().replaceAll('_', ' ')}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={() => setEditMode((e) => !e)}>
              {editMode ? 'Done' : 'Edit layout'}
            </Button>
            {editMode ? (
              <>
                {WIDGET_KINDS.map((k) => (
                  <Button key={k} size="sm" onClick={() => addWidget(k)}>
                    + {k}
                  </Button>
                ))}
                <Button size="sm" variant="primary" onClick={() => saveLayout()}>
                  Save layout
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => remove.mutate(dashboard.id)}
                >
                  Delete dashboard
                </Button>
              </>
            ) : null}
          </>
        ) : null}
      </div>
      <ErrorNote error={create.error ?? update.error ?? remove.error} />

      {!dashboard ? (
        <p className="text-sm text-ink-muted" data-testid="dashboards-empty">
          No dashboards yet. Create one, then add KPI cards, charts, maps, pivot tables,
          and text blocks. Last-fetched data renders offline with a “data as of” stamp.
        </p>
      ) : (
        <div
          ref={gridRef}
          data-testid="dashboard-grid"
          className="grid max-w-6xl grid-cols-12 gap-2"
          style={{ gridAutoRows: `${ROW_PX}px` }}
          onPointerMove={editMode ? onPointerMove : undefined}
          onPointerUp={() => (drag.current = null)}
        >
          {liveItems.map((item) => (
            <div
              key={item.id}
              className="relative min-h-0"
              style={{
                gridColumn: `${item.gridX + 1} / span ${item.gridW}`,
                gridRow: `${item.gridY + 1} / span ${item.gridH}`,
              }}
            >
              <Panel
                title={widgetTitle(item)}
                className={cx('h-full', editMode && 'border-dashed border-primary')}
                noFullscreen={editMode}
                headerProps={
                  editMode
                    ? {
                        className: 'cursor-move',
                        onPointerDown: (e) => {
                          drag.current = {
                            id: item.id,
                            mode: 'move',
                            startX: e.clientX,
                            startY: e.clientY,
                            orig: item,
                          };
                        },
                      }
                    : undefined
                }
                toolbar={
                  editMode ? (
                    <>
                      <PanelIconButton
                        label="Configure widget"
                        onClick={() => setConfiguring(item)}
                      >
                        <span aria-hidden>⚙</span>
                      </PanelIconButton>
                      <PanelIconButton
                        label="Remove widget"
                        onClick={() =>
                          setItems(liveItems.filter((i) => i.id !== item.id))
                        }
                      >
                        <span aria-hidden>×</span>
                      </PanelIconButton>
                    </>
                  ) : undefined
                }
              >
                <Widget item={item} filters={filters} />
              </Panel>
              {editMode ? (
                <span
                  className="absolute right-0 bottom-0 h-4 w-4 cursor-nwse-resize border-t border-l border-primary"
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    drag.current = {
                      id: item.id,
                      mode: 'resize',
                      startX: e.clientX,
                      startY: e.clientY,
                      orig: item,
                    };
                  }}
                />
              ) : null}
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={configuring !== null}
        onOpenChange={(o) => !o && setConfiguring(null)}
      >
        <DialogContent
          title={`Configure ${configuring?.kind ?? ''} widget`}
          className="w-[min(560px,calc(100vw-2rem))]"
        >
          {configuring ? (
            <WidgetConfigForm
              item={configuring}
              onClose={() => setConfiguring(null)}
              onSave={(updated) => {
                const next = liveItems.map((i) => (i.id === updated.id ? updated : i));
                setItems(next);
                saveLayout(next);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </Page>
  );
}
