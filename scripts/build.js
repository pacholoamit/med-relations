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
    icon: '📊',
    svgIcon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1 11l3.5-4 3 3L11 5l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    accent: '#58a6ff',
    rgb: { r: 88, g: 166, b: 255 },
    desc: 'Developer velocity and ticket metrics by week',
  },
  {
    key: 'achievements',
    label: 'Achievements Wall',
    icon: '🏆',
    svgIcon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1l1.854 3.757L14 5.517l-3 2.924.708 4.13L8 10.5l-3.708 2.07L5 8.44 2 5.517l4.146-.76L8 1z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
    accent: '#f78166',
    rgb: { r: 247, g: 129, b: 102 },
    desc: 'Team wins, milestones, and highlights',
  },
  {
    key: 'releases',
    label: 'Release Notes',
    icon: '🚀',
    svgIcon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5C8 1.5 13 4 13 8.5a5 5 0 01-10 0C3 4 8 1.5 8 1.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="8" cy="8.5" r="1.5" fill="currentColor"/></svg>`,
    accent: '#3fb950',
    rgb: { r: 63, g: 185, b: 80 },
    desc: 'Full versioned changelog, newest first',
  },
];

// ─── Data readers ────────────────────────────────────────────────────────────

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function rgbVars(prefix, { r, g, b }) {
  return `--${prefix}-r:${r};--${prefix}-g:${g};--${prefix}-b:${b}`;
}

// ─── Component renderers ─────────────────────────────────────────────────────

function renderStatGrid(totalClosed, totalQA, engineerCount) {
  const total = totalClosed + totalQA;
  return `
<div class="stat-grid" role="list">
  <div class="stat-card" role="listitem">
    <span class="stat-val">${total}</span>
    <span class="stat-key">Total tickets</span>
  </div>
  <div class="stat-card stat-card--green" role="listitem">
    <span class="stat-val">${totalClosed}</span>
    <span class="stat-key">Closed</span>
  </div>
  <div class="stat-card stat-card--orange" role="listitem">
    <span class="stat-val">${totalQA}</span>
    <span class="stat-key">Moved to QA</span>
  </div>
  <div class="stat-card" role="listitem">
    <span class="stat-val">${engineerCount}</span>
    <span class="stat-key">Active engineers</span>
  </div>
</div>`;
}

function renderDevCard(row, idx, maxTotal, rgb) {
  const pct = Math.max(4, Math.round((row.total / maxTotal) * 100));
  const medals = ['🥇', '🥈', '🥉'];
  const rankEl = idx < 3
    ? `<span class="rank-medal" aria-label="rank ${idx + 1}">${medals[idx]}</span>`
    : `<span class="rank-num" aria-label="rank ${idx + 1}">${idx + 1}</span>`;
  const isFirst = idx === 0;
  const styleVars = isFirst
    ? `${rgbVars('card-accent', rgb)};animation-delay:${idx * 40}ms`
    : `animation-delay:${idx * 40}ms`;
  return `
<div class="dev-card${isFirst ? ' dev-card--first' : ''}" style="${styleVars}">
  <div class="dev-rank">${rankEl}</div>
  <div class="dev-body">
    <div class="dev-name">${esc(row.engineer)}</div>
    <div class="dev-bar-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(row.engineer)} performance">
      <div class="dev-bar" style="${rgbVars('bar', rgb)};--bar-pct:${pct}%"></div>
    </div>
  </div>
  <div class="dev-stats">
    <span class="pill pill--green" title="Closed tickets">${row.closed} closed</span>
    <span class="pill pill--orange" title="Moved to QA">${row.qa} QA</span>
    <span class="dev-total">${row.total}</span>
  </div>
</div>`;
}

function renderLeaderboard(rows, rgb) {
  if (!rows || rows.length === 0) return '';

  const maxTotal = rows.reduce((m, r) => Math.max(m, r.total), 1);
  const engineers = rows.filter(r => r.engineer.toLowerCase() !== 'unassigned');
  const totalClosed = rows.reduce((s, r) => s + r.closed, 0);
  const totalQA = rows.reduce((s, r) => s + r.qa, 0);

  const statGrid = renderStatGrid(totalClosed, totalQA, engineers.length);
  const devCards = engineers
    .slice(0, 12)
    .map((row, idx) => renderDevCard(row, idx, maxTotal, rgb))
    .join('');

  return `
<div class="leaderboard">
  ${statGrid}
  <div class="dev-list" role="list" aria-label="Developer leaderboard">
    ${devCards}
  </div>
</div>`;
}

function renderExpandToggle(html) {
  return `
<details class="expand-details">
  <summary class="expand-summary">
    <span class="expand-icon" aria-hidden="true"></span>
    <span>Full report</span>
  </summary>
  <div class="report-body">${html}</div>
</details>`;
}

function renderAccordion(r, rgb, extraContent = '') {
  return `
<details class="accordion-card">
  <summary class="accordion-summary">
    <span class="accordion-chevron" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </span>
    <span class="slug-chip" style="${rgbVars('chip', rgb)}">${esc(r.slug)}</span>
    <span class="accordion-title">${esc(r.title)}</span>
  </summary>
  ${extraContent}
  <div class="report-body">${r.html}</div>
</details>`;
}

function renderFeaturedCard(r, rgb, body) {
  return `
<div class="featured-card" style="${rgbVars('fc', rgb)}">
  <div class="featured-header">
    <div class="chip-row">
      <span class="badge badge--latest" style="${rgbVars('badge', rgb)}">Latest</span>
      <span class="slug-chip" style="${rgbVars('chip', rgb)}">${esc(r.slug)}</span>
    </div>
    <h3 class="featured-title">${esc(r.title)}</h3>
  </div>
  ${body}
</div>`;
}

function renderEmptyState(icon, label) {
  return `
<div class="empty-state" role="status">
  <div class="empty-icon" aria-hidden="true">${icon}</div>
  <p>No ${label.toLowerCase()} reports yet.</p>
  <p class="empty-sub">Reports are committed automatically by the Relations pipeline.</p>
</div>`;
}

// ─── Section renderers ────────────────────────────────────────────────────────

function renderPerformanceSection(reports, section) {
  const { rgb } = section;
  const latest = reports[0];
  const rows = parsePerformanceTable(latest.raw);
  const leaderboard = renderLeaderboard(rows, rgb);
  const featured = renderFeaturedCard(
    latest, rgb,
    `${leaderboard}${renderExpandToggle(latest.html)}`,
  );
  const archived = reports.slice(1).map(r => {
    const lb = renderLeaderboard(parsePerformanceTable(r.raw), rgb);
    return renderAccordion(r, rgb, lb);
  }).join('');
  return `${featured}${archived}`;
}

function renderAchievementsSection(reports, section) {
  const { rgb } = section;
  const latest = reports[0];
  const featured = renderFeaturedCard(
    latest, rgb,
    `<div class="report-body achv-body">${latest.html}</div>`,
  );
  const archived = reports.slice(1).map(r => renderAccordion(r, rgb)).join('');
  return `${featured}${archived}`;
}

function renderReleasesSection(reports, section) {
  const { accent, rgb } = section;
  return `
<div class="release-timeline" role="list">
  ${reports.map((r, idx) => {
    const isLatest = idx === 0;
    const isMajor = /^v?[1-9]/.test(r.slug);
    return `
<article class="release-card${isLatest ? ' release-card--latest' : ''}" role="listitem"${isLatest ? ` style="${rgbVars('rc', rgb)}"` : ''}>
  <div class="release-dot" aria-hidden="true"></div>
  <div class="release-header">
    <span class="release-ver${isMajor ? ' release-ver--major' : ''}"${isMajor ? ` style="color:${accent}"` : ''}>${esc(r.slug)}</span>
    ${isLatest ? `<span class="badge badge--latest" style="${rgbVars('badge', rgb)}">Latest</span>` : ''}
  </div>
  <div class="report-body">${r.html}</div>
</article>`;
  }).join('')}
</div>`;
}

const SECTION_RENDERERS = {
  performance: renderPerformanceSection,
  achievements: renderAchievementsSection,
  releases: renderReleasesSection,
};

function renderSection(s, reports) {
  if (reports.length === 0) {
    const content = renderEmptyState(s.icon, s.label);
    return sectionWrapper(s, content);
  }
  const content = SECTION_RENDERERS[s.key](reports, s);
  return sectionWrapper(s, content);
}

function sectionWrapper(s, content) {
  return `
<section class="section" id="section-${s.key}" aria-labelledby="section-title-${s.key}">
  <header class="section-hd">
    <div class="section-icon" style="${rgbVars('si', s.rgb)}" aria-hidden="true">
      ${s.svgIcon}
    </div>
    <div>
      <h2 class="section-title" id="section-title-${s.key}">${s.label}</h2>
      <p class="section-desc">${s.desc}</p>
    </div>
  </header>
  ${content}
</section>`;
}

// ─── CSS ─────────────────────────────────────────────────────────────────────

function getCSS() {
  return `
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');

/* === TOKENS === */
:root {
  --bg: #070b10;
  --surf: #101720;
  --surf2: #141d28;
  --surf3: #1a2436;
  --border: rgba(255,255,255,0.07);
  --border2: rgba(255,255,255,0.04);
  --border-hover: rgba(255,255,255,0.12);
  --text: #e8eef6;
  --text2: #9baabb;
  --text3: #667788;
  --blue: #58a6ff;
  --green: #3fb950;
  --orange: #f78166;
  --hdr-h: 58px;
  --sidebar-w: 260px;
  --radius: 10px;
  --transition: 180ms cubic-bezier(0.4,0,0.2,1);
}

/* === RESET === */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

/* === BASE === */
body {
  font-family: 'Outfit', system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  font-size: 15px;
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
  background-image:
    radial-gradient(ellipse 80% 50% at 50% -20%, rgba(88,166,255,0.06) 0%, transparent 60%),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='0.025'/%3E%3C/svg%3E");
}

/* === HEADER === */
.hdr {
  position: sticky;
  top: 0;
  z-index: 200;
  height: var(--hdr-h);
  padding: 0 1.5rem;
  display: flex;
  align-items: center;
  gap: 0.875rem;
  background: rgba(7,11,16,0.88);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid var(--border);
}

.hdr-logo {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  text-decoration: none;
  color: var(--text);
  outline-offset: 4px;
}
.hdr-logo:focus-visible { outline: 2px solid var(--blue); border-radius: 4px; }

.hdr-gem {
  width: 30px;
  height: 30px;
  border-radius: 8px;
  flex-shrink: 0;
  background: linear-gradient(135deg, var(--blue) 0%, var(--green) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  box-shadow: 0 0 16px rgba(88,166,255,0.3);
}

.hdr-name {
  font-family: 'Syne', sans-serif;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: -0.02em;
  color: var(--text);
}

.hdr-divider {
  width: 1px;
  height: 18px;
  background: var(--border);
}

.hdr-org {
  font-size: 0.72rem;
  color: var(--text3);
  background: var(--surf2);
  border: 1px solid var(--border);
  padding: 2px 10px;
  border-radius: 20px;
  font-weight: 500;
  letter-spacing: 0.02em;
}

.hdr-space { flex: 1; }

.live-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--green);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  animation: pulse-dot 2.4s ease infinite;
}

