const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const BRIEFS_FILE = path.join(ROOT, 'data', 'weekly-briefs.json');
const OUTPUT_DIR = path.join(ROOT, 'weekly-briefs');
const SITE = 'https://www.autonomyindex.io';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBriefPage(brief) {
  const canonicalPath = `/weekly-briefs/${brief.report_id}`;
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: brief.title,
    description: brief.subtitle,
    datePublished: brief.published_at_utc,
    dateModified: brief.published_at_utc,
    author: { '@type': 'Organization', name: 'Autonomy Index' },
    publisher: { '@type': 'Organization', name: 'Autonomy Index', logo: { '@type': 'ImageObject', url: `${SITE}/assets/icon.png` } },
    mainEntityOfPage: `${SITE}${canonicalPath}`
  };

  const movements = (brief.top_index_movements || [])
    .map((item) => `<li><strong>${escapeHtml(item.entity)}</strong> · ${escapeHtml(item.index)} ${item.delta > 0 ? '+' : ''}${escapeHtml(item.delta)} · <span class="confidence-badge">${escapeHtml(item.confidence)}</span></li>`)
    .join('');

  const summary = (brief.executive_delta_summary || [])
    .map((line) => `<li>${escapeHtml(line)}</li>`)
    .join('');

  const evidence = (brief.evidence_ledger || [])
    .map((item) => `<li>${escapeHtml(item.source_id)} — ${escapeHtml(item.used_for)}</li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(brief.title)} | Autonomy Index</title>
  <meta name="description" content="${escapeHtml(brief.subtitle)}">
  <link rel="canonical" href="${SITE}${canonicalPath}">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Autonomy Index', url: SITE, logo: `${SITE}/assets/icon.png` })}</script>
  <script type="application/ld+json">${JSON.stringify(articleJsonLd)}</script>
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <main class="section">
    <div class="container">
      <h1 class="section-title" style="text-align:left;">${escapeHtml(brief.title)}</h1>
      <p class="brief-meta">${escapeHtml(brief.subtitle)} · Published ${escapeHtml(brief.published_at_utc)}</p>
      <h2 class="signals-section-title">Executive Delta Summary</h2>
      <ul>${summary}</ul>
      <h2 class="signals-section-title" style="margin-top:20px;">Top Index Movements</h2>
      <ul>${movements}</ul>
      <h2 class="signals-section-title" style="margin-top:20px;">Evidence Ledger</h2>
      <ul>${evidence}</ul>
      <p style="margin-top:20px;"><a href="/weekly-briefs">All Weekly Briefs</a></p>
    </div>
  </main>
</body>
</html>`;
}

function renderIndexPage(briefs) {
  const rows = briefs
    .sort((a, b) => Date.parse(b.published_at_utc) - Date.parse(a.published_at_utc))
    .map((brief) => `<li><a href="/weekly-briefs/${brief.report_id}">${escapeHtml(brief.title)}</a> <span class="brief-meta">${escapeHtml(brief.published_at_utc)}</span></li>`)
    .join('');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Weekly Briefs | Autonomy Index</title>
  <meta name="description" content="Weekly movement briefs with source-linked index deltas.">
  <link rel="canonical" href="${SITE}/weekly-briefs">
  <link rel="stylesheet" href="/style.css">
  <script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Organization', name: 'Autonomy Index', url: SITE, logo: `${SITE}/assets/icon.png` })}</script>
  <script>window.va=window.va||function(){(window.vaq=window.vaq||[]).push(arguments)};</script>
  <script defer src="/_vercel/insights/script.js"></script>
</head>
<body>
  <main class="section">
    <div class="container">
      <h1 class="section-title" style="text-align:left;">Weekly Briefs</h1>
      <ul>${rows}</ul>
    </div>
  </main>
</body>
</html>`;
}

function main() {
  const briefsDoc = JSON.parse(fs.readFileSync(BRIEFS_FILE, 'utf8'));
  const briefs = Array.isArray(briefsDoc.briefs) ? briefsDoc.briefs : [];

  ensureDir(OUTPUT_DIR);
  fs.writeFileSync(path.join(OUTPUT_DIR, 'index.html'), renderIndexPage(briefs));

  for (const brief of briefs) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${brief.report_id}.html`), renderBriefPage(brief));
  }

  console.log(JSON.stringify({
    status: 'ok',
    weekly_brief_pages_generated: briefs.length,
    output_dir: 'weekly-briefs'
  }, null, 2));
}

main();
