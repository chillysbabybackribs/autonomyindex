const fs = require('node:fs');
const path = require('node:path');
const LOG_PATH = path.join(process.cwd(), 'logs', 'daily-signal-errors.log');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8'));
}

function validate() {
  const signals = readJson('data/daily-signals.json').signals;
  const claims = readJson('data/claims.json').claims;
  const sourceCatalog = readJson('data/source-catalog.json').sources;

  const claimById = new Map(claims.map((c) => [c.claim_id, c]));
  const sourceById = new Map(sourceCatalog.map((s) => [s.source_id, s]));

  const invalid = [];
  let validCount = 0;

  for (const signal of signals) {
    const errors = [];

    if (!signal.confidence || !String(signal.confidence).trim()) {
      errors.push('missing_confidence_tag');
    }

    if (!Array.isArray(signal.driver_claim_ids) || signal.driver_claim_ids.length === 0) {
      errors.push('missing_driver_claim_ids');
    }

    const signalClaims = (signal.driver_claim_ids || []).map((id) => claimById.get(id)).filter(Boolean);
    if (signal.driver_claim_ids.length !== signalClaims.length) {
      errors.push('missing_driver_claim_reference');
    }

    for (const claim of signalClaims) {
      if (!claim.source_ids || claim.source_ids.length === 0) {
        errors.push(`claim_without_source:${claim.claim_id}`);
      }
    }

    const hasKnownPrimarySource = (signal.primary_source_ids || []).some((id) => sourceById.has(id));
    if (signal.delta !== 0 && !hasKnownPrimarySource) {
      errors.push('delta_without_confirmed_source');
    }

    if (String(signal.confidence).toLowerCase() === 'speculative' && signal.delta !== 0) {
      errors.push('speculative_confidence_disallowed_for_nonzero_delta');
    }

    if (errors.length > 0) {
      invalid.push({ signal_id: signal.id, errors });
      continue;
    }

    validCount += 1;
  }

  return {
    number_of_signals_valid: validCount,
    number_of_signals_invalid: invalid.length,
    invalid_reasons: invalid
  };
}

const summary = validate();

const outDir = path.join(process.cwd(), 'phase1');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'qa-summary.json'), JSON.stringify(summary, null, 2));

if (summary.number_of_signals_invalid > 0) {
  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  fs.appendFileSync(
    LOG_PATH,
    `[${new Date().toISOString()}] validate-signals failure\n${JSON.stringify(summary.invalid_reasons, null, 2)}\n\n`
  );
  process.exitCode = 1;
}

console.log(JSON.stringify(summary, null, 2));
