#!/usr/bin/env node
import { readdir, readFile, writeFile, mkdir, copyFile } from 'fs/promises';
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

async function readHtmlReports(category) {
  const dir = join(REPORTS_DIR, category);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  return files
    .filter(f => extname(f) === '.html' && f !== '.gitkeep')
    .sort()
    .reverse()
    .map(file => {
      const slug = basename(file, '.html');
      const title = `Week ${slug}`;
      return { slug, title, file };
    });
}

async function parseLatestAchievementHTML() {
  const dir = join(REPORTS_DIR, 'achievements');
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return null;
  }
  const htmlFiles = files
    .filter(f => extname(f) === '.html' && f !== '.gitkeep')
    .sort()
    .reverse();
  if (htmlFiles.length === 0) return null;

  let content;
  try {
    content = await readFile(join(dir, htmlFiles[0]), 'utf-8');
  } catch {
    return null;
  }

  const stats = {};
  const statCardRe = /<div class="stat-label">([^<]+)<\/div>\s*<div class="stat-value[^"]*">([^<]+)<\/div>/g;
  let m;
  while ((m = statCardRe.exec(content)) !== null) {
    stats[m[1].trim()] = m[2].trim();
  }

  const bugM = content.match(/var bugCount = (\d+)/);
  const featM = content.match(/var featCount = (\d+)/);
  const enhM = content.match(/var enhCount = (\d+)/);

  return {
    stats,
    chart: {
      bugCount: bugM ? parseInt(bugM[1], 10) : 0,
      featCount: featM ? parseInt(featM[1], 10) : 0,
      enhCount: enhM ? parseInt(enhM[1], 10) : 0,
    },
  };
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

