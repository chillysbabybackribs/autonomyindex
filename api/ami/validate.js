'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/validate?assessmentId=...&profile=... — PASS/FAIL evaluation
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const {
  getProfileById,
  getDefaultProfile,
  loadSourceCatalog,
  evaluateAssessmentAgainstProfile,
} = require(path.join(process.cwd(), 'lib', 'ami', 'profiles.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const q = req.query || {};

    // Assessment ID is required
    if (!q.assessmentId) {
      res.status(400).json({ error: 'missing_parameter', parameter: 'assessmentId' });
      return;
    }

    // Load assessment
    const assessment = store.getAssessmentById(q.assessmentId);
    if (!assessment) {
      res.status(404).json({ error: 'assessment_not_found', assessment_id: q.assessmentId });
      return;
    }

    // Load profile (default if not specified)
    let profile;
    if (q.profile) {
      profile = getProfileById(q.profile);
      if (!profile) {
        res.status(400).json({ error: 'profile_not_found', profile_id: q.profile });
        return;
      }
    } else {
      profile = getDefaultProfile();
      if (!profile) {
        res.status(500).json({ error: 'no_default_profile' });
        return;
      }
    }

    // Evaluate
    const catalog = loadSourceCatalog();
    const result = evaluateAssessmentAgainstProfile(assessment, catalog, profile);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      assessment_id: assessment.assessment_id,
      system_id: assessment.system_id,
      profile_id: profile.id,
      profile_label: profile.label,
      pass: result.pass,
      reasons: result.reasons,
      computed: result.computed,
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'validation_failed',
      message: error?.message || 'Failed to evaluate assessment',
    });
  }
};
