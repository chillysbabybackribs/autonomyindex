#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI v1.0 Negative Test Suite — Proves all gates reject invalid data
// Exit 0 = all negative tests passed. Exit 1 = test failure.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const schema = require(path.join(ROOT, 'lib', 'ami', 'schema.js'));
const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Deep clone an object. */
function clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Load source catalog as Map. */
function loadSourceCatalog() {
  const catalogPath = path.join(ROOT, 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

/** Load rubrics from meta.json. */
function loadRubrics() {
  const metaPath = path.join(ROOT, 'data', 'ami', 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.rubrics || null;
}

/** Build validation options from catalog + optional extras. */
function buildOpts(catalogOrOpts) {
  if (catalogOrOpts instanceof Map) return { sourceCatalog: catalogOrOpts };
  if (catalogOrOpts && typeof catalogOrOpts === 'object') return catalogOrOpts;
  return {};
}

/** Assert that validation fails and at least one error matches the pattern. */
function assertFails(label, assessment, pattern, catalogOrOpts) {
  const opts = buildOpts(catalogOrOpts);
  const result = schema.validateAssessment(assessment, opts);

  if (result.valid) {
    throw new Error(`FAIL [${label}]: expected validation to FAIL but it passed`);
  }

  const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, 'i');
  const matched = result.errors.some((e) => regex.test(e));
  if (!matched) {
    throw new Error(
      `FAIL [${label}]: expected error matching ${regex} but got:\n` +
      result.errors.map((e) => `  - ${e}`).join('\n')
    );
  }
}

/** Assert that validation passes. */
function assertPasses(label, assessment, catalogOrOpts) {
  const opts = buildOpts(catalogOrOpts);
  const result = schema.validateAssessment(assessment, opts);
  if (!result.valid) {
    throw new Error(
      `FAIL [${label}]: expected validation to PASS but got errors:\n` +
      result.errors.map((e) => `  - ${e}`).join('\n')
    );
  }
}

// ── Load base fixture ───────────────────────────────────────────────────────

const baseDir = path.join(ROOT, 'data', 'ami', 'assessments', 'openclaw');
const baseFiles = fs.readdirSync(baseDir).filter((f) => f.endsWith('.json'));
if (baseFiles.length === 0) {
  console.error('ERROR: No OpenClaw assessment found to use as base fixture');
  process.exit(1);
}
const BASE = JSON.parse(fs.readFileSync(path.join(baseDir, baseFiles[0]), 'utf8'));
const CATALOG = loadSourceCatalog();
const RUBRICS = loadRubrics();

// ── Tests ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(label, fn) {
  try {
    fn();
    passed++;
    console.log(`  PASS  ${label}`);
  } catch (err) {
    failed++;
    console.log(`  FAIL  ${label}`);
    console.log(`        ${err.message.split('\n')[0]}`);
  }
}

console.log('\n=== AMI v1.0 Negative Tests ===\n');

// ── Sanity: base fixture passes ─────────────────────────────────────────────

test('sanity: base OpenClaw assessment passes validation', () => {
  assertPasses('sanity', BASE, CATALOG);
});

// ── GATE 1: scored dimension must have evidence ─────────────────────────────

test('GATE 1: scored dimension with empty evidence fails', () => {
  const a = clone(BASE);
  a.dimensions[0].evidence = [];
  assertFails('GATE 1', a, /GATE VIOLATION.*scored dimension has no evidence/);
});

test('GATE 1: scored dimension with null evidence fails', () => {
  const a = clone(BASE);
  a.dimensions[0].evidence = null;
  assertFails('GATE 1 null', a, /GATE VIOLATION.*scored dimension has no evidence/);
});

// ── GATE 2: evidence must have source_ids ───────────────────────────────────

test('GATE 2: evidence with empty source_ids fails', () => {
  const a = clone(BASE);
  a.dimensions[0].evidence[0].source_ids = [];
  delete a.dimensions[0].evidence[0].source_id;
  assertFails('GATE 2', a, /GATE VIOLATION.*no source_ids/);
});

test('GATE 2: evidence with missing source_ids and source_id fails', () => {
  const a = clone(BASE);
  delete a.dimensions[0].evidence[0].source_ids;
  delete a.dimensions[0].evidence[0].source_id;
  assertFails('GATE 2 missing', a, /GATE VIOLATION.*no source_ids/);
});

// ── GATE 3: confidence required for scored dimensions ───────────────────────

test('GATE 3: dimension missing confidence fails', () => {
  const a = clone(BASE);
  a.dimensions[0].confidence = 'invalid_level';
  assertFails('GATE 3 dim', a, /GATE VIOLATION.*scored dimension missing valid confidence/);
});

test('GATE 3: SCORED assessment missing overall_confidence fails', () => {
  const a = clone(BASE);
  a.overall_confidence = 'invalid';
  assertFails('GATE 3 overall', a, /GATE VIOLATION.*SCORED assessment missing valid overall_confidence/);
});

// ── GATE 4: aggregation math mismatch ───────────────────────────────────────

test('GATE 4: tampered overall_score fails', () => {
  const a = clone(BASE);
  a.overall_score = 99; // wrong value
  assertFails('GATE 4 score', a, /GATE VIOLATION.*stored overall_score.*does not match computed/);
});

test('GATE 4: tampered grade fails', () => {
  const a = clone(BASE);
  a.grade = 'A'; // wrong for score 55
  assertFails('GATE 4 grade', a, /grade mismatch/);
});

test('GATE 4: overall_confidence mismatch fails', () => {
  const a = clone(BASE);
  // Force all dimensions to verified to change computed confidence
  // but keep stored overall_confidence as something wrong
  a.overall_confidence = 'low';
  assertFails('GATE 4 confidence', a, /overall_confidence mismatch/);
});

// ── GATE 5: score >= 4 requires >= 2 distinct source_ids ────────────────────

test('GATE 5: score 4 with only 1 source fails', () => {
  const a = clone(BASE);
  // tooling_integration has score 4 and 2 evidence items; reduce to 1 source
  const toolDim = a.dimensions.find((d) => d.dimension_id === 'tooling_integration');
  toolDim.evidence = [toolDim.evidence[0]]; // keep only 1 evidence item with 1 source
  // Recompute aggregation to keep math consistent
  const agg = schema.computeAggregation(a.dimensions);
  a.overall_score = agg.score_percent;
  a.grade = agg.grade;
  a.overall_confidence = schema.computeOverallConfidence(a.dimensions);
  assertFails('GATE 5', a, /GATE VIOLATION.*score 4 requires >= 2 distinct sources/);
});

test('GATE 5: score 5 with only 1 source fails', () => {
  const a = clone(BASE);
  // Bump a dimension to 5 with only 1 source
  const dim = a.dimensions.find((d) => d.dimension_id === 'execution_reliability');
  dim.score = 5;
  dim.evidence = [dim.evidence[0]]; // 1 evidence, 1 source
  // Recompute
  const agg = schema.computeAggregation(a.dimensions);
  a.overall_score = agg.score_percent;
  a.grade = agg.grade;
  a.overall_confidence = schema.computeOverallConfidence(a.dimensions);
  assertFails('GATE 5 score5', a, /GATE VIOLATION.*score 5 requires >= 2 distinct sources/);
});

// ── GATE 6: score 5 requires primary/hard-evidence source ───────────────────

test('GATE 6: score 5 without primary/hard source fails (with catalog)', () => {
  const a = clone(BASE);
  // Set a dimension to score 5 and give it 2 sources that are both secondary
  const dim = a.dimensions.find((d) => d.dimension_id === 'real_world_validation');
  dim.score = 5;
  // SRC_001 is Reuters (secondary). Add a second secondary source.
  dim.evidence.push({
    id: 'EV_GATE6_TEST',
    url: 'https://example.com',
    title: 'Test secondary source',
    publisher: 'Test',
    published_date: '2026-02-17',
    excerpt: 'Test excerpt for gate 6',
    claim_supported: 'Test claim',
    evidence_type: 'news_report',
    confidence_contribution: 'verified',
    relevance_weight: 0.5,
    captured_at: '2026-02-17T10:00:00Z',
    source_ids: ['SRC_001'],
  });
  // Recompute
  const agg = schema.computeAggregation(a.dimensions);
  a.overall_score = agg.score_percent;
  a.grade = agg.grade;
  a.overall_confidence = schema.computeOverallConfidence(a.dimensions);
  assertFails('GATE 6', a, /GATE VIOLATION.*score 5 requires.*primary.*hard-evidence/, CATALOG);
});

test('GATE 6: score 5 with primary source passes (with catalog)', () => {
  const a = clone(BASE);
  const dim = a.dimensions.find((d) => d.dimension_id === 'real_world_validation');
  dim.score = 5;
  // SRC_009 is primary. Add it as second source.
  dim.evidence.push({
    id: 'EV_GATE6_PASS',
    url: 'https://github.com/openclaw/openclaw',
    title: 'OpenClaw GitHub',
    publisher: 'OpenClaw Foundation',
    published_date: '2026-02-16',
    excerpt: 'Primary source for gate 6 test',
    claim_supported: 'Test claim',
    evidence_type: 'source_code',
    confidence_contribution: 'verified',
    relevance_weight: 0.5,
    captured_at: '2026-02-17T10:00:00Z',
    source_ids: ['SRC_009'],
  });
  // Recompute
  const agg = schema.computeAggregation(a.dimensions);
  a.overall_score = agg.score_percent;
  a.grade = agg.grade;
  a.overall_confidence = schema.computeOverallConfidence(a.dimensions);
  assertPasses('GATE 6 pass', a, CATALOG);
});

// ── GATE 7: SCORED assessment requires >= 3 distinct source_ids ─────────────

test('GATE 7: SCORED with < 3 distinct sources fails', () => {
  const a = clone(BASE);
  // Reduce all evidence to reference only 2 sources total
  for (const dim of a.dimensions) {
    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        // Map all to just SRC_001 or SRC_003
        ev.source_ids = [ev.source_ids[0] === 'SRC_001' ? 'SRC_001' : 'SRC_003'];
      }
    }
  }
  // Recompute aggregation
  const agg = schema.computeAggregation(a.dimensions);
  a.overall_score = agg.score_percent;
  a.grade = agg.grade;
  a.overall_confidence = schema.computeOverallConfidence(a.dimensions);
  assertFails('GATE 7', a, /GATE VIOLATION.*SCORED assessment requires >= 3 distinct sources/);
});

