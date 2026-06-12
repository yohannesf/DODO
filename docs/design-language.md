# DODO design language

Utilitarian editorial — closer to a well-set field notebook or a Swiss
timetable than a startup landing page. The product must not look like
default AI-generated SaaS (Inter + shadcn pills + purple gradients +
glassmorphism). All UI work follows this document; the tokens live in
`packages/web/src/styles/index.css` and are the single source of truth.

## Typography is the interface

- UI text: **IBM Plex Sans**, self-hosted (no font CDNs).
- ALL numerals in tables, KPIs, and charts: **IBM Plex Mono** or Plex Sans
  with `font-variant-numeric: tabular-nums` (the `tnum` utility).
- Generous type-scale contrast: 12–14 px dense data against 28–40 px
  section numerals.
- Plex is licensed under the SIL Open Font License 1.1 and is bundled as a
  build asset (`@fontsource/*` dev dependencies), not a runtime dependency.

## Color

| Token         | Value     | Use                                            |
| ------------- | --------- | ---------------------------------------------- |
| `paper`       | `#FAF8F4` | app background (paper-warm)                    |
| `surface`     | `#FFFEFB` | raised surfaces: inputs, dialogs, hovered rows |
| `ink`         | `#1C1A15` | text, strong borders                           |
| `ink-muted`   | `#6F6A5E` | secondary text                                 |
| `hairline`    | `#E3DFD4` | 1 px rules and borders                         |
| `cobalt`      | `#1F3FBF` | THE accent — interaction states only           |
| `cobalt-deep` | `#182F8F` | accent hover/active                            |
| `ochre`       | `#9A6B00` | data meaning: warning                          |
| `ontrack`     | `#2E6E3E` | data meaning: on-track                         |
| `offtrack`    | `#B3261E` | data meaning: off-track / error                |

Semantic colors are used **only** for data meaning, never decoration.
Dark theme (later) is true ink-dark with the same discipline. No
gradients, no glass, no glow, no shadows.

## Shape & density

- Radii 2–4 px maximum (`rounded-xs` … `rounded-lg`).
- Hairline 1 px borders instead of drop shadows.
- Density toggle comfortable/compact; compact is the default on data
  screens.

## Tables are first-class citizens

Sticky headers and first column, row hover, keyboard navigation,
right-aligned tabular numbers, zebra OFF, hairline rules. Use the
`Table/THead/TBody/Tr/Th/Td` primitives; numeric cells take `numeric`.

## Status is typographic, not pill-shaped

Small-caps text with a leading glyph instead of rounded badges:

```
● SYNCED   ◌ PENDING   ▲ CONFLICT
```

Use the `small-caps` utility. Never render status as a pill.

## Motion

120–160 ms ease-out on state changes only. No springy entrance
animations. Respect `prefers-reduced-motion`.

## Components

Built in-house on Radix primitives (unstyled, accessible) + Tailwind v4
with the locked token file. **Never install a pre-styled component
library** (no shadcn/MUI/Ant). Current kit: `Button`, `Input`, `Table`,
`Dialog` in `packages/web/src/components/`.

## Empty states teach

Every empty state says what to configure next and where — never
decoration, never a lone illustration.
