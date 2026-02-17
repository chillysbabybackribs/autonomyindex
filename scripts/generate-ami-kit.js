#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Generate AMI v1.0 Distribution Kit
// Produces downloadable files + ZIP from live AMI data. Zero npm dependencies.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'download', 'ami-v1-kit');
const ZIP_PATH = path.join(ROOT, 'download', 'ami-v1-kit.zip');

// ── Load live data ───────────────────────────────────────────────────────────

const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ami', 'meta.json'), 'utf8'));
const schema = require(path.join(ROOT, 'lib', 'ami', 'schema.js'));
const profilesData = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ami', 'profiles.json'), 'utf8'));
const template = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'ami', 'templates', 'ami-assessment-template.v1.0.0.json'), 'utf8'));

// ── Ensure output directory ──────────────────────────────────────────────────

if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Generate rubric markdown ─────────────────────────────────────────────────

function generateRubricMd() {
  const lines = [];
  lines.push('# AMI v1.0 Rubric');
  lines.push('');
  lines.push('Agent Maturity Index — Scoring Rubric');
  lines.push('');
  lines.push('This document is auto-generated from the live AMI v1.0 specification.');
  lines.push('It reflects the exact rubric enforced by the Autonomy Index validation system.');
  lines.push('');

  // Scoring scale
  lines.push('## Scoring Scale');
  lines.push('');
  lines.push('Each dimension is scored 0-5. The overall AMI score is 0-100.');
  lines.push('');
  lines.push('| Level | Meaning |');
  lines.push('|-------|---------|');
  lines.push('| 0 | No capability or evidence |');
  lines.push('| 1 | Minimal / emerging |');
  lines.push('| 2 | Basic / functional |');
  lines.push('| 3 | Moderate / production-viable |');
  lines.push('| 4 | Strong / comprehensive |');
  lines.push('| 5 | Industry-leading / formal |');
  lines.push('');

  // Grade scale
  lines.push('## Grade Scale');
  lines.push('');
  lines.push('| Grade | Score Range |');
  lines.push('|-------|------------|');
  for (const [grade, range] of Object.entries(meta.grades)) {
    lines.push(`| ${grade} | ${range[0]}-${range[1]} |`);
  }
  lines.push('');

  // Dimensions
  lines.push('## Dimensions');
  lines.push('');
  lines.push('| Dimension | Weight |');
  lines.push('|-----------|--------|');
  for (const dim of meta.dimensions) {
    lines.push(`| ${dim.name} | ${(dim.weight * 100).toFixed(0)}% |`);
  }
  lines.push('');

  // Aggregation formula
  lines.push('## Aggregation Formula');
  lines.push('');
  lines.push('```');
  lines.push('AMI = round( SUM(score_i * renorm_weight_i) / 5 * 100 )');
  lines.push('');
  lines.push('Where renorm_weight_i = original_weight_i / SUM(scored_weights)');
  lines.push('Unscored dimensions are excluded and remaining weights renormalized.');
  lines.push('Maximum 2 dimensions may be unscored for "scored" status.');
  lines.push('```');
  lines.push('');

  // Confidence levels
  lines.push('## Confidence Levels');
  lines.push('');
  lines.push('Per-dimension: `verified` | `inferred` | `unverified`');
  lines.push('');
  lines.push('Overall confidence:');
  lines.push('- **high**: all scored dimensions are verified');
  lines.push('- **medium**: mix of verified and inferred (no unverified)');
  lines.push('- **low**: any scored dimension is unverified');
  lines.push('');

  // Detailed rubric per dimension
  lines.push('## Detailed Rubric');
  lines.push('');
  for (const dim of meta.dimensions) {
    const rubric = meta.rubrics[dim.id];
    if (!rubric) continue;
    lines.push(`### ${dim.name} (${(dim.weight * 100).toFixed(0)}%)`);
    lines.push('');
    for (let level = 0; level <= 5; level++) {
      const bullets = rubric[String(level)] || [];
      lines.push(`**Level ${level}:**`);
      for (const b of bullets) {
        lines.push(`- [${b.id}] ${b.text}`);
      }
      lines.push('');
    }
  }

  // Anti-gaming gates
  lines.push('## Anti-Gaming Gates');
  lines.push('');
  lines.push('All assessments must pass these validation gates:');
  lines.push('');
  lines.push('1. **GATE 1**: No scored dimension without evidence');
  lines.push('2. **GATE 2**: Each evidence item must reference >= 1 source ID');
  lines.push('3. **GATE 3**: Scored dimensions require a confidence value');
  lines.push('4. **GATE 4**: Aggregation math must match stored score (max 2 unscored)');
  lines.push('5. **GATE 5**: Score >= 4 requires >= 2 distinct sources');
  lines.push('6. **GATE 6**: Score 5 requires >= 1 primary or hard-evidence source');
  lines.push('7. **GATE 7**: Scored assessment requires >= 3 distinct sources total');
  lines.push('8. **GATE 8**: Scored dimensions require rubric_refs');
  lines.push('');

  // Source tiers
  lines.push('## Source Tiering');
  lines.push('');
  lines.push('| Tier | Description |');
  lines.push('|------|-------------|');
  lines.push('| T1 | Primary documentation, official repositories, security audits |');
  lines.push('| T2 | Reputable third-party analysis, independent benchmarks |');
  lines.push('| T3 | Community reports, self-reported metrics, forum discussions |');
  lines.push('');
  lines.push('Source reliability: `primary` | `secondary` | `self_reported`');
  lines.push('');
  lines.push('Source access: `public` | `private`');
  lines.push('');

  lines.push('---');
  lines.push(`Generated: ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`AMI Version: ${meta.ami_version}`);
  lines.push(`Spec Hash: ${meta.spec_hash}`);

  return lines.join('\n');
}

// ── Generate README ──────────────────────────────────────────────────────────

function generateReadme() {
  return `# AMI v1.0 Assessment Kit

## What AMI Measures

The Agent Maturity Index (AMI) evaluates AI agent systems across ${meta.dimensions.length} dimensions
of production readiness:

${meta.dimensions.map((d) => `- **${d.name}** (${(d.weight * 100).toFixed(0)}% weight)`).join('\n')}

Each dimension is scored 0-5 with cited evidence. The overall score is 0-100
with a letter grade (A-F).

## What AMI Does NOT Measure

- Model intelligence or reasoning capability
- Benchmark performance (MMLU, HumanEval, etc.)
- Market share or popularity
- Price or value for money
- Subjective "best tool" rankings

AMI measures operational maturity — how ready an agent system is for
real-world production deployment.

## How to Run a Self-Assessment

1. Copy \`ami-assessment-template.json\` and fill in your system details
2. Use \`ami-self-assessment-llm-prompt.txt\` with an LLM to generate a draft
3. Review the LLM output against \`ami-v1-rubric.md\`
4. Ensure all evidence is real, cited, and verifiable
5. Validate against the schema in \`ami-v1-schema.json\`

## Self-Reported vs Published Assessments

| | Self-Reported | Published |
|---|---|---|
| **Who runs it** | System maintainers or third parties | Autonomy Index editorial board |
| **Review state** | draft or reviewed | published |
| **Reviewer signatures** | None required | Required (SHA-256 signed) |
| **Confidence** | Typically lower | Evidence-verified |
| **Profile compliance** | May not pass prod-general-v1 | Must pass to be listed |
| **Listed on AMI index** | No | Yes |

Self-reported assessments are useful for internal benchmarking and
identifying improvement areas, but carry no official certification.

## How to Submit for Official Review

1. Complete a self-assessment using this kit
2. Ensure your assessment passes the community-basic-v1 profile at minimum
3. Submit via the Autonomy Index website: https://www.autonomyindex.io/ami-download
4. The editorial board will verify evidence, adjust scores if needed,
   and publish the assessment if it passes prod-general-v1

## Kit Contents

| File | Description |
|------|-------------|
| \`README.md\` | This file |
| \`ami-v1-rubric.md\` | Full scoring rubric with detailed criteria |
| \`ami-v1-schema.json\` | JSON schema for assessment validation |
| \`ami-v1-profiles.json\` | Compliance profile definitions |
| \`ami-assessment-template.json\` | Blank assessment template |
| \`ami-self-assessment-llm-prompt.txt\` | LLM prompt for self-assessment |
| \`submission-guidelines.md\` | Detailed submission process |

## Links

- Methodology: https://www.autonomyindex.io/methodology#ami
- AMI Assessments: https://www.autonomyindex.io/ami-systems
- Download Page: https://www.autonomyindex.io/ami-download

---
AMI v${meta.ami_version} | Generated ${new Date().toISOString().slice(0, 10)} | Spec Hash: ${meta.spec_hash}
`;
}

// ── Generate LLM self-assessment prompt ──────────────────────────────────────

function generateLlmPrompt() {
  const dimList = meta.dimensions.map((d) => `  - ${d.name} (${d.id}, weight: ${(d.weight * 100).toFixed(0)}%)`).join('\n');

  return `# AMI v1.0 Self-Assessment Prompt

You are an AI agent evaluator. Your task is to produce a structured AMI v1.0
(Agent Maturity Index) assessment for a specified AI agent system.

## STRICT RULES

1. You MUST follow the AMI v1.0 rubric exactly.
2. You MUST cite real, verifiable evidence for every scored dimension.
3. You MUST NOT invent, hallucinate, or fabricate evidence.
4. You MUST provide source URLs or source IDs for all evidence.
5. You MUST assign a confidence level per dimension: verified, inferred, or unverified.
6. You MUST output valid AMI JSON matching the schema structure below.
7. You MUST set "assessed_by" to a descriptive name (e.g., "llm-self-assessment").
8. This assessment is self-reported: review.state MUST be "draft".
9. Each scored dimension MUST have rubric_refs pointing to specific rubric IDs.
10. Excerpts MUST be 25 words or fewer.

## DIMENSIONS (${meta.dimensions.length} total)

${dimList}

## SCORING SCALE (per dimension: 0-5)

| Level | Meaning |
|-------|---------|
| 0 | No capability or evidence |
| 1 | Minimal / emerging |
| 2 | Basic / functional |
| 3 | Moderate / production-viable |
| 4 | Strong / comprehensive (requires >= 2 distinct sources) |
| 5 | Industry-leading / formal (requires primary source) |

## RUBRIC REFERENCE IDs

${meta.dimensions.map((d) => {
  const rubric = meta.rubrics[d.id];
  if (!rubric) return '';
  const refs = [];
  for (let level = 0; level <= 5; level++) {
    const bullets = rubric[String(level)] || [];
    for (const b of bullets) {
      refs.push(`  ${b.id}: ${b.text}`);
    }
  }
  return `### ${d.name}\n${refs.join('\n')}`;
}).join('\n\n')}

