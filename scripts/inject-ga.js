const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const GA_ID = process.env.GA_MEASUREMENT_ID || '';
const BLOCK_START = '<!-- GA_TAG_START -->';
const BLOCK_END = '<!-- GA_TAG_END -->';

function shouldSkipDir(name) {
  return name === 'node_modules' || name === '.git' || name === 'phase1';
}

function listHtmlFiles(dir, acc = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldSkipDir(entry.name)) listHtmlFiles(fullPath, acc);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) {
      acc.push(fullPath);
    }
  }
  return acc;
}

function removeExistingGaBlock(html) {
  const start = html.indexOf(BLOCK_START);
  const end = html.indexOf(BLOCK_END);
  if (start === -1 || end === -1 || end < start) return html;
  return `${html.slice(0, start)}${html.slice(end + BLOCK_END.length)}`;
}

function gaBlock(id) {
  if (!id) return '';
  return [
    BLOCK_START,
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>`,
    '<script>',
    '  window.dataLayer = window.dataLayer || [];',
    '  function gtag(){dataLayer.push(arguments);}',
    "  gtag('js', new Date());",
    `  gtag('config', '${id}');`,
    '</script>',
    BLOCK_END
  ].join('\n');
}

function injectGa(html, id) {
  const clean = removeExistingGaBlock(html);
  const block = gaBlock(id);
  if (!block) return clean;
  if (clean.includes('</head>')) {
    return clean.replace('</head>', `${block}\n</head>`);
  }
  return clean;
}

function main() {
  const files = listHtmlFiles(ROOT);
  let updated = 0;
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf8');
    const next = injectGa(original, GA_ID);
    if (next !== original) {
      fs.writeFileSync(file, next);
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    status: 'ok',
    files_scanned: files.length,
    files_updated: updated,
    ga_configured: Boolean(GA_ID)
  }, null, 2));
}

main();