// ── Eligibility: verified_sources_count < 3 for SCORED ──────────────────────

test('Eligibility: SCORED with verified_sources_count < 3 fails', () => {
  const a = clone(BASE);
  a.eligibility.verified_sources_count = 2;
  assertFails('eligibility vsc', a, /SCORED status requires verified_sources_count >= 3/);
});

// ── Eligibility: exclusion flag + SCORED fails ──────────────────────────────

test('Eligibility: SCORED with base_llm_only fails', () => {
  const a = clone(BASE);
  a.eligibility.exclusion_flags.base_llm_only = true;
  assertFails('eligibility excl', a, /SCORED but exclusion_flags\.base_llm_only is true/);
});

// ── Integrity hash mismatch ─────────────────────────────────────────────────

test('Integrity: tampered field produces hash mismatch', () => {
  const a = clone(BASE);
  // Tamper a field without recomputing hash
  a.notes = 'TAMPERED VALUE';
  // Verify the stored hash no longer matches
  const computed = store.computeIntegrityHash(a);
  if (computed.assessment_hash === a.integrity.assessment_hash) {
    throw new Error('Expected hash mismatch after tampering but hashes match');
  }
});

test('Integrity: untampered assessment has matching hash', () => {
  const a = clone(BASE);
  const computed = store.computeIntegrityHash(a);
  if (computed.assessment_hash !== a.integrity.assessment_hash) {
    throw new Error(
      `Expected matching hash but got stored="${a.integrity.assessment_hash}" ` +
      `vs computed="${computed.assessment_hash}"`
    );
  }
});

