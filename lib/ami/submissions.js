'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI Submission System — Structured submissions with review workflow.
// Storage: Neon Postgres (DATABASE_URL env var)
// Falls back to local file storage for development/testing.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const https = require('node:https');

// ── Neon SQL-over-HTTP client (zero deps) ───────────────────────────────────

function parseConnectionString(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      host: u.hostname,
      user: u.username,
      password: u.password,
      database: u.pathname.slice(1),
    };
  } catch { return null; }
}

function neonQuery(sql, params) {
  const connStr = (process.env.DATABASE_URL || '').trim();
  const conn = parseConnectionString(connStr);
  if (!conn) return Promise.reject(new Error('no_database_url'));

  // Neon serverless HTTP API: https://<host>/sql
  const body = JSON.stringify({ query: sql, params: params || [] });

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: conn.host,
      path: '/sql',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connStr,
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          const text = Buffer.concat(chunks).toString();
          const data = JSON.parse(text);
          if (res.statusCode >= 400 || data.error) {
            reject(new Error(data.error?.message || data.message || `HTTP ${res.statusCode}`));
            return;
          }
          // Neon HTTP returns { rows, fields, ... }
          resolve(data.rows || []);
        } catch (err) { reject(err); }
      });
    });

    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

function useDatabase() {
  return !!process.env.DATABASE_URL;
}

// ── Local file storage (dev/test fallback) ──────────────────────────────────

function resolveRoot() { return process.cwd(); }

let _resolvedSubDir = null;
function submissionsDir() {
  if (_resolvedSubDir) return _resolvedSubDir;
  const primary = path.join(resolveRoot(), 'data', 'ami', 'submissions');
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

// ── Row ↔ Object mapping ────────────────────────────────────────────────────

function rowToSubmission(row) {
  return {
    submission_id: row.submission_id,
    type: row.type,
    system_id: row.system_id,
    assessment_id: row.assessment_id || null,
    status: row.status,
    claims: typeof row.claims === 'string' ? JSON.parse(row.claims) : row.claims,
    evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence) : row.evidence,
    contact: typeof row.contact === 'string' ? JSON.parse(row.contact) : row.contact,
    notes: row.notes || null,
    review: row.review ? (typeof row.review === 'string' ? JSON.parse(row.review) : row.review) : null,
    resulting_assessment_id: row.resulting_assessment_id || null,
    submitted_at: row.submitted_at,
    updated_at: row.updated_at,
  };
}

// ── Constants ────────────────────────────────────────────────────────────────

const SUBMISSION_TYPES = ['assessment_request', 'correction', 'challenge', 'self_assessment_draft'];
const SUBMISSION_STATUSES = ['received', 'under_review', 'accepted', 'rejected'];

// ── Validation ───────────────────────────────────────────────────────────────

function validateSubmission(submission) {
  const errors = [];

  if (!submission || typeof submission !== 'object') {
    return { valid: false, errors: ['Submission must be an object'] };
  }

  if (!submission.type || !SUBMISSION_TYPES.includes(submission.type)) {
    errors.push(`type must be one of: ${SUBMISSION_TYPES.join(', ')}`);
  }

  if (!submission.system_id || typeof submission.system_id !== 'string') {
    errors.push('system_id is required');
  } else if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(submission.system_id)) {
    errors.push('system_id must be lowercase alphanumeric with hyphens/underscores');
  }

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
      if ((submission.type === 'correction' || submission.type === 'challenge') && !claim.dimension_id) {
        errors.push(`claims[${i}].dimension_id is recommended for ${submission.type} submissions`);
      }
    }
  }

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

  if ((submission.type === 'correction' || submission.type === 'challenge') && !submission.assessment_id) {
    errors.push('assessment_id is required for correction and challenge submissions');
  }

  return { valid: errors.length === 0, errors };
}

// ── ID generation ───────────────────────────────────────────────────────────

function generateSubmissionId(systemId) {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(4).toString('hex');
  return `SUB_${dateStr}_${systemId}_${rand}`;
}

// ── Storage: DB or file ─────────────────────────────────────────────────────

