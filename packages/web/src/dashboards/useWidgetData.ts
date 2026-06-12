// Widget data with offline cache (spec §8.6): last-fetched analytics live in
// Dexie so dashboards render offline with a "data as of <ts>" stamp.
import { useEffect, useState } from 'react';
import { resolveRelativePeriods, type RelativePeriod } from '@dodo/shared';
import { fetchAnalytics, type AnalyticsResult } from '../api/analytics';
import { getDb, hasDb } from '../db/db';

export interface WidgetQuery {
  dx: string[];
  ouIds: string[];
  ouMode: 'selected' | 'subtree';
  relativePeriod: RelativePeriod;
  peTotal?: boolean;
}

export interface GlobalFilters {
  ouId?: string | null;
  relativePeriod?: RelativePeriod | null;
}

export interface WidgetData {
  result: AnalyticsResult | null;
  periods: string[];
  /** set when served from the offline cache */
  asOf: string | null;
  loading: boolean;
  error: string | null;
}

export function effectiveQuery(query: WidgetQuery, filters: GlobalFilters): WidgetQuery {
  return {
    ...query,
    ouIds: filters.ouId ? [filters.ouId] : query.ouIds,
    relativePeriod: filters.relativePeriod ?? query.relativePeriod,
  };
}

export function useWidgetData(
  query: WidgetQuery | null,
  filters: GlobalFilters,
): WidgetData {
  const [state, setState] = useState<WidgetData>({
    result: null,
    periods: [],
    asOf: null,
    loading: true,
    error: null,
  });

  const effective = query ? effectiveQuery(query, filters) : null;
  const key = effective ? JSON.stringify(effective) : null;

  useEffect(() => {
    if (!key || !effective) {
      setState((s) => ({ ...s, loading: false, error: 'widget not configured' }));
      return;
    }
    let cancelled = false;
    const periods = resolveRelativePeriods(effective.relativePeriod);

    async function load() {
      try {
        const result = await fetchAnalytics({
          dx: effective!.dx,
          ou: effective!.ouIds,
          pe: periods,
          ouMode: effective!.ouMode,
          peTotal: effective!.peTotal ?? true,
        });
        if (cancelled) return;
        setState({ result, periods, asOf: null, loading: false, error: null });
        if (hasDb()) {
          await getDb().widgetCache.put({
            key: key!,
            data: result,
            fetchedAt: new Date().toISOString(),
          });
        }
      } catch {
        // offline or server unreachable → serve the last-fetched data
        if (!hasDb()) {
          if (!cancelled)
            setState((s) => ({ ...s, loading: false, error: 'offline, no cache' }));
          return;
        }
        const cached = await getDb().widgetCache.get(key!);
        if (cancelled) return;
        if (cached) {
          setState({
            result: cached.data as AnalyticsResult,
            periods,
            asOf: cached.fetchedAt,
            loading: false,
            error: null,
          });
        } else {
          setState((s) => ({
            ...s,
            loading: false,
            error: 'offline — no cached data yet',
          }));
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [key]); // key encodes the whole query

  return state;
}
