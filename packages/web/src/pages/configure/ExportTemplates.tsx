// Export Templates (spec §16.13): template list + create, per-template editor
// (donor upload, field mappings, run-now, history) and scheduled exports.
// Export endpoints live under /api/export (not /api/metadata), so this page
// talks to the API directly via TanStack Query rather than the entity hooks.
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  EXPORT_FORMATS,
  EXPORT_TEMPLATE_TYPES,
  SCHEDULE_FREQUENCIES,
  type ExportJob,
  type ExportTemplate,
  type ExportTemplateMapping,
  type ScheduledExport,
} from '@dodo/shared';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  Field,
  Input,
  Select,
} from '../../components';
import { api } from '../../api/client';
import { useEntityList } from '../../api/metadata';
import { EmptyHint, ErrorNote, SectionTitle } from './common';

function useExportQuery<T>(key: string[], url: string) {
  return useQuery({ queryKey: key, queryFn: () => api.get<T>(url) });
}

function TemplateForm({ onDone }: { onDone: () => void }) {
  const programs = useEntityList('programs');
  const frameworks = useEntityList('frameworks');
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    programId: '',
    frameworkId: '',
    outputFormat: 'excel',
    templateType: 'internal',
    periodType: 'fixed',
    includeRag: false,
  });
  const create = useMutation({
    mutationFn: () =>
      api.post('/api/export/templates', {
        name: form.name,
        programId: form.programId,
        frameworkId: form.frameworkId || null,
        outputFormat: form.outputFormat,
        templateType: form.templateType,
        periodType: form.periodType,
        flags: { include_rag: form.includeRag },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['exportTemplates'] });
      onDone();
    },
  });

  return (
    <div className="mt-4 space-y-3">
      <Field label="Name">
        <Input
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Program">
          <Select
            value={form.programId}
            onChange={(e) => setForm({ ...form, programId: e.target.value })}
          >
            <option value="">choose…</option>
            {programs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Framework scope (optional)">
          <Select
            value={form.frameworkId}
            onChange={(e) => setForm({ ...form, frameworkId: e.target.value })}
          >
            <option value="">all frameworks</option>
            {frameworks.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Format">
          <Select
            value={form.outputFormat}
            onChange={(e) => setForm({ ...form, outputFormat: e.target.value })}
          >
            {EXPORT_FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Type">
          <Select
            value={form.templateType}
            onChange={(e) => setForm({ ...form, templateType: e.target.value })}
          >
            {EXPORT_TEMPLATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Checkbox
        label="Include RAG status column"
        checked={form.includeRag}
        onChange={(e) => setForm({ ...form, includeRag: e.target.checked })}
      />
      <ErrorNote error={create.error} />
      <div className="flex justify-end gap-2 pt-1">
        <DialogClose asChild>
          <Button>Cancel</Button>
        </DialogClose>
        <Button
          variant="primary"
          onClick={() => create.mutate()}
          disabled={!form.name || !form.programId || create.isPending}
        >
          Create
        </Button>
      </div>
    </div>
  );
}

function TemplateEditor({ template }: { template: ExportTemplate }) {
  const qc = useQueryClient();
  const mappings = useExportQuery<ExportTemplateMapping[]>(
    ['exportMappings'],
    '/api/export/template-mappings',
  );
  const jobs = useExportQuery<ExportJob[]>(
    ['exportJobs', template.id],
    `/api/export/jobs?template=${template.id}`,
  );
  const mine = (mappings.data ?? []).filter((m) => m.templateId === template.id);

  const [map, setMap] = useState({ dodoField: '', donorLabel: '', donorCellRef: '' });
  const [period, setPeriod] = useState({ start: '2026-01-01', end: '2026-12-31' });
  const [error, setError] = useState<unknown>(null);

  const addMapping = useMutation({
    mutationFn: () =>
      api.post('/api/export/template-mappings', {
        templateId: template.id,
        dodoField: map.dodoField,
        donorLabel: map.donorLabel || null,
        donorCellRef: map.donorCellRef || null,
      }),
    onSuccess: async () => {
      setMap({ dodoField: '', donorLabel: '', donorCellRef: '' });
      await qc.invalidateQueries({ queryKey: ['exportMappings'] });
    },
  });

  async function uploadDonor(file: File) {
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const res = await api.postForm<{ fileRef: string }>('/api/files', fd);
      await api.put(`/api/export/templates/${template.id}`, {
        donorFileRef: res.fileRef,
      });
      await qc.invalidateQueries({ queryKey: ['exportTemplates'] });
    } catch (e) {
      setError(e);
    }
  }

  const runNow = useMutation({
    mutationFn: () =>
      api.post('/api/export/jobs', {
        templateId: template.id,
        periodStart: period.start,
        periodEnd: period.end,
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['exportJobs', template.id] });
    },
  });

  return (
    <div className="mt-4 space-y-4">
      <Field label="Donor template (.xlsx, optional)">
        <input
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadDonor(f);
            e.target.value = '';
          }}
        />
        {template.donorFileRef ? (
          <span className="small-caps ml-2 text-ok">● uploaded</span>
        ) : null}
      </Field>

      <div>
        <h3 className="small-caps mb-1 font-medium text-ink-muted">Field mappings</h3>
        <ul className="text-[13px]">
          {mine.map((m) => (
            <li
              key={m.id}
              className="flex justify-between border-b border-hairline py-0.5"
            >
              <span>
                <span className="font-mono">{m.dodoField}</span>
                {m.donorCellRef ? ` → ${m.donorCellRef}` : ''}
                {m.donorLabel ? ` (${m.donorLabel})` : ''}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Input
            placeholder="dodo field"
            value={map.dodoField}
            onChange={(e) => setMap({ ...map, dodoField: e.target.value })}
          />
          <Input
            placeholder="donor label"
            value={map.donorLabel}
            onChange={(e) => setMap({ ...map, donorLabel: e.target.value })}
          />
          <Input
            placeholder="cell (C5)"
            value={map.donorCellRef}
            onChange={(e) => setMap({ ...map, donorCellRef: e.target.value })}
          />
          <Button onClick={() => addMapping.mutate()} disabled={!map.dodoField}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-end gap-2 border-t border-hairline pt-3">
        <Field label="Period start">
          <Input
            type="date"
            value={period.start}
            onChange={(e) => setPeriod({ ...period, start: e.target.value })}
          />
        </Field>
        <Field label="Period end">
          <Input
            type="date"
            value={period.end}
            onChange={(e) => setPeriod({ ...period, end: e.target.value })}
          />
        </Field>
        <Button
          variant="primary"
          onClick={() => runNow.mutate()}
          disabled={runNow.isPending}
        >
          Run now
        </Button>
      </div>
      <ErrorNote error={error ?? addMapping.error ?? runNow.error} />

      <div>
        <h3 className="small-caps mb-1 font-medium text-ink-muted">Export history</h3>
        {(jobs.data ?? []).length === 0 ? (
          <p className="text-[12px] text-ink-muted">No runs yet.</p>
        ) : (
          <ul className="text-[13px]">
            {(jobs.data ?? []).map((j) => (
              <li
                key={j.id}
                className="flex items-center justify-between border-b border-hairline py-0.5"
              >
                <span>
                  <span className="small-caps text-ink-muted">{j.status}</span> ·{' '}
                  {j.periodStart}–{j.periodEnd} · {j.rowCount ?? 0} rows
                </span>
                {j.status === 'complete' && j.fileRef ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      void api.download(
                        `/api/export/jobs/${j.id}/download`,
                        j.fileRef!.split('/').pop() ?? 'export',
                      )
                    }
                  >
                    Download
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ScheduledPanel template={template} />
    </div>
  );
}

function ScheduledPanel({ template }: { template: ExportTemplate }) {
  const qc = useQueryClient();
  const scheduled = useExportQuery<ScheduledExport[]>(
    ['exportScheduled'],
    '/api/export/scheduled',
  );
  const mine = (scheduled.data ?? []).filter((s) => s.templateId === template.id);
  const [frequency, setFrequency] = useState('quarterly');
  const [nextRunAt, setNextRunAt] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/api/export/scheduled', {
        templateId: template.id,
        frequency,
        nextRunAt: new Date(nextRunAt || Date.now()).toISOString(),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exportScheduled'] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/export/scheduled/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exportScheduled'] }),
  });

  return (
    <div className="border-t border-hairline pt-3">
      <h3 className="small-caps mb-1 font-medium text-ink-muted">Scheduled</h3>
      <ul className="text-[13px]">
        {mine.map((s) => (
          <li key={s.id} className="flex justify-between border-b border-hairline py-0.5">
            <span>
              {s.frequency} · next {new Date(s.nextRunAt).toLocaleDateString()}
            </span>
            <Button size="sm" variant="ghost" onClick={() => remove.mutate(s.id)}>
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-end gap-2">
        <Field label="Frequency">
          <Select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {SCHEDULE_FREQUENCIES.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="First run">
          <Input
            type="date"
            value={nextRunAt}
            onChange={(e) => setNextRunAt(e.target.value)}
          />
        </Field>
        <Button onClick={() => create.mutate()} disabled={!nextRunAt}>
          Schedule
        </Button>
      </div>
      <ErrorNote error={create.error ?? remove.error} />
    </div>
  );
}

export function ExportTemplatesPage() {
  const qc = useQueryClient();
  const templates = useExportQuery<ExportTemplate[]>(
    ['exportTemplates'],
    '/api/export/templates',
  );
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ExportTemplate | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/export/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exportTemplates'] }),
  });

  return (
    <section className="max-w-4xl">
      <SectionTitle
        title="Export templates"
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            New template
          </Button>
        }
      />
      {(templates.data ?? []).length === 0 ? (
        <EmptyHint>
          No export templates yet. A template defines a donor or internal export — fill a
          donor’s own spreadsheet by cell, or generate one from field mappings.
        </EmptyHint>
      ) : (
        <ul className="space-y-1">
          {templates.data?.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between border border-hairline px-3 py-2"
            >
              <span>
                <span className="font-medium">{t.name}</span>
                <span className="small-caps ml-2 text-ink-muted">
                  {t.outputFormat} · {t.templateType}
                </span>
              </span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => setEditing(t)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(t.id)}>
                  Delete
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ErrorNote error={remove.error} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="New export template">
          <TemplateForm onDone={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent
          title={editing ? `${editing.name}` : ''}
          className="w-[min(640px,calc(100vw-2rem))]"
        >
          {editing ? <TemplateEditor template={editing} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}
