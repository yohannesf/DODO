# DODO — Visual Redesign Brief

**Replaces `docs/design-language.md` in full.** Hand this to Claude Code as the new
design language. Scope: look and feel only — do **not** change data model, sync
protocol, routing, or business logic. Restyle the component kit, tokens, chart theme,
and map style. Keep Radix primitives; keep the in-house kit (still no pre-styled
component library).

---

## 0. Why we are changing it

The previous language ("utilitarian editorial": warm cream `#FAF8F4`, hairline rules,
zero radius, big section numerals, single cobalt accent, near-monochrome) reads as
_under-designed_, not minimal. Two specific reasons:

1. Warm-cream + hairline + broadsheet density is a generic default look, not a
   distinctive choice. It appears regardless of subject.
2. Near-monochrome + oversized whitespace produced empty, low-density screens.

This brief moves the entire surface off that cluster into a **cool, technical,
instrument-panel** direction that is denser, framed, and has a real color system.

---

## 1. Concept — "Field Instrument"

DODO's subject is field measurement under intermittent connectivity: indicators,
water points, boreholes, org-unit polygons on maps, and the constant online/offline
reconciliation that is literally the product name. The interface should feel like a
**measurement / control surface** — closer to an engineering dashboard or a survey
instrument than a document or a SaaS marketing site.

- Cool neutral surfaces (survey-paper / blueprint gray), not warm cream.
- Everything is **framed**: panels with a header strip, a body, and a footer toolbar.
  Nothing floats on empty background.
- Dense by default. Tables and numbers are the product.
- One bold, product-specific signature: the **Sync Gauge** (Section 7).

---

## 2. Color tokens

Cool, technical palette. Define these as the single token source (CSS custom
properties / Tailwind v4 `@theme` / vanilla-extract — match the repo's existing
mechanism). Light theme is primary; dark theme values follow.

### Surfaces (light)

```
--canvas        #E8ECEF   /* app background, cool gray-blue */
--panel         #F8FAFB   /* panel body, near-white cool */
--panel-raised  #DCE3E8   /* panel header strip, raised controls */
--sunken        #D0D8DE   /* table header, inset wells */
--border        #BCC6CE   /* hairline 1px */
--border-strong #94A2AD   /* panel outer, focus rings base */
```

### Ink

```
--ink           #141A20   /* primary text, cool near-black */
--ink-muted     #48535D   /* secondary text, labels */
--ink-faint     #79868F   /* captions, disabled, axis text */
```

### Brand + interaction

```
--primary       #1C4E80   /* blueprint blue — buttons, links, selection */
--primary-hover #143A61
--primary-tint  #D6E2F0   /* selected rows, active nav, info fills */
--on-primary    #FFFFFF
--focus         #1C4E80   /* 2px ring, 2px offset */
```

### Semantic (data meaning only — never decorative)

```
--ok       #2E7D32   /* on-track, ≥100% vs target, online */
--warn     #C77D11   /* 70–99%, unsynced/pending, attention */
--danger   #C0392B   /* <70%, error, conflict */
--info     #1C4E80   /* = primary */
```

### Categorical chart palette (8, ordered; colorblind-aware on cool gray)

```
#1C4E80  #C2570B  #2E7D6B  #8A4F9E  #B23A48  #5B6E8C  #C99A1E  #3F8E8C
```

Use in this order for series. For >8 series, dash/pattern instead of recycling hues.

### Dark theme

```
--canvas #12171C  --panel #1B232A  --panel-raised #27313A  --sunken #2E3941
--border #38444E  --border-strong #5A6B77
--ink #E3E9ED  --ink-muted #A4B0B9  --ink-faint #6F7E88
--primary #5B9BD5  --primary-hover #7DB1E0  --primary-tint #1E3653  --on-primary #0B1116
/* semantic + categorical: same hues, lifted ~12% lightness */
```

---

## 3. Typography

Type is a deliberate part of the identity, not a neutral carrier. Self-host all faces.

