# Paperclip Routine Schemas

These are the Paperclip routine configurations for the Relations pipeline agents.
NodeEngineer should implement the agent execution logic against these schema contracts.

---

## DevPerformanceAgent

**Purpose:** Query the GitHub Project board each week, count tickets closed or moved to QA per engineer, generate a Markdown performance summary, and commit it to `reports/performance/YYYY-WNN.md`.

**Routine config (Paperclip API payload):**

```json
{
  "name": "DevPerformanceAgent — Weekly",
  "agentId": "<DevPerformanceAgent agent ID>",
  "description": "Generates a weekly developer performance report from GitHub project board activity.",
  "triggers": [
    {
      "kind": "schedule",
      "cron": "0 9 * * 1",
      "timezone": "UTC"
    }
  ],
  "concurrencyPolicy": "forbid",
  "catchUpPolicy": "skip",
  "executionIssueTitle": "DevPerformanceAgent — Weekly Run {{date}}",
  "executionIssueDescription": "Automatic weekly run. Agent will:\n1. Query GitHub project board for the previous 7-day window.\n2. Aggregate closed/QA-moved tickets per assignee.\n3. Commit `reports/performance/{{isoWeek}}.md` to med-relations.\n4. Trigger GitHub Actions Pages rebuild."
}
```

**Expected output contract:**

File committed to `reports/performance/` with this structure:

```markdown
# Dev Performance — Week YYYY-WNN

Period: YYYY-MM-DD → YYYY-MM-DD

## Summary

| Engineer | Closed | Moved to QA | Total |
|---|---|---|---|
| Alice | 5 | 3 | 8 |
| Bob | 4 | 2 | 6 |

## Highlights

- ... (top contributors, notable tickets)

## Details

### Alice
- [MED-101](/MED/issues/MED-101) — Title
- ...
```

**Required GitHub token scopes:** `project:read`, `repo:read`

---

## AchievementsAgent

**Purpose:** Each week, collect closed tickets and synthesise a team achievements summary, then commit it to `reports/achievements/YYYY-WNN.md`.

**Routine config:**

```json
{
  "name": "AchievementsAgent — Weekly",
  "agentId": "<AchievementsAgent agent ID>",
  "description": "Generates a weekly team achievements report based on closed GitHub tickets.",
  "triggers": [
    {
      "kind": "schedule",
      "cron": "0 9 * * 1",
      "timezone": "UTC"
    }
  ],
  "concurrencyPolicy": "forbid",
  "catchUpPolicy": "skip",
  "executionIssueTitle": "AchievementsAgent — Weekly Run {{date}}",
  "executionIssueDescription": "Automatic weekly run. Agent will:\n1. List tickets closed in the last 7 days from GitHub.\n2. Group by label/milestone/epic.\n3. Write an achievements narrative.\n4. Commit `reports/achievements/{{isoWeek}}.md` to med-relations."
}
```

**Expected output contract:**

```markdown
# Achievements — Week YYYY-WNN

Period: YYYY-MM-DD → YYYY-MM-DD

## This week we shipped

- **Feature X** — description (MED-42, MED-43)
- **Bug fix Y** — description (MED-50)
- ...

## By the numbers

- N tickets closed
- N PRs merged
- N contributors
```

---

## ReleaseNotesAgent

**Purpose:** On demand (triggered per deployment), fetch the deployment PR, extract merged tickets, generate release notes, and commit to `reports/releases/vX.Y.Z.md`.

**Routine config:**

```json
{
  "name": "ReleaseNotesAgent",
  "agentId": "<ReleaseNotesAgent agent ID>",
  "description": "Generates release notes from a deployment PR and commits them to the med-relations repo.",
  "triggers": [
    {
      "kind": "api"
    }
  ],
  "concurrencyPolicy": "allow",
  "catchUpPolicy": "skip",
  "executionIssueTitle": "ReleaseNotesAgent — {{version}} Release Notes",
  "executionIssueDescription": "Release notes generation triggered via API. See trigger payload for PR and version details."
}
```

**See `docs/trigger-payload.md` for the API trigger payload format.**

---

## Implementation notes for NodeEngineer

1. Create each agent via `POST /api/companies/{companyId}/agents` with appropriate `instructions-path` pointing to their agent AGENTS.md.
2. Create routines via `POST /api/routines` with the payloads above (substituting real agent IDs).
3. Each agent needs write access to the `med-relations` repo (`GH_TOKEN` is already available in the Paperclip environment).
4. Use `isWeek()` from `date-fns` to compute `YYYY-WNN` strings consistently.
5. Commit message format: `chore: add {category} report {slug} [skip ci for anything except reports path]` — the Actions workflow is scoped to `reports/**` so only report commits trigger a redeploy.
