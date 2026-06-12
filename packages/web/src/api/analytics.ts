import { api } from './client';

export interface AnalyticsRow {
  dx: string;
  ou: string;
  pe: string;
  value: number | null;
}

export interface AnalyticsResult {
  rows: AnalyticsRow[];
  meta: { names: Record<string, string> };
}

export function fetchAnalytics(params: {
  dx: string[];
  ou: string[];
  pe: string[];
  ouMode?: 'selected' | 'subtree';
  peTotal?: boolean;
}): Promise<AnalyticsResult> {
  const q = new URLSearchParams({
    dx: params.dx.join(';'),
    ou: params.ou.join(';'),
    pe: params.pe.join(';'),
    ouMode: params.ouMode ?? 'selected',
    ...(params.peTotal ? { peTotal: '1' } : {}),
  });
  return api.get(`/api/analytics?${q.toString()}`);
}

/** months from a YYYY-MM range, inclusive */
export function monthRange(from: string, to: string): string[] {
  const out: string[] = [];
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  if (!fy || !fm || !ty || !tm) return out;
  let y = fy;
  let m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 120) break;
  }
  return out;
}