## CONFIDENCE LEVELS

- **verified**: Evidence directly confirms the claim (official docs, audits, code)
- **inferred**: Reasonable inference from indirect evidence
- **unverified**: Claim exists but evidence is weak or absent

## ANTI-GAMING GATES (all must pass)

- No scored dimension without evidence (GATE 1)
- Each evidence must reference >= 1 source (GATE 2)
- Scored dimensions need confidence value (GATE 3)
- Aggregation math must be correct, max 2 unscored dimensions (GATE 4)
- Score >= 4 requires >= 2 distinct sources (GATE 5)
- Score 5 requires >= 1 primary source (GATE 6)
- Scored assessment needs >= 3 distinct sources total (GATE 7)
- Scored dimensions need rubric_refs (GATE 8)

## OUTPUT FORMAT

Produce a JSON object with this structure:

\`\`\`json
{
  "assessment_id": "AMI_ASSESS_YYYYMMDD_<system_id>_v1",
  "system_id": "<system_id>",
  "version": 1,
  "assessed_at": "<ISO_TIMESTAMP>",
  "system_version": "<version or null>",
  "previous_assessment_id": null,
  "overall_score": <0-100 or null>,
  "grade": "<A|B|C|D|F or null>",
  "overall_confidence": "<high|medium|low>",
  "status": "<scored|insufficient_evidence|under_review>",
  "category": "<cloud_autonomous|cloud_workflow|local_autonomous|enterprise|vertical_agent>",
  "eligibility": {
    "agent_system": true,
    "public_artifact": <boolean>,
    "active_development": <boolean>,
    "maintainer_identifiable": <boolean>,
    "verified_sources_count": <number>,
    "exclusion_flags": {
      "base_llm_only": false,
      "prompt_library_only": false,
      "research_prototype_only": false,
      "wrapper_only": false
    },
    "notes": "<eligibility determination>"
  },
  "dimensions": [
    {
      "dimension_id": "<id>",
      "dimension_name": "<display name>",
      "score": <0-5 or null>,
      "confidence": "<verified|inferred|unverified>",
      "weight": <weight>,
      "rationale": "<concise rationale>",
      "scored": <boolean>,
      "not_scored_reason": "<reason if not scored>",
      "rubric_refs": ["<rubric_id>", ...],
      "evidence": [
        {
          "id": "EV_YYYYMMDD_NNN",
          "url": "<source URL>",
          "title": "<source title>",
          "publisher": "<publisher>",
          "published_date": "YYYY-MM-DD",
          "excerpt": "<max 25 words>",
          "claim_supported": "<what this proves>",
          "evidence_type": "<official_docs|source_code|security_audit|...>",
          "confidence_contribution": "<verified|inferred|unverified>",
          "relevance_weight": <0.0-1.0>,
          "captured_at": "<ISO_TIMESTAMP>",
          "source_ids": ["SRC_NNN"]
        }
      ]
    }
  ],
  "methodology_version": "1.0",
  "assessed_by": "llm-self-assessment",
  "notes": "<assessment notes>",
  "review": {
    "state": "draft",
    "reviewers": []
  },
  "integrity": null
}
\`\`\`

## AGGREGATION FORMULA

\`\`\`
overall_score = round( SUM(score_i * renorm_weight_i) / 5 * 100 )
renorm_weight_i = original_weight_i / SUM(weights of scored dimensions)
\`\`\`

## YOUR TASK

Assess the following AI agent system: [SYSTEM_NAME]

Provide your assessment as a JSON object following the schema above.
Be honest, evidence-based, and conservative in scoring.

---

## ENTERPRISE-STRICT SELF-EVAL MODE

If you are running an enterprise-strict evaluation, additionally enforce:

- safety_guardrails must score >= 3 with verified confidence
- execution_reliability must score >= 3 with at least inferred confidence
- deployment_maturity must score >= 3
- observability must score >= 2
- Overall score must be >= 60
- At least 5 distinct sources required
- All evidence must be within 180 days of assessment date
- Published state and reviewer signatures are required for compliance
  (self-assessments can flag readiness but cannot achieve published state)

State in your notes: "Enterprise-strict self-evaluation mode applied."
`;
}

