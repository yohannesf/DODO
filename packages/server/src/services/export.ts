// Export engine (spec §16.12, ADR 008). Runs in-process: a job is created and
// executed synchronously, writing the output file under FILES_DIR. Two paths —
// fill a donor's own xlsx by cell ref, or generate a workbook/CSV/JSON from the
// column mappings. Excel/CSV/JSON are supported; PDF falls back to JSON.
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { and, eq, inArray, isNull, lte } from 'drizzle-orm';
import { parsePeriod, periodStartDate, uuidv7 } from '@dodo/shared';
import type { Db } from '../db/index.js';
import {
  dataElement,
  dataset,
  datasetElements,
  dataValue,
  exportJob,
  exportTemplate,
  exportTemplateMapping,
  indicator,
  program,
  ragLog,
  scheduledExport,
} from '../db/schema.js';

interface ExportData {
  programName: string;
  rows: Array<{ dataElement: string; value: number }>;
  totalValue: number;
  ragByIndicatorName: Map<string, string>;
}

async function gatherData(
  db: Db,
  programId: string,
  periodStart: string,
  periodEnd: string,
): Promise<ExportData> {
  const [prog] = await db.select().from(program).where(eq(program.id, programId));
  const elements = await db
    .selectDistinct({ id: dataElement.id, name: dataElement.name })
    .from(dataElement)
    .innerJoin(datasetElements, eq(datasetElements.dataElementId, dataElement.id))
    .innerJoin(dataset, eq(dataset.id, datasetElements.datasetId))
    .where(and(eq(dataset.programId, programId), isNull(dataElement.deletedAt)));
  const deIds = elements.map((e) => e.id);

  const startMs = new Date(periodStart).getTime();
  const endMs = new Date(periodEnd).getTime();
  const inRange = (p: string): boolean => {
    const parsed = parsePeriod(p);
    if (!parsed) return false;
    const t = periodStartDate(parsed).getTime();
    return t >= startMs && t <= endMs;
  };

  const values = deIds.length
    ? await db
        .select({
          deId: dataValue.dataElementId,
          period: dataValue.period,
          value: dataValue.value,
        })
        .from(dataValue)
        .where(inArray(dataValue.dataElementId, deIds))
    : [];

  const sumByDe = new Map<string, number>();
  for (const v of values) {
    if (!inRange(v.period)) continue;
    const n = Number(v.value);
    if (!Number.isFinite(n)) continue;
    sumByDe.set(v.deId, (sumByDe.get(v.deId) ?? 0) + n);
  }
  const rows = elements.map((e) => ({
    dataElement: e.name,
    value: sumByDe.get(e.id) ?? 0,
  }));
  const totalValue = rows.reduce((a, r) => a + r.value, 0);

  // latest RAG status per indicator name, for the include_rag column
  const rags = await db
    .select({ indicatorId: ragLog.indicatorId, status: ragLog.status })
    .from(ragLog);
  const inds = await db
    .select({ id: indicator.id, name: indicator.name })
    .from(indicator)
    .where(eq(indicator.programId, programId));
  const nameById = new Map(inds.map((i) => [i.id, i.name]));
  const ragByIndicatorName = new Map<string, string>();
  for (const r of rags) {
    const name = nameById.get(r.indicatorId);
    if (name) ragByIndicatorName.set(name, r.status);
  }

  return { programName: prog?.name ?? '', rows, totalValue, ragByIndicatorName };
}

function applyTransform(value: unknown, transform: unknown): unknown {
  if (!transform || typeof transform !== 'object') return value;
  const t = transform as { op?: string; factor?: number };
  if (t.op === 'multiply' && typeof value === 'number' && typeof t.factor === 'number') {
    return value * t.factor;
  }
  return value;
}

// resolve a DODO field reference (spec §16.11 examples) to a scalar
function resolveScalar(field: string, data: ExportData): unknown {
  switch (field) {
    case 'data_value.value':
      return data.totalValue;
    case 'program.name':
      return data.programName;
    case 'rag.status':
      return [...data.ragByIndicatorName.values()][0] ?? '';
    default:
      return '';
  }
}

type Mapping = typeof exportTemplateMapping.$inferSelect;
type Template = typeof exportTemplate.$inferSelect;

async function buildWorkbook(
  template: Template,
  mappings: Mapping[],
  data: ExportData,
  filesDir: string,
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const fixed = mappings.filter((m) => m.donorCellRef);

  if (template.donorFileRef && fixed.length > 0) {
    // donor path: open their template and fill fixed cells
    await wb.xlsx.readFile(path.join(filesDir, template.donorFileRef));
    const ws = wb.worksheets[0] ?? wb.addWorksheet('Export');
    for (const m of fixed) {
      ws.getCell(m.donorCellRef!).value = applyTransform(
        resolveScalar(m.dodoField, data),
        m.transform,
      ) as ExcelJS.CellValue;
    }
    return wb;
  }

  // generated path: a table of data-element rows
  const ws = wb.addWorksheet('Export');
  const flags = (template.flags ?? {}) as { include_rag?: boolean };
  const header = ['Data element', 'Value'];
  if (flags.include_rag) header.push('RAG');
  ws.addRow(header);
  for (const r of data.rows) {
    const row: ExcelJS.CellValue[] = [r.dataElement, r.value];
    if (flags.include_rag) row.push(data.ragByIndicatorName.get(r.dataElement) ?? '');
    ws.addRow(row);
  }
  return wb;
}

