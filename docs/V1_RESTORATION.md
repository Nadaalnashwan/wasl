# Wasl V2 → V1 structure, evolved maturity — restoration plan

Reference: V1 = `backup/v1-main` (1704ae8), run locally beside V2 with the same seeded data, every page compared side by side.
Rule: restore V1's information architecture, layouts, section order, navigation and component language; keep every V2
feature, API and permission. Mature the execution (even radii, 1.5px ink lines, real type scale, no grid, no wobble,
no hand font, line illustrations), keep the paper + ink + brand blue palette and the navy "Blueprint" dark mode.

## Shared (every page)
| Area | V1 | V2 today | Restore |
|---|---|---|---|
| Sidebar | Paper rail, ink divider; groups WORKSPACE / CAREER TOOLS / SYSTEM (tracked caps); items Career Hub, Post Studio, CV Manager · Job Matches, CV Tailoring, Gap Analyzer · Monitoring, Settings; active = ink-outlined sky pill with offset shadow; bottom: theme pill (Blueprint/Paper) + language pill, outlined user card | Tinted rail; groups Workspace/Career tools/Account; Overview, Achievements, Master CV, Content Studio, Jobs, Tailor a CV, Skill gaps, Settings, Admin console; icon toggles | V1 rail, groups, names and order. V2 additions placed inside V1's structure: Achievements in Workspace (after CV Manager), Monitoring in System only for admins (→ admin console, server-checked as today) |
| Mobile | Top bar: menu button, logo, toggles; drawer with nav + user card | similar | V1 top bar and drawer |
| Page header | Large title with blue scribble underline, subtitle, actions/illustration at the end; no banner | Coloured banner per area with spot art | V1 header (title + underline + sub + actions; optional small line illustration, as V1 Jobs) |
| Cards | `sketch` ink cards with offset shadow; card titles = outlined sky icon square + title; inner items = thinner outlined cards; sky-filled emphasis cards | hairline lists, few cards | Ink cards (even 14px radius, 1.5px ink, 4px offset shadow that mirrors in RTL); `ink-soft` inner items; `sky` tone |
| Buttons | Outlined ink buttons with offset shadow; primary = brand fill | flat secondary | Primary brand + ink outline + shadow; secondary paper + ink outline + shadow |
| Tabs | Pill buttons (active filled ink) | underline tabs | Pill tabs |
| Badges | Outlined pills | soft chips | Outlined pills |
| Empty states | Dashed box, centred illustration, title, text, action | sky note row | Dashed box with line illustration |
| Stats | Four stat cards (icon + label, big number, hint; first is sky) | metric row | Stat cards |

## Pages
- **Landing**: already V1 composition (v2.4). Keep; align nav pills/labels with the shell.
- **Auth**: V1 = illustration + tagline on the start side, form card on the end side. Restore that order; keep V2 auth features (forgot/reset/LinkedIn/confirm).
- **Career Hub (dashboard)**: V1 = "Hello, {name}" with marker on the name + sub; quick-action pills (Post Studio [sky], Job Matches, CV Tailoring); 4 stat cards (Confirmed achievements [sky], Waiting for review, LinkedIn posts (n drafts), Master CV vN + date); two columns: Recent activity (outlined activity items) | Top job matches, Next best steps (sky card, priority pills), Master CV (section pills, latest analysis %, CV Manager button). V2 data kept (needs-attention items become Next best steps; drafts shown in Recent activity).
- **Achievements** (V2 only): V1 page anatomy — header + Add action, pill tabs (Waiting for review / Confirmed / Rejected), filters, activity-style outlined items; drawer/dialogs restyled.
- **Post Studio**: V1 = composer card with pill tabs (Generate post / Improve my wording), field, style wishes, tone chips, language pills, Generate + Evaluate for CV | "Preview" card; "Drafts & history" grid with Edit. Keep V2 sources (achievement / describe), evidence review, images, publish.
- **CV Manager**: V1 = header actions Upload CV + Edit CV; main card "Current Master CV vN" with PDF/DOCX and the document; side: Version history card, Tailored versions card. V2 editor becomes the "Edit CV" mode; suggestions shown as a card above the document; restore/history in the side card.
- **Job Matches**: V1 = header with arm illustration + Find new jobs (+ last searched); pill tabs Recommended / Saved & tracked; job cards; dashed empty state. Keep V2 tracker, detail, scoring.
- **CV Tailoring / Gap Analyzer**: V1 = two columns: input card (Job description, counter, primary action) | sky "Previous …" history card; results below. Keep V2 review flows.
- **Settings**: V1 = two-column cards: Profile (name, headline, email, interface language, Save) | Connections. V2 extra sections become cards in the same two columns (AI provider, API keys, Privacy, Data & account).
- **Admin console**: V2 only; inherits the shared cards/header/buttons.

## Verification
Same seeded data in V1 and V2; side-by-side screenshots; qa-visual full matrix (6 viewports × light/dark × EN/AR, axe, overflow, console); auth, studio and evidence-review e2e; backend tests (unchanged backend).

## Result (implemented)
All pages above follow the V1 organisation. Shared pieces live in `components/ui/card.tsx` (Card, CardTitle, StatCard,
PageHeader, Badge), `components/ui/button.tsx`, `components/ui/overlay.tsx` (pill tabs, dialogs), `components/feedback.tsx`
(dashed EmptyState) and `app/globals.css` (`.ink-card`, `.ink-soft`, `.ink-dashed`, `.ink-chip`, `.ink-btn`).
No backend change. Checks: qa-visual full matrix 288 checks (6 viewports × light/dark × EN/AR) with 0 axe violations,
0 overflow, 0 console errors; auth 25/25, Post Studio 11/11, Evidence Review 19/19 end-to-end; backend 216 tests.
