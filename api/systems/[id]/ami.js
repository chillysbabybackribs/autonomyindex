'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/systems/:id/ami  — List assessments + latest for a system
// POST /api/systems/:id/ami  — Create new assessment (internal use)
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const { handleCors, validateSystemId, requireAuth } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return null;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) {
      resolve(req.body);
      return;
    }
    const chunks = [];
    let size = 0;
    const MAX_BODY = 512 * 1024; // 512KB limit

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('payload_too_large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(new Error('invalid_json'));
      }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  const systemId = validateSystemId(res, req.query?.id);
  if (!systemId) return;

  // ── GET: list assessments + latest ──
  if (req.method === 'GET') {
    try {
      const assessments = store.listAssessments(systemId);
      const latest = assessments.length > 0 ? assessments[0] : null;

      const history = assessments.map((a) => ({
        assessment_id: a.assessment_id,
        version: a.version,
        overall_score: a.overall_score,
        grade: a.grade,
        overall_confidence: a.overall_confidence,
        status: a.status,
        assessed_at: a.assessed_at,
      }));

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json({
        system_id: systemId,
        total_assessments: assessments.length,
        latest,
        history,
      });
    } catch (error) {
      res.status(500).json({
        error: 'system_ami_fetch_failed',
        message: error?.message || 'Failed to load system AMI data',
      });
    }
    return;
  }

  // ── POST: create new assessment ──
  if (req.method === 'POST') {
    if (!requireAuth(req, res)) return;

    try {
      const body = await parseBody(req);

      // Ensure system_id matches route
      body.system_id = systemId;

      // Server-set fields
      if (!body.assessment_id) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const existing = store.listAssessments(systemId);
        const nextVersion = existing.length > 0 ? Math.max(...existing.map((a) => a.version || 0)) + 1 : 1;
        body.assessment_id = `AMI_ASSESS_${dateStr}_${systemId}_v${nextVersion}`;
        body.version = nextVersion;
      }

      if (!body.assessed_at) {
        body.assessed_at = new Date().toISOString();
      }

      if (!body.methodology_version) {
        body.methodology_version = '1.0';
      }

      // If status is "scored", compute and verify aggregation
      if (body.status === 'scored' && Array.isArray(body.dimensions)) {
        const agg = schema.computeAggregation(body.dimensions);
        body.overall_score = agg.score_percent;
        body.grade = agg.grade;
        body.overall_confidence = schema.computeOverallConfidence(body.dimensions);
      }

      // Force review state to draft for all new assessments (spec Section E)
      body.review = { state: 'draft', reviewed_by: null, reviewed_at: null };

      // Validate (with source catalog for gate 6)
      const sourceCatalog = loadSourceCatalog();
      const validation = schema.validateAssessment(body, { sourceCatalog });
      if (!validation.valid) {
        res.status(422).json({
          error: 'validation_failed',
          errors: validation.errors,
        });
        return;
      }

      // Compute integrity hash (after validation, before storage)
      body.integrity = store.computeIntegrityHash(body);

      // Store
      const filePath = store.upsertAssessment(body);

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(201).json({
        assessment_id: body.assessment_id,
        system_id: body.system_id,
        version: body.version,
        overall_score: body.overall_score,
        grade: body.grade,
        status: body.status,
      });
    } catch (error) {
      const status = error.message === 'invalid_json' ? 400 :
                     error.message === 'payload_too_large' ? 413 : 500;
      res.status(status).json({
        error: error.message === 'invalid_json' ? 'invalid_json' :
               error.message === 'payload_too_large' ? 'payload_too_large' :
               'assessment_create_failed',
        message: status === 500 ? (error?.message || 'Failed to create assessment') : undefined,
      });
    }
    return;
  }

  res.status(405).json({ error: 'method_not_allowed', allowed: ['GET', 'POST'] });
};