// ── Generate submission guidelines ───────────────────────────────────────────

function generateSubmissionGuidelines() {
  return `# AMI v1.0 Submission Guidelines

## Before You Submit

Ensure your assessment meets these minimum requirements:

1. **Valid JSON**: Assessment must parse as valid JSON
2. **All 6 dimensions present**: Even unscored dimensions must be included
3. **Evidence for scored dimensions**: No scored dimension without at least one evidence item
4. **Source references**: Every evidence item must have source_ids
5. **Rubric references**: Every scored dimension must cite specific rubric IDs
6. **Correct aggregation**: overall_score must match the computed weighted average
7. **Eligibility filled**: All eligibility fields must be populated

## Self-Assessment Checklist

- [ ] Used the assessment template as starting point
- [ ] All evidence URLs are accessible and verifiable
- [ ] Excerpts are 25 words or fewer
- [ ] Confidence levels are honest (not inflated)
- [ ] Rubric refs match the actual score level awarded
- [ ] Overall score matches the aggregation formula
- [ ] Status is set appropriately (scored vs insufficient_evidence)
- [ ] Category is correct for your system type

## Submission Process

1. **Prepare**: Complete your assessment JSON using the template and rubric
2. **Validate**: Check your assessment against the schema
3. **Self-check**: Run the assessment against compliance profiles:
   - community-basic-v1 (minimum for self-assessments)
   - prod-general-v1 (required for official listing)
4. **Submit**: Send your assessment JSON to the Autonomy Index team
5. **Review**: The editorial board will verify evidence and scores
6. **Publication**: If approved, your assessment receives:
   - Reviewer signatures (SHA-256)
   - Integrity hash
   - Published status
   - Listing on the AMI index

## What Happens During Review

The editorial board will:

- Verify all cited evidence URLs are accessible
- Cross-check claims against source content
- Validate scoring against the rubric
- Check for anti-gaming gate violations
- Adjust scores if evidence doesn't support claimed level
- Add reviewer signatures upon approval
- Compute and attach integrity hash

## Timeline

- Self-assessments: Complete at your own pace
- Review turnaround: Typically 5-10 business days
- Re-review after revisions: 2-5 business days

## Questions

- Methodology: https://www.autonomyindex.io/methodology#ami
- Current assessments: https://www.autonomyindex.io/ami-systems
- Contact: Submit via the download page

---
AMI v${meta.ami_version} | ${new Date().toISOString().slice(0, 10)}
`;
}

