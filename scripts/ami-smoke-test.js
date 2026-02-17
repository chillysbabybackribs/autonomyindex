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

console.log('5. API endpoint files (consolidated):');
assert(fileExists('api/ami.js'), 'api/ami.js exists (consolidated AMI handler)');
assert(fileExists('api/systems.js'), 'api/systems.js exists (consolidated systems handler)');
assert(fileExists('api/submissions.js'), 'api/submissions.js exists (consolidated submissions handler)');
assert(fileExists('api/daily-signals.js'), 'api/daily-signals.js exists');
assert(fileExists('api/weekly-briefs.js'), 'api/weekly-briefs.js exists');

// Verify consolidated handlers contain all route logic
assert(
  fileContains('api/ami.js', 'handleIndex', 'handleAssessment', 'handleProfiles', 'handleRubric', 'handleSchema', 'handleValidate', 'handleSubmit'),
  'api/ami.js contains all 7 sub-handlers'
);
assert(
  fileContains('api/systems.js', 'handleAmi', 'handleDiff', 'handleValidate'),
  'api/systems.js contains all 3 sub-handlers'
);
assert(
  fileContains('api/submissions.js', 'handleList', 'handleGet', 'handleReview'),
  'api/submissions.js contains all 3 sub-handlers'
);

// Verify Vercel rewrites are configured
assert(
  fileContains('vercel.json', 'rewrites', 'action=profiles', 'action=rubric', 'action=schema'),
  'vercel.json has rewrites for AMI sub-routes'
);
assert(
  fileContains('vercel.json', 'action=diff', 'action=validate', 'action=ami'),
  'vercel.json has rewrites for systems sub-routes'
);
assert(
  fileContains('vercel.json', 'action=review', 'action=get', 'action=list'),
  'vercel.json has rewrites for submission sub-routes'
);

// Verify old files are removed (function count must stay ≤ 12)
assert(!fileExists('api/ami/[assessmentId].js'), 'old api/ami/[assessmentId].js removed');
assert(!fileExists('api/ami/profiles.js'), 'old api/ami/profiles.js removed');
assert(!fileExists('api/systems/[id]/ami.js'), 'old api/systems/[id]/ami.js removed');

// ── API response simulation (load store directly) ───────────────────────────

console.log('6. API data integrity:');
const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));
const schema = require(path.join(ROOT, 'lib', 'ami', 'schema.js'));
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ami', 'meta.json'), 'utf8'));

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

// ── Compliance Profiles ─────────────────────────────────────────────────────

console.log('7. Compliance profiles:');
const profiles = require(path.join(ROOT, 'lib', 'ami', 'profiles.js'));

// Profile loading
const allProfiles = profiles.loadProfiles();
assert(allProfiles.length >= 3, `At least 3 profiles defined (got ${allProfiles.length})`);

const defaultProfile = profiles.getDefaultProfile();
assert(defaultProfile !== null, 'Default profile exists');
assert(defaultProfile.id === 'prod-general-v1', 'Default profile is prod-general-v1');

const enterprise = profiles.getProfileById('enterprise-strict-v1');
assert(enterprise !== null, 'Enterprise strict profile exists');

const community = profiles.getProfileById('community-basic-v1');
assert(community !== null, 'Community basic profile exists');

// Profile data file
assert(fileExists('data/ami/profiles.json'), 'profiles.json exists');

// OpenClaw profile evaluation (deterministic)
const catalog = profiles.loadSourceCatalog();
if (openclaw) {
  const oclawResult = profiles.evaluateAssessmentAgainstProfile(openclaw, catalog, defaultProfile);
  assert(typeof oclawResult.pass === 'boolean', 'OpenClaw profile result has pass boolean');
  assert(Array.isArray(oclawResult.reasons), 'OpenClaw profile result has reasons array');
  assert(oclawResult.computed != null, 'OpenClaw profile result has computed object');

  // OpenClaw fails prod-general-v1 due to safety score < 2
  assert(
    oclawResult.pass === false,
    'OpenClaw FAILS prod-general-v1 (safety score below minimum)'
  );
  assert(
    oclawResult.reasons.some((r) => r.code === 'PROFILE_MIN_SCORE_FAIL'),
    'OpenClaw failure includes PROFILE_MIN_SCORE_FAIL'
  );

  // OpenClaw passes community-basic-v1
  const oclawCommunity = profiles.evaluateAssessmentAgainstProfile(openclaw, catalog, community);
  assert(oclawCommunity.pass === true, 'OpenClaw PASSES community-basic-v1');

  // Determinism: running twice gives same result
  const oclawResult2 = profiles.evaluateAssessmentAgainstProfile(openclaw, catalog, defaultProfile);
  assert(
    oclawResult.pass === oclawResult2.pass && oclawResult.reasons.length === oclawResult2.reasons.length,
    'Profile evaluation is deterministic'
  );
}