@keyframes pulse-dot {
  0%, 100% { box-shadow: 0 0 0 0 rgba(63,185,80,0.5); }
  60% { box-shadow: 0 0 0 5px rgba(63,185,80,0); }
}

.hdr-time {
  font-size: 0.68rem;
  color: var(--text3);
  font-family: 'JetBrains Mono', monospace;
}

/* === LAYOUT === */
.layout {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  min-height: calc(100vh - var(--hdr-h));
}

/* === SIDEBAR === */
.sidebar {
  border-right: 1px solid var(--border);
  padding: 1.5rem 0;
  position: sticky;
  top: var(--hdr-h);
  height: calc(100vh - var(--hdr-h));
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.sidebar-lbl {
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  padding: 0 1.25rem 0.75rem;
  font-family: 'JetBrains Mono', monospace;
}

.nav-link {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1.25rem;
  text-decoration: none;
  color: var(--text2);
  border-left: 2px solid transparent;
  transition: background var(--transition), color var(--transition), border-color var(--transition);
  outline-offset: -2px;
  position: relative;
}
.nav-link:focus-visible { outline: 2px solid var(--blue); }
.nav-link:hover { background: rgba(255,255,255,0.03); color: var(--text); }
.nav-link.active { color: var(--blue); background: rgba(88,166,255,0.06); border-left-color: var(--blue); }

.nav-icon {
  width: 28px;
  height: 28px;
  border-radius: 7px;
  background: var(--surf2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background var(--transition), border-color var(--transition);
}
.nav-link.active .nav-icon {
  background: rgba(88,166,255,0.1);
  border-color: rgba(88,166,255,0.25);
  color: var(--blue);
}

.nav-txt { flex: 1; min-width: 0; }
.nav-label { display: block; font-size: 0.85rem; font-weight: 500; line-height: 1.3; }
.nav-sub { display: block; font-size: 0.69rem; color: var(--text3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }

.nav-count {
  font-size: 0.67rem;
  color: var(--text3);
  background: var(--surf3);
  border: 1px solid var(--border);
  padding: 1px 8px;
  border-radius: 20px;
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
}
.nav-link.active .nav-count { color: var(--blue); border-color: rgba(88,166,255,0.25); background: rgba(88,166,255,0.08); }

/* === MAIN CONTENT === */
.main { padding: 2.5rem 2.5rem 2rem; max-width: 900px; }

/* === SECTION === */
.section { margin-bottom: 4.5rem; scroll-margin-top: calc(var(--hdr-h) + 16px); }

.section-hd {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--border);
}

.section-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: 1px solid rgba(var(--si-r), var(--si-g), var(--si-b), 0.25);
  background: rgba(var(--si-r), var(--si-g), var(--si-b), 0.1);
  color: rgb(var(--si-r), var(--si-g), var(--si-b));
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-title {
  font-family: 'Syne', sans-serif;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: -0.02em;
  color: var(--text);
}

.section-desc { font-size: 0.77rem; color: var(--text3); margin-top: 3px; }

/* === FEATURED CARD === */
.featured-card {
  background: var(--surf);
  border: 1px solid var(--border);
  border-top: 2px solid rgb(var(--fc-r), var(--fc-g), var(--fc-b));
  border-radius: 0 0 var(--radius) var(--radius);
  overflow: hidden;
  margin-bottom: 0.875rem;
  animation: card-in 0.35s ease both;
}

@keyframes card-in {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.featured-header { padding: 1.25rem 1.5rem 0.875rem; }
.featured-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text2);
  margin-top: 0.4rem;
}

/* === STAT GRID === */
.stat-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
  border-left: none;
  border-right: none;
  margin-bottom: 1.25rem;
}

