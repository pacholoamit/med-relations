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
    short: 'Performance',
    icon: '📊',
    accent: '#58a6ff',
    accentR: 88, accentG: 166, accentB: 255,
    desc: 'Developer velocity and ticket metrics by week',
  },
  {
    key: 'achievements',
    label: 'Achievements Wall',
    short: 'Achievements',
    icon: '🏆',
    accent: '#f78166',
    accentR: 247, accentG: 129, accentB: 102,
    desc: 'Team wins, milestones, and highlights',
  },
  {
    key: 'releases',
    label: 'Release Notes',
    short: 'Releases',
    icon: '🚀',
    accent: '#3fb950',
    accentR: 63, accentG: 185, accentB: 80,
    desc: 'Full versioned changelog, newest first',
  },
];

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

function renderLeaderboard(rows, accentR, accentG, accentB) {
  if (!rows || rows.length === 0) return '';
  const maxTotal = Math.max(...rows.map(r => r.total), 1);
  const engineers = rows.filter(
    r => r.engineer.toLowerCase() !== 'unassigned',
  );
  const totalClosed = rows.reduce((s, r) => s + r.closed, 0);
  const totalQA = rows.reduce((s, r) => s + r.qa, 0);
  const metrics = `
  <div class="lb-metrics">
    <div class="lb-metric"><span class="lb-val">${totalClosed + totalQA}</span><span class="lb-key">Total tickets</span></div>
    <div class="lb-metric"><span class="lb-val" style="color:#3fb950">${totalClosed}</span><span class="lb-key">Closed</span></div>
    <div class="lb-metric"><span class="lb-val" style="color:#f78166">${totalQA}</span><span class="lb-key">Moved to QA</span></div>
    <div class="lb-metric"><span class="lb-val">${engineers.length}</span><span class="lb-key">Active engineers</span></div>
  </div>`;
  const cards = engineers
    .slice(0, 12)
    .map((row, idx) => {
      const pct = Math.round((row.total / maxTotal) * 100);
      const medal =
        idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}`;
      const rankEl =
        medal.length > 2
          ? `<span class="rank-emoji">${medal}</span>`
          : `<span class="rank-num">${medal}</span>`;
      const isTop = idx === 0;
      return `<div class="dev-card${isTop ? ' dev-card--top' : ''}" style="${isTop ? `border-color:rgba(${accentR},${accentG},${accentB},0.35);background:rgba(${accentR},${accentG},${accentB},0.06)` : ''}">
  <div class="dev-rank">${rankEl}</div>
  <div class="dev-body">
    <div class="dev-name">${esc(row.engineer)}</div>
    <div class="dev-bar-track"><div class="dev-bar" style="width:${pct}%;background:linear-gradient(90deg,rgba(${accentR},${accentG},${accentB},1),rgba(${accentR},${accentG},${accentB},0.5))"></div></div>
  </div>
  <div class="dev-pills">
    <span class="pill pill--green">${row.closed}✓</span>
    <span class="pill pill--orange">${row.qa} QA</span>
    <span class="dev-total">${row.total}</span>
  </div>
</div>`;
    })
    .join('\n');
  return `<div class="leaderboard">${metrics}<div class="dev-list">${cards}</div></div>`;
}

function renderSection(s, reports) {
  const { key, label, icon, accent, accentR, accentG, accentB, desc } = s;
  let content = '';

  if (reports.length === 0) {
    content = `<div class="empty-state">
  <div class="empty-icon">${icon}</div>
  <p>No ${label.toLowerCase()} reports yet.</p>
  <p class="empty-sub">Reports are committed automatically by the Relations pipeline.</p>
</div>`;
  } else if (key === 'performance') {
    const latest = reports[0];
    const rows = parsePerformanceTable(latest.raw);
    content = `
<div class="featured-card" style="border-top-color:${accent}">
  <div class="featured-header">
    <div class="chip-row">
      <span class="badge badge--latest" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.12);border-color:rgba(${accentR},${accentG},${accentB},0.25)">Latest</span>
      <span class="slug-chip" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.1)">${esc(latest.slug)}</span>
    </div>
    <h3 class="featured-title">${esc(latest.title)}</h3>
  </div>
  ${renderLeaderboard(rows, accentR, accentG, accentB)}
  <details class="expand-toggle">
    <summary>Full report</summary>
    <div class="report-body">${latest.html}</div>
  </details>