function parseAchievementsStats(raw) {
  const section = raw.split(/^## By the numbers/m)[1];
  if (!section) return null;
  const chunk = section.split(/^## /m)[0];
  const tickets = chunk.match(/(\d+)\s+tickets? closed/);
  const prs = chunk.match(/(\d+)\s+PRs? merged/);
  const contributors = chunk.match(/(\d+)\s+contributors? active/);
  if (!tickets && !prs && !contributors) return null;
  return {
    ticketsClosed: tickets ? parseInt(tickets[1], 10) : null,
    prsMerged: prs ? parseInt(prs[1], 10) : null,
    contributorsActive: contributors ? parseInt(contributors[1], 10) : null,
  };
}

function parseAchievementCategories(raw) {
  const section = raw.split(/^## This week we shipped/m)[1];
  if (!section) return [];
  const chunk = section.split(/^## /m)[0];
  const categories = [];
  const headingRegex = /^### (.+)$/gm;
  let match;
  while ((match = headingRegex.exec(chunk)) !== null) {
    const label = match[1].trim();
    const afterHeading = chunk.slice(match.index + match[0].length);
    const nextHeading = afterHeading.search(/^### /m);
    const body = nextHeading === -1 ? afterHeading : afterHeading.slice(0, nextHeading);
    const count = (body.match(/^- /gm) || []).length;
    categories.push({ label, count });
  }
  return categories;
}

const CATEGORY_BADGE_CLASS = { Features: 'badge--feature', 'Bug Fixes': 'badge--fix' };

function renderAchievementStatGrid(stats) {
  if (!stats) return '';
  const cells = [
    stats.ticketsClosed !== null
      ? `<div class="stat-card"><span class="stat-val stat-val--green">${stats.ticketsClosed}</span><span class="stat-lbl">Tickets closed</span></div>`
      : null,
    stats.prsMerged !== null
      ? `<div class="stat-card"><span class="stat-val">${stats.prsMerged}</span><span class="stat-lbl">PRs merged</span></div>`
      : null,
    stats.contributorsActive !== null
      ? `<div class="stat-card"><span class="stat-val">${stats.contributorsActive}</span><span class="stat-lbl">Contributors</span></div>`
      : null,
  ].filter(Boolean);
  if (cells.length === 0) return '';
  return `<div class="stat-grid" style="grid-template-columns:repeat(${cells.length},1fr)">${cells.join('')}</div>`;
}

function renderAchievementCategoryBadges(categories) {
  if (!categories || categories.length === 0) return '';
  return categories.map(c => {
    const cls = CATEGORY_BADGE_CLASS[c.label] ?? 'badge--infra';
    return `<span class="badge ${cls}">${esc(c.label)} ${c.count}</span>`;
  }).join('');
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

const CAT_ICONS = {
  'Features': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1l1.2 2.4L11 4l-2 2 .5 2.8L7 7.5 4.5 8.8 5 6 3 4l2.8-.6L7 1z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
  'Bug Fixes': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M5 2a2 2 0 014 0M3 6h8M4 6V4l-2-2M10 6V4l2-2M4 10.5A3 3 0 007 13a3 3 0 003-2.5M3 6a4 4 0 008 0" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  'Enhancements': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.2 3.2l1.4 1.4M9.4 9.4l1.4 1.4M3.2 10.8l1.4-1.4M9.4 4.6l1.4-1.4M7 9.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
  'Infrastructure': `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><circle cx="7" cy="7" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M7 1v2M7 11v2M1 7h2M11 7h2M3.2 3.2l1.4 1.4M9.4 9.4l1.4 1.4M3.2 10.8l1.4-1.4M9.4 4.6l1.4-1.4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>`,
};
const CAT_TINT = {
  'Features': 'green',
  'Bug Fixes': 'orange',
  'Enhancements': 'indigo',
  'Infrastructure': 'slate',
};

function renderAchievementsShowcase(latestStats, categories) {
  if (!latestStats && (!categories || categories.length === 0)) return '';
  const { stats = {}, chart = { bugCount: 0, featCount: 0, enhCount: 0 } } = latestStats ?? {};

  const prs = esc(stats['PRs Merged'] || '—');
  const added = esc(stats['Lines Added'] || '—');
  const removed = esc(stats['Lines Removed'] || '—');
  const hotfixes = esc(stats['Hotfixes'] || '—');

  const { bugCount, featCount, enhCount } = chart;
  const total = bugCount + featCount + enhCount;

  const statItems = [
    { val: prs, lbl: 'PRs Merged', accent: 'indigo', raw: prs },
    { val: added, lbl: 'Lines Added', accent: 'green', raw: added },
    { val: removed, lbl: 'Lines Removed', accent: 'orange', raw: removed },
    { val: hotfixes, lbl: 'Hotfixes', accent: 'yellow', raw: hotfixes },
  ];

  const statRibbon = `
<div class="ach-showcase-stats">
  ${statItems.map(s => {
    const numVal = parseInt(String(s.raw).replace(/,/g, ''), 10);
    const countupAttr = !isNaN(numVal) && numVal >= 0 ? ` data-countup="${numVal}"` : '';
    return `<div class="ach-showcase-stat ach-showcase-stat--${s.accent}">
    <span class="ach-showcase-val"${countupAttr}>${s.val}</span>
    <span class="ach-showcase-lbl">${s.lbl}</span>
  </div>`;
  }).join('')}
</div>`;

  const chartBlock = total > 0 ? `
<div class="ach-showcase-chart-row">
  <div class="ach-showcase-chart-wrap">
    <canvas id="achShowcaseDonut" width="180" height="180"></canvas>
  </div>
  <div class="ach-showcase-legend">
    <div class="ach-showcase-legend-item"><span class="ach-showcase-dot" style="background:#f87171"></span><span>Bug Fixes — ${bugCount}</span></div>
    <div class="ach-showcase-legend-item"><span class="ach-showcase-dot" style="background:#818cf8"></span><span>New Features — ${featCount}</span></div>
    <div class="ach-showcase-legend-item"><span class="ach-showcase-dot" style="background:#34d399"></span><span>Enhancements — ${enhCount}</span></div>
  </div>
</div>
<script>
(function(){
  if(typeof Chart==='undefined')return;
  var ctx=document.getElementById('achShowcaseDonut');
  if(!ctx)return;
  var centerPlugin={id:'centerText',beforeDraw:function(chart){
    var c=chart.ctx,w=chart.width,h=chart.height;
    c.save();
    c.font='700 20px Inter,system-ui,sans-serif';
    c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text').trim()||'#f1f5f9';
    c.textAlign='center';c.textBaseline='middle';
    c.fillText('${total}',w/2,h/2-9);
    c.font='500 11px Inter,system-ui,sans-serif';
    c.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--text-3').trim()||'#64748b';
    c.fillText('items',w/2,h/2+11);
    c.restore();
  }};
  new Chart(ctx.getContext('2d'),{
    type:'doughnut',
    data:{labels:['Bug Fixes','New Features','Enhancements'],datasets:[{data:[${bugCount},${featCount},${enhCount}],backgroundColor:['#f87171','#818cf8','#34d399'],borderColor:'var(--surface)',borderWidth:3,hoverOffset:8}]},
    options:{responsive:false,cutout:'70%',plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.label+': '+c.raw+' ('+Math.round(c.raw/${total}*100)+'%)';}}}},centerText:true},
    plugins:[centerPlugin]
  });
})();
</script>` : '';

  const catPills = categories && categories.length > 0
    ? `<div class="ach-showcase-cats">
  ${categories.map(c => {
    const tint = CAT_TINT[c.label] ?? 'slate';
    const icon = CAT_ICONS[c.label] ?? CAT_ICONS['Infrastructure'];
    return `<div class="ach-cat-pill ach-cat-pill--${tint}">
    <span class="ach-cat-icon">${icon}</span>
    <span class="ach-cat-label">${esc(c.label)}</span>
    <span class="ach-cat-count">${c.count}</span>
  </div>`;
  }).join('\n  ')}
</div>` : '';

  const cta = `<div class="ach-cta-row">
  <a href="achievements/" class="ach-cta-btn" aria-label="View full achievements page">
    <span>View Full Achievements</span>
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
  </a>
</div>`;

  return `<div class="ach-showcase">${statRibbon}${chartBlock}${catPills}${cta}</div>`;
}

function renderAchievementsSection(reports, latestStats) {
  const latest = reports[0];
  const categories = parseAchievementCategories(latest.raw);
  const showcase = renderAchievementsShowcase(latestStats, categories);

  const cardBody = `
    ${showcase}
    <div class="report-body">${latest.html}</div>
  `;
  const featured = renderFeaturedCard(latest, cardBody);

  const archived = reports.slice(1).map(r => {
    const archivedCats = parseAchievementCategories(r.raw);
    const summaryBadges = archivedCats
      .map(c => {
        const cls = CATEGORY_BADGE_CLASS[c.label] ?? 'badge--infra';
        return `<span class="badge ${cls}">${esc(c.label)} ${c.count}</span>`;
      })
      .join('');
    return renderAccordion(
      r,
      summaryBadges ? `<div class="achievement-categories achievement-categories--archived">${summaryBadges}</div>` : '',
    );
  }).join('');

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

function renderSection(s, reports, extra) {
  const renderers = {
    performance: renderPerformanceSection,
    achievements: (rpts) => renderAchievementsSection(rpts, extra),
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
  --bg:       #0f1117;
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
  background: var(--accent-bg); border: 1px solid var(--accent-bd);
  color: var(--accent);
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

/* Achievement category badges */
.badge--feature { color: var(--green);  background: var(--green-bg);  border: 1px solid var(--green-bd); }
.badge--fix     { color: var(--orange); background: var(--orange-bg); border: 1px solid var(--orange-bd); }
.badge--infra   { color: var(--text-2); background: var(--surface-2); border: 1px solid var(--border); }
.achievement-categories {
  display: flex; flex-wrap: wrap; gap: 0.375rem;
  padding: 0.625rem 1.25rem;
  border-bottom: 1px solid var(--border);
}
.achievement-categories--archived {
  padding: 0.5rem 1rem 0;
  border-bottom: none;
}

/* ── Featured card ──────────────────────────────────────────────────────── */
.featured-card {
  background: var(--surface);
  border: 1px solid var(--accent-bd);
  border-top: 2px solid var(--accent);
  border-radius: 0 0 var(--radius) var(--radius);
  overflow: hidden; margin-bottom: 0.75rem;
  transition: box-shadow var(--t), border-color var(--t);
}
.featured-card:hover {
  box-shadow: 0 8px 28px rgba(99,102,241,.16);
  border-color: rgba(99,102,241,.45);
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
  transition: background var(--t);
  cursor: default;
}
.stat-card:hover { background: var(--surface-2); }
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
.dev-bar-track { height: 5px; background: var(--border); border-radius: 3px; overflow: hidden; }
.dev-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, var(--accent), #818cf8); max-width: 100%; }

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
  transition: border-color var(--t), box-shadow var(--t);
}
.accordion:hover { border-color: var(--border-2); }
.accordion[open] { border-color: var(--accent-bd); }
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
  transition: border-color var(--t), box-shadow var(--t);
}
.release-card:hover { border-color: var(--border-2); box-shadow: 0 6px 20px rgba(0,0,0,.18); }
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
.release-ver {
  display: inline-flex; align-items: center;
  font-size: 0.8125rem; font-weight: 600;
  padding: 2px 8px; border-radius: 6px;
  background: var(--surface-2); border: 1px solid var(--border);
  color: var(--text-2); font-variant-numeric: tabular-nums;
}
.release-ver--major {
  background: var(--accent-bg); border-color: var(--accent-bd);
  color: var(--accent); font-size: 0.875rem;
}
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

/* ── Achievements showcase (homepage section) ───────────────────────────── */
.ach-showcase { border-bottom: 1px solid var(--border); }

.ach-showcase-stats {
  display: grid; grid-template-columns: repeat(4, 1fr);
  gap: 1px; background: var(--border);
}
.ach-showcase-stat {
  background: var(--surface);
  padding: 1rem 0.75rem 0.875rem;
  display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px;
  border-top: 3px solid transparent;
  transition: background var(--t);
  cursor: default;
}
.ach-showcase-stat:hover { background: var(--surface-2); }
.ach-showcase-stat--indigo { border-top-color: var(--accent); }
.ach-showcase-stat--green  { border-top-color: var(--green); }
.ach-showcase-stat--orange { border-top-color: var(--orange); }
.ach-showcase-stat--yellow { border-top-color: #f59e0b; }
.ach-showcase-val {
  font-size: 1.75rem; font-weight: 700; line-height: 1; letter-spacing: -0.04em;
  color: var(--text); font-variant-numeric: tabular-nums;
}
.ach-showcase-stat--indigo .ach-showcase-val { color: var(--accent); }
.ach-showcase-stat--green  .ach-showcase-val { color: var(--green); }
.ach-showcase-stat--orange .ach-showcase-val { color: var(--orange); }
.ach-showcase-stat--yellow .ach-showcase-val { color: #f59e0b; }
.ach-showcase-lbl {
  font-size: 0.6875rem; color: var(--text-3);
  text-transform: uppercase; letter-spacing: 0.06em; font-weight: 600;
}

.ach-showcase-chart-row {
  display: flex; align-items: center; gap: 1.75rem;
  padding: 1.5rem 1.5rem 0.5rem;
}
.ach-showcase-chart-wrap { width: 180px; height: 180px; flex-shrink: 0; }
.ach-showcase-legend { display: flex; flex-direction: column; gap: 0.625rem; }
.ach-showcase-legend-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; color: var(--text-2); }
.ach-showcase-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }

.ach-showcase-cats {
  display: flex; flex-wrap: wrap; gap: 0.5rem;
  padding: 1rem 1.5rem 0.5rem;
}
.ach-cat-pill {
  display: inline-flex; align-items: center; gap: 0.4rem;
  padding: 0.4375rem 0.875rem;
  border-radius: 20px; border: 1px solid transparent;
  font-size: 0.8125rem; font-weight: 500;
  cursor: default;
  transition: box-shadow var(--t), transform var(--t);
}
.ach-cat-pill:hover { transform: translateY(-1px); }
.ach-cat-pill--green  { background: var(--green-bg);  border-color: var(--green-bd);  color: var(--green); }
.ach-cat-pill--orange { background: var(--orange-bg); border-color: var(--orange-bd); color: var(--orange); }
.ach-cat-pill--indigo { background: var(--accent-bg); border-color: var(--accent-bd); color: var(--accent); }
.ach-cat-pill--slate  { background: var(--surface-2); border-color: var(--border-2);  color: var(--text-2); }
.ach-cat-pill--green:hover  { box-shadow: 0 4px 14px rgba(22,163,74,.22); }
.ach-cat-pill--orange:hover { box-shadow: 0 4px 14px rgba(234,88,12,.22); }
.ach-cat-pill--indigo:hover { box-shadow: 0 4px 14px rgba(99,102,241,.22); }
.ach-cat-pill--slate:hover  { box-shadow: 0 4px 14px rgba(71,85,105,.12); }
.ach-cat-icon { display: flex; align-items: center; flex-shrink: 0; }
.ach-cat-label { font-weight: 600; }
.ach-cat-count {
  font-size: 0.75rem; padding: 0 5px; border-radius: 8px;
  background: rgba(0,0,0,0.06);
}
html[data-theme="dark"] .ach-cat-count { background: rgba(255,255,255,0.1); }

.ach-cta-row { padding: 1rem 1.5rem; }
.ach-cta-btn {
  display: inline-flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 1.125rem;
  background: var(--accent); color: #fff;
  border: none; border-radius: 8px;
  font-size: 0.875rem; font-weight: 600;
  text-decoration: none; cursor: pointer;
  transition: background var(--t), transform var(--t), box-shadow var(--t);
}
.ach-cta-btn:hover {
  background: #4f46e5;
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(99,102,241,.35);
}
.ach-cta-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }

@media (max-width: 900px) {
  .ach-showcase-stats { grid-template-columns: repeat(2, 1fr); }
  .ach-showcase-chart-row { padding: 1.25rem 1rem 0.5rem; }
  .ach-showcase-cats { padding: 0.875rem 1rem 0.375rem; }
  .ach-cta-row { padding: 0.875rem 1rem; }
}

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
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
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

// ─── Achievements page JS ─────────────────────────────────────────────────────

function getAchievementsJS() {
  return `
(function () {
  var btns = document.querySelectorAll('.ach-tab-btn');
  var panels = document.querySelectorAll('.ach-report-panel');

  function show(slug) {
    btns.forEach(function (b) {
      var active = b.dataset.slug === slug;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
      b.setAttribute('tabindex', active ? '0' : '-1');
    });
    panels.forEach(function (p) {
      var visible = p.dataset.slug === slug;
      if (visible) {
        p.style.display = 'block';
        p.classList.add('ach-report-panel--active');
      } else {
        p.style.display = 'none';
        p.classList.remove('ach-report-panel--active');
      }
    });
    try { history.replaceState(null, '', '#' + slug); } catch (e) {}
  }

  btns.forEach(function (b) {
    b.addEventListener('click', function () { show(b.dataset.slug); });
    b.addEventListener('keydown', function (e) {
      var idx = Array.from(btns).indexOf(b);
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(b.dataset.slug); }
      if (e.key === 'ArrowRight' && idx < btns.length - 1) { btns[idx + 1].focus(); show(btns[idx + 1].dataset.slug); }
      if (e.key === 'ArrowLeft'  && idx > 0)               { btns[idx - 1].focus(); show(btns[idx - 1].dataset.slug); }
    });
  });

  // Count-up animation for showcase stats
  document.querySelectorAll('[data-countup]').forEach(function (el) {
    var target = parseInt(el.dataset.countup, 10);
    if (isNaN(target) || target <= 0) return;
    var dur = 800, step = 16, n = Math.ceil(dur / step), count = 0;
    var interval = setInterval(function () {
      count++;
      el.textContent = count >= n ? target : Math.round((target / n) * count);
      if (count >= n) clearInterval(interval);
    }, step);
  });

  // Honour URL hash on load
  var hash = location.hash.replace('#', '');
  var initial = (hash && document.querySelector('.ach-tab-btn[data-slug="' + hash + '"]'))
    ? hash
    : (btns[0] ? btns[0].dataset.slug : null);
  if (initial) show(initial);
})();
`;
}

// ─── ISO week date helper ─────────────────────────────────────────────────────

function getDateOfISOWeek(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4);
  weekStart.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1) + (week - 1) * 7);
  return weekStart;
}

function formatWeekDateRange(slug) {
  const m = slug.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return '';
  const year = parseInt(m[1], 10);
  const week = parseInt(m[2], 10);
  const start = getDateOfISOWeek(year, week);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  const fmt = d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(start)} – ${fmt(end)}`;
}

// ─── HTML assembly ────────────────────────────────────────────────────────────

function generateHTML(data, htmlAchievementCount, latestStats) {
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
  const achievementsMeta = SECTIONS.find(s => s.key === 'achievements');
  const sections = SECTIONS.map(s =>
    renderSection(s, data[s.key], s.key === 'achievements' ? latestStats : undefined),
  ).join('\n');
  const chartJsCDN = latestStats
    ? '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>'
    : '';

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
  ${chartJsCDN}
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
    <a href="achievements/" class="nav-link" aria-label="Dedicated achievements page (${htmlAchievementCount} HTML reports)">
      <span class="nav-icon">${achievementsMeta.icon}</span>
      <span class="nav-label">Achievements ↗</span>
    </a>
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
  <a href="../" class="hdr-logo" aria-label="MediaJel Relations home">
    <div class="hdr-mark" aria-hidden="true">MJ</div>
    Relations
  </a>
  <span class="hdr-sep" aria-hidden="true">/</span>
  <span class="hdr-org">Release Notes</span>
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

async function generateAchievementsHTML(mdReports, htmlReports) {
  const buildDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const hasHtml = htmlReports.length > 0;

  const tabNav = hasHtml
    ? htmlReports.map((r, idx) => {
        const dateRange = formatWeekDateRange(r.slug);
        return `
<button
  class="ach-tab-btn${idx === 0 ? ' active' : ''}"
  data-slug="${esc(r.slug)}"
  aria-label="View ${esc(r.title)}${dateRange ? ' — ' + dateRange : ''}"
  tabindex="${idx === 0 ? '0' : '-1'}"
  role="tab"
  aria-selected="${idx === 0 ? 'true' : 'false'}"
>
  <span class="ach-tab-slug">${esc(r.slug)}</span>
  ${idx === 0 ? '<span class="badge badge--accent" aria-hidden="true">Latest</span>' : ''}
  ${dateRange ? `<span class="ach-tab-date">${esc(dateRange)}</span>` : ''}
</button>`;
      }).join('\n')
    : '';

  const panels = hasHtml
    ? await Promise.all(htmlReports.map(async (r, idx) => {
        let bodyContent = '';
        try {
          const content = await readFile(join(REPORTS_DIR, 'achievements', r.file), 'utf-8');
          bodyContent = content
            .replace(/^[\s\S]*?<body[^>]*>/i, '')
            .replace(/<\/body>[\s\S]*$/i, '');
        } catch {
          bodyContent = '<p style="padding:2rem;color:#94a3b8">Unable to load report.</p>';
        }
        return `
<div
  class="ach-report-panel${idx === 0 ? ' ach-report-panel--active' : ''}"
  data-slug="${esc(r.slug)}"
  role="tabpanel"
  aria-label="${esc(r.title)}"
  style="${idx === 0 ? '' : 'display:none'}"
>
  <div class="ach-report-content">${bodyContent}</div>
</div>`;
      }))
    : [`<div class="ach-viewer-empty">
  <div class="empty-state" role="status">
    <p class="empty-heading">No HTML reports yet</p>
    <p class="empty-sub">HTML achievement reports will appear here once the AchievementsAgent publishes them.</p>
  </div>
</div>`];

  const mdSection = mdReports.length > 0
    ? `
<section class="ach-legacy" aria-label="Legacy markdown reports">
  <h2 class="ach-legacy-title">Legacy Reports (Markdown)</h2>
  <div class="archive">
    ${mdReports.map(r => renderAccordion(r)).join('\n')}
  </div>
</section>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Achievements — MediaJel Relations</title>
  <meta name="description" content="Weekly achievement reports for the MediaJel engineering team.">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <style>
${getCSS()}

/* ── Achievements page layout ─────────────────────────────────────────── */
.ach-layout {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--hdr-h));
}

/* ── Horizontal pill-tab nav bar ──────────────────────────────────────── */
.ach-tabs-bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.5rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: var(--hdr-h);
  z-index: 90;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.ach-tabs-bar::-webkit-scrollbar { display: none; }

.ach-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4375rem 0.875rem;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 20px;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  font-family: inherit;
  color: var(--text-2);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background var(--t), color var(--t), border-color var(--t), box-shadow var(--t);
}
.ach-tab-btn:hover { background: var(--border); color: var(--text); }
.ach-tab-btn.active {
  background: var(--accent-bg);
  border-color: var(--accent-bd);
  color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-bg);
}
.ach-tab-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.ach-tab-slug {
  font-size: 0.75rem; font-weight: 600;
  font-variant-numeric: tabular-nums; opacity: 0.75;
}
.ach-tab-date { font-size: 0.6875rem; color: var(--text-3); }
.ach-tab-btn.active .ach-tab-date { color: var(--accent); opacity: 0.75; }

