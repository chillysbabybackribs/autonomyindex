'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI Compliance Profiles — Deterministic PASS/FAIL evaluation
// Pure JS (zero dependencies). Uses schema.js for source resolution.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const schema = require(path.join(__dirname, 'schema.js'));

// ── Confidence ordering (higher index = stricter) ────────────────────────────

const CONFIDENCE_RANK = { unverified: 0, inferred: 1, verified: 2 };

// ── Profile loading ──────────────────────────────────────────────────────────

function profilesPath() {
  return path.join(process.cwd(), 'data', 'ami', 'profiles.json');
}

function loadProfiles() {
  const filePath = profilesPath();
  if (!fs.existsSync(filePath)) return [];
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(data.profiles) ? data.profiles : [];
}

function getProfileById(profileId) {
  return loadProfiles().find((p) => p.id === profileId) || null;
}

function getDefaultProfile() {
  return loadProfiles().find((p) => p.default === true) || null;
}

// ── Source catalog helpers ────────────────────────────────────────────────────

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

// ── Core evaluator ───────────────────────────────────────────────────────────

/**
 * Evaluate an assessment against a compliance profile.
 * Deterministic: same inputs always produce same output.
 *
 * @param {object} assessment - Full AmiAssessment object
 * @param {Map|null} sourceCatalog - Map<source_id, SourceEntry> or null
 * @param {object} profile - Profile definition with rules
 * @returns {{ pass: boolean, reasons: Array<{code, message, severity}>, computed: object }}
 */
