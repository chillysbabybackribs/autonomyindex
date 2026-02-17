'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Consolidated AMI API handler
//
// Routes (dispatched via Vercel rewrites → ?action=...):
//   GET  /api/ami                    → action=index (default)
//   GET  /api/ami/:assessmentId      → action=assessment&assessmentId=...
//   GET  /api/ami/profiles           → action=profiles
//   GET  /api/ami/rubric             → action=rubric
//   GET  /api/ami/schema             → action=schema
//   GET  /api/ami/validate           → action=validate&assessmentId=...&profile=...
//   POST /api/ami/submit             → action=submit
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const store = require(path.join(process.cwd(), 'lib', 'ami', 'store.js'));
const schema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));
const apiUtil = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const profiles = require(path.join(process.cwd(), 'lib', 'ami', 'profiles.js'));
const submissions = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));
const notify = require(path.join(process.cwd(), 'lib', 'ami', 'notify.js'));

// ── Rate limiter (in-memory, per-IP) ───────────────────────────────────────

const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const rateLimitMap = new Map();

function checkRateLimit(ip) {
  const now = Date.now();
  const key = ip || 'unknown';
  let timestamps = rateLimitMap.get(key);
  if (!timestamps) { timestamps = []; rateLimitMap.set(key, timestamps); }
  // Prune expired
  const cutoff = now - RATE_LIMIT_WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) timestamps.shift();
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  return true;
}

// Forbidden top-level fields for public submission
const SUBMIT_FORBIDDEN_FIELDS = [
  'status', 'review', 'integrity', 'overall_score', 'grade',
  'overall_confidence', 'score', 'submission_id', 'resulting_assessment_id',
  'updated_at', 'submitted_at',
];

function loadSourceCatalog() {
  const catalogPath = path.join(process.cwd(), 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return null;
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

function parseBody(req, maxBytes) {
  const MAX_BODY = maxBytes || 512 * 1024;
  return new Promise((resolve, reject) => {
    if (req.body) { resolve(req.body); return; }
    const chunks = [];
    let size = 0;
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

  const q = req.query || {};
  const action = q.action || 'index';

  switch (action) {
    case 'index': return handleIndex(req, res);
    case 'assessment': return handleAssessment(req, res);
    case 'profiles': return handleProfiles(req, res);
    case 'rubric': return handleRubric(req, res);
    case 'schema': return handleSchema(req, res);
    case 'validate': return handleValidate(req, res);
    case 'submit': return handleSubmit(req, res);
    default:
      res.status(400).json({ error: 'unknown_action', action });
  }
};

// ── GET /api/ami — Latest AMI assessment per system + filters ────────────────

function handleIndex(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const allLatest = store.loadAllLatest();
    const q = req.query || {};
    let results = allLatest;

    if (q.status) {
      const status = apiUtil.validateQueryEnum(res, q.status, 'status', schema.SYSTEM_STATUSES);
      if (status === undefined) return;
      if (status) results = results.filter((a) => a.status === status);
    }

    if (q.category) {
      const category = apiUtil.validateQueryEnum(res, q.category, 'category', schema.SYSTEM_CATEGORIES);
      if (category === undefined) return;
      if (category) results = results.filter((a) => a.category === category);
    }

    if (q.confidence) {
      const confidence = apiUtil.validateQueryEnum(res, q.confidence, 'confidence', schema.OVERALL_CONFIDENCE_LEVELS);
      if (confidence === undefined) return;
      if (confidence) results = results.filter((a) => a.overall_confidence === confidence);
    }

    if (q.minScore) {
      const min = apiUtil.validateQueryInt(res, q.minScore, 'minScore', 0, 100);
      if (min === undefined) return;
      if (min != null) results = results.filter((a) => a.overall_score != null && a.overall_score >= min);
    }

    if (q.maxScore) {
      const max = apiUtil.validateQueryInt(res, q.maxScore, 'maxScore', 0, 100);
      if (max === undefined) return;
      if (max != null) results = results.filter((a) => a.overall_score != null && a.overall_score <= max);
    }

    const includeParam = q.include || null;
    if (includeParam && !['draft', 'all'].includes(includeParam)) {
      res.status(400).json({ error: 'invalid_parameter', parameter: 'include', valid_values: ['draft', 'all'] });
      return;
    }

    if (includeParam) {
      if (!apiUtil.requireAuth(req, res)) return;
    }

    if (!includeParam) {
      results = results.filter((a) => a.review?.state === 'published' || !a.review);
    } else if (includeParam === 'draft') {
      results = results.filter((a) => a.review?.state === 'draft');
    }

    results.sort((a, b) => {
      if (a.overall_score == null && b.overall_score == null) return 0;
      if (a.overall_score == null) return 1;
      if (b.overall_score == null) return -1;
      return b.overall_score - a.overall_score;
    });

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
    res.status(500).json({ error: 'ami_index_unavailable', message: error?.message || 'Failed to load AMI data' });
  }
}

// ── GET /api/ami/:assessmentId — Full assessment by ID + signals ─────────────

function handleAssessment(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const assessmentId = req.query?.assessmentId;
    if (!assessmentId || typeof assessmentId !== 'string') {
      res.status(400).json({ error: 'missing_assessment_id' });
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(assessmentId)) {
      res.status(400).json({ error: 'invalid_assessment_id' });
      return;
    }

    const assessment = store.getAssessmentById(assessmentId);
    if (!assessment) {
      res.status(404).json({ error: 'assessment_not_found', assessment_id: assessmentId });
      return;
    }

    const sourceCatalog = loadSourceCatalog();
    const signals = schema.computeAssessmentSignals(assessment, sourceCatalog);

    const sourceCatalogObj = {};
    if (sourceCatalog) {
      for (const dim of assessment.dimensions || []) {
        for (const ev of dim.evidence || []) {
          for (const sid of schema.resolveSourceIds(ev)) {
            if (!sourceCatalogObj[sid] && sourceCatalog.has(sid)) {
              const src = sourceCatalog.get(sid);
              sourceCatalogObj[sid] = {
                source_id: src.source_id, title: src.title, url: src.url,
                publisher: src.publisher, tier: src.tier, reliability: src.reliability,
                access: src.access, type: src.type,
              };
            }
          }
        }
      }
    }

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
    res.status(500).json({ error: 'assessment_fetch_failed', message: error?.message || 'Failed to load assessment' });
  }
}

// ── GET /api/ami/profiles — List compliance profiles ─────────────────────────

function handleProfiles(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const allProfiles = profiles.loadProfiles();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      meta: { total: allProfiles.length },
      profiles: allProfiles.map((p) => ({
        id: p.id, label: p.label, description: p.description,
        amiVersion: p.amiVersion, default: p.default || false, rules: p.rules,
      })),
    });
  } catch (error) {
    res.status(500).json({ error: 'profiles_unavailable', message: error?.message || 'Failed to load profiles' });
  }
}

