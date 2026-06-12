import { useState } from 'react';
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Input,
  TBody,
  Table,
  Td,
  Th,
  THead,
  Tr,
} from '../components';
import { Page } from './Page';

// Configuration areas per spec §8.2; counts populate from M1 onward.
const AREAS = [
  { name: 'Indicators', detail: 'formulas computed from data elements' },
  { name: 'Disaggregations', detail: 'categories, options, and combos' },
  { name: 'Org units', detail: 'hierarchy, levels, and geometry' },
  { name: 'Datasets', detail: 'collection forms and assignments' },
  { name: 'Validation', detail: 'rules checked at entry and on the server' },
  { name: 'Users', detail: 'accounts, roles, and org-unit scopes' },
  { name: 'System', detail: 'organisation, fiscal year, locale' },
] as const;

export function Configure() {
  const [filter, setFilter] = useState('');
  const shown = AREAS.filter((a) =>
    a.name.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <Page number="07" title="Configure">
      <p>
        Everything in DODO is configured here, with no code changes. Start with org units,
        then disaggregations and datasets.
      </p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <Input
          aria-label="Filter configuration areas"
          placeholder="Filter areas…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-56"
        />
        <Dialog>
          <DialogTrigger asChild>
            <Button>Where do I start?</Button>
          </DialogTrigger>
          <DialogContent
            title="Suggested first steps"
            description="A working configuration needs, in order:"
          >
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-ink">
              <li>Org unit levels and the org unit tree</li>
              <li>Categories and category combos (disaggregation)</li>
              <li>Data elements, then datasets assigned to org units</li>
              <li>Users with roles and org-unit scopes</li>
            </ol>
            <div className="mt-4 flex justify-end">
              <DialogClose asChild>
                <Button variant="primary">Got it</Button>
              </DialogClose>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-3">
        <Table>
          <THead>
            <Tr>
              <Th>Area</Th>
              <Th>Contents</Th>
              <Th numeric>Items</Th>
              <Th>Status</Th>
            </Tr>
          </THead>
          <TBody>
            {shown.map((area) => (
              <Tr key={area.name} className="hover:bg-surface">
                <Td className="font-medium text-ink">{area.name}</Td>
                <Td className="text-ink-muted">{area.detail}</Td>
                <Td numeric>0</Td>
                <Td>
                  <span className="small-caps text-ink-muted">— not configured</span>
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </Page>
  );
}