.stat-card {
  background: var(--surf2);
  padding: 1rem 0.75rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 4px;
  transition: background var(--transition);
}
.stat-card:hover { background: var(--surf3); }

.stat-val {
  font-family: 'Syne', sans-serif;
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text);
  letter-spacing: -0.03em;
}
.stat-card--green .stat-val { color: var(--green); }
.stat-card--orange .stat-val { color: var(--orange); }

.stat-key {
  font-size: 0.64rem;
  color: var(--text3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 500;
}

/* === LEADERBOARD === */
.leaderboard { padding: 0 1.5rem 1.25rem; }

.dev-list { display: flex; flex-direction: column; gap: 0.35rem; }

.dev-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0.875rem;
  border: 1px solid var(--border2);
  border-radius: 8px;
  background: var(--surf2);
  transition: background var(--transition), border-color var(--transition);
  animation: slide-in 0.4s ease both;
}
.dev-card:hover { background: var(--surf3); border-color: var(--border); }
.dev-card--first {
  border-color: rgba(var(--card-accent-r), var(--card-accent-g), var(--card-accent-b), 0.3);
  background: rgba(var(--card-accent-r), var(--card-accent-g), var(--card-accent-b), 0.06);
  box-shadow: 0 0 20px rgba(var(--card-accent-r), var(--card-accent-g), var(--card-accent-b), 0.08);
}
.dev-card--first:hover {
  background: rgba(var(--card-accent-r), var(--card-accent-g), var(--card-accent-b), 0.09);
  border-color: rgba(var(--card-accent-r), var(--card-accent-g), var(--card-accent-b), 0.45);
}

