#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI v1.0 Validation Script — CI/build gate
// Loads all assessments, validates structure + gates + score math.
// Exit 0 = all valid. Exit 1 = validation failures.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();

// Inline the schema module (relative require)
const schema = require(path.join(ROOT, 'lib', 'ami', 'schema.js'));
const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));

// ── Source catalog cross-referencing ─────────────────────────────────────────

function loadSourceCatalog() {
  const catalogPath = path.join(ROOT, 'data', 'source-catalog.json');
  if (!fs.existsSync(catalogPath)) return new Map();
  const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
  const sources = Array.isArray(catalog?.sources) ? catalog.sources : [];
  return new Map(sources.map((s) => [s.source_id, s]));
}

// ── Spec hash verification ──────────────────────────────────────────────────

/**
 * Verify spec hash contract.
 * Returns { errors: string[], warnings: string[] }
 */
function verifySpecHash() {
  const metaPath = path.join(ROOT, 'data', 'ami', 'meta.json');
  const specPath = path.join(ROOT, 'docs', 'ami-v1-spec.md');
  if (!fs.existsSync(metaPath) || !fs.existsSync(specPath)) return { errors: [], warnings: [] };

  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  if (!meta.spec_hash) return { errors: [], warnings: [] };

  const specContent = fs.readFileSync(specPath, 'utf8');
  const computed = crypto.createHash('sha256').update(specContent, 'utf8').digest('hex');

  if (computed !== meta.spec_hash) {
    return {
      errors: [`Spec hash mismatch: meta.json expects "${meta.spec_hash}" but docs/ami-v1-spec.md hashes to "${computed}". Update spec_hash in meta.json or revert spec changes.`],
      warnings: [],
    };
  }
  return { errors: [], warnings: [] };
}

// ── Integrity hash verification ─────────────────────────────────────────────

function verifyIntegrity(assessment, relPath) {
  if (!assessment.integrity) return []; // no integrity block = skip
  const computed = store.computeIntegrityHash(assessment);
  if (computed.assessment_hash !== assessment.integrity.assessment_hash) {
    return [
      `integrity hash mismatch in ${relPath}: stored "${assessment.integrity.assessment_hash}" vs computed "${computed.assessment_hash}"`
    ];
  }
  return [];
}

// ── Rubric loading ──────────────────────────────────────────────────────────

function loadRubrics() {
  const metaPath = path.join(ROOT, 'data', 'ami', 'meta.json');
  if (!fs.existsSync(metaPath)) return null;
  const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  return meta.rubrics || null;
}

// ── Reviewer signature verification ─────────────────────────────────────────