/* ── Report panels ────────────────────────────────────────────────────── */
.ach-panels { flex: 1; }
@keyframes achPanelIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}
.ach-report-panel--active { animation: achPanelIn 200ms ease both; }
.ach-report-content { max-width: 100%; overflow: hidden; }

/* ── Legacy + empty ───────────────────────────────────────────────────── */
.ach-viewer-empty { padding: 2.5rem; }
.ach-legacy {
  padding: 2rem 2.5rem;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.ach-legacy-title {
  font-size: 0.875rem; font-weight: 600; color: var(--text-3);
  letter-spacing: 0.04em; text-transform: uppercase;
  margin-bottom: 1rem;
}

/* ── Responsive ───────────────────────────────────────────────────────── */
@media (max-width: 900px) {
  .ach-tabs-bar { padding: 0.625rem 1rem; }
  .ach-legacy { padding: 1.25rem 1rem; }
}
  </style>
  <script>(function(){var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);})();</script>
</head>
<body>

<header class="hdr" role="banner">
  <a href="../" class="hdr-logo" aria-label="MediaJel Relations home">
    <div class="hdr-mark" aria-hidden="true">MJ</div>
    Relations
  </a>
  <span class="hdr-sep" aria-hidden="true">/</span>
  <span class="hdr-org">Achievements</span>
  <div class="hdr-space"></div>
  <time class="hdr-date" datetime="${new Date().toISOString()}">${buildDate}</time>
  <button class="theme-toggle" id="theme-toggle" aria-label="Switch to light mode" title="Toggle light/dark mode">
    <svg class="theme-icon theme-icon--sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
    <svg class="theme-icon theme-icon--moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
  </button>