@keyframes slide-in {
  from { opacity: 0; transform: translateX(-8px); }
  to { opacity: 1; transform: translateX(0); }
}

.dev-rank { width: 28px; text-align: center; flex-shrink: 0; }
.rank-medal { font-size: 1.1rem; line-height: 1; }
.rank-num { font-size: 0.75rem; color: var(--text3); font-weight: 700; font-family: 'JetBrains Mono', monospace; }

.dev-body { flex: 1; min-width: 0; }
.dev-name {
  font-size: 0.83rem;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  margin-bottom: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text);
}

.dev-bar-track {
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}
.dev-bar {
  height: 100%;
  border-radius: 2px;
  width: var(--bar-pct);
  background: linear-gradient(90deg,
    rgba(var(--bar-r), var(--bar-g), var(--bar-b), 0.9),
    rgba(var(--bar-r), var(--bar-g), var(--bar-b), 0.45)
  );
  box-shadow: 0 0 6px rgba(var(--bar-r), var(--bar-g), var(--bar-b), 0.4);
  animation: bar-grow 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  transform-origin: left;
}

@keyframes bar-grow {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}

.dev-stats {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}

.dev-total {
  font-size: 0.83rem;
  font-weight: 700;
  min-width: 22px;
  text-align: right;
  color: var(--text);
  font-family: 'JetBrains Mono', monospace;
}