// ── Determinism: computeIntegrityHash is idempotent ─────────────────────────

test('Determinism: computeIntegrityHash returns same hash on repeated calls', () => {
  const a = clone(BASE);
  const h1 = store.computeIntegrityHash(a);
  const h2 = store.computeIntegrityHash(a);
  if (h1.assessment_hash !== h2.assessment_hash) {
    throw new Error(
      `Hash not deterministic: "${h1.assessment_hash}" !== "${h2.assessment_hash}"`
    );
  }
});

test('Determinism: hash is stable across clone + reserialize', () => {
  const a = clone(BASE);
  delete a.integrity;
  const h1 = store.computeIntegrityHash(a);
  const a2 = JSON.parse(JSON.stringify(a));
  const h2 = store.computeIntegrityHash(a2);
  if (h1.assessment_hash !== h2.assessment_hash) {
    throw new Error(
      `Hash not stable across reserialize: "${h1.assessment_hash}" !== "${h2.assessment_hash}"`
    );
  }
});

// ── Review state: invalid state rejected ────────────────────────────────────

test('Review: invalid review.state is rejected', () => {
  const a = clone(BASE);
  a.review = { state: 'bogus', reviewed_by: null, reviewed_at: null };
  assertFails('review state', a, /invalid review\.state/);
});

