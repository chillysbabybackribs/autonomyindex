'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/:assessmentId — Full assessment by ID + signals
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const submissions = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return null;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const { assessmentId } = req.query;

    if (!assessmentId || typeof assessmentId !== 'string') {
      res.status(400).json({ error: 'missing_assessment_id' });
      return;
    }

    // Sanitize: only allow expected ID format characters
    if (!/^[A-Za-z0-9_-]+$/.test(assessmentId)) {
      res.status(400).json({ error: 'invalid_assessment_id' });
      return;
    }

    const assessment = store.getAssessmentById(assessmentId);

    if (!assessment) {
      res.status(404).json({ error: 'assessment_not_found', assessment_id: assessmentId });
      return;
    }

    // Compute signals
    const sourceCatalog = loadSourceCatalog();
    const signals = schema.computeAssessmentSignals(assessment, sourceCatalog);

    // Expand source_ids with catalog data for each evidence item
    const sourceCatalogObj = {};
    if (sourceCatalog) {
      for (const dim of assessment.dimensions || []) {
        for (const ev of dim.evidence || []) {
          for (const sid of schema.resolveSourceIds(ev)) {
            if (!sourceCatalogObj[sid] && sourceCatalog.has(sid)) {
              const src = sourceCatalog.get(sid);
              sourceCatalogObj[sid] = {
                source_id: src.source_id,
                title: src.title,
                url: src.url,
                publisher: src.publisher,
                tier: src.tier,
                reliability: src.reliability,
                access: src.access,
                type: src.type,
              };
            }
          }
        }
      }
    }

    // Load public submission history for this assessment
    const submissionHistory = submissions.listSubmissionsForAssessment(assessmentId).map((s) => ({
      submission_id: s.submission_id,
      type: s.type,
      status: s.status,
      submitted_at: s.submitted_at,
      resulting_assessment_id: s.resulting_assessment_id || null,
      review: s.review ? {
        status: s.review.status,
        reviewer_name: s.review.reviewer_name,
        reasoning: s.review.reasoning,
        reviewed_at: s.review.reviewed_at,
      } : null,
    }));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      ...assessment,
      _signals: signals,
      _source_catalog: sourceCatalogObj,
      _submissions: submissionHistory,
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'assessment_fetch_failed',
      message: error?.message || 'Failed to load assessment',
    });
  }
};