/* === PILLS / BADGES === */
.pill {
  font-size: 0.65rem;
  padding: 2px 7px;
  border-radius: 20px;
  font-weight: 600;
  white-space: nowrap;
  font-family: 'JetBrains Mono', monospace;
}
.pill--green { background: rgba(63,185,80,0.1); color: var(--green); border: 1px solid rgba(63,185,80,0.2); }
.pill--orange { background: rgba(247,129,102,0.1); color: var(--orange); border: 1px solid rgba(247,129,102,0.2); }

.badge {
  font-size: 0.6rem;
  font-weight: 700;
  padding: 2px 9px;
  border-radius: 20px;
  border: 1px solid rgba(var(--badge-r), var(--badge-g), var(--badge-b), 0.3);
  color: rgb(var(--badge-r), var(--badge-g), var(--badge-b));
  background: rgba(var(--badge-r), var(--badge-g), var(--badge-b), 0.1);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: 'JetBrains Mono', monospace;
}

.chip-row { display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.375rem; }

.slug-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.73rem;
  padding: 2px 8px;
  border-radius: 4px;
  color: rgb(var(--chip-r), var(--chip-g), var(--chip-b));
  background: rgba(var(--chip-r), var(--chip-g), var(--chip-b), 0.1);
  border: 1px solid rgba(var(--chip-r), var(--chip-g), var(--chip-b), 0.2);
}

/* === EXPAND TOGGLE === */
.expand-details { border-top: 1px solid var(--border); }

