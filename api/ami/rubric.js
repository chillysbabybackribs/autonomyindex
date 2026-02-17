'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/rubric — Machine-readable AMI v1.0 rubric
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const metaPath = path.join(process.cwd(), 'data', 'ami', 'meta.json');
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      amiVersion: meta.ami_version,
      specHash: meta.spec_hash,
      dimensions: meta.dimensions.map((d) => ({
        id: d.id,
        name: d.name,
        weight: d.weight,
      })),
      weights: schema.DIMENSION_WEIGHTS,
      scoringScale: {
        0: 'No capability or evidence',
        1: 'Minimal / emerging',
        2: 'Basic / functional',
        3: 'Moderate / production-viable',
        4: 'Strong / comprehensive',
        5: 'Industry-leading / formal',
      },
      rubrics: meta.rubrics,
      grades: meta.grades,
      confidenceLevels: {
        perDimension: schema.CONFIDENCE_LEVELS,
        overall: schema.OVERALL_CONFIDENCE_LEVELS,
      },
      evidenceTypes: schema.EVIDENCE_TYPES,
      sourceTiers: schema.SOURCE_TIERS,
      sourceReliability: schema.SOURCE_RELIABILITY,
      antiGamingGates: [
        { gate: 1, rule: 'No scored dimension without evidence' },
        { gate: 2, rule: 'Each evidence item must reference >= 1 source ID' },
        { gate: 3, rule: 'Scored dimensions require a confidence value' },
        { gate: 4, rule: 'Aggregation math must match stored score; max 2 unscored dimensions' },
        { gate: 5, rule: 'Score >= 4 requires >= 2 distinct sources' },
        { gate: 6, rule: 'Score 5 requires >= 1 primary or hard-evidence source' },
        { gate: 7, rule: 'Scored assessment requires >= 3 distinct sources total' },
        { gate: 8, rule: 'Scored dimensions require rubric_refs' },
      ],
      aggregationFormula: 'AMI = round( SUM(score_i * renorm_weight_i) / 5 * 100 )',
      systemStatuses: schema.SYSTEM_STATUSES,
      systemCategories: schema.SYSTEM_CATEGORIES,
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'rubric_unavailable',
      message: error?.message || 'Failed to load rubric',
    });
  }
};
