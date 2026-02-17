'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI Submission System — Structured submissions with review workflow.
// Storage: data/ami/submissions/<submissionId>.json
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function resolveRoot() {
  return process.cwd();
}

let _resolvedSubDir = null;

function submissionsDir() {
  if (_resolvedSubDir) return _resolvedSubDir;

  const primary = path.join(resolveRoot(), 'data', 'ami', 'submissions');
  // Test writability — Vercel's /var/task is read-only at runtime
  try {
    if (!fs.existsSync(primary)) fs.mkdirSync(primary, { recursive: true });
    const probe = path.join(primary, '.write-test');
    fs.writeFileSync(probe, '', 'utf8');
    fs.unlinkSync(probe);
    _resolvedSubDir = primary;
  } catch {
    const fallback = path.join('/tmp', 'ami-submissions');
    if (!fs.existsSync(fallback)) fs.mkdirSync(fallback, { recursive: true });
    _resolvedSubDir = fallback;
  }
  return _resolvedSubDir;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${Date.now()}.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw err;
  }
}

// ── Constants ────────────────────────────────────────────────────────────────

const SUBMISSION_TYPES = ['assessment_request', 'correction', 'challenge'];

const SUBMISSION_STATUSES = ['received', 'under_review', 'accepted', 'rejected'];

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a new submission payload.
 * Returns { valid: boolean, errors: string[] }.
 */
function validateSubmission(submission) {
  const errors = [];

  if (!submission || typeof submission !== 'object') {
    return { valid: false, errors: ['Submission must be an object'] };
  }

  // type
  if (!submission.type || !SUBMISSION_TYPES.includes(submission.type)) {
    errors.push(`type must be one of: ${SUBMISSION_TYPES.join(', ')}`);
  }

  // systemId
  if (!submission.system_id || typeof submission.system_id !== 'string') {
    errors.push('system_id is required');
  } else if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(submission.system_id)) {
    errors.push('system_id must be lowercase alphanumeric with hyphens/underscores');
  }

  // claims — structured array of claims
  if (!Array.isArray(submission.claims) || submission.claims.length === 0) {
    errors.push('claims must be a non-empty array');
  } else {
    for (let i = 0; i < submission.claims.length; i++) {
      const claim = submission.claims[i];
      if (!claim || typeof claim !== 'object') {
        errors.push(`claims[${i}] must be an object`);
        continue;
      }
      if (!claim.summary || typeof claim.summary !== 'string' || claim.summary.trim().length === 0) {
        errors.push(`claims[${i}].summary is required`);
      }
      // For corrections and challenges, dimension_id is recommended
      if ((submission.type === 'correction' || submission.type === 'challenge') && !claim.dimension_id) {
        errors.push(`claims[${i}].dimension_id is recommended for ${submission.type} submissions`);
      }
    }
  }

  // evidence — must include sources
  if (!Array.isArray(submission.evidence) || submission.evidence.length === 0) {
    errors.push('evidence must be a non-empty array with sources');
  } else {
    for (let i = 0; i < submission.evidence.length; i++) {
      const ev = submission.evidence[i];
      if (!ev || typeof ev !== 'object') {
        errors.push(`evidence[${i}] must be an object`);
        continue;
      }
      if (!ev.url || typeof ev.url !== 'string') {
        errors.push(`evidence[${i}].url is required`);
      }
      if (!ev.description || typeof ev.description !== 'string') {
        errors.push(`evidence[${i}].description is required`);
      }
    }
  }

  // contact
  if (!submission.contact || typeof submission.contact !== 'object') {
    errors.push('contact is required');
  } else {
    if (!submission.contact.name || typeof submission.contact.name !== 'string') {
      errors.push('contact.name is required');
    }
    if (!submission.contact.email || typeof submission.contact.email !== 'string') {
      errors.push('contact.email is required');
    }
  }

  // For corrections/challenges, assessment_id is required
  if ((submission.type === 'correction' || submission.type === 'challenge') && !submission.assessment_id) {
    errors.push('assessment_id is required for correction and challenge submissions');
  }

  return { valid: errors.length === 0, errors };
}

// ── Storage ──────────────────────────────────────────────────────────────────

/**
 * Generate a submission ID.
 * Format: SUB_<YYYYMMDD>_<systemId>_<random>
 */