// fixture-profile-fail: scored but fails prod-general-v1
const profileFail = store.getLatestAssessment('fixture-profile-fail');
assert(profileFail !== null, 'fixture-profile-fail assessment exists');
if (profileFail) {
  assert(profileFail.status === 'scored', 'fixture-profile-fail is scored');
  const pfResult = profiles.evaluateAssessmentAgainstProfile(profileFail, catalog, defaultProfile);
  assert(pfResult.pass === false, 'fixture-profile-fail FAILS prod-general-v1');
  assert(
    pfResult.reasons.some((r) => r.code === 'PROFILE_REVIEW_STATE_FAIL'),
    'fixture-profile-fail failure includes PROFILE_REVIEW_STATE_FAIL'
  );
  assert(
    pfResult.reasons.some((r) => r.code === 'PROFILE_SIGNATURE_MISSING'),
    'fixture-profile-fail failure includes PROFILE_SIGNATURE_MISSING'
  );

  // fixture-profile-fail passes community-basic-v1
  const pfCommunity = profiles.evaluateAssessmentAgainstProfile(profileFail, catalog, community);
  assert(pfCommunity.pass === true, 'fixture-profile-fail PASSES community-basic-v1');
}

// Non-scored fixtures always fail prod-general-v1
for (const fid of fixtures) {
  const latest = store.getLatestAssessment(fid);
  if (latest) {
    const result = profiles.evaluateAssessmentAgainstProfile(latest, catalog, defaultProfile);
    assert(result.pass === false, `${fid} FAILS prod-general-v1 (not scored)`);
  }
}

// ── Distribution Kit ────────────────────────────────────────────────────────

console.log('8. Distribution kit:');
assert(fileExists('download/ami-v1-kit.zip'), 'ami-v1-kit.zip exists');
assert(fileExists('download/ami-v1-kit/README.md'), 'kit README.md exists');
assert(fileExists('download/ami-v1-kit/ami-v1-rubric.md'), 'kit rubric.md exists');
assert(fileExists('download/ami-v1-kit/ami-v1-schema.json'), 'kit schema.json exists');
assert(fileExists('download/ami-v1-kit/ami-v1-profiles.json'), 'kit profiles.json exists');
assert(fileExists('download/ami-v1-kit/ami-assessment-template.json'), 'kit template.json exists');
assert(fileExists('download/ami-v1-kit/ami-self-assessment-llm-prompt.txt'), 'kit LLM prompt exists');
assert(fileExists('download/ami-v1-kit/submission-guidelines.md'), 'kit submission guidelines exists');
assert(fileExists('download/ami-self-assessment-prompt.txt'), 'standalone LLM prompt exists');

// Verify kit content is generated from live data
const kitRubric = fs.readFileSync(path.join(ROOT, 'download', 'ami-v1-kit', 'ami-v1-rubric.md'), 'utf8');
assert(kitRubric.includes('Execution Reliability'), 'rubric has ER dimension');
assert(kitRubric.includes('Safety & Guardrails'), 'rubric has SG dimension');
assert(kitRubric.includes('20%'), 'rubric has correct ER weight');
assert(kitRubric.includes('GATE 1'), 'rubric has anti-gaming gates');
assert(kitRubric.includes(meta.spec_hash), 'rubric includes spec hash');

