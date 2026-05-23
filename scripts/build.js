#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { marked } from 'marked';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const REPORTS_DIR = join(ROOT, 'reports');
const DIST_DIR = join(ROOT, 'dist');

const SECTIONS = [
  {
    key: 'performance',
    label: 'Weekly Performance',
    desc: 'Developer velocity and ticket metrics by week',
    icon: `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M1 10.5L4.5 7l3 3L11 4.5l3.5 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'achievements',
    label: 'Achievements',
    desc: 'Team wins, milestones, and highlights',
    icon: `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1l1.618 3.28L13 5.09l-2.75 2.68.649 3.78L7.5 9.75l-3.399 1.8L4.75 7.77 2 5.09l3.882-.81L7.5 1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  },
  {
    key: 'releases',
    label: 'Release Notes',
    desc: 'Full versioned changelog, newest first',
    icon: `<svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true"><path d="M7.5 1.5C7.5 1.5 12 3.5 12 7.5a4.5 4.5 0 01-9 0c0-4 4.5-6 4.5-6z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="7.5" cy="7.5" r="1.25" fill="currentColor"/></svg>`,
  },
];

// ─── Data readers ─────────────────────────────────────────────────────────────

async function readReports(category) {
  const dir = join(REPORTS_DIR, category);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const mdFiles = files
    .filter(f => extname(f) === '.md' && f !== '.gitkeep')
    .sort()
    .reverse();
  return Promise.all(
    mdFiles.map(async file => {
      const raw = await readFile(join(dir, file), 'utf-8');
      const html = await marked.parse(raw);
      const slug = basename(file, '.md');
      const firstLine = raw.split('\n').find(l => l.trim()) ?? slug;
      const title = firstLine.replace(/^#+\s*/, '').trim();
      return { slug, title, html, raw };
    }),
  );
}

function esc(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parsePerformanceTable(raw) {
  const lines = raw.split('\n');
  const headerIdx = lines.findIndex(
    l => l.includes('| Engineer') || l.includes('|Engineer'),
  );
  if (headerIdx === -1) return null;
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) break;
    const cols = line
      .split('|')
      .filter(c => c.trim())
      .map(c => c.trim());
    if (cols.length >= 4) {
      rows.push({
        engineer: cols[0],
        closed: parseInt(cols[1], 10) || 0,
        qa: parseInt(cols[2], 10) || 0,
        total: parseInt(cols[3], 10) || 0,
      });
    }
  }
  return rows.length > 0 ? rows : null;
}

// ─── Component renderers ──────────────────────────────────────────────────────

function renderLeaderboard(rows) {
  if (!rows || rows.length === 0) return '';
  const engineers = rows.filter(r => r.engineer.toLowerCase() !== 'unassigned');
  const maxTotal = Math.max(...rows.map(r => r.total), 1);
  const totalClosed = rows.reduce((s, r) => s + r.closed, 0);
  const totalQA = rows.reduce((s, r) => s + r.qa, 0);
  const medals = ['🥇', '🥈', '🥉'];

  const statGrid = `
<div class="stat-grid">
  <div class="stat-card"><span class="stat-val">${totalClosed + totalQA}</span><span class="stat-lbl">Total tickets</span></div>
  <div class="stat-card"><span class="stat-val stat-val--green">${totalClosed}</span><span class="stat-lbl">Closed</span></div>
  <div class="stat-card"><span class="stat-val stat-val--orange">${totalQA}</span><span class="stat-lbl">Moved to QA</span></div>
  <div class="stat-card"><span class="stat-val">${engineers.length}</span><span class="stat-lbl">Engineers</span></div>
</div>`;

  const devRows = engineers.slice(0, 12).map((row, idx) => {
    const pct = Math.max(4, Math.round((row.total / maxTotal) * 100));
    const rankEl = idx < 3
      ? `<span class="rank-medal" aria-label="rank ${idx + 1}">${medals[idx]}</span>`
      : `<span class="rank-num" aria-label="rank ${idx + 1}">${idx + 1}</span>`;
    return `
<div class="dev-row${idx === 0 ? ' dev-row--top' : ''}">
  <div class="dev-rank">${rankEl}</div>
  <div class="dev-body">
    <div class="dev-name-row">
      <span class="dev-name">${esc(row.engineer)}</span>
      <div class="dev-stats">
        <span class="tag tag--green">${row.closed} closed</span>
        <span class="tag tag--orange">${row.qa} QA</span>
        <span class="dev-total">${row.total}</span>
      </div>
    </div>
    <div class="dev-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(row.engineer)}: ${row.total} tickets">
      <div class="dev-bar" style="width:${pct}%"></div>
    </div>
  </div>
</div>`;
  }).join('');

  return `
<div class="leaderboard">
  ${statGrid}
  <div class="dev-list" role="list" aria-label="Developer leaderboard">
    ${devRows}
  </div>
</div>`;
}

