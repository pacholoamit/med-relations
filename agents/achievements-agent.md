# AchievementsAgent — HTML Report Format Spec

This file defines the required output format for the AchievementsAgent's weekly HTML achievement report. When generating `reports/achievements/<YEAR>-W<WW>.html`, follow this spec exactly so the report integrates correctly with the med-relations site and build pipeline.

---

## Overview

Each report is a **self-contained HTML file** (no external CSS dependencies). It renders on a dark background (`#0f1117`) and loads Chart.js from CDN for the two donut charts.

---

## CRITICAL — pipeline contract

The following names are hard-wired into `scripts/build.js`. **Do not change them.**

| Required element | Exact value |
|---|---|
| Category chart canvas ID | `id="categoryChart"` |
| Priority chart canvas ID | `id="priorityChart"` |
| Category bug variable | `var bugCount = N;` |
| Category feature variable | `var featCount = N;` |
| Category enhancement variable | `var enhCount = N;` |
| Priority critical variable | `var critCount = N;` |
| Priority high variable | `var highCount = N;` |
| Priority normal variable | `var normCount = N;` |
| Priority low variable | `var lowCount = N;` |

Using any other name (e.g. `donutChart`, `bugFixes`, `const`, `let`) will cause the build to fail with a guard error.

Chart.js CDN script MUST be in `<body>` (or omit it — the achievements page now loads it from `<head>` automatically). Do NOT put it in `<head>` of the report file.

---

## File naming

`reports/achievements/<YEAR>-W<WW>.html` — e.g. `2026-W22.html`

---

## Required sections (in order)

1. **Stat grid** — 4 top-level metrics
2. **Category & Priority Breakdown** — two donut charts side by side
3. **Pull Requests table** — sorted by category, no Repo column
4. **Contributors table** — priority breakdown per contributor
5. **Additional Metrics** — supplemental KPIs

---

## 1. Stat grid

Four stat cards in a CSS grid. Each card uses a color-variant modifier class and contains an SVG icon, a value, a label, and a "this week" context sublabel.

| Label | Value format | Card class | Icon |
|---|---|---|---|
| PRs Merged | integer | `stat-card--accent` | git-pull-request |
| Lines Added | `+N` (green) | `stat-card--green` | trending-up |
| Lines Removed | `-N` (red) | `stat-card--red` | trending-down |
| Hotfixes | integer (yellow) | `stat-card--yellow` | zap |

HTML structure per card:

```html
<div class="stat-card stat-card--accent">
  <div class="stat-icon" aria-hidden="true"><!-- SVG icon --></div>
  <div class="stat-value">29</div>
  <div class="stat-label">PRs Merged</div>
  <div class="stat-period">this week</div>
</div>
```

Value color classes: `stat-value.green`, `stat-value.red`, `stat-value.yellow` (PRs Merged has no extra class).

---

## 2. Category & Priority Breakdown — two donut charts

Render both donuts inside a `<div class="charts-row">` so they sit side by side.

### Category chart (`id="categoryChart"`)

- Labels: Bug Fixes, New Features, Enhancements
- Colours: `#f87171`, `#818cf8`, `#34d399`
- Variables in script: `bugCount`, `featCount`, `enhCount`

### Priority chart (`id="priorityChart"`)

- Labels: Critical, High, Normal, Low
- Colours: `#f59e0b`, `#f87171`, `#94a3b8`, `#34d399`
- Variables in script: `critCount`, `highCount`, `normCount`, `lowCount`
- **Classification rule:** A PR is **Critical** if its title contains "hotfix" (case-insensitive) OR it carries a critical-urgency label. Otherwise derive priority from the PR's priority label (High / Normal / Low). When in doubt, default to Normal.

Each chart container: `<div class="chart-container">` with `<div class="chart-wrap"><canvas ...></canvas></div>` and a `<div class="legend">`.

---

## 3. Pull Requests table

### Column order (no Repo column)

| Column | Width | Notes |
|---|---|---|
| Title | ~50% | Linked to PR URL, `target="_blank"` |
| Category | ~15% | Badge: `badge-bug`, `badge-feature`, `badge-enhancement` |
| Priority | ~15% | Badge: `badge-critical`, `badge-high`, `badge-normal`, `badge-low` |
| Lines | ~20% | `+added / -removed` with `.lines-added` / `.lines-removed` classes |

**Do NOT include a Repo column.**

### Sort order

Sort `<tbody>` rows as follows (primary: category, secondary: priority):
1. Bug Fix — Critical first, then Normal/Low/High
2. New Feature — Critical first, then Normal/Low/High
3. Enhancement — Critical first, then Normal/Low/High

Priority rank within each category group: Critical (0) → High (1) → Normal (2) → Low (3).

### Badge classes

```
Bug Fix       → badge-bug
New Feature   → badge-feature
Enhancement   → badge-enhancement
Critical      → badge-critical
High          → badge-high
Normal        → badge-normal
Low           → badge-low
```

---

