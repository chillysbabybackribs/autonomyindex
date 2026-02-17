'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/schema — JSON Schema for AMI v1.0 assessments
// Derived from live validation logic, not handwritten.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const libSchema = require(path.join(process.cwd(), 'lib', 'ami', 'schema.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    // Build schema from live validation constants
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
        assessment_id: { type: 'string', pattern: '^AMI_ASSESS_\\d{8}_[a-z0-9_-]+_v\\d+$' },
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
          type: 'array',
          minItems: 6,
          maxItems: 6,
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
                    id: { type: 'string' },
                    url: { type: 'string' },
                    title: { type: 'string' },
                    publisher: { type: 'string' },
                    published_date: { type: 'string', format: 'date' },
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
                  name: { type: 'string' },
                  handle: { type: 'string' },
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
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'schema_unavailable',
      message: error?.message || 'Failed to generate schema',
    });
  }
};
