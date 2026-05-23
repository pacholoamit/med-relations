# MED Relations

Automated weekly reports, achievements, and release notes — deployed as a static site on GitHub Pages.

## Report folders

| Folder | Content | Cadence |
|---|---|---|
| `reports/performance/` | Dev performance summaries (tickets closed / moved to QA) | Weekly |
| `reports/achievements/` | Team achievements based on closed tickets | Weekly |
| `reports/releases/` | Release notes for each production deployment | Per release |

## File naming convention

```
reports/performance/YYYY-WNN.md        # e.g. 2026-W21.md
reports/achievements/YYYY-WNN.md
reports/releases/vX.Y.Z.md             # e.g. v1.4.0.md
```

## How it works

1. A Paperclip agent commits a new Markdown file to the appropriate `reports/` subfolder.
2. GitHub Actions detects the push and runs `npm run build`, which converts every Markdown file into a single `dist/index.html`.
3. The built site is deployed to GitHub Pages automatically.

## Local development

```bash
npm install
npm run build
open dist/index.html
```

## Agents

| Agent | Schedule | Trigger |
|---|---|---|
| `DevPerformanceAgent` | Mondays 09:00 UTC | Routine (cron) |
| `AchievementsAgent` | Mondays 09:00 UTC | Routine (cron) |
| `ReleaseNotesAgent` | On demand | API call (deployment PR number) |

See `docs/routine-schemas.md` for Paperclip routine configuration and `docs/trigger-payload.md` for the ReleaseNotesAgent trigger spec.
