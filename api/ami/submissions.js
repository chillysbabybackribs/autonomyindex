'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/submissions — List submissions (optionally filtered)
// Query: ?system_id=...&status=...
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { handleCors, requireAuth, validateQueryEnum } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const subs = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  // Require auth — submissions are internal
  if (!requireAuth(req, res)) return;

  try {
    const filters = {};

    if (req.query?.system_id) {
      filters.system_id = req.query.system_id;
    }

    if (req.query?.status) {
      const status = validateQueryEnum(res, req.query.status, 'status', subs.SUBMISSION_STATUSES);
      if (status === undefined) return;
      if (status) filters.status = status;
    }

    const submissions = subs.listSubmissions(Object.keys(filters).length > 0 ? filters : undefined);

    // Return summary (strip contact details for list view)
    const items = submissions.map((s) => ({
      submission_id: s.submission_id,
      type: s.type,
      system_id: s.system_id,
      assessment_id: s.assessment_id,
      status: s.status,
      submitted_at: s.submitted_at,
      updated_at: s.updated_at,
      resulting_assessment_id: s.resulting_assessment_id || null,
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      meta: { total: items.length },
      submissions: items,
    });
  } catch (error) {
    res.status(500).json({
      error: 'fetch_failed',
      message: error?.message || 'Failed to list submissions',
    });
  }
};