function renderExpandToggle(html) {
  return `
<details class="expand-details">
  <summary class="expand-summary">
    <svg class="expand-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span>Full report</span>
  </summary>
  <div class="report-body">${html}</div>
</details>`;
}

function renderAccordion(r, extraContent = '') {
  return `
<details class="accordion">
  <summary class="accordion-summary">
    <svg class="accordion-icon" width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="slug-pill">${esc(r.slug)}</span>
    <span class="accordion-title">${esc(r.title)}</span>
  </summary>
  ${extraContent}
  <div class="report-body">${r.html}</div>
</details>`;
}

function renderFeaturedCard(r, body) {
  return `
<div class="featured-card">
  <div class="card-header">
    <div class="card-meta">
      <span class="badge badge--accent">Latest</span>
      <span class="slug-pill">${esc(r.slug)}</span>
    </div>
    <h3 class="card-title">${esc(r.title)}</h3>
  </div>
  ${body}
</div>`;
}

function renderEmptyState(label) {
  return `
<div class="empty-state" role="status">
  <p class="empty-heading">No ${label.toLowerCase()} yet</p>
  <p class="empty-sub">Reports are committed automatically by the Relations pipeline.</p>
</div>`;
}

// ─── Section renderers ────────────────────────────────────────────────────────

function renderPerformanceSection(reports) {
  const latest = reports[0];
  const rows = parsePerformanceTable(latest.raw);
  const featured = renderFeaturedCard(
    latest,
    `${renderLeaderboard(rows)}${renderExpandToggle(latest.html)}`,
  );
  const archived = reports.slice(1).map(r => {
    const lb = renderLeaderboard(parsePerformanceTable(r.raw));
    return renderAccordion(r, lb);
  }).join('');
  return `${featured}${archived ? `<div class="archive">${archived}</div>` : ''}`;
}

function renderAchievementsSection(reports) {
  const latest = reports[0];
  const featured = renderFeaturedCard(
    latest,
    `<div class="report-body">${latest.html}</div>`,
  );
  const archived = reports.slice(1).map(r => renderAccordion(r)).join('');
  return `${featured}${archived ? `<div class="archive">${archived}</div>` : ''}`;
}

function renderReleasesSection(reports) {
  return `
<div class="release-list" role="list">
  ${reports.map((r, idx) => {
    const isLatest = idx === 0;
    const isMajor = /^v?[1-9]/.test(r.slug);
    return `
<article class="release-card${isLatest ? ' release-card--latest' : ''}" role="listitem">
  <div class="release-header">
    <div class="release-meta">
      <span class="release-ver${isMajor ? ' release-ver--major' : ''}">${esc(r.slug)}</span>
      ${isLatest ? '<span class="badge badge--accent">Latest</span>' : ''}
    </div>
    <h3 class="release-title">${esc(r.title)}</h3>
  </div>
  <div class="report-body">${r.html}</div>
</article>`;
  }).join('')}
</div>`;
}

function renderSection(s, reports) {
  const renderers = {
    performance: renderPerformanceSection,
    achievements: renderAchievementsSection,
    releases: renderReleasesSection,
  };
  const content = reports.length === 0
    ? renderEmptyState(s.label)
    : renderers[s.key](reports);
  return `
<section class="section" id="section-${s.key}" aria-labelledby="section-title-${s.key}">
  <header class="section-hd">
    <div class="section-icon" aria-hidden="true">${s.icon}</div>
    <div>
      <h2 class="section-title" id="section-title-${s.key}">${s.label}</h2>
      <p class="section-desc">${s.desc}</p>
    </div>
  </header>
  ${content}
</section>`;
}