// ── Non-scored status: overall_score must be null ────────────────────────────

test('Non-scored status: overall_score not null is rejected', () => {
  const a = clone(BASE);
  a.status = 'under_review';
  a.overall_score = 50; // should be null
  // Set all dims to not scored
  for (const dim of a.dimensions) {
    dim.scored = false;
    dim.score = null;
    dim.not_scored_reason = 'Under review';
    dim.evidence = [];
  }
  assertFails('non-scored score', a, /status is "under_review" but overall_score is not null/);
});

// ── Missing top-level fields ────────────────────────────────────────────────

test('Missing assessment_id is rejected', () => {
  const a = clone(BASE);
  a.assessment_id = '';
  assertFails('missing id', a, /missing assessment_id/);
});

test('Missing methodology_version is rejected', () => {
  const a = clone(BASE);
  a.methodology_version = '';
  assertFails('missing method', a, /missing methodology_version/);
});

// ── GATE 8: rubric_refs required for scored dimensions ──────────────────────

test('GATE 8: scored dimension missing rubric_refs fails', () => {
  const a = clone(BASE);
  delete a.dimensions[0].rubric_refs;
  assertFails('GATE 8 missing', a, /GATE VIOLATION.*scored dimension missing rubric_refs/);
});

test('GATE 8: scored dimension with empty rubric_refs fails', () => {
  const a = clone(BASE);
  a.dimensions[0].rubric_refs = [];
  assertFails('GATE 8 empty', a, /GATE VIOLATION.*scored dimension missing rubric_refs/);
});

test('GATE 8: invalid rubric_ref rejected when rubrics provided', () => {
  const a = clone(BASE);
  a.dimensions[0].rubric_refs = ['BOGUS_REF'];
  assertFails('GATE 8 invalid ref', a, /rubric_ref "BOGUS_REF" not found in meta rubric table/, { rubrics: RUBRICS });
});

// ── Reviewer signatures: published requires reviewer ────────────────────────

