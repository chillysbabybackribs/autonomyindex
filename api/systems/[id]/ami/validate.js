'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/systems/:id/ami/validate?profile=... — Validate latest published assessment
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const { handleCors, validateSystemId } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
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
    const systemId = validateSystemId(res, req.query?.id);
    if (!systemId) return;

    // Get latest assessment for this system
    const assessment = store.getLatestAssessment(systemId);
    if (!assessment) {
      res.status(404).json({ error: 'no_assessment', system_id: systemId });
      return;
    }

    // Load profile
    const q = req.query || {};
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
      system_id: systemId,
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