</div>
${reports
  .slice(1)
  .map(r => {
    const rrows = parsePerformanceTable(r.raw);
    return `<details class="report-card">
  <summary>
    <span class="chevron"></span>
    <span class="slug-chip slug-chip--sm" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.1)">${esc(r.slug)}</span>
    <span class="card-title">${esc(r.title)}</span>
  </summary>
  ${renderLeaderboard(rrows, accentR, accentG, accentB)}
  <div class="report-body">${r.html}</div>
</details>`;
  })
  .join('\n')}`;
  } else if (key === 'achievements') {
    const latest = reports[0];
    content = `
<div class="featured-card" style="border-top-color:${accent}">
  <div class="featured-header">
    <div class="chip-row">
      <span class="badge badge--latest" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.12);border-color:rgba(${accentR},${accentG},${accentB},0.25)">Latest</span>
      <span class="slug-chip" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.1)">${esc(latest.slug)}</span>
    </div>
    <h3 class="featured-title">${esc(latest.title)}</h3>
  </div>
  <div class="report-body achv-body">${latest.html}</div>
</div>
${reports
  .slice(1)
  .map(
    r => `<details class="report-card">
  <summary>
    <span class="chevron"></span>
    <span class="slug-chip slug-chip--sm" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.1)">${esc(r.slug)}</span>
    <span class="card-title">${esc(r.title)}</span>
  </summary>
  <div class="report-body">${r.html}</div>
</details>`,
  )
  .join('\n')}`;
  } else {
    // releases
    content = reports
      .map((r, idx) => {
        const isLatest = idx === 0;
        const isMajor = /^v?[1-9]/.test(r.slug);
        return `<div class="release-card${isLatest ? ' release-card--latest' : ''}" ${isLatest ? `style="border-top-color:${accent}"` : ''}>
  <div class="release-header">
    <span class="release-ver${isMajor ? ' release-ver--major' : ''}" style="${isMajor ? `color:${accent}` : ''}">${esc(r.slug)}</span>
    ${isLatest ? `<span class="badge badge--latest" style="color:${accent};background:rgba(${accentR},${accentG},${accentB},0.12);border-color:rgba(${accentR},${accentG},${accentB},0.25)">Latest</span>` : ''}
  </div>
  <div class="report-body">${r.html}</div>
</div>`;
      })
      .join('\n');
  }

  return `<section class="section" id="section-${key}">
  <div class="section-hd">
    <div class="section-icon" style="background:rgba(${accentR},${accentG},${accentB},0.12);border-color:rgba(${accentR},${accentG},${accentB},0.2)">${icon}</div>
    <div>
      <h2 class="section-title">${label}</h2>
      <p class="section-desc">${desc}</p>
    </div>
  </div>
  ${content}
</section>`;
}

function generateHTML(data) {
  const buildDate = new Date().toUTCString();

  const navItems = SECTIONS.map(
    s => `<a href="#section-${s.key}" class="nav-link" data-section="${s.key}">
  <span class="nav-icon">${s.icon}</span>
  <span class="nav-txt">
    <span class="nav-label">${s.label}</span>
    <span class="nav-sub">${s.desc}</span>
  </span>
  <span class="nav-count">${data[s.key].length}</span>
</a>`,
  ).join('\n');

  const sections = SECTIONS.map(s => renderSection(s, data[s.key])).join('\n');

  const css = `
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
:root{
  --bg:#0d1117;--surf:#161b22;--surf2:#1c2128;
  --border:#30363d;--border2:#21262d;
  --text:#e6edf3;--text2:#c9d1d9;--muted:#8b949e;
}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  background:var(--bg);color:var(--text);min-height:100vh;font-size:15px;line-height:1.6;
}