// ─── CSS ──────────────────────────────────────────────────────────────────────

function getCSS() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

:root {
  --bg:       #f8fafc;
  --surface:  #ffffff;
  --surface-2:#f1f5f9;
  --border:   #e2e8f0;
  --border-2: #cbd5e1;
  --text:     #0f172a;
  --text-2:   #475569;
  --text-3:   #94a3b8;
  --accent:   #6366f1;
  --accent-bg:#eef2ff;
  --accent-bd:#c7d2fe;
  --green:    #16a34a;
  --green-bg: #f0fdf4;
  --green-bd: #bbf7d0;
  --orange:   #ea580c;
  --orange-bg:#fff7ed;
  --orange-bd:#fed7aa;
  --hdr-h:    56px;
  --side-w:   232px;
  --radius:   8px;
  --t:        150ms ease;
}

html[data-theme="dark"] {
  --bg:       #0f172a;
  --surface:  #1e293b;
  --surface-2:#1e293b;
  --border:   #334155;
  --border-2: #475569;
  --text:     #f1f5f9;
  --text-2:   #94a3b8;
  --text-3:   #64748b;
  --accent:   #6366f1;
  --accent-bg:#1e1b4b;
  --accent-bd:#3730a3;
  --green:    #22c55e;
  --green-bg: #052e16;
  --green-bd: #166534;
  --orange:   #f97316;
  --orange-bg:#431407;
  --orange-bd:#9a3412;
}

html.theme-ready *,
html.theme-ready *::before,
html.theme-ready *::after {
  transition: background-color 200ms ease, border-color 200ms ease, color 200ms ease !important;
}

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
}

/* ── Header ─────────────────────────────────────────────────────────────── */
.hdr {
  position: sticky; top: 0; z-index: 100;
  height: var(--hdr-h);
  padding: 0 1.5rem;
  display: flex; align-items: center; gap: 0.75rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.hdr-logo {
  display: flex; align-items: center; gap: 0.5rem;
  text-decoration: none; color: var(--text);
  font-size: 0.9375rem; font-weight: 600;
}
.hdr-logo:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
.hdr-mark {
  width: 28px; height: 28px; border-radius: 6px;
  background: var(--accent); color: #fff;
  display: flex; align-items: center; justify-content: center;
  font-size: 12px; font-weight: 700; flex-shrink: 0;
  letter-spacing: -0.02em;
}
.hdr-sep { color: var(--border-2); font-weight: 300; font-size: 1.1rem; }
.hdr-org { font-size: 0.8125rem; color: var(--text-2); font-weight: 500; }
.hdr-space { flex: 1; }
.hdr-date { font-size: 0.75rem; color: var(--text-3); }
.theme-toggle {
  width: 32px; height: 32px; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 6px; cursor: pointer; color: var(--text-2);
  padding: 0;
}
.theme-toggle:hover { background: var(--border); color: var(--text); }
.theme-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.theme-icon { display: block; pointer-events: none; }
html[data-theme="dark"] .theme-icon--moon { display: none; }
html:not([data-theme="dark"]) .theme-icon--sun { display: none; }

/* ── Layout ─────────────────────────────────────────────────────────────── */
.layout {
  display: grid;
  grid-template-columns: var(--side-w) 1fr;
  min-height: calc(100vh - var(--hdr-h));
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 1.25rem 0;
  position: sticky; top: var(--hdr-h);
  height: calc(100vh - var(--hdr-h));
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}
.sidebar-lbl {
  font-size: 0.6875rem; font-weight: 600;
  letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--text-3); padding: 0 1rem 0.625rem;
}
.nav-link {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.5625rem 1rem;
  text-decoration: none; color: var(--text-2);
  font-size: 0.875rem; font-weight: 500;
  border-left: 2px solid transparent;
  transition: background var(--t), color var(--t), border-color var(--t);
}
.nav-link:hover { background: var(--bg); color: var(--text); }
.nav-link.active {
  color: var(--accent);
  background: var(--accent-bg);
  border-left-color: var(--accent);
}
.nav-link:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }
.nav-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; opacity: 0.75; }
.nav-link.active .nav-icon { opacity: 1; }
.nav-label { flex: 1; }
.nav-count {
  font-size: 0.6875rem; color: var(--text-3);
  background: var(--surface-2); border: 1px solid var(--border);
  padding: 1px 6px; border-radius: 10px; min-width: 20px; text-align: center;
}
.nav-link.active .nav-count {
  color: var(--accent);
  background: var(--accent-bg);
  border-color: var(--accent-bd);
}