.expand-summary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 1.5rem;
  cursor: pointer;
  list-style: none;
  font-size: 0.77rem;
  color: var(--text3);
  user-select: none;
  transition: color var(--transition);
  font-family: 'JetBrains Mono', monospace;
}
.expand-summary::-webkit-details-marker { display: none; }
.expand-summary:hover { color: var(--text2); }

.expand-icon {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 1px solid currentColor;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  position: relative;
}
.expand-icon::before, .expand-icon::after {
  content: '';
  position: absolute;
  background: currentColor;
  border-radius: 1px;
}
.expand-icon::before { width: 6px; height: 1px; }
.expand-icon::after { width: 1px; height: 6px; transition: transform 0.2s; }
.expand-details[open] .expand-icon::after { transform: scaleY(0); }

/* === ACCORDION CARD === */
.accordion-card {
  background: var(--surf);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  margin-bottom: 0.5rem;
  overflow: hidden;
  transition: border-color var(--transition);
}
.accordion-card:hover { border-color: var(--border-hover); }

.accordion-summary {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.875rem 1.25rem;
  cursor: pointer;
  list-style: none;
  user-select: none;
  transition: background var(--transition);
}
.accordion-summary::-webkit-details-marker { display: none; }
.accordion-summary:hover { background: rgba(255,255,255,0.02); }

.accordion-chevron {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: var(--surf2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--text3);
  transition: transform 0.18s, background var(--transition);
}
.accordion-card[open] .accordion-chevron { transform: rotate(90deg); background: var(--surf3); }

.accordion-title { flex: 1; font-size: 0.84rem; color: var(--text2); font-weight: 500; }

/* === RELEASE TIMELINE === */
.release-timeline {
  position: relative;
  padding-left: 1.5rem;
}
.release-timeline::before {
  content: '';
  position: absolute;
  left: 0;
  top: 16px;
  bottom: 16px;
  width: 1px;
  background: linear-gradient(to bottom, var(--border) 0%, transparent 100%);
}

.release-card {
  position: relative;
  background: var(--surf);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  margin-bottom: 1.25rem;
  transition: border-color var(--transition);
  animation: card-in 0.35s ease both;
}
.release-card:hover { border-color: var(--border-hover); }
.release-card--latest {
  border-top: 2px solid rgb(var(--rc-r), var(--rc-g), var(--rc-b));
  border-radius: 0 0 var(--radius) var(--radius);
  box-shadow: 0 0 30px rgba(var(--rc-r), var(--rc-g), var(--rc-b), 0.06);
}

.release-dot {
  position: absolute;
  left: -1.875rem;
  top: 1.25rem;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border);
  border: 2px solid var(--surf);
}
.release-card--latest .release-dot {
  background: rgb(var(--rc-r), var(--rc-g), var(--rc-b));
  box-shadow: 0 0 8px rgba(var(--rc-r), var(--rc-g), var(--rc-b), 0.5);
}

.release-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--surf2);
}

.release-ver {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text2);
}
.release-ver--major {
  font-size: 1.15rem;
  font-weight: 700;
}

/* === REPORT BODY (rendered markdown) === */
.report-body {
  padding: 1.25rem 1.5rem;
  font-size: 0.875rem;
  line-height: 1.8;
  color: var(--text2);
}
.accordion-card .report-body { border-top: 1px solid var(--border); }