function generateSubmissionId(systemId) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex');
  return `SUB_${dateStr}_${systemId}_${rand}`;
}

/**
 * Store a submission. Caller should have already validated.
 */
function createSubmission(payload) {
  const submissionId = generateSubmissionId(payload.system_id);
  const now = new Date().toISOString();

  const submission = {
    submission_id: submissionId,
    type: payload.type,
    system_id: payload.system_id,
    assessment_id: payload.assessment_id || null,
    status: 'received',
    claims: payload.claims,
    evidence: payload.evidence,
    contact: payload.contact,
    notes: payload.notes || null,
    submitted_at: now,
    updated_at: now,
    review: null,
  };

  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  writeJsonAtomic(filePath, submission);

  return submission;
}

/**
 * Get a submission by ID.
 */
function getSubmission(submissionId) {
  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

/**
 * List all submissions, optionally filtered by system_id and/or status.
 * Returns sorted by submitted_at descending (newest first).
 */
function listSubmissions(filters) {
  const dir = submissionsDir();
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let submissions = files.map((f) => readJsonFile(path.join(dir, f)));

  if (filters) {
    if (filters.system_id) {
      submissions = submissions.filter((s) => s.system_id === filters.system_id);
    }
    if (filters.status) {
      submissions = submissions.filter((s) => s.status === filters.status);
    }
  }

  return submissions.sort((a, b) => {
    if (a.submitted_at > b.submitted_at) return -1;
    if (a.submitted_at < b.submitted_at) return 1;
    return 0;
  });
}

/**
 * List submissions for a specific assessment (corrections/challenges).
 */
function listSubmissionsForAssessment(assessmentId) {
  return listSubmissions().filter((s) => s.assessment_id === assessmentId);
}

// ── Review ───────────────────────────────────────────────────────────────────

const VALID_REVIEW_TRANSITIONS = {
  received: ['under_review', 'rejected'],
  under_review: ['accepted', 'rejected'],
  // Terminal states — no further transitions
};

/**
 * Validate a status transition.
 */
function isValidTransition(currentStatus, newStatus) {
  const allowed = VALID_REVIEW_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

/**
 * Apply a review decision to a submission.
 * Returns { success, error?, submission? }.
 */
function reviewSubmission(submissionId, reviewData) {
  const submission = getSubmission(submissionId);
  if (!submission) {
    return { success: false, error: 'submission_not_found' };
  }

  const { status, reviewer_name, reviewer_handle, reasoning } = reviewData;

  // Validate required fields
  if (!status || !SUBMISSION_STATUSES.includes(status)) {
    return { success: false, error: 'invalid_status' };
  }

  if (!isValidTransition(submission.status, status)) {
    return {
      success: false,
      error: 'invalid_transition',
      message: `Cannot transition from '${submission.status}' to '${status}'`,
    };
  }

  if (!reviewer_name || !reviewer_handle) {
    return { success: false, error: 'reviewer_signature_required' };
  }

  const now = new Date().toISOString();

  // Compute reviewer signature hash
  const signatureHash = crypto.createHash('sha256')
    .update(reviewer_handle + now + submissionId, 'utf8')
    .digest('hex');

  submission.status = status;
  submission.updated_at = now;
  submission.review = {
    status,
    reviewer_name,
    reviewer_handle,
    reasoning: reasoning || null,
    reviewed_at: now,
    signature_hash: signatureHash,
  };

  // Write updated submission
  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  writeJsonAtomic(filePath, submission);

  return { success: true, submission };
}

/**
 * Link a new assessment version to an accepted submission.
 */
function linkAssessmentToSubmission(submissionId, newAssessmentId) {
  const submission = getSubmission(submissionId);
  if (!submission) return false;

  submission.resulting_assessment_id = newAssessmentId;
  submission.updated_at = new Date().toISOString();

  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  writeJsonAtomic(filePath, submission);
  return true;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Constants
  SUBMISSION_TYPES,
  SUBMISSION_STATUSES,
  VALID_REVIEW_TRANSITIONS,

  // Validation
  validateSubmission,

  // Storage
  submissionsDir,
  generateSubmissionId,
  createSubmission,
  getSubmission,
  listSubmissions,
  listSubmissionsForAssessment,

  // Review
  isValidTransition,
  reviewSubmission,
  linkAssessmentToSubmission,
};