async function createSubmission(payload) {
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

  if (useDatabase()) {
    await neonQuery(
      `INSERT INTO submissions (submission_id, type, system_id, assessment_id, status, claims, evidence, contact, notes, submitted_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [submissionId, submission.type, submission.system_id, submission.assessment_id,
       submission.status, JSON.stringify(submission.claims), JSON.stringify(submission.evidence),
       JSON.stringify(submission.contact), submission.notes, now, now]
    );
  } else {
    const filePath = path.join(submissionsDir(), `${submissionId}.json`);
    writeJsonAtomic(filePath, submission);
  }

  return submission;
}

async function getSubmission(submissionId) {
  if (useDatabase()) {
    const rows = await neonQuery(
      'SELECT * FROM submissions WHERE submission_id = $1',
      [submissionId]
    );
    return rows.length > 0 ? rowToSubmission(rows[0]) : null;
  }
  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return readJsonFile(filePath);
}

async function listSubmissions(filters) {
  if (useDatabase()) {
    let sql = 'SELECT * FROM submissions';
    const params = [];
    const clauses = [];
    if (filters?.system_id) {
      params.push(filters.system_id);
      clauses.push(`system_id = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      clauses.push(`status = $${params.length}`);
    }
    if (clauses.length > 0) sql += ' WHERE ' + clauses.join(' AND ');
    sql += ' ORDER BY submitted_at DESC';

    const rows = await neonQuery(sql, params);
    return rows.map(rowToSubmission);
  }

  const dir = submissionsDir();
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  let submissions = files.map((f) => readJsonFile(path.join(dir, f)));

  if (filters) {
    if (filters.system_id) submissions = submissions.filter((s) => s.system_id === filters.system_id);
    if (filters.status) submissions = submissions.filter((s) => s.status === filters.status);
  }

  return submissions.sort((a, b) => (a.submitted_at > b.submitted_at ? -1 : a.submitted_at < b.submitted_at ? 1 : 0));
}

async function listSubmissionsForAssessment(assessmentId) {
  if (useDatabase()) {
    const rows = await neonQuery(
      'SELECT * FROM submissions WHERE assessment_id = $1 ORDER BY submitted_at DESC',
      [assessmentId]
    );
    return rows.map(rowToSubmission);
  }
  const all = await listSubmissions();
  return all.filter((s) => s.assessment_id === assessmentId);
}

// ── Review ───────────────────────────────────────────────────────────────────

const VALID_REVIEW_TRANSITIONS = {
  received: ['under_review', 'rejected'],
  under_review: ['accepted', 'rejected'],
};

function isValidTransition(currentStatus, newStatus) {
  const allowed = VALID_REVIEW_TRANSITIONS[currentStatus];
  return allowed ? allowed.includes(newStatus) : false;
}

async function reviewSubmission(submissionId, reviewData) {
  const submission = await getSubmission(submissionId);
  if (!submission) {
    return { success: false, error: 'submission_not_found' };
  }

  const { status, reviewer_name, reviewer_handle, reasoning } = reviewData;

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

  if (useDatabase()) {
    await neonQuery(
      'UPDATE submissions SET status=$1, review=$2, updated_at=$3 WHERE submission_id=$4',
      [status, JSON.stringify(submission.review), now, submissionId]
    );
  } else {
    const filePath = path.join(submissionsDir(), `${submissionId}.json`);
    writeJsonAtomic(filePath, submission);
  }

  return { success: true, submission };
}

async function linkAssessmentToSubmission(submissionId, newAssessmentId) {
  const now = new Date().toISOString();

  if (useDatabase()) {
    await neonQuery(
      'UPDATE submissions SET resulting_assessment_id=$1, updated_at=$2 WHERE submission_id=$3',
      [newAssessmentId, now, submissionId]
    );
    return true;
  }

  const submission = await getSubmission(submissionId);
  if (!submission) return false;

  submission.resulting_assessment_id = newAssessmentId;
  submission.updated_at = now;

  const filePath = path.join(submissionsDir(), `${submissionId}.json`);
  writeJsonAtomic(filePath, submission);
  return true;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  SUBMISSION_TYPES,
  SUBMISSION_STATUSES,
  VALID_REVIEW_TRANSITIONS,
  validateSubmission,
  submissionsDir,
  generateSubmissionId,
  createSubmission,
  getSubmission,
  listSubmissions,
  listSubmissionsForAssessment,
  isValidTransition,
  reviewSubmission,
  linkAssessmentToSubmission,
};
