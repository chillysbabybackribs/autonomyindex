'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami — Latest AMI assessment per system + filters
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const { handleCors, requireAuth, validateQueryEnum, validateQueryInt } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));

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
    const allLatest = store.loadAllLatest();
    const q = req.query || {};

    let results = allLatest;

    // Validate and filter by status
    if (q.status) {
      const status = validateQueryEnum(res, q.status, 'status', schema.SYSTEM_STATUSES);
      if (status === undefined) return;
      if (status) results = results.filter((a) => a.status === status);
    }

    // Validate and filter by category
    if (q.category) {
      const category = validateQueryEnum(res, q.category, 'category', schema.SYSTEM_CATEGORIES);
      if (category === undefined) return;
      if (category) results = results.filter((a) => a.category === category);
    }

    // Validate and filter by confidence
    if (q.confidence) {
      const confidence = validateQueryEnum(res, q.confidence, 'confidence', schema.OVERALL_CONFIDENCE_LEVELS);
      if (confidence === undefined) return;
      if (confidence) results = results.filter((a) => a.overall_confidence === confidence);
    }

    // Validate and filter by min/max score
    if (q.minScore) {
      const min = validateQueryInt(res, q.minScore, 'minScore', 0, 100);
      if (min === undefined) return;
      if (min != null) results = results.filter((a) => a.overall_score != null && a.overall_score >= min);
    }

    if (q.maxScore) {
      const max = validateQueryInt(res, q.maxScore, 'maxScore', 0, 100);
      if (max === undefined) return;
      if (max != null) results = results.filter((a) => a.overall_score != null && a.overall_score <= max);
    }

    // Publish gating: default to published only
    const includeParam = q.include || null;
    if (includeParam && !['draft', 'all'].includes(includeParam)) {
      res.status(400).json({ error: 'invalid_parameter', parameter: 'include', valid_values: ['draft', 'all'] });
      return;
    }

    if (includeParam) {
      // Require auth for non-published access
      if (!requireAuth(req, res)) return;
    }

    // Filter by review state
    if (!includeParam) {
      // Default: only published
      results = results.filter((a) => a.review?.state === 'published' || !a.review);
    } else if (includeParam === 'draft') {
      results = results.filter((a) => a.review?.state === 'draft');
    }
    // includeParam === 'all' → no filtering by review state

    // Sort by score descending (nulls last)
    results.sort((a, b) => {
      if (a.overall_score == null && b.overall_score == null) return 0;
      if (a.overall_score == null) return 1;
      if (b.overall_score == null) return -1;
      return b.overall_score - a.overall_score;
    });

    // Build summary entries (no full evidence blobs)
    const sourceCatalog = loadSourceCatalog();
    const summary = results.map((a) => {
      const signals = schema.computeAssessmentSignals(a, sourceCatalog);
      return {
        system_id: a.system_id,
        assessment_id: a.assessment_id,
        overall_score: a.overall_score,
        grade: a.grade,
        overall_confidence: a.overall_confidence,
        status: a.status,
        category: a.category,
        assessed_at: a.assessed_at,
        methodology_version: a.methodology_version,
        freshness_days_median: signals.freshness_days_median,
        warnings_count: signals.warnings_count,
        dimensions: (a.dimensions || []).map((d) => ({
          dimension_id: d.dimension_id,
          dimension_name: d.dimension_name,
          score: d.score,
          confidence: d.confidence,
          weight: d.weight,
          scored: d.scored,
        })),
      };
    });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      meta: {
        version: '1.0',
        last_updated: new Date().toISOString(),
        total_systems: summary.length,
        methodology_url: '/methodology',
      },
      systems: summary,
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'ami_index_unavailable',
      message: error?.message || 'Failed to load AMI data',
    });
  }
};