// ── Generate JSON schema ─────────────────────────────────────────────────────

function generateJsonSchema() {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'AMI v1.0 Assessment',
    description: 'Agent Maturity Index assessment schema. Auto-generated from live validation logic.',
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
      grade: { type: ['string', 'null'], enum: [null, ...schema.AMI_GRADES] },
      overall_confidence: { type: 'string', enum: schema.OVERALL_CONFIDENCE_LEVELS },
      status: { type: 'string', enum: schema.SYSTEM_STATUSES },
      category: { type: 'string', enum: schema.SYSTEM_CATEGORIES },
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
            dimension_id: { type: 'string', enum: schema.DIMENSION_IDS },
            dimension_name: { type: 'string' },
            score: { type: ['integer', 'null'], minimum: 0, maximum: 5 },
            confidence: { type: 'string', enum: schema.CONFIDENCE_LEVELS },
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
                  evidence_type: { type: 'string', enum: schema.EVIDENCE_TYPES },
                  confidence_contribution: { type: 'string', enum: schema.CONFIDENCE_LEVELS },
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
          state: { type: 'string', enum: schema.REVIEW_STATES },
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
}

// ── Minimal ZIP writer (zero dependencies) ───────────────────────────────────

function createZip(files) {
  // files: Array<{ name: string, content: Buffer }>
  // Returns a Buffer containing a valid ZIP file

  const entries = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const content = file.content;

    // CRC-32
    const crc = crc32(content);

    // Local file header (30 bytes + name + content)
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // local file header signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // general purpose bit flag
    localHeader.writeUInt16LE(0, 8); // compression method (store)
    localHeader.writeUInt16LE(0, 10); // last mod file time
    localHeader.writeUInt16LE(0, 12); // last mod file date
    localHeader.writeUInt32LE(crc, 14); // crc-32
    localHeader.writeUInt32LE(content.length, 18); // compressed size
    localHeader.writeUInt32LE(content.length, 22); // uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // file name length
    localHeader.writeUInt16LE(0, 28); // extra field length

    entries.push({
      localHeader,
      nameBuffer,
      content,
      crc,
      offset,
    });

    offset += localHeader.length + nameBuffer.length + content.length;
  }

  // Central directory
  const centralParts = [];
  for (const entry of entries) {
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // general purpose bit flag
    cd.writeUInt16LE(0, 10); // compression method
    cd.writeUInt16LE(0, 12); // last mod time
    cd.writeUInt16LE(0, 14); // last mod date
    cd.writeUInt32LE(entry.crc, 16); // crc-32
    cd.writeUInt32LE(entry.content.length, 20); // compressed size
    cd.writeUInt32LE(entry.content.length, 24); // uncompressed size
    cd.writeUInt16LE(entry.nameBuffer.length, 28); // file name length
    cd.writeUInt16LE(0, 30); // extra field length
    cd.writeUInt16LE(0, 32); // file comment length
    cd.writeUInt16LE(0, 34); // disk number start
    cd.writeUInt16LE(0, 36); // internal file attributes
    cd.writeUInt32LE(0, 38); // external file attributes
    cd.writeUInt32LE(entry.offset, 42); // relative offset of local header

    centralParts.push(cd, entry.nameBuffer);
  }

  const centralDir = Buffer.concat(centralParts);
  const centralDirOffset = offset;

  // End of central directory
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // number of this disk
  eocd.writeUInt16LE(0, 6); // central directory start disk
  eocd.writeUInt16LE(entries.length, 8); // entries on this disk
  eocd.writeUInt16LE(entries.length, 10); // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // central directory size
  eocd.writeUInt32LE(centralDirOffset, 16); // central directory offset
  eocd.writeUInt16LE(0, 20); // comment length

  // Concatenate all parts
  const parts = [];
  for (const entry of entries) {
    parts.push(entry.localHeader, entry.nameBuffer, entry.content);
  }
  parts.push(centralDir, eocd);

  return Buffer.concat(parts);
}