export interface RunResult {
  fileRef: string;
  rowCount: number;
}

/** Build the output file for a job and return its ref + row count. */
export async function buildExportFile(
  db: Db,
  job: typeof exportJob.$inferSelect,
  filesDir: string,
): Promise<RunResult> {
  fs.mkdirSync(filesDir, { recursive: true });
  const [template] = await db
    .select()
    .from(exportTemplate)
    .where(eq(exportTemplate.id, job.templateId));
  if (!template) throw new Error('export template not found');
  const mappings = await db
    .select()
    .from(exportTemplateMapping)
    .where(eq(exportTemplateMapping.templateId, template.id));
  const data = await gatherData(db, job.programId, job.periodStart, job.periodEnd);

  const fmt = template.outputFormat;
  if (fmt === 'csv') {
    const flags = (template.flags ?? {}) as { include_rag?: boolean };
    const header = ['Data element', 'Value', ...(flags.include_rag ? ['RAG'] : [])];
    const lines = [header.join(',')];
    for (const r of data.rows) {
      const cells = [JSON.stringify(r.dataElement), String(r.value)];
      if (flags.include_rag) cells.push(data.ragByIndicatorName.get(r.dataElement) ?? '');
      lines.push(cells.join(','));
    }
    const ref = `${job.id}.csv`;
    await fs.promises.writeFile(path.join(filesDir, ref), lines.join('\n'));
    return { fileRef: ref, rowCount: data.rows.length };
  }
  if (fmt === 'json' || fmt === 'pdf') {
    // pdf is not supported in v0.2.0 (ADR 008) — emit JSON as a usable fallback
    const ref = `${job.id}.json`;
    await fs.promises.writeFile(
      path.join(filesDir, ref),
      JSON.stringify({ program: data.programName, rows: data.rows }, null, 2),
    );
    return { fileRef: ref, rowCount: data.rows.length };
  }

  // excel (donor fill-in or generated)
  const wb = await buildWorkbook(template, mappings, data, filesDir);
  const ref = `${job.id}.xlsx`;
  await wb.xlsx.writeFile(path.join(filesDir, ref));
  return { fileRef: ref, rowCount: data.rows.length };
}

/** Run a job in-process: processing → complete/failed, expires in 7 days. */
export async function runExportJob(
  db: Db,
  jobId: string,
  filesDir: string,
): Promise<void> {
  const [job] = await db.select().from(exportJob).where(eq(exportJob.id, jobId));
  if (!job) return;
  await db.update(exportJob).set({ status: 'processing' }).where(eq(exportJob.id, jobId));
  try {
    const { fileRef, rowCount } = await buildExportFile(db, job, filesDir);
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    await db
      .update(exportJob)
      .set({
        status: 'complete',
        fileRef,
        rowCount,
        completedAt: new Date().toISOString(),
        expiresAt: expires,
      })
      .where(eq(exportJob.id, jobId));
  } catch (err) {
    await db
      .update(exportJob)
      .set({
        status: 'failed',
        errorLog: { message: err instanceof Error ? err.message : String(err) },
        completedAt: new Date().toISOString(),
      })
      .where(eq(exportJob.id, jobId));
  }
}

/** Advance a schedule's next_run_at by its frequency. */
export function nextRunAfter(frequency: string, from: Date): Date {
  const d = new Date(from);
  if (frequency === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1); // annual
  return d;
}

function windowStart(frequency: string, end: Date): string {
  const d = new Date(end);
  if (frequency === 'monthly') d.setMonth(d.getMonth() - 1);
  else if (frequency === 'quarterly') d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Run every active schedule whose next_run_at has passed: enqueue + run a job,
 * advance next_run_at, stamp last_run_at. Called by the node-cron tick (and
 * directly in tests). Returns how many ran.
 */
export async function runDueSchedules(
  db: Db,
  filesDir: string,
  now: Date = new Date(),
): Promise<number> {
  const due = await db
    .select()
    .from(scheduledExport)
    .where(
      and(
        eq(scheduledExport.isActive, true),
        lte(scheduledExport.nextRunAt, now.toISOString()),
      ),
    );
  let ran = 0;
  for (const s of due) {
    const jobId = uuidv7();
    await db.insert(exportJob).values({
      id: jobId,
      templateId: s.templateId,
      programId: s.programId,
      status: 'queued',
      periodStart: windowStart(s.frequency, now),
      periodEnd: now.toISOString().slice(0, 10),
    });
    await runExportJob(db, jobId, filesDir);
    await db
      .update(scheduledExport)
      .set({
        lastRunAt: now.toISOString(),
        nextRunAt: nextRunAfter(s.frequency, now).toISOString(),
      })
      .where(eq(scheduledExport.id, s.id));
    ran++;
  }
  return ran;
}
