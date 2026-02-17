const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, 'data');
const HISTORY_DIR = path.join(DATA_DIR, 'index-history');
const DELTA_DIR = path.join(DATA_DIR, 'deltas');
const LOG_DIR = path.join(ROOT, 'logs');
const LOG_FILE = path.join(LOG_DIR, 'daily-signal-errors.log');

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

function canonicalString(value) {
  return JSON.stringify(value);
}

function checksum(value) {
  return crypto.createHash('sha256').update(canonicalString(value)).digest('hex');
}

function ymdFromDate(input) {
  const d = input ? new Date(input) : new Date();
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dottedDate(isoDate) {
  return isoDate.replace(/-/g, '.');
}

function parseUrlsFromMarkdown(md) {
  const urls = new Set();
  const regex = /https?:\/\/[^\s)]+/g;
  let match;
  while ((match = regex.exec(md)) !== null) {
    urls.add(normalizeUrl(match[0]));
  }
  return urls;
}

function normalizeUrl(url) {
  return String(url || '').trim().replace(/\/$/, '').toLowerCase();
}

function findPreviousSnapshotFile(currentFileName) {
  ensureDir(HISTORY_DIR);
  const files = fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => /^\d{4}\.\d{2}\.\d{2}\.json$/.test(f))
    .sort();

  const candidates = files.filter((f) => f < currentFileName);
  if (candidates.length === 0) return null;
  return path.join(HISTORY_DIR, candidates[candidates.length - 1]);
}

function frameworkSnapshotRecord(framework) {
  const indices = {};
  for (const indexName of ['AMI', 'ARI', 'EPI']) {
    const indexObj = framework.indices?.[indexName];
    if (!indexObj) continue;

    const dimensions = {};
    const dimObj = indexObj.dimensions || {};
    for (const dimName of Object.keys(dimObj)) {
      dimensions[dimName] = Number(dimObj[dimName].score);
    }

    indices[indexName] = {
      score: Number(indexObj.score),
      confidence: String(indexObj.confidence || '').toLowerCase(),
      dimensions
    };
  }

  return {
    id: framework.id,
    name: framework.name,
    indices
  };
}

function buildSnapshot(frameworksDoc, isoDate, timestampUtc) {
  const records = frameworksDoc.frameworks.map(frameworkSnapshotRecord);
  return {
    snapshot_date: isoDate,
    generated_at_utc: timestampUtc,
    index_data_version:
      frameworksDoc.meta?.index_data_version ||
      frameworksDoc.meta?.version ||
      frameworksDoc.meta?.lastUpdated ||
      'unknown',
    framework_checksum_sha256: checksum(frameworksDoc),
    framework_count: records.length,
    frameworks: records
  };
}

function compareSnapshots(previous, current) {
  const prevById = new Map((previous?.frameworks || []).map((f) => [f.id, f]));
  const indexDeltas = [];

  for (const framework of current.frameworks) {
    const prevFramework = prevById.get(framework.id);
    if (!prevFramework) continue;

    for (const indexName of ['AMI', 'ARI', 'EPI']) {
      const prevIndex = prevFramework.indices?.[indexName];
      const nextIndex = framework.indices?.[indexName];
      if (!prevIndex || !nextIndex) continue;

      const delta = Number(nextIndex.score) - Number(prevIndex.score);

      const dimNames = new Set([
        ...Object.keys(prevIndex.dimensions || {}),
        ...Object.keys(nextIndex.dimensions || {})
      ]);

      const changedDimensions = [];
      for (const dimName of dimNames) {
        const prevDim = Number(prevIndex.dimensions?.[dimName] ?? 0);
        const nextDim = Number(nextIndex.dimensions?.[dimName] ?? 0);
        const dimDelta = nextDim - prevDim;
        if (dimDelta !== 0) {
          changedDimensions.push({
            dimension: dimName,
            previous: prevDim,
            current: nextDim,
            delta: dimDelta
          });
        }
      }

      indexDeltas.push({
        framework_id: framework.id,
        entity: framework.name,
        index: indexName,
        previous_score: Number(prevIndex.score),
        current_score: Number(nextIndex.score),
        delta,
        direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat',
        changed_dimensions: changedDimensions,
        confidence: nextIndex.confidence || 'inferred'
      });
    }
  }

  const nonZero = indexDeltas.filter((x) => x.delta !== 0);
  const dimensionChanges = nonZero.reduce((acc, item) => acc + item.changed_dimensions.length, 0);

  return {
    previous_snapshot_date: previous?.snapshot_date || null,
    current_snapshot_date: current.snapshot_date,
    previous_index_data_version: previous?.index_data_version || null,
    current_index_data_version: current.index_data_version,
    version_changed: previous ? previous.index_data_version !== current.index_data_version : true,
    total_index_comparisons: indexDeltas.length,
    changed_index_count: nonZero.length,
    changed_dimension_count: dimensionChanges,
    index_deltas: indexDeltas,
    daily_diff_summary: nonZero.map((item) => ({
      entity: item.entity,
      index: item.index,
      delta: item.delta,
      changed_dimensions: item.changed_dimensions.map((d) => d.dimension)
    }))
  };
}