function evaluateAssessmentAgainstProfile(assessment, sourceCatalog, profile) {
  const reasons = [];
  const rules = profile.rules || {};
  const dims = Array.isArray(assessment.dimensions) ? assessment.dimensions : [];
  const catalog = sourceCatalog || new Map();

  // ── Computed signals ──
  const scoredDims = dims.filter((d) => d.scored && d.score != null);
  const notScoredCount = dims.length - scoredDims.length;

  // Collect all distinct source IDs across the assessment
  const allSourceIds = new Set();
  for (const dim of dims) {
    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        for (const sid of schema.resolveSourceIds(ev)) {
          allSourceIds.add(sid);
        }
      }
    }
  }

  // Per-dimension source IDs
  const dimSourceIds = {};
  for (const dim of dims) {
    const sids = new Set();
    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        for (const sid of schema.resolveSourceIds(ev)) sids.add(sid);
      }
    }
    dimSourceIds[dim.dimension_id] = sids;
  }

  // Evidence freshness (days from published_date or captured_at to assessed_at)
  const assessedAt = new Date(assessment.assessed_at);
  let maxAgeDays = null;
  for (const dim of dims) {
    if (Array.isArray(dim.evidence)) {
      for (const ev of dim.evidence) {
        const pubDate = ev.published_date ? new Date(ev.published_date) : null;
        const capDate = ev.captured_at ? new Date(ev.captured_at) : null;
        const refDate = capDate || pubDate;
        if (refDate && !isNaN(refDate.getTime())) {
          const age = Math.floor((assessedAt - refDate) / 86400000);
          if (maxAgeDays == null || age > maxAgeDays) maxAgeDays = age;
        }
      }
    }
  }

  // Check if any source for score=5 dims is primary/hard-evidence
  const hasAnyPrimaryForScore5 = scoredDims
    .filter((d) => d.score === 5)
    .every((d) => {
      const sids = dimSourceIds[d.dimension_id] || new Set();
      return [...sids].some((sid) => {
        const src = catalog.get(sid);
        return src && src.reliability === 'primary';
      });
    });

  const computed = {
    scored_count: scoredDims.length,
    not_scored_count: notScoredCount,
    distinct_sources_total: allSourceIds.size,
    max_source_age_days: maxAgeDays,
    overall_score: assessment.overall_score,
    status: assessment.status,
    review_state: assessment.review?.state || null,
    has_reviewer_signatures: Array.isArray(assessment.review?.reviewers) && assessment.review.reviewers.length > 0,
  };

  // ── Rule checks (order: structural first, then dimensional, then sources) ──

  // 1. Must be scored status
  if (rules.requireScored && assessment.status !== 'scored') {
    reasons.push({
      code: 'PROFILE_STATUS_NOT_SCORED',
      message: `Assessment status is "${assessment.status}"; profile requires "scored"`,
      severity: 'error',
    });
  }

  // 2. Published state
  if (rules.requirePublished && assessment.review?.state !== 'published') {
    reasons.push({
      code: 'PROFILE_REVIEW_STATE_FAIL',
      message: `Review state is "${assessment.review?.state || 'none'}"; profile requires "published"`,
      severity: 'error',
    });
  }

  // 3. Reviewer signature
  if (rules.requireReviewerSignature) {
    const reviewers = assessment.review?.reviewers;
    if (!Array.isArray(reviewers) || reviewers.length === 0) {
      reasons.push({
        code: 'PROFILE_SIGNATURE_MISSING',
        message: 'Profile requires at least one reviewer signature',
        severity: 'error',
      });
    }
  }

  // 4. Max not-scored dimensions
  if (rules.maxNotScored != null && notScoredCount > rules.maxNotScored) {
    reasons.push({
      code: 'PROFILE_NOT_SCORED_EXCEEDED',
      message: `${notScoredCount} dimensions not scored; profile allows max ${rules.maxNotScored}`,
      severity: 'error',
    });
  }

  // 5. Minimum overall score
  if (rules.minOverallScorePercent != null) {
    if (assessment.overall_score == null || assessment.overall_score < rules.minOverallScorePercent) {
      reasons.push({
        code: 'PROFILE_OVERALL_SCORE_FAIL',
        message: `Overall score is ${assessment.overall_score ?? 'null'}; profile requires >= ${rules.minOverallScorePercent}`,
        severity: 'error',
      });
    }
  }

  // 6. Per-dimension minimum scores
  if (rules.minScores && typeof rules.minScores === 'object') {
    for (const [dimId, minScore] of Object.entries(rules.minScores)) {
      const dim = dims.find((d) => d.dimension_id === dimId);
      if (!dim || !dim.scored || dim.score == null || dim.score < minScore) {
        const actual = dim && dim.scored ? dim.score : 'not scored';
        const displayName = schema.DIMENSION_DISPLAY_NAMES[dimId] || dimId;
        reasons.push({
          code: 'PROFILE_MIN_SCORE_FAIL',
          message: `${displayName} score is ${actual}; profile requires >= ${minScore}`,
          severity: 'error',
        });
      }
    }
  }

  // 7. Per-dimension minimum confidence
  if (rules.minConfidence && typeof rules.minConfidence === 'object') {
    for (const [dimId, minConf] of Object.entries(rules.minConfidence)) {
      const dim = dims.find((d) => d.dimension_id === dimId);
      if (dim && dim.scored) {
        const actualRank = CONFIDENCE_RANK[dim.confidence] ?? -1;
        const requiredRank = CONFIDENCE_RANK[minConf] ?? -1;
        if (actualRank < requiredRank) {
          const displayName = schema.DIMENSION_DISPLAY_NAMES[dimId] || dimId;
          reasons.push({
            code: 'PROFILE_CONFIDENCE_FAIL',
            message: `${displayName} confidence is "${dim.confidence}"; profile requires at least "${minConf}"`,
            severity: 'error',
          });
        }
      }
    }
  }

  // 8. Source diversity: total distinct sources
  if (rules.minDistinctSourcesTotal != null && allSourceIds.size < rules.minDistinctSourcesTotal) {
    reasons.push({
      code: 'PROFILE_SOURCE_DIVERSITY_FAIL',
      message: `${allSourceIds.size} distinct sources found; profile requires >= ${rules.minDistinctSourcesTotal}`,
      severity: 'error',
    });
  }

  // 9. Source diversity per dimension scoring >= 4
  if (rules.minDistinctSourcesPerDimensionGE4 != null) {
    for (const dim of scoredDims) {
      if (dim.score >= 4) {
        const sids = dimSourceIds[dim.dimension_id] || new Set();
        if (sids.size < rules.minDistinctSourcesPerDimensionGE4) {
          const displayName = schema.DIMENSION_DISPLAY_NAMES[dim.dimension_id] || dim.dimension_id;
          reasons.push({
            code: 'PROFILE_SOURCE_DIVERSITY_FAIL',
            message: `${displayName} (score ${dim.score}) has ${sids.size} source(s); profile requires >= ${rules.minDistinctSourcesPerDimensionGE4} for dimensions scoring >= 4`,
            severity: 'error',
          });
        }
      }
    }
  }

  // 10. Primary source required for score 5
  if (rules.requirePrimaryForScore5) {
    for (const dim of scoredDims) {
      if (dim.score === 5) {
        const sids = dimSourceIds[dim.dimension_id] || new Set();
        const hasPrimary = [...sids].some((sid) => {
          const src = catalog.get(sid);
          return src && src.reliability === 'primary';
        });
        if (!hasPrimary) {
          const displayName = schema.DIMENSION_DISPLAY_NAMES[dim.dimension_id] || dim.dimension_id;
          reasons.push({
            code: 'PROFILE_SOURCE_DIVERSITY_FAIL',
            message: `${displayName} (score 5) has no primary source; profile requires primary source for score 5`,
            severity: 'error',
          });
        }
      }
    }
  }

  // 11. Source staleness
  if (rules.maxSourceAgeDays != null && maxAgeDays != null && maxAgeDays > rules.maxSourceAgeDays) {
    reasons.push({
      code: 'PROFILE_SOURCE_STALENESS_FAIL',
      message: `Oldest source is ${maxAgeDays} days old; profile allows max ${rules.maxSourceAgeDays} days`,
      severity: 'warning',
    });
  }

  return {
    pass: reasons.filter((r) => r.severity === 'error').length === 0,
    reasons,
    computed,
  };
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  loadProfiles,
  getProfileById,
  getDefaultProfile,
  loadSourceCatalog,
  evaluateAssessmentAgainstProfile,
};
