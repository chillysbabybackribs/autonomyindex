const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SITE = 'https://www.autonomyindex.io';

function existsRoute(route) {
  if (route === '/') return true;
  const clean = route.replace(/^\//, '');
  const candidates = [
    path.join(ROOT, clean),
    path.join(ROOT, `${clean}.html`),
    path.join(ROOT, clean, 'index.html')
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function fileLastmod(route, fallback) {
  const clean = route.replace(/^\//, '');
  const files = [
    path.join(ROOT, `${clean}.html`),
    path.join(ROOT, clean, 'index.html'),
    path.join(ROOT, 'index.html')
  ];
  for (const file of files) {
    if (fs.existsSync(file)) {
      return fs.statSync(file).mtime.toISOString().slice(0, 10);
    }
  }
  return fallback;
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    '  <url>',
    `    <loc>${SITE}${loc}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    '  </url>'
  ].join('\n');
}

function main() {
  const baseRoutes = [
    { loc: '/', changefreq: 'daily', priority: '1.0' },
    { loc: '/methodology', changefreq: 'monthly', priority: '0.8' },
    { loc: '/ami-systems', changefreq: 'weekly', priority: '0.8' },
    { loc: '/ami-download', changefreq: 'monthly', priority: '0.7' },
    { loc: '/ami-submit', changefreq: 'monthly', priority: '0.6' },
    { loc: '/daily-signals', changefreq: 'daily', priority: '0.9' },
    { loc: '/weekly-briefs', changefreq: 'weekly', priority: '0.8' }
  ].filter((route) => existsRoute(route.loc));

  const pillarCandidates = ['/agents', '/security', '/benchmarks', '/ecosystem', '/risk'];
  const pillarRoutes = pillarCandidates
    .filter((route) => existsRoute(route))
    .map((loc) => ({ loc, changefreq: 'weekly', priority: '0.7' }));

  const briefsDoc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'weekly-briefs.json'), 'utf8'));
  const weeklyBriefRoutes = (briefsDoc.briefs || []).map((brief) => ({
    loc: `/weekly-briefs/${brief.report_id}`,
    lastmod: String(brief.published_at_utc || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    changefreq: 'weekly',
    priority: '0.7'
  }));

  const nowDate = new Date().toISOString().slice(0, 10);
  const routes = [...baseRoutes, ...pillarRoutes, ...weeklyBriefRoutes];

  const body = routes
    .map((route) =>
      urlEntry(
        route.loc,
        route.lastmod || fileLastmod(route.loc, nowDate),
        route.changefreq,
        route.priority
      )
    )
    .join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);

  console.log(JSON.stringify({
    status: 'ok',
    url_count: routes.length,
    sitemap: 'sitemap.xml'
  }, null, 2));
}

main();