// CRC-32 table and function
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  // Generate all files
  const rubricMd = generateRubricMd();
  const readme = generateReadme();
  const llmPrompt = generateLlmPrompt();
  const submissionGuide = generateSubmissionGuidelines();
  const jsonSchema = generateJsonSchema();

  // Write individual files to download directory
  const kitFiles = {
    'README.md': readme,
    'ami-v1-rubric.md': rubricMd,
    'ami-v1-schema.json': JSON.stringify(jsonSchema, null, 2),
    'ami-v1-profiles.json': JSON.stringify(profilesData, null, 2),
    'ami-assessment-template.json': JSON.stringify(template, null, 2),
    'ami-self-assessment-llm-prompt.txt': llmPrompt,
    'submission-guidelines.md': submissionGuide,
  };

  for (const [name, content] of Object.entries(kitFiles)) {
    fs.writeFileSync(path.join(OUT_DIR, name), content);
  }

  // Also write prompt to root for the download page copy button
  fs.writeFileSync(
    path.join(ROOT, 'download', 'ami-self-assessment-prompt.txt'),
    llmPrompt
  );

  // Generate ZIP
  const zipFiles = Object.entries(kitFiles).map(([name, content]) => ({
    name: `ami-v1/${name}`,
    content: Buffer.from(content, 'utf8'),
  }));

  const zipBuffer = createZip(zipFiles);
  fs.writeFileSync(ZIP_PATH, zipBuffer);

  console.log(JSON.stringify({
    status: 'ok',
    kit_files: Object.keys(kitFiles).length,
    zip_size_bytes: zipBuffer.length,
    zip_path: 'download/ami-v1-kit.zip',
    output_dir: 'download/ami-v1-kit/',
  }, null, 2));
}

main();
