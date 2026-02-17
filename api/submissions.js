'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated Submissions API handler
//
// Access control:
//   PUBLIC (no token):
//     GET  /api/ami/submissions         → action=list  (redacted view)
//     GET  /api/ami/submissions/:id     → action=get   (redacted view)
//   INTERNAL (x-internal-token required):
//     GET  /api/ami/submissions?full=true         → full payload
//     GET  /api/ami/submissions/:id?full=true     → full payload
//     POST /api/ami/submissions/:id/review        → action=review
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const apiUtil = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
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

/**
 * Redact sensitive fields from a submission for public view.
 * Strips: contact info, review reasoning/signature, notes.
 */
function redactSubmission(s) {
  return {
    submission_id: s.submission_id,
    type: s.type,
    system_id: s.system_id,
    assessment_id: s.assessment_id || null,
    status: s.status,
    submitted_at: s.submitted_at,
    updated_at: s.updated_at,
    resulting_assessment_id: s.resulting_assessment_id || null,
  };
}

module.exports = async function handler(req, res) {
  if (apiUtil.handleCors(req, res)) return;

  // Only allow GET and POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET', 'POST'] });
    return;
  }

  const action = req.query?.action || 'list';

  switch (action) {
    case 'list': return handleList(req, res);
    case 'get': return handleGet(req, res);
    case 'review': return handleReview(req, res);
    default:
      res.status(400).json({ error: 'unknown_action', action });
  }
};

// ── GET /api/submissions — List submissions ──────────────────────────────────
// Public: returns redacted view. With ?full=true + valid token: full payload.

async function handleList(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  const wantsFull = req.query?.full === 'true';
  if (wantsFull && !apiUtil.requireAuth(req, res)) return;
  const authed = wantsFull || apiUtil.isAuthenticated(req);

  try {
    const filters = {};

    if (req.query?.system_id) {
      filters.system_id = req.query.system_id;
    }

    if (req.query?.status) {
      const status = apiUtil.validateQueryEnum(res, req.query.status, 'status', subs.SUBMISSION_STATUSES);
      if (status === undefined) return;
      if (status) filters.status = status;
    }

    const submissions = await subs.listSubmissions(Object.keys(filters).length > 0 ? filters : undefined);

    const items = authed
      ? submissions.map((s) => ({
          submission_id: s.submission_id,
          type: s.type,
          system_id: s.system_id,
          assessment_id: s.assessment_id,
          status: s.status,
          submitted_at: s.submitted_at,
          updated_at: s.updated_at,
          resulting_assessment_id: s.resulting_assessment_id || null,
          contact: s.contact,
          review: s.review,
          notes: s.notes,
        }))
      : submissions.map(redactSubmission);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      meta: { total: items.length },
      submissions: items,
    });
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: error?.message || 'Failed to list submissions' });
  }
}

// ── GET /api/submissions/:id — Get single submission ─────────────────────────
// Public: returns redacted view. With ?full=true + valid token: full payload.

async function handleGet(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  const submissionId = req.query?.id;
  if (!submissionId) {
    res.status(400).json({ error: 'missing_submission_id' });
    return;
  }

  // Path traversal guard: submission IDs must be alphanumeric + underscore + hyphen
  if (!/^[A-Za-z0-9_-]+$/.test(submissionId)) {
    res.status(400).json({ error: 'invalid_submission_id' });
    return;
  }

  const wantsFull = req.query?.full === 'true';
  if (wantsFull && !apiUtil.requireAuth(req, res)) return;
  const authed = wantsFull || apiUtil.isAuthenticated(req);

  try {
    const submission = await subs.getSubmission(submissionId);
    if (!submission) {
      res.status(404).json({ error: 'submission_not_found', submission_id: submissionId });
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(authed ? submission : redactSubmission(submission));
  } catch (error) {
    res.status(500).json({ error: 'fetch_failed', message: error?.message || 'Failed to fetch submission' });
  }
}

// ── POST /api/submissions/:id/review — Apply review decision ─────────────────
// Internal only — requires x-internal-token.

async function handleReview(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['POST'] });
    return;
  }

  // Auth required for review actions
  if (!apiUtil.requireAuth(req, res)) return;

  const submissionId = req.query?.id;
  if (!submissionId) {
    res.status(400).json({ error: 'missing_submission_id' });
    return;
  }

  // Path traversal guard
  if (!/^[A-Za-z0-9_-]+$/.test(submissionId)) {
    res.status(400).json({ error: 'invalid_submission_id' });
    return;
  }

  try {
    const body = await parseBody(req);
    const { status, reviewer_name, reviewer_handle, reasoning } = body;

    const result = await subs.reviewSubmission(submissionId, {
      status, reviewer_name, reviewer_handle, reasoning,
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
        await subs.linkAssessmentToSubmission(submissionId, newAssessment.assessment_id);
      }
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(response);
  } catch (error) {
    const httpStatus = error.message === 'invalid_json' ? 400 :
                       error.message === 'payload_too_large' ? 413 : 500;
    res.status(httpStatus).json({
      error: error.message === 'invalid_json' ? 'invalid_json' :
             error.message === 'payload_too_large' ? 'payload_too_large' :
             'review_failed',
      message: httpStatus === 500 ? (error?.message || 'Failed to process review') : undefined,
    });
  }
}

function createNewAssessmentVersion(submission, assessmentUpdates) {
  if (!assessmentUpdates) return null;

  const original = store.getAssessmentById(submission.assessment_id);
  if (!original) return null;

  const existing = store.listAssessments(original.system_id);
  const nextVersion = existing.length > 0
    ? Math.max(...existing.map((a) => a.version || 0)) + 1
    : 1;

  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const newAssessment = JSON.parse(JSON.stringify(original));
  newAssessment.assessment_id = `AMI_ASSESS_${dateStr}_${original.system_id}_v${nextVersion}`;
  newAssessment.version = nextVersion;
  newAssessment.assessed_at = new Date().toISOString();
  newAssessment.previous_assessment_id = original.assessment_id;

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

  if (newAssessment.status === 'scored') {
    const agg = schema.computeAggregation(newAssessment.dimensions);
    newAssessment.overall_score = agg.score_percent;
    newAssessment.grade = agg.grade;
    newAssessment.overall_confidence = schema.computeOverallConfidence(newAssessment.dimensions);
  }

  newAssessment.review = { state: 'draft', reviewers: [] };
  newAssessment.notes = `Created from ${submission.type} submission ${submission.submission_id}`;
  newAssessment.integrity = store.computeIntegrityHash(newAssessment);

  const sourceCatalog = loadSourceCatalog();
  const validation = schema.validateAssessment(newAssessment, { sourceCatalog });
  if (!validation.valid) return null;

  store.upsertAssessment(newAssessment);
  return newAssessment;
}
