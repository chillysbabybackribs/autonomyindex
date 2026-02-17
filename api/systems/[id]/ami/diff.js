'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/systems/:id/ami/diff — Diff two assessments
// Query params: ?from=<assessmentId>&to=<assessmentId>
// Defaults: to=latest, from=previous of latest
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const { handleCors, validateSystemId } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const systemId = validateSystemId(res, req.query?.id);
    if (!systemId) return;

    const assessments = store.listAssessments(systemId); // newest first
    if (assessments.length === 0) {
      res.status(404).json({ error: 'no_assessments', system_id: systemId });
      return;
    }

    // Resolve "to" (current) assessment
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

    // Resolve "from" (previous) assessment
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

    // Build dimension changes
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

    const overallDelta =
      (previous?.overall_score != null && current.overall_score != null)
        ? current.overall_score - previous.overall_score
        : null;

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
    res.status(500).json({
      error: 'diff_failed',
      message: error?.message || 'Failed to compute diff',
    });
  }
};