const kitSchema = JSON.parse(fs.readFileSync(path.join(ROOT, 'download', 'ami-v1-kit', 'ami-v1-schema.json'), 'utf8'));
assert(kitSchema.properties.dimensions.items.properties.dimension_id.enum.length === 6, 'schema has 6 dimension IDs');
assert(kitSchema.properties.status.enum.length === schema.SYSTEM_STATUSES.length, 'schema status enum matches live');

// LLM prompt required clauses
const llmPrompt = fs.readFileSync(path.join(ROOT, 'download', 'ami-v1-kit', 'ami-self-assessment-llm-prompt.txt'), 'utf8');
assert(llmPrompt.includes('MUST NOT invent'), 'LLM prompt forbids fabrication');
assert(llmPrompt.includes('source URLs or source IDs'), 'LLM prompt requires sources');
assert(llmPrompt.includes('confidence level per dimension'), 'LLM prompt requires confidence');
assert(llmPrompt.includes('"draft"'), 'LLM prompt sets draft state');
assert(llmPrompt.includes('ENTERPRISE-STRICT'), 'LLM prompt has enterprise mode');
assert(llmPrompt.includes('rubric_refs'), 'LLM prompt mentions rubric_refs');

// Download page
assert(fileExists('ami-download.html'), 'ami-download.html exists');
assert(
  fileContains('ami-download.html', 'ami-v1-kit.zip', 'Copy LLM', '/api/ami/rubric'),
  'download page has required elements'
);

// Rubric and schema served from consolidated api/ami.js
assert(
  fileContains('api/ami.js', 'handleRubric', 'handleSchema'),
  'api/ami.js handles rubric and schema routes'
);

// ── Submission System ───────────────────────────────────────────────────────

console.log('9. Submission system:');

// Module existence
assert(fileExists('lib/ami/submissions.js'), 'submissions.js exists');
assert(fileExists('api/ami.js'), 'consolidated api/ami.js handles submit route');
assert(fileExists('api/submissions.js'), 'consolidated api/submissions.js handles submission routes');

// Load module
const submissions = require(path.join(ROOT, 'lib', 'ami', 'submissions.js'));

// Constants
assert(
  submissions.SUBMISSION_TYPES.length === 3,
  'Three submission types defined'
);
assert(
  submissions.SUBMISSION_TYPES.includes('assessment_request') &&
  submissions.SUBMISSION_TYPES.includes('correction') &&
  submissions.SUBMISSION_TYPES.includes('challenge'),
  'Expected submission types present'
);
assert(
  submissions.SUBMISSION_STATUSES.length === 4,
  'Four submission statuses defined'
);

// Validation — reject malformed
const badResult1 = submissions.validateSubmission({});
assert(badResult1.valid === false, 'Empty submission fails validation');
assert(badResult1.errors.length >= 4, 'Empty submission has multiple errors');

const badResult2 = submissions.validateSubmission({
  type: 'invalid_type',
  system_id: 'test',
  claims: [],
  evidence: [],
  contact: {},
});
assert(badResult2.valid === false, 'Invalid type fails validation');
assert(badResult2.errors.some((e) => e.includes('type')), 'Error mentions type');

const badResult3 = submissions.validateSubmission({
  type: 'correction',
  system_id: 'test',
  claims: [{ summary: 'Test' }],
  evidence: [{ url: 'https://example.com', description: 'Test' }],
  contact: { name: 'Test', email: 'test@test.com' },
  // missing assessment_id for correction
});
assert(badResult3.valid === false, 'Correction without assessment_id fails');

// Validation — accept valid
const goodResult = submissions.validateSubmission({
  type: 'assessment_request',
  system_id: 'test-system',
  claims: [{ summary: 'New system needs assessment' }],
  evidence: [{ url: 'https://example.com', description: 'Project homepage' }],
  contact: { name: 'Test User', email: 'test@example.com' },
});
assert(goodResult.valid === true, 'Valid assessment_request passes');

const goodCorrection = submissions.validateSubmission({
  type: 'correction',
  system_id: 'openclaw',
  assessment_id: 'AMI_ASSESS_20260217_openclaw_v1',
  claims: [{ summary: 'Score should be higher', dimension_id: 'safety_guardrails' }],
  evidence: [{ url: 'https://example.com/audit', description: 'Security audit' }],
  contact: { name: 'Test', email: 'test@test.com' },
});
assert(goodCorrection.valid === true, 'Valid correction passes');

