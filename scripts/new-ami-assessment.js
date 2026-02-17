#!/usr/bin/env node
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// Create a new AMI assessment file from the template for a given system.
// Usage: node scripts/new-ami-assessment.js <systemId> [category]
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const TEMPLATE_PATH = path.join(ROOT, 'data', 'ami', 'templates', 'ami-assessment-template.v1.0.0.json');

const VALID_CATEGORIES = [
  'cloud_autonomous',
  'cloud_workflow',
  'local_autonomous',
  'enterprise',
  'vertical_agent',
];

function main() {
  const systemId = process.argv[2];
  const category = process.argv[3] || 'cloud_autonomous';

  if (!systemId) {
    console.error('Usage: node scripts/new-ami-assessment.js <systemId> [category]');
    console.error('Categories:', VALID_CATEGORIES.join(', '));
    process.exit(1);
  }

  if (!VALID_CATEGORIES.includes(category)) {
    console.error(`Invalid category "${category}". Must be one of: ${VALID_CATEGORIES.join(', ')}`);
    process.exit(1);
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`Template not found at ${TEMPLATE_PATH}`);
    process.exit(1);
  }

  // Determine version
  const assessDir = path.join(ROOT, 'data', 'ami', 'assessments', systemId);
  let nextVersion = 1;
  if (fs.existsSync(assessDir)) {
    const existing = fs.readdirSync(assessDir).filter((f) => f.endsWith('.json'));
    nextVersion = existing.length + 1;
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const assessmentId = `AMI_ASSESS_${dateStr}_${systemId}_v${nextVersion}`;

  const template = JSON.parse(fs.readFileSync(TEMPLATE_PATH, 'utf8'));

  // Fill in template fields
  delete template._template_note;
  template.assessment_id = assessmentId;
  template.system_id = systemId;
  template.version = nextVersion;
  template.assessed_at = now.toISOString();
  template.category = category;

  // Set review to draft
  template.review = { state: 'draft', reviewed_by: null, reviewed_at: null };

  if (nextVersion > 1) {
    // Find previous assessment ID
    const prevFiles = fs.readdirSync(assessDir).filter((f) => f.endsWith('.json')).sort();
    if (prevFiles.length > 0) {
      const prev = JSON.parse(fs.readFileSync(path.join(assessDir, prevFiles[prevFiles.length - 1]), 'utf8'));
      template.previous_assessment_id = prev.assessment_id;
    }
  }

  // Compute integrity hash
  const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));
  template.integrity = store.computeIntegrityHash(template);

  // Write file
  if (!fs.existsSync(assessDir)) fs.mkdirSync(assessDir, { recursive: true });
  const outPath = path.join(assessDir, `${assessmentId}.json`);
  fs.writeFileSync(outPath, JSON.stringify(template, null, 2) + '\n', 'utf8');

  console.log(`Created: ${path.relative(ROOT, outPath)}`);
  console.log(`Assessment ID: ${assessmentId}`);
  console.log(`Version: ${nextVersion}`);
  console.log(`Status: under_review (fill in dimensions and set to "scored" when ready)`);
}

main();
