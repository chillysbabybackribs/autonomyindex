#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI Smoke Tests — Verify pages exist and API responses are well-formed.
// Usage: node scripts/ami-smoke-test.js
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.error(`  FAIL: ${label}`);
  }
}

function fileExists(relPath) {
  return fs.existsSync(path.join(ROOT, relPath));
}

function fileContains(relPath, ...strings) {
  const content = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  return strings.every((s) => content.includes(s));
}

// ── Page existence ──────────────────────────────────────────────────────────

console.log('=== AMI Smoke Tests ===\n');

console.log('1. Static page files:');
assert(fileExists('methodology.html'), 'methodology.html exists');
assert(fileExists('ami-assessment.html'), 'ami-assessment.html exists');
assert(fileExists('ami-systems.html'), 'ami-systems.html exists');

// ── Methodology content checks ──────────────────────────────────────────────

console.log('2. Methodology v1.0 content:');
assert(
  fileContains('methodology.html', 'AMI v1.0'),
  'methodology.html contains "AMI v1.0"'
);
assert(
  fileContains('methodology.html', 'Execution Reliability', 'Safety &amp; Guardrails', 'Tooling &amp; Integration Breadth'),
  'methodology.html has correct v1.0 dimension names'
);
assert(
  fileContains('methodology.html', '0-5 per dimension, 0-100 overall'),
  'methodology.html shows correct scoring scale'
);
assert(
  fileContains('methodology.html', 'tag-verified', 'tag-inferred', 'tag-unverified'),
  'methodology.html uses v1.0 confidence labels'
);
assert(
  fileContains('methodology.html', '>F<', '0-19'),
  'methodology.html includes F grade'
);
assert(
  fileContains('methodology.html', 'Renormalization'),
  'methodology.html explains renormalization'
);
assert(
  fileContains('methodology.html', 'Anti-Gaming Gates'),
  'methodology.html lists anti-gaming gates'
);
assert(
  fileContains('methodology.html', 'Source Tiers', 'T1', 'T2', 'T3'),
  'methodology.html explains source tiering'
);

// ── Assessment page checks ──────────────────────────────────────────────────

console.log('3. Assessment detail page:');
assert(
  fileContains('ami-assessment.html', '/api/ami/'),
  'ami-assessment.html fetches from API'
);
assert(
  fileContains('ami-assessment.html', 'private source'),
  'ami-assessment.html handles private sources'
);
assert(
  fileContains('ami-assessment.html', 'Autonomy Index'),
  'ami-assessment.html uses correct logo'
);
assert(
  fileContains('ami-assessment.html', '/methodology#ami'),
  'ami-assessment.html links to AMI methodology'
);

// ── Systems page checks ─────────────────────────────────────────────────────

console.log('4. Systems index page:');
assert(
  fileContains('ami-systems.html', '/api/ami'),
  'ami-systems.html fetches from API'
);
assert(
  fileContains('ami-systems.html', '/ami-assessment?id='),
  'ami-systems.html links to assessment detail'
);
assert(
  fileContains('ami-systems.html', 'Autonomy Index'),
  'ami-systems.html uses correct logo'
);

// ── API endpoint files ──────────────────────────────────────────────────────

console.log('5. API endpoint files:');
assert(fileExists('api/ami.js'), 'api/ami.js exists');
assert(fileExists('api/ami/[assessmentId].js'), 'api/ami/[assessmentId].js exists');
assert(fileExists('api/systems/[id]/ami.js'), 'api/systems/[id]/ami.js exists');
assert(fileExists('api/systems/[id]/ami/diff.js'), 'api/systems/[id]/ami/diff.js exists');

// ── API response simulation (load store directly) ───────────────────────────

console.log('6. API data integrity:');
const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));
const schema = require(path.join(ROOT, 'lib', 'ami', 'schema.js'));

const systemIds = store.listSystemIds();
assert(systemIds.length > 0, 'At least one system has assessments');

// Check OpenClaw specifically
const openclaw = store.getLatestAssessment('openclaw');
assert(openclaw !== null, 'OpenClaw latest assessment exists');
if (openclaw) {
  assert(openclaw.status === 'scored', 'OpenClaw is scored');
  assert(openclaw.overall_score != null, 'OpenClaw has overall_score');
  assert(openclaw.grade != null, 'OpenClaw has grade');
  assert(openclaw.review?.state === 'published', 'OpenClaw is published');
  assert(
    Array.isArray(openclaw.review?.reviewers) && openclaw.review.reviewers.length > 0,
    'OpenClaw has reviewer signatures'
  );
  assert(openclaw.integrity != null, 'OpenClaw has integrity hash');

  // Verify aggregation
  const agg = schema.computeAggregation(openclaw.dimensions);
  assert(
    agg.score_percent === openclaw.overall_score,
    `OpenClaw aggregation matches: computed=${agg.score_percent}, stored=${openclaw.overall_score}`
  );

  // Verify integrity hash
  const computed = store.computeIntegrityHash(openclaw);
  assert(
    computed.assessment_hash === openclaw.integrity.assessment_hash,
    'OpenClaw integrity hash matches'
  );

  // Check dimensions have rubric_refs
  const allHaveRubricRefs = openclaw.dimensions
    .filter((d) => d.scored)
    .every((d) => Array.isArray(d.rubric_refs) && d.rubric_refs.length > 0);
  assert(allHaveRubricRefs, 'All scored OpenClaw dimensions have rubric_refs');

  // Signals
  const signals = schema.computeAssessmentSignals(openclaw, null);
  assert(signals.freshness_days_median != null, 'OpenClaw signals have freshness');
}

// Check fixture systems
const fixtures = ['fixture-inactive', 'fixture-excluded', 'fixture-underreview', 'fixture-insufficient'];
for (const fid of fixtures) {
  const latest = store.getLatestAssessment(fid);
  if (latest) {
    assert(latest.status !== 'scored' || latest.overall_score != null, `${fid}: status/score consistency`);
  }
}

// ── Sitemap ─────────────────────────────────────────────────────────────────

console.log('7. Sitemap:');
assert(fileExists('scripts/generate-sitemap.js'), 'Sitemap generator exists');
assert(
  fileContains('scripts/generate-sitemap.js', '/ami-systems'),
  'Sitemap includes /ami-systems route'
);

// ── Summary ─────────────────────────────────────────────────────────────────

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('SMOKE TESTS FAILED');
  process.exit(1);
} else {
  console.log('ALL SMOKE TESTS PASSED');
}