test('Reviewer: published assessment without reviewers fails', () => {
  const a = clone(BASE);
  a.review = { state: 'published' };
  assertFails('reviewer missing', a, /published assessment requires >= 1 reviewer signature/);
});

test('Reviewer: published assessment with empty reviewers array fails', () => {
  const a = clone(BASE);
  a.review = { state: 'published', reviewers: [] };
  assertFails('reviewer empty', a, /published assessment requires >= 1 reviewer signature/);
});

test('Reviewer: reviewer missing name fails', () => {
  const a = clone(BASE);
  a.review = {
    state: 'published',
    reviewers: [{ handle: 'test', signed_at: '2026-02-17T11:00:00Z', signature_hash: 'abc' }],
  };
  assertFails('reviewer no name', a, /review\.reviewers\[0\].*missing name/);
});

test('Reviewer: reviewer missing signature_hash fails', () => {
  const a = clone(BASE);
  a.review = {
    state: 'published',
    reviewers: [{ name: 'Test', handle: 'test', signed_at: '2026-02-17T11:00:00Z' }],
  };
  assertFails('reviewer no sig', a, /review\.reviewers\[0\].*missing signature_hash/);
});

test('Reviewer: draft assessment without reviewers passes', () => {
  const a = clone(BASE);
  a.review = { state: 'draft' };
  // This will fail for other reasons (score math etc) but NOT for reviewer
  // So let's make a proper non-scored draft
  a.status = 'under_review';
  a.overall_score = null;
  a.grade = null;
  a.overall_confidence = 'low';
  for (const dim of a.dimensions) {
    dim.scored = false;
    dim.score = null;
    dim.not_scored_reason = 'Draft';
    dim.evidence = [];
    delete dim.rubric_refs;
  }
  assertPasses('reviewer draft ok', a);
});

// ── Signature hash verification ─────────────────────────────────────────────

test('Signature: computeSignatureHash is deterministic', () => {
  const h1 = store.computeSignatureHash('editor', '2026-02-17T11:00:00Z', 'sys1', 'assess1');
  const h2 = store.computeSignatureHash('editor', '2026-02-17T11:00:00Z', 'sys1', 'assess1');
  if (h1 !== h2) throw new Error('Signature hash not deterministic');
});

test('Signature: different inputs produce different hashes', () => {
  const h1 = store.computeSignatureHash('editor', '2026-02-17T11:00:00Z', 'sys1', 'assess1');
  const h2 = store.computeSignatureHash('editor', '2026-02-17T12:00:00Z', 'sys1', 'assess1');
  if (h1 === h2) throw new Error('Different inputs should produce different hashes');
});

// ── Signals: computeAssessmentSignals ───────────────────────────────────────

test('Signals: computes freshness metrics for scored assessment', () => {
  const signals = schema.computeAssessmentSignals(BASE, CATALOG);
  if (signals.freshness_days_median == null) throw new Error('Expected freshness_days_median');
  if (signals.freshness_days_max == null) throw new Error('Expected freshness_days_max');
  if (typeof signals.warnings_count !== 'number') throw new Error('Expected warnings_count');
  if (!Array.isArray(signals.warnings)) throw new Error('Expected warnings array');
});

test('Signals: detects stale evidence (> 180 days)', () => {
  const a = clone(BASE);
  // Make evidence very old
  for (const dim of a.dimensions) {
    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        ev.published_date = '2025-01-01';
        ev.captured_at = '2025-01-01T10:00:00Z';
      }
    }
  }
  const signals = schema.computeAssessmentSignals(a, CATALOG);
  const hasStale = signals.warnings.some((w) => w.startsWith('STALE_EVIDENCE'));
  if (!hasStale) throw new Error('Expected STALE_EVIDENCE warning');
});

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);

if (failed > 0) {
  console.log('NEGATIVE TESTS FAILED\n');
  process.exitCode = 1;
} else {
  console.log('ALL NEGATIVE TESTS PASSED\n');
}