// ── GET /api/ami/rubric — Machine-readable rubric ────────────────────────────

function handleRubric(req, res) {
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
      dimensions: meta.dimensions.map((d) => ({ id: d.id, name: d.name, weight: d.weight })),
      weights: schema.DIMENSION_WEIGHTS,
      scoringScale: {
        0: 'No capability or evidence', 1: 'Minimal / emerging', 2: 'Basic / functional',
        3: 'Moderate / production-viable', 4: 'Strong / comprehensive', 5: 'Industry-leading / formal',
      },
      rubrics: meta.rubrics,
      grades: meta.grades,
      confidenceLevels: { perDimension: schema.CONFIDENCE_LEVELS, overall: schema.OVERALL_CONFIDENCE_LEVELS },
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
    res.status(500).json({ error: 'rubric_unavailable', message: error?.message || 'Failed to load rubric' });
  }
}

// ── GET /api/ami/schema — JSON Schema ────────────────────────────────────────

function handleSchema(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const libSchema = schema;
    const jsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'AMI v1.0 Assessment',
      description: 'Agent Maturity Index assessment schema. Derived from live validation logic.',
      type: 'object',
      required: [
        'assessment_id', 'system_id', 'version', 'assessed_at',
        'status', 'category', 'eligibility', 'dimensions',
        'methodology_version', 'assessed_by',
      ],
      properties: {
        assessment_id: { type: 'string', pattern: '^AMI_ASSESS_\\\\d{8}_[a-z0-9_-]+_v\\\\d+$' },
        system_id: { type: 'string', pattern: '^[a-z0-9][a-z0-9_-]{0,63}$' },
        version: { type: 'integer', minimum: 1 },
        assessed_at: { type: 'string', format: 'date-time' },
        system_version: { type: ['string', 'null'] },
        previous_assessment_id: { type: ['string', 'null'] },
        overall_score: { type: ['integer', 'null'], minimum: 0, maximum: 100 },
        grade: { type: ['string', 'null'], enum: [null, ...libSchema.AMI_GRADES] },
        overall_confidence: { type: 'string', enum: libSchema.OVERALL_CONFIDENCE_LEVELS },
        status: { type: 'string', enum: libSchema.SYSTEM_STATUSES },
        category: { type: 'string', enum: libSchema.SYSTEM_CATEGORIES },
        eligibility: {
          type: 'object',
          required: ['agent_system', 'public_artifact', 'active_development', 'maintainer_identifiable', 'verified_sources_count', 'exclusion_flags'],
          properties: {
            agent_system: { type: 'boolean' },
            public_artifact: { type: 'boolean' },
            active_development: { type: 'boolean' },
            maintainer_identifiable: { type: 'boolean' },
            verified_sources_count: { type: 'integer', minimum: 0 },
            exclusion_flags: {
              type: 'object',
              properties: {
                base_llm_only: { type: 'boolean' },
                prompt_library_only: { type: 'boolean' },
                research_prototype_only: { type: 'boolean' },
                wrapper_only: { type: 'boolean' },
              },
            },
            notes: { type: 'string' },
          },
        },
        dimensions: {
          type: 'array', minItems: 6, maxItems: 6,
          items: {
            type: 'object',
            required: ['dimension_id', 'dimension_name', 'score', 'confidence', 'weight', 'scored'],
            properties: {
              dimension_id: { type: 'string', enum: libSchema.DIMENSION_IDS },
              dimension_name: { type: 'string' },
              score: { type: ['integer', 'null'], minimum: 0, maximum: 5 },
              confidence: { type: 'string', enum: libSchema.CONFIDENCE_LEVELS },
              weight: { type: 'number', minimum: 0, maximum: 1 },
              rationale: { type: 'string' },
              scored: { type: 'boolean' },
              not_scored_reason: { type: 'string' },
              rubric_refs: { type: 'array', items: { type: 'string' } },
              evidence: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['id', 'url', 'title', 'publisher', 'published_date', 'excerpt', 'claim_supported', 'evidence_type', 'confidence_contribution', 'relevance_weight', 'captured_at', 'source_ids'],
                  properties: {
                    id: { type: 'string' }, url: { type: 'string' }, title: { type: 'string' },
                    publisher: { type: 'string' }, published_date: { type: 'string', format: 'date' },
                    excerpt: { type: 'string', description: 'Max 25 words' },
                    claim_supported: { type: 'string' },
                    evidence_type: { type: 'string', enum: libSchema.EVIDENCE_TYPES },
                    confidence_contribution: { type: 'string', enum: libSchema.CONFIDENCE_LEVELS },
                    relevance_weight: { type: 'number', minimum: 0, maximum: 1 },
                    captured_at: { type: 'string', format: 'date-time' },
                    source_ids: { type: 'array', items: { type: 'string' }, minItems: 1 },
                  },
                },
              },
            },
          },
        },
        methodology_version: { type: 'string', const: '1.0' },
        assessed_by: { type: 'string', minLength: 1 },
        notes: { type: 'string' },
        review: {
          type: 'object',
          properties: {
            state: { type: 'string', enum: libSchema.REVIEW_STATES },
            reviewers: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'handle', 'signed_at', 'signature_hash'],
                properties: {
                  name: { type: 'string' }, handle: { type: 'string' },
                  signed_at: { type: 'string', format: 'date-time' },
                  signature_hash: { type: 'string' },
                },
              },
            },
          },
        },
        integrity: {
          type: ['object', 'null'],
          properties: {
            assessment_hash: { type: 'string' },
            hash_algorithm: { type: 'string', const: 'sha256' },
            hashed_at: { type: 'string', format: 'date-time' },
          },
        },
      },
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json(jsonSchema);
  } catch (error) {
    res.status(500).json({ error: 'schema_unavailable', message: error?.message || 'Failed to generate schema' });
  }
}

