const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const https = require('node:https');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relPath), 'utf8'));
}

function writeJson(relPath, value) {
  const target = path.join(ROOT, relPath);
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/$/, '').toLowerCase();
}

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function extractUrls(markdown) {
  const regex = /https?:\/\/[^\s)]+/g;
  const urls = new Set();
  let match;
  while ((match = regex.exec(markdown)) !== null) {
    urls.add(normalizeUrl(match[0]));
  }
  return urls;
}

function listEvidenceUrls(frameworksDoc) {
  const urls = [];
  for (const framework of frameworksDoc.frameworks || []) {
    for (const indexName of ['AMI', 'ARI', 'EPI']) {
      const evidence = framework.indices?.[indexName]?.evidence || [];
      for (const item of evidence) {
        if (item?.url) {
          urls.push({
            framework_id: framework.id,
            framework_name: framework.name,
            index: indexName,
            url: item.url
          });
        }
      }
    }
  }
  return urls;
}

function checkUrl(url, timeoutMs) {
  return new Promise((resolve) => {
    let finished = false;

    const done = (result) => {
      if (finished) return;
      finished = true;
      resolve(result);
    };

    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      url,
      {
        method: 'HEAD',
        timeout: timeoutMs,
        headers: { 'User-Agent': 'autonomyindex-source-validator/1.0' }
      },
      (res) => {
        done({
          url,
          ok: res.statusCode >= 200 && res.statusCode < 400,
          status: res.statusCode,
          status_text: res.statusMessage || ''
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
      done({ url, ok: false, status: 0, status_text: 'timeout' });
    });

    req.on('error', (error) => {
      done({ url, ok: false, status: 0, status_text: error.message || 'request_error' });
    });

    req.end();
  });
}

async function main() {
  const frameworksDoc = readJson('data/frameworks.json');
  const sourceCatalog = readJson('data/source-catalog.json');
  const markdown = fs.readFileSync(path.join(DATA_DIR, 'AGENTS_2026_SOURCES.md'), 'utf8');

  const checksumDoc = {
    generated_at_utc: new Date().toISOString(),
    file: 'data/frameworks.json',
    sha256: sha256(JSON.stringify(frameworksDoc)),
    index_data_version:
      frameworksDoc.meta?.index_data_version || frameworksDoc.meta?.version || frameworksDoc.meta?.lastUpdated || 'unknown'
  };

  writeJson('data/frameworks.checksum.json', checksumDoc);

  const sourcesMdUrls = extractUrls(markdown);
  const catalogUrls = new Map(
    (sourceCatalog.sources || []).map((source) => [normalizeUrl(source.url), source.source_id])
  );

  const evidenceUrls = listEvidenceUrls(frameworksDoc);
  const missingCatalogReferences = [];
  const missingMarkdownReferences = [];

  for (const evidence of evidenceUrls) {
    const key = normalizeUrl(evidence.url);
    if (!catalogUrls.has(key)) {
      missingCatalogReferences.push(evidence);
    }
    if (!sourcesMdUrls.has(key)) {
      missingMarkdownReferences.push(evidence);
    }
  }

  const skipLinkCheck = String(process.env.SKIP_LINK_CHECK || '').toLowerCase() === 'true';
  let linkChecks = [];

  if (!skipLinkCheck) {
    const uniqueUrls = Array.from(new Set([...catalogUrls.keys(), ...evidenceUrls.map((e) => normalizeUrl(e.url))]));
    const timeoutMs = Number.parseInt(process.env.LINK_TIMEOUT_MS || '7000', 10);
    linkChecks = await Promise.all(uniqueUrls.map((url) => checkUrl(url, timeoutMs)));
  }

  const brokenLinks = linkChecks.filter((check) => !check.ok);

  const deltasDir = path.join(DATA_DIR, 'deltas');
  let latestDiffSummary = null;
  if (fs.existsSync(deltasDir)) {
    const files = fs
      .readdirSync(deltasDir)
      .filter((f) => /^\d{4}\.\d{2}\.\d{2}\.json$/.test(f))
      .sort();
    if (files.length > 0) {
      const latest = JSON.parse(fs.readFileSync(path.join(deltasDir, files[files.length - 1]), 'utf8'));
      latestDiffSummary = {
        file: `data/deltas/${files[files.length - 1]}`,
        changed_index_count: latest?.diff?.changed_index_count ?? null,
        changed_dimension_count: latest?.diff?.changed_dimension_count ?? null,
        daily_diff_summary: latest?.diff?.daily_diff_summary ?? []
      };
      writeJson('data/deltas/latest-summary.json', latestDiffSummary);
    }
  }

  const result = {
    generated_at_utc: new Date().toISOString(),
    framework_checksum: checksumDoc,
    source_validation: {
      evidence_urls_total: evidenceUrls.length,
      missing_catalog_references: missingCatalogReferences,
      missing_agents_markdown_references: missingMarkdownReferences
    },
    broken_link_detection: {
      skipped: skipLinkCheck,
      checked_count: linkChecks.length,
      broken_count: brokenLinks.length,
      broken_links: brokenLinks
    },
    daily_diff_summary: latestDiffSummary
  };

  writeJson('phase1/source-validation-summary.json', result);

  const strict = String(process.env.SOURCE_VALIDATION_STRICT || '').toLowerCase() === 'true';
  const shouldFail =
    strict &&
    (missingCatalogReferences.length > 0 ||
      missingMarkdownReferences.length > 0 ||
      (!skipLinkCheck && brokenLinks.length > 0));

  if (shouldFail) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exit(1);
});