// Transition logic
assert(submissions.isValidTransition('received', 'under_review') === true, 'received → under_review valid');
assert(submissions.isValidTransition('received', 'rejected') === true, 'received → rejected valid');
assert(submissions.isValidTransition('received', 'accepted') === false, 'received → accepted invalid');
assert(submissions.isValidTransition('under_review', 'accepted') === true, 'under_review → accepted valid');
assert(submissions.isValidTransition('under_review', 'rejected') === true, 'under_review → rejected valid');
assert(submissions.isValidTransition('accepted', 'rejected') === false, 'accepted → rejected invalid (terminal)');
assert(submissions.isValidTransition('rejected', 'accepted') === false, 'rejected → accepted invalid (terminal)');

// CRUD test (create, get, list, review, cleanup) — async because storage may use DB
async function runAsyncTests() {
  const testSub = await submissions.createSubmission({
    type: 'challenge',
    system_id: 'openclaw',
    assessment_id: 'AMI_ASSESS_20260217_openclaw_v1',
    claims: [{ summary: 'Safety score underrated', dimension_id: 'safety_guardrails' }],
    evidence: [{ url: 'https://example.com/evidence', description: 'New audit report' }],
    contact: { name: 'Smoke Test', email: 'smoke@test.com' },
  });
  assert(testSub.submission_id.startsWith('SUB_'), 'Created submission has SUB_ prefix');
  assert(testSub.status === 'received', 'New submission status is received');
  assert(testSub.type === 'challenge', 'Submission type preserved');

  const fetched = await submissions.getSubmission(testSub.submission_id);
  assert(fetched !== null, 'Can retrieve submission by ID');
  assert(fetched.system_id === 'openclaw', 'Retrieved submission has correct system_id');

  const listed = await submissions.listSubmissions({ system_id: 'openclaw' });
  assert(listed.some((s) => s.submission_id === testSub.submission_id), 'Submission appears in filtered list');

  const forAssessment = await submissions.listSubmissionsForAssessment('AMI_ASSESS_20260217_openclaw_v1');
  assert(forAssessment.some((s) => s.submission_id === testSub.submission_id), 'Submission appears in assessment list');

  const review1 = await submissions.reviewSubmission(testSub.submission_id, {
    status: 'under_review',
    reviewer_name: 'Smoke Reviewer',
    reviewer_handle: 'smoke-reviewer',
    reasoning: 'Reviewing evidence quality',
  });
  assert(review1.success === true, 'Review to under_review succeeds');
  assert(review1.submission.status === 'under_review', 'Status updated to under_review');
  assert(review1.submission.review.signature_hash != null, 'Review has signature hash');

  const review2 = await submissions.reviewSubmission(testSub.submission_id, {
    status: 'rejected',
    reviewer_name: 'Smoke Reviewer',
    reviewer_handle: 'smoke-reviewer',
    reasoning: 'Insufficient evidence',
  });
  assert(review2.success === true, 'Review to rejected succeeds');
  assert(review2.submission.status === 'rejected', 'Status updated to rejected');

  const review3 = await submissions.reviewSubmission(testSub.submission_id, {
    status: 'accepted',
    reviewer_name: 'Smoke Reviewer',
    reviewer_handle: 'smoke-reviewer',
  });
  assert(review3.success === false, 'Cannot transition from rejected');
  assert(review3.error === 'invalid_transition', 'Error is invalid_transition');

  // Cleanup test submission
  const subFile = path.join(submissions.submissionsDir(), testSub.submission_id + '.json');
  if (fs.existsSync(subFile)) fs.unlinkSync(subFile);
}