function inferConfidence(claims) {
  if (!claims.length) return 'inferred';
  if (claims.every((c) => String(c.confidence).toLowerCase() === 'confirmed')) return 'confirmed';
  if (claims.every((c) => String(c.confidence).toLowerCase() === 'speculative')) return 'speculative';
  return 'inferred';
}

function makeSignalId(dateCompact, frameworkId, indexName) {
  const key = `${frameworkId}_${indexName}`.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
  return `AUTO_SIGNAL_${dateCompact}_${key}`;
}

function getFrameworkEvidenceUrls(frameworksDoc, frameworkId, indexName) {
  const framework = frameworksDoc.frameworks.find((f) => f.id === frameworkId);
  const evidence = framework?.indices?.[indexName]?.evidence || [];
  return evidence.map((e) => e.url).filter(Boolean);
}

function namesMatch(a, b) {
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return false;
  return left === right || left.includes(right) || right.includes(left);
}

function buildSignals(diff, context) {
  const {
    dateCompact,
    timestampUtc,
    frameworksDoc,
    claimsDoc,
    sourceCatalogDoc,
    sourceUrlsInAgentsMd
  } = context;

  const sourceByUrl = new Map(
    sourceCatalogDoc.sources.map((source) => [normalizeUrl(source.url), source.source_id])
  );

  const signals = [];

  for (const item of diff.index_deltas) {
    if (item.delta === 0) continue;

    const matchingClaims = claimsDoc.claims.filter(
      (claim) =>
        String(claim.index_impact?.index || '').toUpperCase() === item.index &&
        namesMatch(claim.index_impact?.entity, item.entity)
    );

    const claimIds = matchingClaims.map((c) => c.claim_id);

    const primarySourceIds = new Set();
    for (const claim of matchingClaims) {
      for (const sourceId of claim.source_ids || []) {
        if (sourceCatalogDoc.sources.some((source) => source.source_id === sourceId)) {
          primarySourceIds.add(sourceId);
        }
      }
    }

    const evidenceUrls = getFrameworkEvidenceUrls(frameworksDoc, item.framework_id, item.index);
    for (const url of evidenceUrls) {
      const normalized = normalizeUrl(url);
      if (!sourceUrlsInAgentsMd.has(normalized)) continue;
      const sourceId = sourceByUrl.get(normalized);
      if (sourceId) primarySourceIds.add(sourceId);
    }

    const topDimensions = item.changed_dimensions.slice(0, 2).map((d) => d.dimension);
    const deltaToken = item.delta > 0 ? `+${item.delta}` : `${item.delta}`;

    signals.push({
      id: makeSignalId(dateCompact, item.framework_id, item.index),
      timestamp_utc: timestampUtc,
      entity: item.entity,
      index: item.index,
      delta: item.delta,
      direction: item.direction,
      driver_claim_ids: claimIds,
      primary_source_ids: Array.from(primarySourceIds),
      confidence: inferConfidence(matchingClaims),
      headline: `${item.entity} ${item.index} ${deltaToken} on daily framework update`,
      summary:
        topDimensions.length > 0
          ? `Score moved from ${item.previous_score} to ${item.current_score}; key dimension changes: ${topDimensions.join(', ')}.`
          : `Score moved from ${item.previous_score} to ${item.current_score}; no dimension-level score changes recorded.`
    });
  }

  return signals;
}

