import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Button, TBody, Table, Td, Th, THead, Tr } from '../../components';
import {
  ENTITIES,
  exportBundle,
  importBundle,
  useEntityList,
  type EntityKey,
} from '../../api/metadata';
import { ErrorNote, SectionTitle } from './common';

const AREAS: Array<{ key: EntityKey; label: string; to: string }> = [
  { key: 'programs', label: 'Programs', to: '/configure/programs' },
  { key: 'orgUnits', label: 'Org units', to: '/configure/org-units' },
  { key: 'categories', label: 'Categories', to: '/configure/disaggregation' },
  { key: 'categoryCombos', label: 'Category combos', to: '/configure/disaggregation' },
  { key: 'dataElements', label: 'Data elements', to: '/configure/data-elements' },
  { key: 'optionSets', label: 'Option sets', to: '/configure/option-sets' },
  { key: 'datasets', label: 'Datasets', to: '/configure/datasets' },
  { key: 'users', label: 'Users', to: '/configure/users' },
];

function AreaRow({ area }: { area: (typeof AREAS)[number] }) {
  const list = useEntityList(area.key);
  const count = list.data?.length ?? 0;
  return (
    <Tr className="hover:bg-surface">
      <Td>
        <Link to={area.to} className="font-medium text-cobalt hover:text-cobalt-deep">
          {area.label}
        </Link>
      </Td>
      <Td numeric>{list.isLoading ? '…' : count}</Td>
      <Td>
        <span className="small-caps text-ink-muted">
          {count > 0 ? '● configured' : '— not configured'}
        </span>
      </Td>
    </Tr>
  );
}

export function ConfigureOverview() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [report, setReport] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const qc = useQueryClient();

  async function onExport() {
    setBusy(true);
    setError(null);
    try {
      const bundle = await exportBundle();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], {
        type: 'application/json',
      });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'metadata.json';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function onImportFile(file: File) {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      const bundle = JSON.parse(await file.text()) as unknown;
      const result = await importBundle(bundle);
      const sum = (bag: Record<string, number>) =>
        Object.values(bag).reduce((a, b) => a + b, 0);
      setReport(
        `imported — ${sum(result.created)} created, ${sum(result.updated)} updated`,
      );
      await qc.invalidateQueries();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="max-w-2xl">
      <SectionTitle
        title="Configuration"
        actions={
          <div className="flex items-center gap-2">
            <Button onClick={onExport} disabled={busy}>
              Export bundle
            </Button>
            <Button onClick={() => fileRef.current?.click()} disabled={busy}>
              Import bundle…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onImportFile(f);
                e.target.value = '';
              }}
            />
          </div>
        }
      />
      <p className="mb-4 text-sm text-ink-muted">
        Configure org units first, then disaggregation, data elements, and datasets. The
        whole configuration can be shared between instances as a single metadata.json
        bundle.
      </p>
      {report ? <p className="mb-3 text-sm text-ontrack">● {report}</p> : null}
      <ErrorNote error={error} />
      <Table>
        <THead>
          <Tr>
            <Th>Area</Th>
            <Th numeric>Items</Th>
            <Th>Status</Th>
          </Tr>
        </THead>
        <TBody>
          {AREAS.map((a) => (
            <AreaRow key={a.label} area={a} />
          ))}
        </TBody>
      </Table>
      <p className="mt-4 text-[12px] text-ink-muted">
        {Object.keys(ENTITIES).length} metadata collections are synchronised to devices
        once sync lands (M2).
      </p>
    </section>
  );
}