.report-body h1 { font-family: 'Syne', sans-serif; font-size: 1.1rem; font-weight: 700; margin: 1.25rem 0 0.5rem; color: var(--text); letter-spacing: -0.02em; }
.report-body h2 { font-size: 0.9rem; font-weight: 700; margin: 1rem 0 0.45rem; color: var(--text); }
.report-body h3 { font-size: 0.85rem; font-weight: 600; margin: 0.875rem 0 0.4rem; color: var(--text2); }
.report-body h1:first-child, .report-body h2:first-child, .report-body h3:first-child { margin-top: 0; }
.report-body p { margin-bottom: 0.625rem; }
.report-body ul, .report-body ol { padding-left: 1.4rem; margin-bottom: 0.625rem; }
.report-body li { margin-bottom: 0.25rem; }
.report-body strong { color: var(--text); font-weight: 600; }
.report-body em { color: var(--text3); font-style: italic; }
.report-body a { color: var(--blue); text-decoration: none; transition: color var(--transition); }
.report-body a:hover { color: #7dbfff; text-decoration: underline; }
.report-body a:focus-visible { outline: 2px solid var(--blue); border-radius: 2px; }
.report-body hr { border: none; border-top: 1px solid var(--border); margin: 1rem 0; }

.report-body code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.8em;
  background: var(--surf3);
  border: 1px solid var(--border);
  padding: 1px 5px;
  border-radius: 4px;
  color: #f0883e;
}

.report-body pre {
  background: var(--surf3);
  border: 1px solid var(--border);
  padding: 1rem;
  border-radius: 8px;
  overflow-x: auto;
  margin-bottom: 0.875rem;
}
.report-body pre code { background: none; border: none; padding: 0; color: var(--text2); }

.report-body table { border-collapse: collapse; width: 100%; margin-bottom: 0.875rem; font-size: 0.8rem; }
.report-body th, .report-body td { border: 1px solid var(--border); padding: 0.4rem 0.75rem; text-align: left; }
.report-body th { background: var(--surf2); font-weight: 600; color: var(--text); font-size: 0.77rem; }
.report-body tr:hover td { background: rgba(255,255,255,0.015); }

.report-body blockquote {
  border-left: 2px solid var(--border-hover);
  padding-left: 1rem;
  color: var(--text3);
  margin-bottom: 0.625rem;
}

/* Achievements overrides */
.achv-body h2 {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text3);
  margin-top: 1.5rem;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}
.achv-body h3 { color: var(--text); font-size: 0.875rem; font-weight: 600; }

/* === EMPTY STATE === */
.empty-state {
  text-align: center;
  padding: 3.5rem 1rem;
  color: var(--text3);
  background: var(--surf);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.empty-icon { font-size: 2.25rem; margin-bottom: 0.875rem; opacity: 0.6; }
.empty-state p { font-size: 0.875rem; }
.empty-sub { margin-top: 0.375rem; font-size: 0.78rem; color: var(--text3); }

/* === FOOTER === */
.footer {
  border-top: 1px solid var(--border);
  padding: 1.5rem 2.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.71rem;
  color: var(--text3);
  margin-top: 2.5rem;
}

.footer-brand {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.footer-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text3);
}

.footer-links { display: flex; gap: 1rem; }
.footer-links a {
  color: var(--text3);
  text-decoration: none;
  transition: color var(--transition);
  font-family: 'JetBrains Mono', monospace;
}
.footer-links a:hover { color: var(--text2); }
.footer-links a:focus-visible { outline: 2px solid var(--blue); border-radius: 2px; }

