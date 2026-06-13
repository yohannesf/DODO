// Shared ECharts theme (design language §8). One source for chart styling so
// every chart matches the instrument palette and — critically — renders its
// legend OUTSIDE the plot (top, scrollable to one row) so it never overlaps
// the data. Axis/grid colours are read from the live CSS vars, so charts adapt
// to light/dark automatically.

// categorical palette (§2), colorblind-aware on cool gray, ordered
export const CHART_PALETTE = [
  '#1C4E80',
  '#C2570B',
  '#2E7D6B',
  '#8A4F9E',
  '#B23A48',
  '#5B6E8C',
  '#C99A1E',
  '#3F8E8C',
];

function cssVar(name: string): string {
  if (typeof document === 'undefined') return '';
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Common ECharts option fragment: palette, transparent background, mono axis
 * labels, faint horizontal split lines, a panel-coloured tooltip, and a
 * scrollable legend pinned to the top (outside the plot). Spread this into a
 * chart's option and add `xAxis.data` + `series`.
 */
export function chartBaseOption(opts: { legend?: boolean } = {}) {
  const border = cssVar('--border') || '#bcc6ce';
  const faint = cssVar('--ink-faint') || '#79868f';
  const ink = cssVar('--ink') || '#141a20';
  const panel = cssVar('--panel') || '#f8fafb';
  const showLegend = opts.legend ?? true;

  return {
    color: CHART_PALETTE,
    backgroundColor: 'transparent',
    textStyle: { fontFamily: 'IBM Plex Mono, ui-monospace, monospace', color: faint },
    grid: { left: 48, right: 12, top: showLegend ? 40 : 14, bottom: 26 },
    legend: showLegend
      ? {
          type: 'scroll' as const,
          top: 0,
          left: 0,
          right: 0,
          icon: 'rect',
          itemHeight: 8,
          itemWidth: 8,
          itemGap: 16,
          textStyle: { color: ink, fontSize: 11 },
          pageTextStyle: { color: faint },
          // long series names truncate; full name stays in the tooltip
          formatter: (name: string) =>
            name.length > 36 ? `${name.slice(0, 35)}…` : name,
        }
      : { show: false },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: panel,
      borderColor: border,
      borderWidth: 1,
      borderRadius: 4,
      textStyle: { color: ink, fontFamily: 'IBM Plex Mono, ui-monospace, monospace' },
    },
    xAxis: {
      type: 'category' as const,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: border } },
      axisLabel: { color: faint },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisLabel: { color: faint },
      splitLine: { lineStyle: { color: border, opacity: 0.6 } },
    },
  };
}

/** Per-series defaults — 2px lines, small symbols (§8). */
export const SERIES_DEFAULTS = {
  lineStyle: { width: 2 },
  symbolSize: 5,
} as const;
