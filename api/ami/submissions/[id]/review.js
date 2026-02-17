'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ami/submissions/:id/review — Apply review decision (internal only)
// Sets status: under_review | accepted | rejected
// If accepted AND correction/challenge: creates new assessment version
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const { handleCors, requireAuth } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const subs = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) { resolve(req.body); return; }
    const chunks = [];
    let size = 0;
    const MAX_BODY = 256 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('payload_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return null;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['POST'] });
    return;
  }

  // Internal only
  if (!requireAuth(req, res)) return;

  const submissionId = req.query?.id;
  if (!submissionId) {
    res.status(400).json({ error: 'missing_submission_id' });
    return;
  }

  try {
    const body = await parseBody(req);

    const { status, reviewer_name, reviewer_handle, reasoning } = body;

    // Apply review
    const result = subs.reviewSubmission(submissionId, {
      status,
      reviewer_name,
      reviewer_handle,
      reasoning,
    });

    if (!result.success) {
      const httpStatus = result.error === 'submission_not_found' ? 404 :
                         result.error === 'invalid_transition' ? 409 : 400;
      res.status(httpStatus).json({
        error: result.error,
        message: result.message || undefined,
      });
      return;
    }

    const submission = result.submission;
    const response = {
      submission_id: submission.submission_id,
      status: submission.status,
      review: submission.review,
    };

    // If accepted AND correction/challenge: create new assessment version
    if (status === 'accepted' &&
        (submission.type === 'correction' || submission.type === 'challenge') &&
        submission.assessment_id) {
      const newAssessment = createNewAssessmentVersion(submission, body.assessment_updates);
      if (newAssessment) {
        response.resulting_assessment_id = newAssessment.assessment_id;
        response.resulting_version = newAssessment.version;

        // Link submission to new assessment
        subs.linkAssessmentToSubmission(submissionId, newAssessment.assessment_id);
      }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(response);
  } catch (error) {
    const status = error.message === 'invalid_json' ? 400 :
                   error.message === 'payload_too_large' ? 413 : 500;
    res.status(status).json({
      error: error.message === 'invalid_json' ? 'invalid_json' :
             error.message === 'payload_too_large' ? 'payload_too_large' :
             'review_failed',
      message: status === 500 ? (error?.message || 'Failed to process review') : undefined,
    });
  }
};

/**
 * Create a new assessment version from an accepted correction/challenge.
 * The assessment_updates object can contain partial dimension updates.
 */
function createNewAssessmentVersion(submission, assessmentUpdates) {
  if (!assessmentUpdates) return null;

  // Load the original assessment
  const original = store.getAssessmentById(submission.assessment_id);
  if (!original) return null;

  // Determine next version
  const existing = store.listAssessments(original.system_id);
  const nextVersion = existing.length > 0
    ? Math.max(...existing.map((a) => a.version || 0)) + 1
    : 1;

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  // Clone original and apply updates
  const newAssessment = JSON.parse(JSON.stringify(original));
  newAssessment.assessment_id = `AMI_ASSESS_${dateStr}_${original.system_id}_v${nextVersion}`;
  newAssessment.version = nextVersion;
  newAssessment.assessed_at = new Date().toISOString();
  newAssessment.previous_assessment_id = original.assessment_id;

  // Apply dimension score/rationale updates if provided
  if (assessmentUpdates.dimensions && Array.isArray(assessmentUpdates.dimensions)) {
    for (const update of assessmentUpdates.dimensions) {
      const dim = newAssessment.dimensions.find((d) => d.dimension_id === update.dimension_id);
      if (!dim) continue;
      if (update.score != null) dim.score = update.score;
      if (update.rationale) dim.rationale = update.rationale;
      if (update.confidence) dim.confidence = update.confidence;
      if (update.rubric_refs) dim.rubric_refs = update.rubric_refs;
      if (update.evidence) dim.evidence = update.evidence;
    }
  }

  // Recompute aggregation
  if (newAssessment.status === 'scored') {
    const agg = schema.computeAggregation(newAssessment.dimensions);
    newAssessment.overall_score = agg.score_percent;
    newAssessment.grade = agg.grade;
    newAssessment.overall_confidence = schema.computeOverallConfidence(newAssessment.dimensions);
  }

  // Reset review to draft (needs re-review after modification)
  newAssessment.review = { state: 'draft', reviewers: [] };

  // Notes about origin
  newAssessment.notes = `Created from ${submission.type} submission ${submission.submission_id}`;

  // Compute new integrity hash
  newAssessment.integrity = store.computeIntegrityHash(newAssessment);

  // Validate before storing
  const sourceCatalog = loadSourceCatalog();
  const validation = schema.validateAssessment(newAssessment, { sourceCatalog });
  if (!validation.valid) {
    // If validation fails, don't store
    return null;
  }

  // Store
  store.upsertAssessment(newAssessment);

  return newAssessment;
}
