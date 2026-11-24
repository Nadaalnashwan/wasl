# Wasl design system (v2)

Wasl v2 replaces the v1 "sketchbook" look (hand-drawn borders, handwritten fonts, offset shadows,
cartoon machinery) with a restrained, editorial product UI. The goal is a career workspace that
reads like a professional document tool.

## Principles

1. **Content first, containers second.** Not everything needs a box. Use sections, headings,
   hairline dividers and lists. Use a bordered surface only when grouping genuinely helps
   (a form, a document preview, an evidence panel).
2. **One accent.** Brand blue (`--primary`) marks the primary action and the active state. Status
   colours (ok / warn / bad) are reserved for status.
3. **Layouts follow the task.** Documents get a split editor/preview; lists get dense rows; analyses
   get an editorial column. Do not repeat "title → 4 stat cards → card grid" on every page.
4. **Functional motion only.** Fades for overlays, spinners for work in progress. No decoration.
5. **Bilingual by construction.** Logical properties (`ms-`, `me-`, `ps-`, `start-`, `end-`), no
   letter-spacing on Arabic, icons that imply direction get `rtl:rotate-180`.

## Tokens (`frontend/src/app/globals.css`)

| Token | Light | Dark | Tailwind |
|---|---|---|---|
| `--bg` | `#F6F8FB` | `#0B1120` | `bg-bg` |
| `--surface` | `#FFFFFF` | `#111827` | `bg-surface` |
| `--surface-2` | `#F1F4F9` | `#162033` | `bg-surface-2` |
| `--border` | `#E2E8F0` | `#243047` | `border-border` |
| `--border-strong` | `#CBD5E1` | `#33425F` | `border-border-strong` |
| `--text` | `#0F172A` | `#E8EDF5` | `text-fg` |
| `--text-2` | `#475569` | `#A9B4C6` | `text-fg-2` |
| `--text-3` | `#64748B` | `#8592A8` | `text-fg-3` |
| `--primary` | `#0B57C9` | `#5B9DFF` | `bg-primary`, `text-primary` |
| `--primary-soft` | `#EAF1FC` | `#14284A` | `bg-primary-soft` |
| `--primary-text` | `#0B4FB5` | `#8DBBFF` | `text-primary-text` (links on surfaces) |
| ok / warn / bad | `#047857` / `#A15C07` / `#B42318` | `#4FD1A0` / `#F0B45A` / `#FF8A80` | `text-ok`, `bg-ok-soft` … |

Text colours meet WCAG AA (4.5:1) on `--surface` and on their own `*-soft` fill in both themes.

## Typography

* English: **Inter** (`--font-inter`). Arabic: **IBM Plex Sans Arabic** (`--font-plex-ar`), selected
  automatically under `dir="rtl"`.
* Scale: `text-display` (marketing hero only) · `text-title` (page title, 26px) · `text-heading`
  (section, 17px) · `text-sm` body in dense UI, `text-[15px]` for reading copy · `text-xs` metadata.
* `.num` for tabular numbers, `.eyebrow` for small uppercase labels above titles (English only).

## Components (`frontend/src/components/ui`, `feedback.tsx`, `claims.tsx`)

| Component | Use |
|---|---|
| `Button` (`primary`, `secondary`, `outline`, `ghost`, `subtle`, `danger`, `danger-solid`, `link`) | One primary per view. Defaults to `type="button"`. |
| `PageHeader` | Title, one-line purpose, actions. Bottom hairline. |
| `Section` | Heading + description + content, no container. |
| `List` / `ListItem` | Divided rows inside one surface. |
| `MetricRow` + `Stat` | Metrics separated by hairlines (one strip, not four cards). |
| `Card` | Bordered surface; `tone="muted"` / `"brand"` for emphasis. |
| `Badge`, `Status` | Short labels; status dot + text for states. |
| `Input`, `Textarea`, `Select`, `Field`, `Segmented`, `Checkbox` | Forms; `Field` handles label, hint, error. |
| `Dialog`/`DialogContent`, `ConfirmDialog`, `DrawerContent`, `Tabs`, `Switch`, `Tooltip` | Radix-based overlays. |
| `Loading`, `SkeletonRows`, `AiWorking`, `EmptyState`, `ErrorNote`, `Notice` | Async + empty states. |
| `ClaimReportPanel`, `ClaimSummary` | Evidence-verification results for AI text. |

## Do / don't

* Do use real data only. Empty states explain how to get data; they never show sample numbers.
* Do label AI output as a draft until the user reviews it.
* Don't use rotated elements, hand-drawn SVG, decorative illustrations, gradients on surfaces,
  pill-shaped everything, or more than one shadow level per view.
* Don't expose operational data (provider stats, cost, evaluation) outside `/admin`.