/* ── Header ── */
.hdr{
  position:sticky;top:0;z-index:200;
  height:56px;padding:0 1.5rem;
  display:flex;align-items:center;gap:0.875rem;
  background:rgba(13,17,23,0.92);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);
  border-bottom:1px solid var(--border);
}
.hdr-logo{display:flex;align-items:center;gap:0.625rem;text-decoration:none;color:var(--text)}
.hdr-gem{
  width:28px;height:28px;border-radius:7px;flex-shrink:0;
  background:linear-gradient(135deg,#58a6ff 0%,#3fb950 100%);
  display:flex;align-items:center;justify-content:center;font-size:13px;
}
.hdr-name{font-weight:700;font-size:0.95rem;letter-spacing:-0.01em}
.hdr-org{
  font-size:0.75rem;color:var(--muted);
  background:var(--surf2);border:1px solid var(--border);
  padding:2px 9px;border-radius:12px;
}
.hdr-space{flex:1}
.live-pill{display:flex;align-items:center;gap:6px;font-size:0.72rem;font-weight:600;color:#3fb950}
.live-dot{width:6px;height:6px;border-radius:50%;background:#3fb950;animation:blink 2.4s ease infinite}
@keyframes blink{0%,100%{box-shadow:0 0 0 0 rgba(63,185,80,.45)}60%{box-shadow:0 0 0 5px rgba(63,185,80,0)}}
.hdr-time{font-size:0.7rem;color:var(--muted)}

/* ── Layout ── */
.layout{display:grid;grid-template-columns:252px 1fr;min-height:calc(100vh - 56px)}

/* ── Sidebar ── */
.sidebar{
  border-right:1px solid var(--border);padding:1.25rem 0;
  position:sticky;top:56px;height:calc(100vh - 56px);overflow-y:auto;
}
.sidebar-lbl{
  font-size:0.67rem;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;
  color:var(--muted);padding:0 1.25rem 0.875rem;
}
.nav-link{
  display:flex;align-items:center;gap:0.625rem;
  padding:0.75rem 1.25rem;text-decoration:none;color:var(--text2);
  border-left:2px solid transparent;transition:background .12s,color .12s,border-color .12s;
}
.nav-link:hover{background:var(--surf);color:var(--text)}
.nav-link.active{color:#58a6ff;background:rgba(88,166,255,.07);border-left-color:#58a6ff}
.nav-icon{font-size:1rem;width:22px;text-align:center;flex-shrink:0}
.nav-txt{flex:1;min-width:0}
.nav-label{display:block;font-size:0.84rem;font-weight:500;line-height:1.25}
.nav-sub{display:block;font-size:0.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.nav-count{font-size:0.7rem;color:var(--muted);background:var(--surf2);border:1px solid var(--border);padding:1px 7px;border-radius:10px;flex-shrink:0}

/* ── Main ── */
.main{padding:2rem 2.5rem;max-width:880px}

/* ── Section ── */
.section{margin-bottom:4rem;scroll-margin-top:72px}
.section-hd{display:flex;align-items:flex-start;gap:0.875rem;margin-bottom:1.25rem;padding-bottom:1rem;border-bottom:1px solid var(--border)}
.section-icon{width:38px;height:38px;border-radius:9px;border:1px solid;display:flex;align-items:center;justify-content:center;font-size:1.1rem;flex-shrink:0}
.section-title{font-size:1.1rem;font-weight:700;line-height:1.25}
.section-desc{font-size:0.78rem;color:var(--muted);margin-top:3px}

/* ── Chips & Badges ── */
.chip-row{display:flex;align-items:center;gap:0.4rem;margin-bottom:0.5rem}
.badge{font-size:0.63rem;font-weight:700;padding:2px 8px;border-radius:20px;border:1px solid;letter-spacing:0.04em;text-transform:uppercase}
.slug-chip{font-family:'SF Mono','Cascadia Code',Consolas,monospace;font-size:0.76rem;padding:2px 8px;border-radius:4px}
.slug-chip--sm{font-size:0.72rem;padding:1px 7px}

/* ── Featured Card ── */
.featured-card{background:var(--surf);border:1px solid var(--border);border-top:2px solid;border-radius:0 0 10px 10px;overflow:hidden;margin-bottom:1rem}
.featured-header{padding:1.125rem 1.5rem}
.featured-title{font-size:0.9rem;font-weight:600;color:var(--text2)}

/* ── Leaderboard ── */
.leaderboard{padding:0 1.5rem 1.25rem}
.lb-metrics{
  display:grid;grid-template-columns:repeat(4,1fr);gap:1px;
  background:var(--border);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:1rem;
}
.lb-metric{background:var(--surf2);padding:0.75rem 0.5rem;display:flex;flex-direction:column;align-items:center;text-align:center}
.lb-val{font-size:1.4rem;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums;color:#e6edf3}
.lb-key{font-size:0.66rem;color:var(--muted);margin-top:2px;text-transform:uppercase;letter-spacing:.04em}
.dev-list{display:flex;flex-direction:column;gap:0.4rem}
.dev-card{
  display:flex;align-items:center;gap:0.625rem;
  padding:0.55rem 0.7rem;border:1px solid var(--border2);border-radius:7px;
  background:var(--surf2);
}
.dev-rank{width:26px;text-align:center;flex-shrink:0}
.rank-emoji{font-size:1rem}
.rank-num{font-size:0.78rem;color:var(--muted);font-weight:600}
.dev-body{flex:1;min-width:0}
.dev-name{font-size:0.82rem;font-weight:600;font-family:'SF Mono','Cascadia Code',Consolas,monospace;margin-bottom:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dev-bar-track{height:3px;background:var(--border);border-radius:2px;overflow:hidden}
.dev-bar{height:100%;border-radius:2px}
.dev-pills{display:flex;align-items:center;gap:0.35rem;flex-shrink:0}
.pill{font-size:0.67rem;padding:2px 6px;border-radius:10px;font-weight:600;white-space:nowrap}
.pill--green{background:rgba(63,185,80,.13);color:#3fb950;border:1px solid rgba(63,185,80,.2)}
.pill--orange{background:rgba(247,129,102,.12);color:#f78166;border:1px solid rgba(247,129,102,.2)}
.dev-total{font-size:0.82rem;font-weight:700;min-width:20px;text-align:right}

/* ── Expand toggle ── */
.expand-toggle{border-top:1px solid var(--border)}
.expand-toggle>summary{
  display:flex;align-items:center;gap:0.5rem;padding:0.65rem 1.5rem;
  cursor:pointer;list-style:none;font-size:0.78rem;color:var(--muted);
  user-select:none;transition:color .1s;
}
.expand-toggle>summary::-webkit-details-marker{display:none}
.expand-toggle>summary:hover{color:var(--text)}
.expand-toggle>summary::before{content:'⊕';font-size:0.85rem}
.expand-toggle[open]>summary::before{content:'⊖'}

/* ── Report card (accordion) ── */
.report-card{background:var(--surf);border:1px solid var(--border);border-radius:8px;margin-bottom:0.625rem;overflow:hidden}
.report-card>summary{
  display:flex;align-items:center;gap:0.625rem;
  padding:0.8rem 1.125rem;cursor:pointer;list-style:none;user-select:none;
  transition:background .1s;
}
.report-card>summary:hover{background:var(--surf2)}
.report-card>summary::-webkit-details-marker{display:none}
.chevron{
  width:14px;height:14px;flex-shrink:0;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Cpath fill='%238b949e' d='M6.22 3.22a.75.75 0 011.06 0l4.25 4.25a.75.75 0 010 1.06l-4.25 4.25a.749.749 0 01-1.275-.53.749.749 0 01.215-.53L9.94 8 6.22 4.28a.75.75 0 010-1.06z'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:center;
  transition:transform .15s;
}
.report-card[open]>.chevron,.report-card[open]>summary .chevron{transform:rotate(90deg)}
.card-title{flex:1;font-size:0.84rem;color:var(--text2)}

/* ── Releases ── */
.release-card{background:var(--surf);border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:1rem}
.release-card--latest{border-top:2px solid;border-radius:0 0 10px 10px}
.release-header{display:flex;align-items:center;gap:0.75rem;padding:0.875rem 1.5rem;border-bottom:1px solid var(--border);background:var(--surf2)}
.release-ver{font-family:'SF Mono','Cascadia Code',Consolas,monospace;font-size:1rem;font-weight:700}

/* ── Report body (shared) ── */
.report-body{padding:1.125rem 1.5rem;font-size:0.86rem;line-height:1.75;color:var(--text2)}
.report-card .report-body{border-top:1px solid var(--border)}
.report-body h1{font-size:1.15rem;font-weight:700;margin:1.2rem 0 0.5rem;color:var(--text)}
.report-body h2{font-size:0.95rem;font-weight:700;margin:.95rem 0 .45rem;color:var(--text)}
.report-body h3{font-size:0.875rem;font-weight:600;margin:.8rem 0 .4rem;color:var(--text2)}
.report-body h1:first-child,.report-body h2:first-child,.report-body h3:first-child{margin-top:0}
.report-body p{margin-bottom:.6rem}
.report-body ul,.report-body ol{padding-left:1.4rem;margin-bottom:.6rem}
.report-body li{margin-bottom:.2rem}
.report-body strong{color:var(--text)}
.report-body em{color:var(--muted)}
.report-body a{color:#58a6ff;text-decoration:none}
.report-body a:hover{text-decoration:underline}
.report-body hr{border:none;border-top:1px solid var(--border);margin:.875rem 0}
.report-body code{
  font-family:'SF Mono','Cascadia Code',Consolas,monospace;font-size:.82em;
  background:var(--surf2);border:1px solid var(--border);
  padding:1px 5px;border-radius:4px;color:#f0883e;
}
.report-body pre{background:var(--surf2);border:1px solid var(--border);padding:.875rem;border-radius:6px;overflow-x:auto;margin-bottom:.75rem}
.report-body pre code{background:none;border:none;padding:0;color:var(--text2)}
.report-body table{border-collapse:collapse;width:100%;margin-bottom:.75rem;font-size:.8rem}
.report-body th,.report-body td{border:1px solid var(--border);padding:.375rem .7rem;text-align:left}
.report-body th{background:var(--surf2);font-weight:600;color:var(--text)}
.report-body tr:hover td{background:rgba(255,255,255,.02)}
.report-body blockquote{border-left:3px solid var(--border);padding-left:.875rem;color:var(--muted);margin-bottom:.6rem}

/* Achievements body overrides */
.achv-body h2{font-size:.8rem;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin-top:1.25rem}
.achv-body h3{color:var(--text);font-size:.875rem}

/* ── Empty state ── */
.empty-state{text-align:center;padding:3rem 1rem;color:var(--muted)}
.empty-icon{font-size:2.25rem;margin-bottom:.75rem}
.empty-state p{font-size:.875rem}
.empty-sub{margin-top:.3rem;font-size:.78rem}

/* ── Footer ── */
.footer{
  border-top:1px solid var(--border);padding:1.5rem 2.5rem;
  display:flex;align-items:center;justify-content:space-between;
  font-size:.72rem;color:var(--muted);margin-top:2rem;
}
.footer-links{display:flex;gap:.875rem}
.footer-links a{color:var(--muted);text-decoration:none;transition:color .1s}
.footer-links a:hover{color:var(--text)}

/* ── Responsive ── */
@media(max-width:768px){
  .layout{grid-template-columns:1fr}
  .sidebar{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border);padding:.625rem 0;display:flex;gap:0;overflow-x:auto}
  .nav-sub,.nav-count{display:none}
  .nav-link{padding:.625rem 1rem;border-left:none;border-bottom:2px solid transparent}
  .nav-link.active{border-bottom-color:#58a6ff;border-left-color:transparent}
  .sidebar-lbl{display:none}
  .main{padding:1.25rem}
  .lb-metrics{grid-template-columns:repeat(2,1fr)}
  .dev-pills{display:none}
  .footer{flex-direction:column;gap:.625rem;text-align:center}
  .hdr-time{display:none}
}
`;

  const js = `
(function(){
  var sections=document.querySelectorAll('.section');
  var links=document.querySelectorAll('.nav-link');
  function setActive(id){
    links.forEach(function(l){l.classList.toggle('active',l.dataset.section===id)});
  }
  if(!('IntersectionObserver' in window)){if(sections[0])setActive(sections[0].id.replace('section-',''));return}
  var obs=new IntersectionObserver(function(entries){
    entries.forEach(function(e){if(e.isIntersecting)setActive(e.target.id.replace('section-',''))});
  },{rootMargin:'-25% 0px -65% 0px'});
  sections.forEach(function(s){obs.observe(s)});
  if(sections[0])setActive(sections[0].id.replace('section-',''));
})();
`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MediaJel Relations</title>
<meta name="description" content="Weekly performance dashboard, achievements wall, and release notes for the MediaJel engineering team.">
<style>${css}</style>
</head>
<body>

<header class="hdr">
  <a href="#" class="hdr-logo">
    <div class="hdr-gem">⚡</div>
    <span class="hdr-name">Relations</span>
  </a>
  <span class="hdr-org">MediaJel Engineering</span>
  <div class="hdr-space"></div>
  <div class="live-pill"><span class="live-dot"></span>Live</div>
  <span class="hdr-time">${buildDate}</span>
</header>

<div class="layout">
  <nav class="sidebar">
    <div class="sidebar-lbl">Sections</div>
    ${navItems}
  </nav>
  <div>
    <main class="main">
      ${sections}
    </main>
    <footer class="footer">
      <span>Auto-generated by the MediaJel Relations pipeline</span>
      <div class="footer-links">
        <a href="https://github.com/MediaJel/med-relations" target="_blank" rel="noopener noreferrer">GitHub</a>
        <a href="https://github.com/MediaJel/med-relations/actions" target="_blank" rel="noopener noreferrer">Actions</a>
        <a href="https://github.com/MediaJel/med-relations/tree/main/reports" target="_blank" rel="noopener noreferrer">Reports</a>
      </div>
    </footer>
  </div>
</div>

<script>${js}</script>
</body>
</html>`;
}

async function build() {
  await mkdir(DIST_DIR, { recursive: true });
  const data = {};
  for (const s of SECTIONS) {
    data[s.key] = await readReports(s.key);
    console.log(`  ${s.icon}  ${s.label}: ${data[s.key].length} report(s)`);
  }
  const html = generateHTML(data);
  await writeFile(join(DIST_DIR, 'index.html'), html, 'utf-8');
  console.log(`\n✅ Built dist/index.html (${html.length.toLocaleString()} bytes)`);
}

build().catch(err => {
  console.error(err);
  process.exit(1);
});
