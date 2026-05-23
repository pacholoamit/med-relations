# AchievementsAgent — HTML Report Format Spec

This file defines the required output format for the AchievementsAgent's weekly HTML achievement report. When generating `reports/achievements/<YEAR>-W<WW>.html`, follow this spec exactly so the report integrates correctly with the med-relations site and build pipeline.

---

## Overview

Each report is a **self-contained HTML file** (no external CSS dependencies). It renders on a dark background (`#0f1117`) and loads Chart.js from CDN for the two donut charts.

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

Four stat cards in a CSS grid:

| Label | Format |
|---|---|
| PRs Merged | integer |
| Lines Added | `+N` (green) |
| Lines Removed | `-N` (red) |
| Hotfixes | integer (yellow) |

Use classes: `stat-label`, `stat-value`, `stat-value.green`, `stat-value.red`, `stat-value.yellow`.

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

Sort `<tbody>` rows as follows:
1. Bug Fix rows first (chronological by `merged_at` ascending within group)
2. New Feature rows second (chronological within group)
3. Enhancement rows third (chronological within group)

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
- Chart counts from `var bugCount = N` / `var featCount = N` / `var enhCount = N` in the script block

**Important:** Keep the variable names `bugCount`, `featCount`, `enhCount` in the script block exactly as shown — the main page achievements preview section depends on these regex patterns.
