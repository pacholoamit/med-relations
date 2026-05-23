#!/usr/bin/env node
/**
 * Build script: scans reports/ subdirectories, converts Markdown → HTML,
 * and emits dist/index.html as the GitHub Pages static site.
 */
import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename, extname, resolve } from 'path';
import { marked } from 'marked';

const ROOT = resolve(new URL('.', import.meta.url).pathname, '..');
const REPORTS_DIR = join(ROOT, 'reports');
const DIST_DIR = join(ROOT, 'dist');

const CATEGORIES = [
  { key: 'performance',   label: 'Dev Performance',  icon: '📊' },
  { key: 'achievements',  label: 'Achievements',      icon: '🏆' },
  { key: 'releases',      label: 'Release Notes',     icon: '🚀' },
];

async function readReports(category) {
  const dir = join(REPORTS_DIR, category);
  let files;
  try {
    files = await readdir(dir);
  } catch {
    return [];
  }
  const mdFiles = files.filter(f => extname(f) === '.md').sort().reverse();

  return Promise.all(mdFiles.map(async (file) => {
    const raw = await readFile(join(dir, file), 'utf-8');
    const html = await marked.parse(raw);
    const slug = basename(file, '.md');
    const firstLine = raw.split('\n').find(l => l.trim()) ?? slug;
    const title = firstLine.replace(/^#+\s*/, '').trim();
    return { slug, title, html };
  }));
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function generateHTML(data) {
  const tabs = CATEGORIES.map((cat, i) =>
    `<button class="tab${i === 0 ? ' active' : ''}" data-tab="${cat.key}">${cat.icon} ${cat.label}</button>`
  ).join('\n        ');

  const panels = CATEGORIES.map((cat, i) => {
    const reports = data[cat.key];
    let content;
    if (reports.length === 0) {
      content = `<div class="empty">No ${cat.label.toLowerCase()} reports yet.</div>`;
    } else {
      content = reports.map((r, idx) => `
        <details class="report-card"${idx === 0 ? ' open' : ''}>
          <summary><span class="report-slug">${escapeHtml(r.slug)}</span> — ${escapeHtml(r.title)}</summary>
          <div class="report-body">${r.html}</div>
        </details>`).join('\n');
    }
    return `<div class="panel${i === 0 ? ' active' : ''}" id="tab-${cat.key}">${content}</div>`;
  }).join('\n');

  const buildDate = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MED Relations</title>
  <style>
    :root {
      --bg: #0d1117;
      --surface: #161b22;
      --border: #30363d;
      --text: #e6edf3;
      --muted: #8b949e;
      --accent: #58a6ff;
      --accent-hover: #79c0ff;
      --success: #3fb950;
      --tab-active-bg: #21262d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); color: var(--text); min-height: 100vh;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding: 1.25rem 2rem;
      display: flex; align-items: center; gap: 1rem;
    }
    header h1 { font-size: 1.25rem; font-weight: 600; }
    header .badge {
      font-size: 0.7rem; background: var(--success); color: #000;
      padding: 2px 8px; border-radius: 20px; font-weight: 600;
    }
    .build-info { margin-left: auto; font-size: 0.75rem; color: var(--muted); }
    main { max-width: 900px; margin: 0 auto; padding: 2rem; }
    .tabs {
      display: flex; gap: 0.5rem; border-bottom: 1px solid var(--border); margin-bottom: 1.5rem;
    }
    .tab {
      background: none; border: none; color: var(--muted); cursor: pointer;
      padding: 0.6rem 1.2rem; font-size: 0.9rem; border-bottom: 2px solid transparent;
      transition: color .15s, border-color .15s;
    }
    .tab:hover { color: var(--text); }
    .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
    .panel { display: none; }
    .panel.active { display: block; }
    .empty { color: var(--muted); font-size: 0.9rem; padding: 2rem 0; text-align: center; }
    .report-card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 8px; margin-bottom: 1rem; overflow: hidden;
    }
    .report-card summary {
      padding: 1rem 1.25rem; cursor: pointer; list-style: none;
      display: flex; align-items: center; gap: 0.75rem; user-select: none;
    }
    .report-card summary::-webkit-details-marker { display: none; }
    .report-card summary::before {
      content: '▶'; font-size: 0.65rem; color: var(--muted); transition: transform .15s;
    }
    .report-card[open] summary::before { transform: rotate(90deg); }
    .report-slug {
      font-family: 'SF Mono', Consolas, monospace; font-size: 0.8rem;
      background: var(--tab-active-bg); padding: 2px 8px; border-radius: 4px;
      color: var(--accent);
    }
    .report-body {
      padding: 1.25rem 1.5rem; border-top: 1px solid var(--border);
      font-size: 0.9rem; line-height: 1.7;
    }
    .report-body h1,.report-body h2,.report-body h3 { margin: 1.2rem 0 0.5rem; }
    .report-body h1 { font-size: 1.3rem; }
    .report-body h2 { font-size: 1.1rem; }
    .report-body h3 { font-size: 1rem; }
    .report-body p { margin-bottom: 0.75rem; }
    .report-body ul,.report-body ol { padding-left: 1.5rem; margin-bottom: 0.75rem; }
    .report-body li { margin-bottom: 0.3rem; }
    .report-body code {
      background: var(--tab-active-bg); padding: 1px 5px; border-radius: 3px;
      font-family: 'SF Mono', Consolas, monospace; font-size: 0.85em;
    }
    .report-body pre {
      background: var(--tab-active-bg); padding: 1rem; border-radius: 6px;
      overflow-x: auto; margin-bottom: 0.75rem;
    }
    .report-body pre code { background: none; padding: 0; }
    .report-body a { color: var(--accent); }
    .report-body table {
      border-collapse: collapse; width: 100%; margin-bottom: 0.75rem;
    }
    .report-body th,.report-body td {
      border: 1px solid var(--border); padding: 0.5rem 0.75rem; text-align: left;
    }
    .report-body th { background: var(--tab-active-bg); font-weight: 600; }
    footer {
      text-align: center; font-size: 0.75rem; color: var(--muted);
      padding: 2rem; border-top: 1px solid var(--border); margin-top: 2rem;
    }
  </style>
</head>
<body>
  <header>
    <h1>MED Relations</h1>
    <span class="badge">LIVE</span>
    <span class="build-info">Built ${buildDate}</span>
  </header>
  <main>
    <nav class="tabs">
        ${tabs}
    </nav>
    ${panels}
  </main>
  <footer>Generated by MED Relations pipeline &bull; <a href="https://github.com/pacholoamit/med-relations" style="color:var(--accent)">GitHub</a></footer>
  <script>
    document.querySelectorAll('.tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab, .panel').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      });
    });
  </script>
</body>
</html>`;
}

async function build() {
  await mkdir(DIST_DIR, { recursive: true });
  const data = {};
  for (const cat of CATEGORIES) {
    data[cat.key] = await readReports(cat.key);
    console.log(`  ${cat.icon}  ${cat.label}: ${data[cat.key].length} report(s)`);
  }
  const html = generateHTML(data);
  await writeFile(join(DIST_DIR, 'index.html'), html, 'utf-8');
  console.log(`\n✅ Built dist/index.html`);
}

build().catch(err => { console.error(err); process.exit(1); });