function verifyReviewerSignatures(assessment, relPath) {
  const errors = [];
  if (!assessment.review || assessment.review.state !== 'published') return errors;
  if (!Array.isArray(assessment.review.reviewers)) return errors;

  for (let i = 0; i < assessment.review.reviewers.length; i++) {
    const r = assessment.review.reviewers[i];
    if (!r.handle || !r.signed_at || !r.signature_hash) continue;
    const expected = store.computeSignatureHash(
      r.handle, r.signed_at, assessment.system_id, assessment.assessment_id
    );
    if (r.signature_hash !== expected) {
      errors.push(
        `reviewer[${i}] signature_hash mismatch in ${relPath}: ` +
        `stored "${r.signature_hash.slice(0, 16)}..." vs computed "${expected.slice(0, 16)}..."`
      );
    }
  }
  return errors;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const assessmentsBaseDir = path.join(ROOT, 'data', 'ami', 'assessments');

  if (!fs.existsSync(assessmentsBaseDir)) {
    console.log('No data/ami/assessments/ directory found. Nothing to validate.');
    process.exit(0);
  }

  const sourceCatalog = loadSourceCatalog();
  const rubrics = loadRubrics();
  const allErrors = [];

  // Spec hash verification
  const specResult = verifySpecHash();
  if (specResult.errors.length > 0) {
    allErrors.push({ file: 'data/ami/meta.json', errors: specResult.errors });
  }
  for (const w of specResult.warnings) {
    console.log(`  WARNING: ${w}`);
  }

  const systemDirs = fs.readdirSync(assessmentsBaseDir).filter((entry) => {
    return fs.statSync(path.join(assessmentsBaseDir, entry)).isDirectory();
  });

  let totalFiles = 0;
  let totalValid = 0;
  let totalInvalid = 0;

  for (const sysDir of systemDirs) {
    const dirPath = path.join(assessmentsBaseDir, sysDir);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      totalFiles++;
      const filePath = path.join(dirPath, file);
      const relPath = path.relative(ROOT, filePath);

      let assessment;
      try {
        assessment = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } catch (parseErr) {
        totalInvalid++;
        allErrors.push({ file: relPath, errors: [`JSON parse error: ${parseErr.message}`] });
        continue;
      }

      const fileErrors = [];

      // 1. Schema validation (with source catalog for gate 6 + rubrics for gate 8)
      const result = schema.validateAssessment(assessment, { sourceCatalog, rubrics });
      if (!result.valid) {
        fileErrors.push(...result.errors);
      }

      // 2. Source catalog cross-reference (source_ids, with source_id fallback)
      if (Array.isArray(assessment.dimensions)) {
        for (const dim of assessment.dimensions) {
          if (Array.isArray(dim.evidence)) {
            for (const ev of dim.evidence) {
              const sids = schema.resolveSourceIds(ev);
              for (const sid of sids) {
                if (sourceCatalog.size > 0 && !sourceCatalog.has(sid)) {
                  fileErrors.push(
                    `evidence "${ev.id}" references source_id "${sid}" not found in source-catalog.json`
                  );
                }
              }
            }

            // Verify T1/T2 requirement for "verified" confidence
            if (dim.scored && dim.confidence === 'verified') {
              const hasT1T2 = dim.evidence.some((ev) => {
                const sids = schema.resolveSourceIds(ev);
                return sids.some((sid) => {
                  const src = sourceCatalog.get(sid);
                  return src && (src.tier === 'T1' || src.tier === 'T2');
                });
              });
              if (sourceCatalog.size > 0 && !hasT1T2) {
                fileErrors.push(
                  `dimension "${dim.dimension_id}" has confidence "verified" but no T1/T2 source found`
                );
              }
            }
          }
        }
      }

      // 3. Integrity hash verification
      fileErrors.push(...verifyIntegrity(assessment, relPath));

      // 4. Reviewer signature verification
      fileErrors.push(...verifyReviewerSignatures(assessment, relPath));

      // 5. Verify system_id matches directory
      if (assessment.system_id !== sysDir) {
        fileErrors.push(
          `system_id "${assessment.system_id}" does not match directory "${sysDir}"`
        );
      }

      if (fileErrors.length > 0) {
        totalInvalid++;
        allErrors.push({ file: relPath, errors: fileErrors });
      } else {
        totalValid++;
      }
    }
  }

  // ── Output ──

  const summary = {
    generated_at_utc: new Date().toISOString(),
    total_files: totalFiles,
    valid: totalValid,
    invalid: totalInvalid,
    errors: allErrors,
  };

  // Write summary
  const outDir = path.join(ROOT, 'phase1');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, 'ami-validation-summary.json'),
    JSON.stringify(summary, null, 2) + '\n'
  );

  // Console output
  console.log('\n=== AMI v1.0 Validation ===');
  console.log(`Files scanned:  ${totalFiles}`);
  console.log(`Valid:          ${totalValid}`);
  console.log(`Invalid:        ${totalInvalid}`);

  if (allErrors.length > 0) {
    console.log('\n--- Errors ---');
    for (const entry of allErrors) {
      console.log(`\n  ${entry.file}:`);
      for (const err of entry.errors) {
        console.log(`    - ${err}`);
      }
    }
    console.log('');
    process.exitCode = 1;
  } else {
    console.log('\nAll assessments valid.\n');
  }
}

main();
