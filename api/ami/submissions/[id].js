'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/submissions/:id — Get a single submission by ID
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { handleCors, requireAuth } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const subs = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  // Require auth — submissions are internal
  if (!requireAuth(req, res)) return;

  const submissionId = req.query?.id;
  if (!submissionId) {
    res.status(400).json({ error: 'missing_submission_id' });
    return;
  }

  try {
    const submission = subs.getSubmission(submissionId);
    if (!submission) {
      res.status(404).json({ error: 'submission_not_found', submission_id: submissionId });
      return;
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(submission);
  } catch (error) {
    res.status(500).json({
      error: 'fetch_failed',
      message: error?.message || 'Failed to fetch submission',
    });
  }
};