- **Display / headers / KPI numerals:** **Archivo** (use heavier weights 600–800; the
  Expanded optical width for large KPI numbers gives the instrument-panel look).
- **Body / UI:** **Archivo** (400–500).
- **Data / tabular / captions / code:** **IBM Plex Mono**, always
  `font-variant-numeric: tabular-nums`.

Alternate if Archivo is not wanted: Hanken Grotesk (UI) + IBM Plex Mono (data).
Do **not** use Inter or Geist as primary (generic signal), and no high-contrast
display serif (that's the cream-cluster default we are leaving).

### Scale (rem, 16px base)

```
display   2.0   / 700  / -0.01em   /* KPI numbers, page section title */
h1        1.5   / 700
h2        1.125 / 600
body      0.875 / 400               /* default UI text */
data      0.8125/ 450 mono tnum     /* table cells, numeric fields */
label     0.6875/ 600 caps  +0.06em /* eyebrows, column headers, status */
```

Section markers (the old big `01 / 04 / 05`): remove. They encoded nothing —
the nav already names the page. Reclaim that vertical space for content.

---

## 4. Layout & density

- **App shell:** fixed left rail `240px` (`--panel`, active item filled `--primary-tint`
  with `--primary` text + 2px left bar). Persistent top **context bar** `48px` holding:
  current org unit, current period, and the Sync Gauge (Section 7).
- **Content grid:** 12-column, 16px gutter, fills available width (data wants width —
  no narrow centered column). Panels span column ranges.
- **Density:** compact is the **default** on all data screens. Table row 32px compact /
  40px comfortable; a density toggle lives in the table toolbar.
- **Radius:** `4px` on panels, inputs, buttons (not 0 — small radius reads like an
  instrument bezel and differentiates from the broadsheet default).
- **Elevation:** surface tiers + 1px borders. **No drop shadows on cards.** One soft
  shadow allowed for transient overlays only (menus, dialogs, popovers).
- **Spacing base:** 4px. Panel padding 12–16px; panel header 36px.

---

## 5. The Panel (core structural change)

Every dashboard widget, chart, map, table, and form section becomes a **Panel**:

```
┌─────────────────────────────────────────────┐
│ HEADER  title (label caps)        [toolbar] │  36px, --panel-raised, 1px bottom border
├─────────────────────────────────────────────┤
│ BODY    content (chart / table / form)      │  --panel
│                                             │
├─────────────────────────────────────────────┤  (footer optional)
│ FOOTER  meta / pagination / source stamp    │  28px, --ink-faint, top hairline
└─────────────────────────────────────────────┘
```

- **Header toolbar** = the per-widget actions the competitor portals have and DODO
  lacks: `fullscreen`, `download ▾` (PNG / CSV / XLS), `view as table`. Icon buttons,
  ghost style, revealed on hover/focus, always keyboard reachable.
- This single device removes the "floating thing on empty paper" problem and makes
  every screen read as finished.

---

## 6. Components (restyle these primitives)

- **Button:** primary (filled `--primary`), secondary (outline `--border-strong` on
  `--panel`), ghost (text only), danger (outline → fill `--danger` on hover).
  Height 32 compact / 36 default. 4px radius. No full-round.
- **Input / Select / Date:** `--panel` fill, 1px `--border`, 4px radius, focus = 2px
  `--focus` ring + offset. Mono for numeric inputs.
- **Tabs** (Configure uses them): underline-style, active tab `--ink` with 2px
  `--primary` underline; no pill tabs.
- **Table (first-class):** sticky header + sticky first column; column headers in
  `label` caps on `--sunken`; 1px row rules in `--border`; right-aligned mono numerals;
  row hover `--primary-tint` at low alpha; sortable headers; density toggle; zebra OFF.
- **KPI stat block:** big Archivo number (`display`), `label`-caps caption, a **real**
  inline sparkline (1px `--primary` line + single end dot — not solid bars), and a
  delta-vs-target chip colored by `--ok/--warn/--danger`.
- **Status:** keep typographic, refine — `label`-caps + leading glyph:
  `● ONLINE` (`--ok`) / `◌ UNSYNCED` (`--warn`) / `▲ CONFLICT` (`--danger`).
  No pill badges anywhere.
- **Empty state:** never blank. State what to do next and link the action
  ("No dataset selected. Choose a dataset to begin entry." + the selector).

---

## 7. Signature element — the Sync Gauge

The one bold, product-specific component. Lives in the top context bar, always visible.
A compact instrument showing the thing no other M&E tool foregrounds: live connection
and outstanding offline work.

```
┌───────────────────────────────┐
│ ● ONLINE   ◷ synced 2m ago     │   online: --ok dot
│ ▣ 0 unsynced                   │   any pending: count in --warn, becomes the focus
└───────────────────────────────┘
```

States: ONLINE/synced (calm, `--ok`), ONLINE/syncing (animated, `--primary`),
OFFLINE with N unsynced (`--warn`, count prominent), CONFLICT (`--danger`, links to
resolver). Clicking opens the Sync Center. This is the only place a small,
purposeful animation is allowed (a 1.2s sync pulse). Spend the boldness here; keep
everything else quiet.

---

## 8. Charts & maps (theme, not per-chart styling)

- **ECharts theme object** (register once): `--canvas`-transparent background, axis
  line `--border`, axis label `--ink-faint` mono, faint horizontal split lines only,
  categorical palette from §2, line width 2px, symbol size 5, tooltip on `--panel`
  with 1px `--border` and 4px radius. Legend rendered **outside** the plot
  (right column or top), never overlapping — this fixes the Explore overlap bug.
- **MapLibre style:** ship a self-hosted PMTiles basemap and a minimal cool style
  (land `--panel`, water `--primary-tint`, admin borders `--border-strong`). Org-unit
  polygons: `--ink` 1px outline, fill `--primary` at 8% alpha. Indicator points:
  **graduated symbols** colored by vs-target ramp (`--ok/--warn/--danger` + `--ink-faint`
  for no-target). The current all-gray dots = wire the data join to the color ramp.

---

## 9. Anti-generic guardrails (hard rules)

Do **not** introduce any of: pill-shaped badges; indigo/violet/purple; gradients of
any kind; glassmorphism / backdrop blur; drop-shadow floating cards; full-round
(9999px) anything except avatars; emoji in UI; skeleton-shimmer everywhere; warm-cream
backgrounds; high-contrast display serif. These are the looks we are explicitly
leaving.

---

## 10. Migration steps for Claude Code

1. Replace `docs/design-language.md` with this file's content.
2. Rewrite the token file (single source) with §2 values; add dark theme.
3. Add and self-host Archivo + IBM Plex Mono; wire the §3 scale.
4. Build the **Panel** component (header/body/footer + toolbar) and convert every
   existing card/widget to it.
5. Add the persistent top **context bar** and the **Sync Gauge** (§7).
6. Restyle primitives per §6; delete the big section-number component.
7. Register the ECharts theme (§8); move all legends outside plots.
8. Apply the MapLibre style + wire indicator color join (§8); confirm the basemap
   actually renders.
9. Set compact density as the default on data screens.
10. Add a `/dev/styleguide` preview route rendering every primitive, the Panel, the
    Sync Gauge in all states, a sample chart, and a sample table — in light and dark.
11. Keep the quality floor: AA contrast, visible keyboard focus, `prefers-reduced-motion`
    respected (disables the sync pulse), responsive down to mobile.

Commit rules unchanged (imperative, lowercase, ≤50 chars, no trailers/emojis).
Suggested commits: `add cool token palette`, `add panel component`,
`add sync gauge`, `restyle buttons and inputs`, `add echarts theme`,
`fix legend overlap in explore`, `style maplibre basemap`, `add styleguide route`.

## 11. Done when

`/dev/styleguide` renders all primitives in both themes; dashboard, maps, and explore
use Panels with working header toolbars; legends never overlap plots; basemap and
indicator coloring render; compact density is default; no item in §9 appears anywhere;
contrast/focus/reduced-motion pass.
