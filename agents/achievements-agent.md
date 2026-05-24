# AchievementsAgent — JSON Report Spec

This file defines the required output format for the AchievementsAgent's weekly achievement
report. Write one JSON file per week to `reports/achievements/<YEAR>-W<WW>.json`.
The build pipeline (`scripts/build.js`) reads this file and renders the achievements page
using the stable template at `scripts/achievements-report-template.html`.

**Do not write HTML.** Do not modify the template file. Output JSON only.

---

## File naming

`reports/achievements/<YEAR>-W<WW>.json` — e.g. `reports/achievements/2026-W22.json`

Use ISO week numbering (Monday = start of week). Zero-pad the week number to two digits.

---

## JSON schema

```json
{
  "week": "2026-W22",
  "period": "2026-05-25 → 2026-05-31",
  "stats": {
    "prs": 31,
    "linesAdded": 13557,
    "linesRemoved": 3686,
    "hotfixes": 18
  },
  "chart": {
    "bugCount": 24,
    "featCount": 2,
    "enhCount": 5
  },
  "priorityChart": {
    "critCount": 18,
    "highCount": 0,
    "normCount": 13,
    "lowCount": 0
  },
  "prs": [
    {
      "title": "Fix login redirect loop",
      "url": "https://github.com/MediaJel/mediajel-dashboard/pull/12345",
      "category": "bug",
      "priority": "critical",
      "linesAdded": 12,
      "linesRemoved": 5
    }
  ],
  "contributors": [
    {
      "name": "githubusername",
      "url": "https://github.com/githubusername",
      "prs": 3,
      "critical": 2,
      "high": 0,
      "normal": 1,
      "low": 0,
      "linesAdded": 500,
      "linesRemoved": 100
    }
  ],
  "metrics": {
    "mostActiveRepo": "mediajel-dashboard",
    "avgPrSize": 556,
    "revertCount": 1,
    "prVelocity": 4.43
  }
}
```

---

## Field reference

### Top-level

| Field | Type | Description |
|---|---|---|
| `week` | string | ISO week slug, e.g. `"2026-W22"` |
| `period` | string | Human-readable date range, e.g. `"2026-05-25 → 2026-05-31"` |
| `stats` | object | Top-level aggregate stats (see below) |
| `chart` | object | Category donut chart counts |
| `priorityChart` | object | Priority donut chart counts |
| `prs` | array | Per-PR records (see below) |
| `contributors` | array | Per-contributor records |
| `metrics` | object | Supplemental KPIs |

### `stats`

| Field | Type | Notes |
|---|---|---|
| `prs` | integer | Total PRs merged this week |
| `linesAdded` | integer | Total lines added (raw number, no `+` prefix) |
| `linesRemoved` | integer | Total lines removed (raw number, no `-` prefix) |
| `hotfixes` | integer | Number of hotfix PRs |

### `chart` (category breakdown)

| Field | Type | Notes |
|---|---|---|
| `bugCount` | integer | Bug fix PR count |
| `featCount` | integer | New feature PR count |
| `enhCount` | integer | Enhancement PR count |

`bugCount + featCount + enhCount` should equal `stats.prs`.

### `priorityChart`

| Field | Type | Notes |
|---|---|---|
| `critCount` | integer | Critical priority PR count |
| `highCount` | integer | High priority count |
| `normCount` | integer | Normal priority count |
| `lowCount` | integer | Low priority count |

**Priority classification:** A PR is Critical if its title contains "hotfix" (case-insensitive)
OR it carries a critical-urgency label. Otherwise derive from the PR's label.
Default to `"normal"` when uncertain.

### `prs` array items

| Field | Type | Notes |
|---|---|---|
| `title` | string | PR title (unescaped plain text) |
| `url` | string | Full GitHub PR URL |
| `category` | string | `"bug"` \| `"feature"` \| `"enhancement"` |
| `priority` | string | `"critical"` \| `"high"` \| `"normal"` \| `"low"` |
| `linesAdded` | integer | Lines added in this PR |
| `linesRemoved` | integer | Lines removed in this PR |

### `contributors` array items

| Field | Type | Notes |
|---|---|---|
| `name` | string | GitHub username |
| `url` | string | GitHub profile URL |
| `prs` | integer | Number of PRs by this contributor |
| `critical` | integer | Critical PRs by this contributor |
| `high` | integer | High PRs |
| `normal` | integer | Normal PRs |
| `low` | integer | Low PRs |
| `linesAdded` | integer | Total lines added |
| `linesRemoved` | integer | Total lines removed |

### `metrics`

| Field | Type | Notes |
|---|---|---|
| `mostActiveRepo` | string | Repo name with most PRs |
| `avgPrSize` | number | Average (linesAdded + linesRemoved) across all PRs |
| `revertCount` | integer | Number of revert PRs |
| `prVelocity` | number | PRs per calendar day in the period |

---

## Priority classification rule

1. Title contains "hotfix" (case-insensitive) → `"critical"`
2. PR has a `priority:critical` or equivalent critical label → `"critical"`
3. PR has `priority:high` label → `"high"`
4. PR has `priority:low` label → `"low"`
5. Default → `"normal"`

---

## Backward compatibility note

Prior to this spec (before 2026-W21), the AchievementsAgent produced self-contained HTML
files (`reports/achievements/<slug>.html`). Those files are retained in the repo for
historical reference but are no longer used as the primary data source. The build pipeline
prefers JSON files; it falls back to HTML inlining only if no JSON file exists.

When a JSON file exists for a given week, the corresponding HTML file (if present) is ignored
by the build. Do not regenerate or modify the legacy HTML files.
