'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated Systems API handler
//
// Routes (dispatched via Vercel rewrites → ?id=...&action=...):
//   GET  /api/systems/:id/ami            → action=ami (default)
//   POST /api/systems/:id/ami            → action=ami (POST)
//   GET  /api/systems/:id/ami/diff       → action=diff
//   GET  /api/systems/:id/ami/validate   → action=validate
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const apiUtil = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const profiles = require(path.join(process.cwd(), 'lib', 'ami', 'profiles.js'));

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return null;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) { resolve(req.body); return; }
    const chunks = [];
    let size = 0;
    const MAX_BODY = 512 * 1024;
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

module.exports = async function handler(req, res) {
  if (apiUtil.handleCors(req, res)) return;

  const systemId = apiUtil.validateSystemId(res, req.query?.id);
  if (!systemId) return;

  const action = req.query?.action || 'ami';

  switch (action) {
    case 'ami': return handleAmi(req, res, systemId);
    case 'diff': return handleDiff(req, res, systemId);
    case 'validate': return handleValidate(req, res, systemId);
    default:
      res.status(400).json({ error: 'unknown_action', action });
  }
};

// ── GET/POST /api/systems/:id/ami ────────────────────────────────────────────

async function handleAmi(req, res, systemId) {
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
      res.status(500).json({ error: 'system_ami_fetch_failed', message: error?.message || 'Failed to load system AMI data' });
    }
    return;
  }

  if (req.method === 'POST') {
    if (!apiUtil.requireAuth(req, res)) return;

    try {
      const body = await parseBody(req);
      body.system_id = systemId;

      if (!body.assessment_id) {
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const existing = store.listAssessments(systemId);
        const nextVersion = existing.length > 0 ? Math.max(...existing.map((a) => a.version || 0)) + 1 : 1;
        body.assessment_id = `AMI_ASSESS_${dateStr}_${systemId}_v${nextVersion}`;
        body.version = nextVersion;
      }

      if (!body.assessed_at) body.assessed_at = new Date().toISOString();
      if (!body.methodology_version) body.methodology_version = '1.0';

      if (body.status === 'scored' && Array.isArray(body.dimensions)) {
        const agg = schema.computeAggregation(body.dimensions);
        body.overall_score = agg.score_percent;
        body.grade = agg.grade;
        body.overall_confidence = schema.computeOverallConfidence(body.dimensions);
      }

      body.review = { state: 'draft', reviewers: [] };

      const sourceCatalog = loadSourceCatalog();
      const validation = schema.validateAssessment(body, { sourceCatalog });
      if (!validation.valid) {
        res.status(422).json({ error: 'validation_failed', errors: validation.errors });
        return;
      }

      body.integrity = store.computeIntegrityHash(body);
      store.upsertAssessment(body);

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
}

// ── GET /api/systems/:id/ami/diff ────────────────────────────────────────────

function handleDiff(req, res, systemId) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const assessments = store.listAssessments(systemId);
    if (assessments.length === 0) {
      res.status(404).json({ error: 'no_assessments', system_id: systemId });
      return;
    }

    let current;
    if (req.query?.to) {
      current = assessments.find((a) => a.assessment_id === req.query.to);
      if (!current) {
        res.status(404).json({ error: 'assessment_not_found', assessment_id: req.query.to });
        return;
      }
    } else {
      current = assessments[0];
    }

    let previous = null;
    if (req.query?.from) {
      previous = assessments.find((a) => a.assessment_id === req.query.from);
      if (!previous) {
        res.status(404).json({ error: 'assessment_not_found', assessment_id: req.query.from });
        return;
      }
    } else if (current.previous_assessment_id) {
      previous = assessments.find((a) => a.assessment_id === current.previous_assessment_id);
    } else {
      const currentIdx = assessments.findIndex((a) => a.assessment_id === current.assessment_id);
      if (currentIdx >= 0 && currentIdx < assessments.length - 1) {
        previous = assessments[currentIdx + 1];
      }
    }

    const dimensionChanges = schema.DIMENSION_IDS.map((dimId) => {
      const curDim = (current.dimensions || []).find((d) => d.dimension_id === dimId);
      const prevDim = previous ? (previous.dimensions || []).find((d) => d.dimension_id === dimId) : null;
      const oldScore = prevDim?.scored ? prevDim.score : null;
      const newScore = curDim?.scored ? curDim.score : null;
      return {
        dimension_id: dimId,
        old_score: oldScore,
        new_score: newScore,
        delta: (oldScore != null && newScore != null) ? newScore - oldScore : null,
        confidence_changed: prevDim ? prevDim.confidence !== curDim?.confidence : false,
      };
    });

    const overallDelta = (previous?.overall_score != null && current.overall_score != null)
      ? current.overall_score - previous.overall_score : null;

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      system_id: systemId,
      current,
      previous: previous || null,
      changes: {
        overall_score_delta: overallDelta,
        grade_changed: previous ? previous.grade !== current.grade : false,
        confidence_changed: previous ? previous.overall_confidence !== current.overall_confidence : false,
        dimension_changes: dimensionChanges,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'diff_failed', message: error?.message || 'Failed to compute diff' });
  }
}

// ── GET /api/systems/:id/ami/validate ────────────────────────────────────────

function handleValidate(req, res, systemId) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const assessment = store.getLatestAssessment(systemId);
    if (!assessment) {
      res.status(404).json({ error: 'no_assessment', system_id: systemId });
      return;
    }

    const q = req.query || {};
    let profile;
    if (q.profile) {
      profile = profiles.getProfileById(q.profile);
      if (!profile) {
        res.status(400).json({ error: 'profile_not_found', profile_id: q.profile });
        return;
      }
    } else {
      profile = profiles.getDefaultProfile();
      if (!profile) {
        res.status(500).json({ error: 'no_default_profile' });
        return;
      }
    }

    const catalog = profiles.loadSourceCatalog();
    const result = profiles.evaluateAssessmentAgainstProfile(assessment, catalog, profile);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      assessment_id: assessment.assessment_id,
      system_id: systemId,
      profile_id: profile.id,
      profile_label: profile.label,
      pass: result.pass,
      reasons: result.reasons,
      computed: result.computed,
    });
  } catch (error) {
    res.status(500).json({ error: 'validation_failed', message: error?.message || 'Failed to evaluate assessment' });
  }
}