/* ── Main ───────────────────────────────────────────────────────────────── */
.main { padding: 2rem 2.5rem; max-width: 880px; }

/* ── Section ────────────────────────────────────────────────────────────── */
.section { margin-bottom: 4rem; scroll-margin-top: calc(var(--hdr-h) + 16px); }
.section-hd {
  display: flex; align-items: flex-start; gap: 0.75rem;
  margin-bottom: 1.25rem; padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}
.section-icon {
  width: 32px; height: 32px; border-radius: 6px; flex-shrink: 0;
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text-2);
  display: flex; align-items: center; justify-content: center;
  margin-top: 1px;
}
.section-title { font-size: 1rem; font-weight: 600; color: var(--text); letter-spacing: -0.01em; }
.section-desc { font-size: 0.8125rem; color: var(--text-3); margin-top: 2px; }

/* ── Badges & pills ─────────────────────────────────────────────────────── */
.badge {
  display: inline-flex; align-items: center;
  font-size: 0.6875rem; font-weight: 600;
  padding: 1px 7px; border-radius: 10px; letter-spacing: 0.02em;
}
.badge--accent {
  color: var(--accent); background: var(--accent-bg); border: 1px solid var(--accent-bd);
}
.slug-pill {
  display: inline-flex; align-items: center;
  font-size: 0.6875rem; font-weight: 500;
  padding: 1px 7px; border-radius: 4px;
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text-2); font-variant-numeric: tabular-nums;
}
.tag {
  font-size: 0.6875rem; font-weight: 500;
  padding: 1px 6px; border-radius: 10px; white-space: nowrap;
}
.tag--green { background: var(--green-bg); color: var(--green); border: 1px solid var(--green-bd); }
.tag--orange { background: var(--orange-bg); color: var(--orange); border: 1px solid var(--orange-bd); }

/* ── Featured card ──────────────────────────────────────────────────────── */
.featured-card {
  background: var(--surface);
  border: 1px solid var(--accent-bd);
  border-top: 2px solid var(--accent);
  border-radius: 0 0 var(--radius) var(--radius);
  overflow: hidden; margin-bottom: 0.75rem;
}
.card-header {
  padding: 1rem 1.25rem 0.875rem;
  border-bottom: 1px solid var(--border);
}
.card-meta { display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.4rem; }
.card-title { font-size: 0.9375rem; font-weight: 600; color: var(--text); }

/* ── Stat grid ──────────────────────────────────────────────────────────── */
.stat-grid {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1px; background: var(--border);
  border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);
}
.stat-card {
  background: var(--surface);
  padding: 0.875rem 0.75rem;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 3px;
}
.stat-val {
  font-size: 1.5rem; font-weight: 700; line-height: 1; letter-spacing: -0.03em;
  color: var(--text); font-variant-numeric: tabular-nums;
}
.stat-val--green { color: var(--green); }
.stat-val--orange { color: var(--orange); }
.stat-lbl { font-size: 0.6875rem; color: var(--text-3); text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }

