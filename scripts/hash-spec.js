#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = process.cwd();
const SPEC_PATH = path.join(ROOT, 'docs', 'ami-v1-spec.md');

function main() {
  if (!fs.existsSync(SPEC_PATH)) {
    console.error(`Spec file not found: ${SPEC_PATH}`);
    process.exit(1);
  }
  const content = fs.readFileSync(SPEC_PATH, 'utf8');
  const hash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  console.log(hash);
}

main();