</header>

<div class="ach-layout">
  <div class="ach-tabs-bar" role="tablist" aria-label="Achievement report weeks">
    ${tabNav}
  </div>
  <div class="ach-panels">
    ${panels.join('\n')}
    ${mdSection}
  </div>
</div>

<script>
${getJS()}
${getAchievementsJS()}
</script>
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
  const latestStats = await parseLatestAchievementHTML();
  if (latestStats) {
    console.log('  Achievements preview stats parsed from latest HTML report');
  }
  const html = generateHTML(data, 0, latestStats);
  await writeFile(`${DIST_DIR}/index.html`, html, 'utf-8');
  console.log(`\n✓  Built dist/index.html (${html.length.toLocaleString()} bytes)`);

  await mkdir(join(DIST_DIR, 'releases'), { recursive: true });
  const releasesHtml = generateReleasesHTML(data.releases);
  await writeFile(join(DIST_DIR, 'releases', 'index.html'), releasesHtml, 'utf-8');
  console.log(`✓  Built dist/releases/index.html (${releasesHtml.length.toLocaleString()} bytes)`);

  // Build achievements page
  const htmlReports = await readHtmlReports('achievements');
  console.log(`  Achievements (HTML): ${htmlReports.length} report(s)`);

  await mkdir(join(DIST_DIR, 'achievements', 'reports'), { recursive: true });
  for (const r of htmlReports) {
    const src = join(REPORTS_DIR, 'achievements', r.file);
    const dst = join(DIST_DIR, 'achievements', 'reports', r.file);
    await copyFile(src, dst);
  }

  const achievementsHtml = await generateAchievementsHTML(data.achievements, htmlReports);
  await writeFile(join(DIST_DIR, 'achievements', 'index.html'), achievementsHtml, 'utf-8');
  console.log(`✓  Built dist/achievements/index.html (${achievementsHtml.length.toLocaleString()} bytes)`);

  // Re-write index.html with correct HTML report count for the sidebar badge
  const htmlFinal = generateHTML(data, htmlReports.length, latestStats);
  await writeFile(`${DIST_DIR}/index.html`, htmlFinal, 'utf-8');
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