function validateSignals(signals, sourceCatalogDoc) {
  const sourceIds = new Set(sourceCatalogDoc.sources.map((source) => source.source_id));
  const failures = [];

  for (const signal of signals) {
    const errors = [];

    if (!signal.confidence || !String(signal.confidence).trim()) {
      errors.push('missing_confidence_tag');
    }

    if (!Array.isArray(signal.driver_claim_ids) || signal.driver_claim_ids.length === 0) {
      errors.push('missing_driver_claim_ids');
    }

    const knownPrimarySources = (signal.primary_source_ids || []).filter((id) => sourceIds.has(id));
    if (signal.delta !== 0 && knownPrimarySources.length === 0) {
      errors.push('delta_without_confirmed_source');
    }

    if (String(signal.confidence).toLowerCase() === 'speculative' && signal.delta !== 0) {
      errors.push('speculative_confidence_disallowed_for_nonzero_delta');
    }

    if (errors.length > 0) {
      failures.push({ signal_id: signal.id, errors });
    }
  }

  return {
    passed: failures.length === 0,
    failure_count: failures.length,
    failures
  };
}

function appendErrorsToLog(timestampUtc, validation, signals) {
  ensureDir(LOG_DIR);
  const lines = [
    `[${timestampUtc}] Daily signal QA failure`,
    `signals_generated=${signals.length}`,
    JSON.stringify(validation.failures, null, 2),
    ''
  ];
  fs.appendFileSync(LOG_FILE, lines.join('\n'));
}

function mergeIntoDailySignals(signals, todayIsoDate) {
  const doc = readJson('data/daily-signals.json');
  const existing = Array.isArray(doc.signals) ? doc.signals : [];
  const existingIds = new Set(existing.map((s) => s.id));

  const merged = [...existing];
  for (const signal of signals) {
    if (!existingIds.has(signal.id)) {
      merged.push(signal);
    }
  }

  merged.sort((a, b) => Date.parse(b.timestamp_utc) - Date.parse(a.timestamp_utc));

  const updated = {
    version: todayIsoDate,
    signals: merged
  };

  writeJson('data/daily-signals.json', updated);
  return updated;
}

function main() {
  ensureDir(HISTORY_DIR);
  ensureDir(DELTA_DIR);

  const todayIsoDate = ymdFromDate(process.env.SIGNAL_DATE || undefined);
  const todayDotted = dottedDate(todayIsoDate);
  const dateCompact = todayIsoDate.replace(/-/g, '');
  const timestampUtc = new Date().toISOString();

  const frameworksDoc = readJson('data/frameworks.json');
  const claimsDoc = readJson('data/claims.json');
  const sourceCatalogDoc = readJson('data/source-catalog.json');
  const sourcesMarkdown = fs.readFileSync(path.join(DATA_DIR, 'AGENTS_2026_SOURCES.md'), 'utf8');

  const sourceUrlsInAgentsMd = parseUrlsFromMarkdown(sourcesMarkdown);

  const snapshot = buildSnapshot(frameworksDoc, todayIsoDate, timestampUtc);
  const snapshotRel = `data/index-history/${todayDotted}.json`;
  writeJson(snapshotRel, snapshot);

  const previousFile = findPreviousSnapshotFile(`${todayDotted}.json`);
  const previousSnapshot = previousFile ? JSON.parse(fs.readFileSync(previousFile, 'utf8')) : null;

  const diff = compareSnapshots(previousSnapshot, snapshot);
  const signals = buildSignals(diff, {
    dateCompact,
    timestampUtc,
    frameworksDoc,
    claimsDoc,
    sourceCatalogDoc,
    sourceUrlsInAgentsMd
  });

  const validation = validateSignals(signals, sourceCatalogDoc);

  const deltaPayload = {
    generated_at_utc: timestampUtc,
    snapshot_file: snapshotRel,
    previous_snapshot_file: previousFile ? path.relative(ROOT, previousFile) : null,
    diff,
    generated_signals_count: signals.length,
    generated_signals: signals,
    qa_validation: validation
  };

  const deltaRel = `data/deltas/${todayDotted}.json`;
  writeJson(deltaRel, deltaPayload);

  if (!validation.passed) {
    appendErrorsToLog(timestampUtc, validation, signals);
    console.error('Daily signal generation failed QA gates. Publish blocked.');
    console.error(JSON.stringify(validation, null, 2));
    process.exit(1);
  }

  const mergedDoc = mergeIntoDailySignals(signals, todayIsoDate);

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        snapshot: snapshotRel,
        delta: deltaRel,
        signals_appended: signals.length,
        total_signals: mergedDoc.signals.length,
        qa_failures: validation.failure_count
      },
      null,
      2
    )
  );
}

main();