function runRemainingTests() {
  // Assessment page shows _submissions
  assert(
    fileContains('ami-assessment.html', '_submissions', 'Submission History'),
    'Assessment page renders submission history'
  );

  assert(
    fileContains('api/ami.js', 'validateSubmission', 'createSubmission'),
    'api/ami.js handles submit with validation'
  );
  assert(
    fileContains('api/submissions.js', 'requireAuth', 'handleList', 'handleReview'),
    'api/submissions.js uses auth and handles list/review'
  );

  // ── Auth & Security Hardening ─────────────────────────────────────────────

  console.log('10. Auth & security hardening:');

  const utilModule = require(path.join(ROOT, 'lib', 'ami', 'api-util.js'));
  assert(
    fileContains('lib/ami/api-util.js', 'isAuthenticated', 'sanitizeString', 'sanitizeDeep'),
    'api-util.js exports isAuthenticated, sanitizeString, sanitizeDeep'
  );
  assert(typeof utilModule.isAuthenticated === 'function', 'isAuthenticated is a function');
  assert(typeof utilModule.sanitizeString === 'function', 'sanitizeString is a function');
  assert(typeof utilModule.sanitizeDeep === 'function', 'sanitizeDeep is a function');

  assert(utilModule.sanitizeString('hello\x00world') === 'helloworld', 'sanitizeString strips null bytes');
  assert(utilModule.sanitizeString('  test  ') === 'test', 'sanitizeString trims whitespace');
  assert(utilModule.sanitizeString('line\ttab') === 'line\ttab', 'sanitizeString preserves tabs');
  assert(utilModule.sanitizeString('line\nnewline') === 'line\nnewline', 'sanitizeString preserves newlines');

  const deepResult = utilModule.sanitizeDeep({
    name: ' hello\x00 ',
    nested: { val: 'test\x07' },
    arr: ['clean', 'with\x01ctrl'],
  });
  assert(deepResult.name === 'hello', 'sanitizeDeep cleans nested string');
  assert(deepResult.nested.val === 'test', 'sanitizeDeep cleans deep nested string');
  assert(deepResult.arr[1] === 'withctrl', 'sanitizeDeep cleans array elements');

  assert(
    fileContains('api/ami.js', 'checkRateLimit', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'rateLimitMap'),
    'api/ami.js has rate limiter infrastructure'
  );
  assert(
    fileContains('api/ami.js', 'SUBMIT_FORBIDDEN_FIELDS', 'forbidden_fields'),
    'api/ami.js rejects forbidden fields on public submit'
  );
  assert(
    fileContains('api/ami.js', '200 * 1024'),
    'api/ami.js limits submit payload to 200KB'
  );
  assert(
    fileContains('api/ami.js', 'sanitizeDeep'),
    'api/ami.js sanitizes submission input'
  );

  const amiContent = fs.readFileSync(path.join(ROOT, 'api', 'ami.js'), 'utf8');
  const submitSection = amiContent.slice(amiContent.indexOf('async function handleSubmit'));
  assert(
    !submitSection.includes('requireAuth'),
    'handleSubmit does NOT call requireAuth (public endpoint)'
  );

  assert(
    fileContains('api/submissions.js', 'redactSubmission', 'isAuthenticated'),
    'api/submissions.js uses redaction and isAuthenticated'
  );
  assert(
    fileContains('api/submissions.js', 'full=true', 'wantsFull'),
    'api/submissions.js supports ?full=true for internal access'
  );

  const subsContent = fs.readFileSync(path.join(ROOT, 'api', 'submissions.js'), 'utf8');
  const reviewSection = subsContent.slice(subsContent.indexOf('async function handleReview'));
  assert(
    reviewSection.includes('requireAuth'),
    'handleReview requires auth (internal only)'
  );

  const listSection = subsContent.slice(subsContent.indexOf('function handleList'), subsContent.indexOf('function handleGet'));
  assert(
    !listSection.includes('if (!apiUtil.requireAuth(req, res)) return;\n\n  const action'),
    'handleList does not blanket-require auth'
  );

  assert(
    fileContains('api/submissions.js', 'invalid_submission_id', '/^[A-Za-z0-9_-]+$/'),
    'submissions.js guards against path traversal in submission IDs'
  );

  // ── Submission Page & Notifications ────────────────────────────────────────

  console.log('11. Submission page & notifications:');

  assert(fileExists('ami-submit.html'), 'ami-submit.html exists');
  assert(
    fileContains('ami-submit.html', 'Submit to AMI', '/api/ami/submit', 'submitForm'),
    'ami-submit.html has form that POSTs to submit endpoint'
  );
  assert(
    fileContains('ami-submit.html', 'assessment_request', 'correction', 'challenge'),
    'ami-submit.html has all three submission types'
  );
  assert(
    fileContains('ami-submit.html', 'contactEmail', 'contactName', 'conflictOfInterest'),
    'ami-submit.html has contact fields and COI checkbox'
  );
  assert(
    fileContains('ami-submit.html', 'result-box', 'success', 'error', 'submission_id'),
    'ami-submit.html displays success/error results'
  );
  assert(
    fileContains('ami-submit.html', 'validation_failed', 'rate_limit_exceeded', 'forbidden_fields'),
    'ami-submit.html handles all error types gracefully'
  );

  assert(fileExists('lib/ami/notify.js'), 'notify.js exists');
  const notifyModule = require(path.join(ROOT, 'lib', 'ami', 'notify.js'));
  assert(typeof notifyModule.notifyNewSubmission === 'function', 'notifyNewSubmission is a function');
  assert(typeof notifyModule.sendAdminEmail === 'function', 'sendAdminEmail is a function');
  assert(typeof notifyModule.sendSubmitterConfirmation === 'function', 'sendSubmitterConfirmation is a function');
  assert(typeof notifyModule.sendTelegramNotification === 'function', 'sendTelegramNotification is a function');

  assert(
    fileContains('api/ami.js', "require(path.join(process.cwd(), 'lib', 'ami', 'notify.js'))"),
    'api/ami.js imports notify module'
  );
  assert(
    fileContains('api/ami.js', 'notify.notifyNewSubmission'),
    'api/ami.js calls notifyNewSubmission after submission creation'
  );

  assert(
    fileContains('lib/ami/notify.js', "require('node:https')"),
    'notify.js uses built-in https module (no npm deps)'
  );
  assert(
    fileContains('lib/ami/notify.js', 'RESEND_API_KEY', 'ADMIN_EMAIL', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'),
    'notify.js checks all required env vars'
  );
  assert(
    fileContains('lib/ami/notify.js', 'Promise.allSettled'),
    'notify.js fires all notifications in parallel'
  );

  try {
    notifyModule.notifyNewSubmission({
      submission_id: 'SUB_TEST_123',
      type: 'assessment_request',
      system_id: 'test',
      status: 'received',
      submitted_at: new Date().toISOString(),
      contact: { name: 'Test', email: 'test@test.com' },
    });
    assert(true, 'notifyNewSubmission does not throw without env vars');
  } catch {
    assert(false, 'notifyNewSubmission does not throw without env vars');
  }

  // ── Database storage ──────────────────────────────────────────────────────

  console.log('12. Database storage:');
  assert(
    fileContains('lib/ami/submissions.js', 'DATABASE_URL', 'neonQuery', 'useDatabase'),
    'submissions.js supports Neon Postgres via DATABASE_URL'
  );
  assert(
    fileContains('lib/ami/submissions.js', "require('node:https')"),
    'submissions.js uses built-in https for Neon SQL-over-HTTP'
  );
  assert(
    fileContains('lib/ami/submissions.js', 'INSERT INTO submissions', 'SELECT * FROM submissions'),
    'submissions.js has SQL queries for CRUD operations'
  );

  // ── Sitemap ─────────────────────────────────────────────────────────────────

  console.log('13. Sitemap:');
  assert(fileExists('scripts/generate-sitemap.js'), 'Sitemap generator exists');
  assert(
    fileContains('scripts/generate-sitemap.js', '/ami-systems'),
    'Sitemap includes /ami-systems route'
  );
  assert(
    fileContains('scripts/generate-sitemap.js', '/ami-download'),
    'Sitemap includes /ami-download route'
  );
  assert(
    fileContains('scripts/generate-sitemap.js', '/ami-submit'),
    'Sitemap includes /ami-submit route'
  );
}

// Run async CRUD tests, then remaining sync tests, then print summary
runAsyncTests()
  .then(() => {
    runRemainingTests();
    console.log(`\nResults: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error('SMOKE TESTS FAILED');
      process.exit(1);
    } else {
      console.log('ALL SMOKE TESTS PASSED');
    }
  })
  .catch((err) => {
    console.error('SMOKE TEST ERROR:', err);
    process.exit(1);
  });