// ── GET /api/ami/validate — PASS/FAIL evaluation ─────────────────────────────

function handleValidate(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const q = req.query || {};
    if (!q.assessmentId) {
      res.status(400).json({ error: 'missing_parameter', parameter: 'assessmentId' });
      return;
    }

    const assessment = store.getAssessmentById(q.assessmentId);
    if (!assessment) {
      res.status(404).json({ error: 'assessment_not_found', assessment_id: q.assessmentId });
      return;
    }

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
      system_id: assessment.system_id,
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

// ── POST /api/ami/submit — Public submission endpoint ────────────────────────
// No auth required. Rate-limited. Sanitized. Forbidden fields rejected.

async function handleSubmit(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['POST'] });
    return;
  }

  // Rate limit by IP
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
           || req.socket?.remoteAddress
           || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'rate_limit_exceeded', message: 'Max 5 submissions per 10 minutes' });
    return;
  }

  try {
    const body = await parseBody(req, 200 * 1024); // 200KB limit

    // Reject forbidden top-level fields
    const forbidden = SUBMIT_FORBIDDEN_FIELDS.filter((f) => body[f] !== undefined);
    if (forbidden.length > 0) {
      res.status(400).json({
        error: 'forbidden_fields',
        fields: forbidden,
        message: 'Public submissions cannot set these fields',
      });
      return;
    }

    // Sanitize all string inputs
    const sanitized = apiUtil.sanitizeDeep(body);

    const validation = submissions.validateSubmission(sanitized);
    if (!validation.valid) {
      res.status(422).json({ error: 'validation_failed', errors: validation.errors });
      return;
    }

    const submission = submissions.createSubmission(sanitized);

    // Fire-and-forget notifications (never blocks response)
    notify.notifyNewSubmission(submission);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({
      submission_id: submission.submission_id,
      type: submission.type,
      system_id: submission.system_id,
      status: submission.status,
      submitted_at: submission.submitted_at,
    });
  } catch (error) {
    const status = error.message === 'invalid_json' ? 400 :
                   error.message === 'payload_too_large' ? 413 : 500;
    res.status(status).json({
      error: error.message === 'invalid_json' ? 'invalid_json' :
             error.message === 'payload_too_large' ? 'payload_too_large' :
             'submission_failed',
      message: status === 500 ? (error?.message || 'Failed to create submission') : undefined,
    });
  }
}