/* ── Leaderboard ────────────────────────────────────────────────────────── */
.leaderboard { padding-bottom: 0.25rem; }
.dev-list { display: flex; flex-direction: column; padding: 0.75rem 1.25rem; gap: 0.375rem; }
.dev-row {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.5rem 0.625rem; border-radius: 6px;
  border: 1px solid transparent;
}
.dev-row:hover { background: var(--bg); }
.dev-row--top { background: var(--accent-bg); border-color: var(--accent-bd); }
.dev-row--top:hover { background: var(--accent-bg); }
.dev-rank { width: 24px; text-align: center; flex-shrink: 0; padding-top: 1px; }
.rank-medal { font-size: 1rem; line-height: 1; }
.rank-num { font-size: 0.75rem; color: var(--text-3); font-weight: 600; }
.dev-body { flex: 1; min-width: 0; }
.dev-name-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; margin-bottom: 5px;
}
.dev-name { font-size: 0.875rem; font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dev-stats { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }
.dev-total { font-size: 0.8125rem; font-weight: 700; color: var(--text); min-width: 16px; text-align: right; font-variant-numeric: tabular-nums; }
.dev-bar-track { height: 3px; background: var(--border); border-radius: 2px; overflow: hidden; }
.dev-bar { height: 100%; border-radius: 2px; background: var(--accent); max-width: 100%; }

/* ── Expand toggle ──────────────────────────────────────────────────────── */
.expand-details { border-top: 1px solid var(--border); }
.expand-summary {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 1.25rem; cursor: pointer; list-style: none;
  font-size: 0.8125rem; color: var(--text-3); user-select: none;
  transition: color var(--t);
}
.expand-summary::-webkit-details-marker { display: none; }
.expand-summary:hover { color: var(--text-2); }
.expand-icon { flex-shrink: 0; transition: transform 0.15s; }
.expand-details[open] .expand-icon { transform: rotate(90deg); }

/* ── Archive list ───────────────────────────────────────────────────────── */
.archive { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem; }

/* ── Accordion ──────────────────────────────────────────────────────────── */
.accordion {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: border-color var(--t);
}
.accordion:hover { border-color: var(--border-2); }
.accordion-summary {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem; cursor: pointer; list-style: none;
  user-select: none; font-size: 0.875rem;
  transition: background var(--t);
}
.accordion-summary::-webkit-details-marker { display: none; }
.accordion-summary:hover { background: var(--bg); }
.accordion-icon { flex-shrink: 0; color: var(--text-3); transition: transform 0.15s; }
.accordion[open] .accordion-icon { transform: rotate(90deg); }
.accordion-title { flex: 1; color: var(--text-2); font-weight: 500; }
.accordion .report-body { border-top: 1px solid var(--border); }

/* ── Release list ───────────────────────────────────────────────────────── */
.release-list { display: flex; flex-direction: column; gap: 0.75rem; }
.release-card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); overflow: hidden;
  transition: border-color var(--t);
}
.release-card:hover { border-color: var(--border-2); }
.release-card--latest {
  border-color: var(--accent-bd);
  border-top: 2px solid var(--accent);
  border-radius: 0 0 var(--radius) var(--radius);
}
.release-header {
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}
.release-meta { display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.25rem; }
.release-ver { font-size: 0.9375rem; font-weight: 600; color: var(--text-2); font-variant-numeric: tabular-nums; }
.release-ver--major { color: var(--accent); font-size: 1.0625rem; }
.release-title { font-size: 0.9375rem; font-weight: 600; color: var(--text); }

/* ── Report body ────────────────────────────────────────────────────────── */
.report-body { padding: 1.125rem 1.25rem; font-size: 0.875rem; line-height: 1.75; color: var(--text-2); }
.report-body h1, .report-body h2, .report-body h3 { color: var(--text); font-weight: 600; line-height: 1.35; margin: 1.25rem 0 0.5rem; }
.report-body h1 { font-size: 1rem; }
.report-body h2 { font-size: 0.9375rem; }
.report-body h3 { font-size: 0.875rem; }
.report-body h1:first-child, .report-body h2:first-child, .report-body h3:first-child { margin-top: 0; }
.report-body p { margin-bottom: 0.625rem; }
.report-body ul, .report-body ol { padding-left: 1.375rem; margin-bottom: 0.625rem; }
.report-body li { margin-bottom: 0.25rem; }
.report-body strong { color: var(--text); font-weight: 600; }
.report-body a { color: var(--accent); text-decoration: none; }
.report-body a:hover { text-decoration: underline; }
.report-body a:focus-visible { outline: 2px solid var(--accent); border-radius: 2px; }
.report-body hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }
.report-body code {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  font-size: 0.8125em; background: var(--surface-2);
  border: 1px solid var(--border); padding: 1px 5px; border-radius: 4px; color: var(--text);
}
.report-body pre {
  background: var(--surface-2); border: 1px solid var(--border);
  padding: 1rem; border-radius: 6px; overflow-x: auto; margin-bottom: 0.875rem;
}
.report-body pre code { background: none; border: none; padding: 0; }
.report-body table { border-collapse: collapse; width: 100%; margin-bottom: 0.875rem; font-size: 0.8125rem; }
.report-body th, .report-body td { border: 1px solid var(--border); padding: 0.4rem 0.75rem; text-align: left; }
.report-body th { background: var(--surface-2); font-weight: 600; color: var(--text); font-size: 0.75rem; letter-spacing: 0.02em; }
.report-body tr:nth-child(even) td { background: var(--bg); }
.report-body tr:hover td { background: var(--surface-2); }
.report-body blockquote { border-left: 3px solid var(--border-2); padding-left: 0.875rem; color: var(--text-3); margin-bottom: 0.625rem; }