## 4. Contributors table

### Column order

| Column | Notes |
|---|---|
| Contributor | GitHub username linked to profile |
| Priority Breakdown | Inline badges (see format below) |
| Lines Added | `.lines-added` class |
| Lines Removed | `.lines-removed` class |

### Priority breakdown format

Use `<div class="priority-breakdown">` containing badge spans separated by `<span class="priority-sep">·</span>`:

```html
<div class="priority-breakdown">
  <span class="badge badge-critical">3 Critical</span>
  <span class="priority-sep">·</span>
  <span class="badge badge-high">1 High</span>
  <span class="priority-sep">·</span>
  <span class="badge badge-normal">2 Normal</span>
</div>
```

Omit priority levels with a count of zero. If a contributor has only one priority level, omit the separator.

### Priority classification

Use the same rule as the Priority chart: hotfix PRs count as Critical. Derive from PR title or label.

---

## 5. Additional Metrics

A `.metrics-grid` with `.metric-item` cards for supplemental stats (most active repo, avg PR size, revert count, PR velocity, etc.). Include whatever is available from the data.

---

## Required CSS variables

```css
:root {
  --bg: #0f1117; --card: #1a1d27; --border: #2a2d3a;
  --text: #e2e8f0; --muted: #718096; --accent: #6366f1;
  --green: #10b981; --red: #ef4444; --yellow: #f59e0b; --blue: #3b82f6;
}
```

## Typography

Import Inter from Google Fonts at the top of `<style>`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

Set on `body`:
```css
body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; ... }
```

Also add `<link rel="preconnect">` tags for `fonts.googleapis.com` and `fonts.gstatic.com` in `<head>`.

## Stat card CSS (full)

```css
@keyframes fadeSlideIn {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
.stat-card {
  background: var(--card); border: 1px solid var(--border);
  border-radius: .75rem; padding: 1.25rem 1.25rem 1rem;
  animation: fadeSlideIn 0.4s ease both;
  position: relative; overflow: hidden;
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  cursor: default;
}
.stat-card:hover { transform: translateY(-3px); }
.stat-card:nth-child(1) { animation-delay: 0ms; }
.stat-card:nth-child(2) { animation-delay: 60ms; }
.stat-card:nth-child(3) { animation-delay: 120ms; }
.stat-card:nth-child(4) { animation-delay: 180ms; }

/* Top glow accent line */
.stat-card::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 2px;
  border-radius: .75rem .75rem 0 0;
}
.stat-card--accent::before { background: var(--accent); box-shadow: 0 0 18px rgba(99,102,241,.65); }
.stat-card--green::before  { background: var(--green);  box-shadow: 0 0 18px rgba(16,185,129,.65); }
.stat-card--red::before    { background: var(--red);    box-shadow: 0 0 18px rgba(239,68,68,.65); }
.stat-card--yellow::before { background: var(--yellow); box-shadow: 0 0 18px rgba(245,158,11,.65); }

/* Color tint bg + hover glow */
.stat-card--accent { background: linear-gradient(145deg, rgba(99,102,241,.1) 0%, var(--card) 55%);  border-color: rgba(99,102,241,.25); }
.stat-card--green  { background: linear-gradient(145deg, rgba(16,185,129,.1) 0%, var(--card) 55%);  border-color: rgba(16,185,129,.25); }
.stat-card--red    { background: linear-gradient(145deg, rgba(239,68,68,.1) 0%, var(--card) 55%);   border-color: rgba(239,68,68,.25); }
.stat-card--yellow { background: linear-gradient(145deg, rgba(245,158,11,.1) 0%, var(--card) 55%);  border-color: rgba(245,158,11,.25); }
.stat-card--accent:hover { box-shadow: 0 12px 32px rgba(99,102,241,.22); border-color: rgba(99,102,241,.45); }
.stat-card--green:hover  { box-shadow: 0 12px 32px rgba(16,185,129,.22);  border-color: rgba(16,185,129,.45); }
.stat-card--red:hover    { box-shadow: 0 12px 32px rgba(239,68,68,.22);   border-color: rgba(239,68,68,.45); }
.stat-card--yellow:hover { box-shadow: 0 12px 32px rgba(245,158,11,.22);  border-color: rgba(245,158,11,.45); }

/* Icon badge */
.stat-icon {
  display: flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; border-radius: .5rem;
  margin-bottom: .875rem; flex-shrink: 0;
}
.stat-card--accent .stat-icon { background: rgba(99,102,241,.18); color: var(--accent); }
.stat-card--green  .stat-icon { background: rgba(16,185,129,.18);  color: var(--green); }
.stat-card--red    .stat-icon { background: rgba(239,68,68,.18);   color: var(--red); }
.stat-card--yellow .stat-icon { background: rgba(245,158,11,.18);  color: var(--yellow); }

.stat-label { font-size: .75rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
.stat-value { font-size: 2.5rem; font-weight: 700; line-height: 1; margin-bottom: .3rem; font-variant-numeric: tabular-nums; }
.stat-value.green { color: var(--green); }
.stat-value.red { color: var(--red); }
.stat-value.yellow { color: var(--yellow); }
.stat-period { font-size: .6875rem; color: rgba(113,128,150,.55); margin-top: .25rem; letter-spacing: .04em; }
```