/* === RESPONSIVE === */
@media (max-width: 900px) {
  .layout { grid-template-columns: 1fr; }

  .sidebar {
    position: static;
    height: auto;
    border-right: none;
    border-bottom: 1px solid var(--border);
    padding: 0;
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .sidebar::-webkit-scrollbar { display: none; }
  .sidebar-lbl { display: none; }

  .nav-sub, .nav-count { display: none; }

  .nav-link {
    padding: 0.75rem 1rem;
    border-left: none;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    flex-shrink: 0;
  }
  .nav-link.active { border-bottom-color: var(--blue); border-left-color: transparent; background: transparent; }

  .nav-icon { width: 22px; height: 22px; border: none; background: transparent; }

  .main { padding: 1.5rem 1.25rem; }
  .stat-grid { grid-template-columns: repeat(2, 1fr); }
  .dev-stats { display: none; }
  .hdr-time { display: none; }
  .footer { flex-direction: column; gap: 0.75rem; text-align: center; }
  .release-timeline { padding-left: 0; }
  .release-timeline::before { display: none; }
  .release-dot { display: none; }
}

@media (max-width: 480px) {
  .hdr { padding: 0 1rem; }
  .hdr-org { display: none; }
  .hdr-divider { display: none; }
}

/* === PRINT === */
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
  var sections = document.querySelectorAll('.section');
  var links = document.querySelectorAll('.nav-link');

  function setActive(id) {
    links.forEach(function (l) {
      l.classList.toggle('active', l.dataset.section === id);
    });
  }

  if (!('IntersectionObserver' in window)) {
    if (sections[0]) setActive(sections[0].id.replace('section-', ''));
    return;
  }

  var obs = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setActive(e.target.id.replace('section-', ''));
      });
    },
    { rootMargin: '-20% 0px -65% 0px' }
  );

  sections.forEach(function (s) { obs.observe(s); });
  if (sections[0]) setActive(sections[0].id.replace('section-', ''));

  var barObs = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (e.isIntersecting) {
        e.target.style.animationPlayState = 'running';
        barObs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.dev-bar').forEach(function (bar) {
    bar.style.animationPlayState = 'paused';
    barObs.observe(bar);
  });
})();
`;
}

// ─── HTML assembly ────────────────────────────────────────────────────────────

function generateHTML(data) {
  const buildDate = new Date().toUTCString();

  const navItems = SECTIONS.map(s => `
<a href="#section-${s.key}" class="nav-link" data-section="${s.key}" aria-label="${s.label}: ${data[s.key].length} reports">
  <span class="nav-icon" aria-hidden="true">${s.svgIcon}</span>
  <span class="nav-txt">
    <span class="nav-label">${s.label}</span>
    <span class="nav-sub">${s.desc}</span>
  </span>
  <span class="nav-count" aria-hidden="true">${data[s.key].length}</span>
</a>`).join('\n');

  const sections = SECTIONS.map(s => renderSection(s, data[s.key])).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MediaJel Relations</title>
  <meta name="description" content="Weekly performance dashboard, achievements wall, and release notes for the MediaJel engineering team.">
  <meta name="color-scheme" content="dark">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>${getCSS()}</style>
</head>
<body>

<header class="hdr" role="banner">
  <a href="#" class="hdr-logo" aria-label="MediaJel Relations home">
    <div class="hdr-gem" aria-hidden="true">⚡</div>
    <span class="hdr-name">Relations</span>
  </a>
  <div class="hdr-divider" aria-hidden="true"></div>
  <span class="hdr-org">MediaJel Engineering</span>
  <div class="hdr-space"></div>
  <div class="live-pill" aria-label="Live dashboard">
    <span class="live-dot" aria-hidden="true"></span>
    Live
  </div>
  <time class="hdr-time" datetime="${new Date().toISOString()}">${buildDate}</time>
</header>

<div class="layout">
  <nav class="sidebar" aria-label="Page sections">
    <div class="sidebar-lbl" aria-hidden="true">Navigate</div>
    ${navItems}
  </nav>
  <div>
    <main class="main" id="main-content">
      ${sections}
    </main>
    <footer class="footer" role="contentinfo">
      <div class="footer-brand">
        <span>MediaJel Relations</span>
        <span class="footer-dot" aria-hidden="true"></span>
        <span>Auto-generated by the Relations pipeline</span>
      </div>
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

// ─── Entry point ──────────────────────────────────────────────────────────────

async function build() {
  await mkdir(DIST_DIR, { recursive: true });
  const results = await Promise.all(SECTIONS.map(s => readReports(s.key)));
  const data = Object.fromEntries(SECTIONS.map((s, i) => [s.key, results[i]]));
  for (const s of SECTIONS) {
    console.log(`  ${s.icon}  ${s.label}: ${data[s.key].length} report(s)`);
  }
  const html = generateHTML(data);
  await writeFile(join(DIST_DIR, 'index.html'), html, 'utf-8');
  console.log(`\n✅  Built dist/index.html (${html.length.toLocaleString()} bytes)`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