/* ── Empty state ────────────────────────────────────────────────────────── */
.empty-state {
  text-align: center; padding: 3rem 1rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text-3);
}
.empty-heading { font-size: 0.9375rem; font-weight: 500; color: var(--text-2); margin-bottom: 0.375rem; }
.empty-sub { font-size: 0.8125rem; }

/* ── Footer ─────────────────────────────────────────────────────────────── */
.footer {
  border-top: 1px solid var(--border); padding: 1.25rem 2.5rem;
  display: flex; align-items: center; justify-content: space-between;
  font-size: 0.75rem; color: var(--text-3);
  background: var(--surface); margin-top: 2rem;
}
.footer-links { display: flex; gap: 1rem; }
.footer-links a { color: var(--text-3); text-decoration: none; transition: color var(--t); }
.footer-links a:hover { color: var(--text-2); }
.footer-links a:focus-visible { outline: 2px solid var(--accent); border-radius: 2px; }

/* ── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }
  .sidebar {
    position: static; height: auto; border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 0; display: flex; overflow-x: auto; scrollbar-width: none;
  }
  .sidebar::-webkit-scrollbar { display: none; }
  .sidebar-lbl { display: none; }
  .nav-link {
    padding: 0.75rem 0.875rem; border-left: none;
    border-bottom: 2px solid transparent;
    white-space: nowrap; flex-shrink: 0;
  }
  .nav-link.active { border-bottom-color: var(--accent); border-left-color: transparent; background: transparent; }
  .nav-count { display: none; }
  .main { padding: 1.25rem 1rem; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .dev-stats { display: none; }
  .hdr-date { display: none; }
  .footer { flex-direction: column; gap: 0.5rem; text-align: center; }
}
@media (max-width: 480px) {
  .hdr-org { display: none; }
  .hdr-sep { display: none; }
}
@media print {
  .hdr, .sidebar { display: none; }
  .layout { display: block; }
  .section { page-break-inside: avoid; }
}
`;
}

// ─── JS ───────────────────────────────────────────────────────────────────────

function getJS() {
  return `
(function () {
  // Theme toggle
  var btn = document.getElementById('theme-toggle');
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
    if (btn) {
      btn.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    }
  }
  // Enable transitions after initial paint to avoid flash
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      document.documentElement.classList.add('theme-ready');
    });
  });
  if (btn) {
    btn.addEventListener('click', function () {
      var current = document.documentElement.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
    // Set initial aria-label
    var initial = document.documentElement.getAttribute('data-theme') || 'dark';
    btn.setAttribute('aria-label', initial === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }

  // Active nav highlight
  var sections = document.querySelectorAll('.section');
  var links = document.querySelectorAll('.nav-link');
  function setActive(id) {
    links.forEach(function (l) { l.classList.toggle('active', l.dataset.section === id); });
  }
  if (!('IntersectionObserver' in window)) {
    if (sections[0]) setActive(sections[0].id.replace('section-', ''));
    return;
  }
  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) setActive(e.target.id.replace('section-', '')); });
  }, { rootMargin: '-20% 0px -65% 0px' });
  sections.forEach(function (s) { obs.observe(s); });
  if (sections[0]) setActive(sections[0].id.replace('section-', ''));
})();
`;
}

// ─── HTML assembly ────────────────────────────────────────────────────────────

function generateHTML(data) {
  const buildDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const navItems = SECTIONS.map(s => `
<a href="#section-${s.key}" class="nav-link" data-section="${s.key}" aria-label="${s.label}: ${data[s.key].length} reports">
  <span class="nav-icon">${s.icon}</span>
  <span class="nav-label">${s.label}</span>
  <span class="nav-count" aria-hidden="true">${data[s.key].length}</span>
</a>`).join('\n');

  const releasesMeta = SECTIONS.find(s => s.key === 'releases');
  const sections = SECTIONS.map(s => renderSection(s, data[s.key])).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MediaJel Relations</title>
  <meta name="description" content="Weekly performance dashboard, achievements wall, and release notes for the MediaJel engineering team.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>${getCSS()}</style>
  <script>(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();</script>
</head>
<body>

<header class="hdr" role="banner">
  <a href="#" class="hdr-logo" aria-label="MediaJel Relations home">
    <div class="hdr-mark" aria-hidden="true">MJ</div>
    Relations
  </a>
  <span class="hdr-sep" aria-hidden="true">/</span>
  <span class="hdr-org">Engineering Team</span>
  <div class="hdr-space"></div>
  <time class="hdr-date" datetime="${new Date().toISOString()}">${buildDate}</time>
  <button class="theme-toggle" id="theme-toggle" aria-label="Switch to light mode" title="Toggle light/dark mode">
    <svg class="theme-icon theme-icon--sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg class="theme-icon theme-icon--moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>
</header>

<div class="layout">
  <nav class="sidebar" aria-label="Page sections">
    <p class="sidebar-lbl" aria-hidden="true">Sections</p>
    ${navItems}
    <p class="sidebar-lbl" style="margin-top:0.75rem" aria-hidden="true">Pages</p>
    <a href="releases/" class="nav-link" aria-label="Dedicated release notes page">
      <span class="nav-icon">${releasesMeta.icon}</span>
      <span class="nav-label">Release Notes ↗</span>
    </a>
  </nav>
  <div>
    <main class="main" id="main-content">
      ${sections}
    </main>
    <footer class="footer" role="contentinfo">
      <span>MediaJel Relations &middot; Generated ${buildDate}</span>
      <nav class="footer-links" aria-label="External links">
        <a href="https://github.com/MediaJel/med-relations" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://github.com/MediaJel/med-relations/actions" target="_blank" rel="noopener noreferrer">Actions</a>
        <a href="https://github.com/MediaJel/med-relations/tree/main/reports" target="_blank" rel="noopener noreferrer">Reports</a>
      </nav>
    </footer>
  </div>
</div>

<script>${getJS()}</script>
</body>
</html>`;
}

function generateReleasesHTML(releases) {
  const buildDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const releasesMeta = SECTIONS.find(s => s.key === 'releases');
  const releasesSection = renderSection(releasesMeta, releases);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Release Notes — MediaJel Relations</title>
  <meta name="description" content="Full versioned changelog for the MediaJel engineering team, newest first.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>${getCSS()}</style>
</head>
<body>

<header class="hdr" role="banner">
  <div class="hdr-logo">
    <div class="hdr-mark" aria-hidden="true">MJ</div>
    Release Notes
  </div>
  <div class="hdr-space"></div>
  <time class="hdr-date" datetime="${new Date().toISOString()}">${buildDate}</time>
</header>

<main class="main" id="main-content">
  ${releasesSection}
</main>
<footer class="footer" role="contentinfo">
  <span>MediaJel &middot; Release Notes &middot; Generated ${buildDate}</span>
  <nav class="footer-links" aria-label="External links">
    <a href="https://github.com/MediaJel/med-relations" target="_blank" rel="noopener noreferrer">GitHub</a>
  </nav>
</footer>

<script>${getJS()}</script>
</body>
</html>`;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function build() {
  await mkdir(DIST_DIR, { recursive: true });
  const results = await Promise.all(SECTIONS.map(s => readReports(s.key)));
  const data = Object.fromEntries(SECTIONS.map((s, i) => [s.key, results[i]]));
  for (const s of SECTIONS) {
    console.log(`  ${s.label}: ${data[s.key].length} report(s)`);
  }
  const html = generateHTML(data);
  await writeFile(`${DIST_DIR}/index.html`, html, 'utf-8');
  console.log(`\n✓  Built dist/index.html (${html.length.toLocaleString()} bytes)`);

  await mkdir(join(DIST_DIR, 'releases'), { recursive: true });
  const releasesHtml = generateReleasesHTML(data.releases);
  await writeFile(join(DIST_DIR, 'releases', 'index.html'), releasesHtml, 'utf-8');
  console.log(`✓  Built dist/releases/index.html (${releasesHtml.length.toLocaleString()} bytes)`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
