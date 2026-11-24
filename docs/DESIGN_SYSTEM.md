# Wasl design system (v2.1 "Ivory")

Wasl v2 removed the v1 "sketchbook" look (hand-drawn borders, handwritten fonts, offset shadows, cartoon
machinery). v2.1 replaces the cold white-and-blue SaaS palette that followed with a warm, editorial identity:
cream and ivory surfaces, ink text, one brand blue used sparingly, hairline separators instead of boxes.
The goal is a career workspace that reads like a well-set professional document.

## Principles

1. **No pure white.** No light-mode surface is `#FFFFFF`. Surfaces are layered by tone (sand → cream → ivory),
   not by shadows. The only white left is in exported CV files (PDF/DOCX), which stay plain for ATS systems
   and printers.
2. **Content first, containers second.** Sections, headings, hairline dividers and lists. A bordered surface
   only when grouping genuinely helps (a form, a document preview, an evidence panel, a data table).
3. **One accent.** Brand blue marks the primary action, the active navigation item, links and selected
   controls. Green / amber / red are reserved for verification states, warnings, errors and operations.
4. **Layouts follow the task.** Documents get a split editor/preview; lists get dense rows; the dashboard is an
   editorial introduction; the admin console is technical and data-dense.
5. **Functional motion only.** Fades for overlays, spinners for work in progress.
6. **Bilingual by construction.** Logical properties (`ms-`, `ps-`, `start-`), no letter-spacing on Arabic,
   direction-implying icons get `rtl:rotate-180`.

## Colour tokens (`frontend/src/app/globals.css`)

| Token | Light | Dark | Tailwind | Use |
|---|---|---|---|---|
| `--bg` | `#F5F1E8` | `#14161B` | `bg-bg` | page |
| `--bg-sidebar` | `#EFEADF` | `#111317` | `bg-sidebar` | navigation rail, mobile header |
| `--surface` | `#FAF7F0` | `#1B1E24` | `bg-surface` | primary surface: panels, rows, editors |
| `--surface-elevated` | `#FCFAF5` | `#22262D` | `bg-surface-elevated` | dialogs, drawers, menus, selected segment |
| `--surface-2` | `#EDE6D8` | `#23272F` | `bg-surface-2` | secondary: hover, table heads, tracks |
| `--surface-3` | `#E8E0D2` | `#2B3039` | `bg-surface-3` | subtle accent (avatars, chips) |
| `--field` | `#FCFAF4` | `#181B20` | `bg-field` | text inputs |
| `--paper` | `#FDFBF6` | `#1E2127` | `bg-paper` | in-app CV preview |
| `--border` | `#D8CFC0` | `#30353F` | `border-border` | section rules |
| `--border-soft` | `#E4DCCD` | `#272B33` | `border-border-soft` | row dividers, panel outlines |
| `--border-strong` | `#8F846F` | `#6E7482` | `border-border-strong` | form controls (≥ 3:1) |
| `--text` | `#202B3C` | `#ECE7DD` | `text-fg` | primary text |
| `--text-2` | `#4D5360` | `#BFB8AA` | `text-fg-2` | secondary text |
| `--text-3` | `#646052` | `#9C9587` | `text-fg-3` | muted / metadata |
| `--primary` | `#0B57C9` | `#7AA9F7` | `bg-primary` | primary action, active state |
| `--primary-hover` | `#0848A8` | `#9BBEF9` | `hover:bg-primary-hover` | |
| `--primary-soft` | `#E5EBF4` | `#1C2A42` | `bg-primary-soft` | selection |
| `--primary-text` | `#0A4FB8` | `#9BBEF9` | `text-primary-text` | links on surfaces |
| `--on-primary` | `#FBF9F4` | `#0E1626` | `text-on-primary` | text on blue / status fills |
| ok / warn / bad | `#0F6B4C` / `#8A4B08` / `#A61B12` | `#5CC99A` / `#E8B363` / `#F08C80` | `text-ok`, `bg-ok-soft` … | status only |

Measured contrast (WCAG 2.x formula): every text token is ≥ 4.5:1 on every surface token in both themes
(lowest: `--text-3` on `--surface-3` = 4.8:1 light, 5.0:1 dark); `--border-strong` is ≥ 3:1 against `--bg`
and `--surface` (control boundaries). Shadows are warm-tinted (`rgb(74 58 30 / …)`) and limited to overlays and
the document preview. The dark theme is a warm charcoal with a hint of navy, not an inversion: its own surface
ramp, warm off-white text and a lighter brand blue.

## Typography

* **Inter** for English UI, **IBM Plex Sans Arabic** for Arabic (selected automatically under `dir="rtl"`).
* **Newsreader** (`.font-display`) only for marketing headlines (landing, auth) and the workspace greeting. In
  Arabic, `.font-display` falls back to Plex Sans Arabic semibold.
* Scale: `text-display` 60px (hero only) · `text-title` 28px (page title) · `text-heading` 17px (section) ·
  `text-sm` dense UI · `text-[15px]` reading copy · `text-xs` metadata. `.num` for tabular numbers.
* `.eyebrow` is a quiet sentence-case label (not uppercase). Uppercase is kept only for CV section headings,
  where it is the document convention.

## Components (`frontend/src/components/ui`, `feedback.tsx`, `claims.tsx`)

| Component | Use |
|---|---|
| `Button` (`primary`, `secondary`, `outline`, `ghost`, `subtle`, `danger`, `danger-solid`, `link`) | One primary per view. |
| `PageHeader` | Title, one-line purpose, actions. No container. |
| `Section` | Heading + description + content, no container. |
| `List` / `ListItem` | Open rows between two rules (no box). |
| `MetricRow` + `Stat` | One strip of metrics separated by hairlines. |
| `Card` | Soft-bordered surface — only where grouping helps. |
| `Badge`, `Status` | Short labels; status dot + text for states. |
| `Input`, `Textarea`, `Select`, `Field`, `Segmented`, `Checkbox` | Forms on `--field` with `--border-strong`. |
| `Dialog`, `ConfirmDialog`, `DrawerContent`, `Tabs`, `Switch`, `Tooltip` | Radix overlays on `--surface-elevated` over `--scrim`. |
| `Loading`, `SkeletonRows`, `AiWorking`, `EmptyState`, `ErrorNote`, `Notice` | `EmptyState` is a quiet note with a rule on the start side, never a dashed box. |
| `ClaimReportPanel`, `ClaimSummary` | Evidence-verification results for AI text. |

## Do / don't

* Do use real data only. Empty states explain how to get data; they never show sample numbers.
* Do label AI output as a draft until the user reviews it.
* Don't use `#fff`, `bg-white` or raw Tailwind palette colours (`slate-*`, `blue-*` …) — use tokens. The QA
  script fails a page if any element larger than 8×8 px computes to `rgb(255, 255, 255)`.
* Don't use dashed boxes, nested cards, coloured icon tiles, gradients, glass effects, decorative shapes or
  more than one shadow level per view.
* Don't expose operational data (provider stats, cost, evaluation) outside `/admin`.

## Verification

`frontend/scripts/qa-visual.mjs` (local only) renders 12 routes × 6 widths (1440, 1280, 1024, 768, 390, 320) ×
light/dark × English/Arabic against a production build, runs axe-core (WCAG 2.0/2.1/2.2 A and AA rules), and
checks horizontal overflow, pure-white surfaces and console errors. Results for this version are in
`docs/QA_REPORT.md`; screenshots in `docs/screenshots/v2-ivory/` (before: `docs/screenshots/before/`).