## Section headings

Use left accent border instead of bottom border:
```css
h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1rem;
     padding-left: 0.75rem; border-left: 3px solid var(--accent); }
```

## Tables — striped + hover + sticky headers

```css
th { position: sticky; top: 0; background: var(--bg); z-index: 1; }
tbody tr:nth-child(even) td { background: rgba(255,255,255,0.025); }
tbody tr:hover td { background: rgba(99,102,241,0.08); transition: background 0.15s; }
```

## Chart containers

```css
.chart-container { box-shadow: 0 2px 8px rgba(0,0,0,0.3); }
.chart-container:nth-child(1) { border-left: 3px solid var(--accent); }
.chart-container:nth-child(2) { border-left: 3px solid #f59e0b; }
```

---

## Chart.js script tag

Load before the inline chart initialisation scripts:

```html
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
```

---

## Chart initialisation pattern

```js
(function() {
  var catCtx = document.getElementById('categoryChart').getContext('2d');
  var bugCount = N; var featCount = N; var enhCount = N;
  var catTotal = bugCount + featCount + enhCount;
  new Chart(catCtx, {
    type: 'doughnut',
    data: {
      labels: ['Bug Fixes', 'New Features', 'Enhancements'],
      datasets: [{ data: catTotal > 0 ? [bugCount, featCount, enhCount] : [1,0,0],
        backgroundColor: ['#f87171','#818cf8','#34d399'],
        borderColor: '#1a1d27', borderWidth: 3, hoverOffset: 8 }]
    },
    options: { responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: function(ctx) {
          if (catTotal === 0) return ctx.label + ': 0';
          return ctx.label + ': ' + ctx.raw + ' (' + Math.round(ctx.raw/catTotal*100) + '%)';
        }}}}}
  });

  var priCtx = document.getElementById('priorityChart').getContext('2d');
  var critCount = N; var highCount = N; var normCount = N; var lowCount = N;
  var priTotal = critCount + highCount + normCount + lowCount;
  new Chart(priCtx, {
    type: 'doughnut',
    data: {
      labels: ['Critical', 'High', 'Normal', 'Low'],
      datasets: [{ data: priTotal > 0 ? [critCount, highCount, normCount, lowCount] : [1,0,0,0],
        backgroundColor: ['#f59e0b','#f87171','#94a3b8','#34d399'],
        borderColor: '#1a1d27', borderWidth: 3, hoverOffset: 8 }]
    },
    options: { responsive: true, maintainAspectRatio: true, cutout: '65%',
      plugins: { legend: { display: false },
        tooltip: { callbacks: { label: function(ctx) {
          if (priTotal === 0) return ctx.label + ': 0';
          return ctx.label + ': ' + ctx.raw + ' (' + Math.round(ctx.raw/priTotal*100) + '%)';
        }}}}}
  });
})();
```

---

## build.js integration

The build script (`scripts/build.js`) reads the latest HTML achievement report via `parseLatestAchievementHTML()` and uses regex to extract:

- Stat values from `.stat-label` / `.stat-value` element pairs
- Category chart counts from `var bugCount = N` / `var featCount = N` / `var enhCount = N` in the script block
- Priority chart counts from `var critCount = N` / `var highCount = N` / `var normCount = N` / `var lowCount = N` in the script block

**Required variable names — do not rename:** The main page achievements preview depends on these exact regex patterns:

| Variable | Purpose |
|---|---|
| `var bugCount` | Bug Fix count for category donut |
| `var featCount` | New Feature count for category donut |
| `var enhCount` | Enhancement count for category donut |
| `var critCount` | Critical count for priority donut |
| `var highCount` | High count for priority donut |
| `var normCount` | Normal count for priority donut |
| `var lowCount` | Low count for priority donut |

**Stat card ordering (required):** The `stat-value` div MUST come BEFORE the `stat-label` div in each stat card. Although `build.js` now handles both orderings defensively, the spec order (value before label) is required for forward compatibility.

---

## Canvas ID scoping (build.js auto-handles)

The build script automatically renames canvas IDs in inlined reports from:
- `categoryChart` → `categoryChart-{slug}`
- `priorityChart` → `priorityChart-{slug}`

This prevents conflicts when multiple reports are embedded in the same achievements page. The AchievementsAgent does NOT need to manually scope these IDs.

However, the AchievementsAgent MUST use these EXACT JavaScript variable names in the inline `<script>` block:

```js
var bugCount = N;
var featCount = N;
var enhCount = N;
var critCount = N;
var highCount = N;
var normCount = N;
var lowCount = N;
```

The main page achievements preview extracts these via regex from the latest HTML report. Changing these variable names breaks the main page preview.
