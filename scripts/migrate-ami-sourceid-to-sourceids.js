#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const store = require(path.join(ROOT, 'lib', 'ami', 'store.js'));

function main() {
  const assessmentsBase = path.join(ROOT, 'data', 'ami', 'assessments');
  if (!fs.existsSync(assessmentsBase)) {
    console.log('No assessments directory found. Nothing to migrate.');
    return;
  }

  const systemDirs = fs.readdirSync(assessmentsBase).filter((entry) =>
    fs.statSync(path.join(assessmentsBase, entry)).isDirectory()
  );

  let migrated = 0;

  for (const sysDir of systemDirs) {
    const dirPath = path.join(assessmentsBase, sysDir);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const assessment = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      let changed = false;

      // 1. Migrate evidence source_id -> source_ids
      if (Array.isArray(assessment.dimensions)) {
        for (const dim of assessment.dimensions) {
          if (Array.isArray(dim.evidence)) {
            for (const ev of dim.evidence) {
              if (ev.source_id && !ev.source_ids) {
                ev.source_ids = [ev.source_id];
                delete ev.source_id;
                changed = true;
              }
            }
          }
        }
      }

      // 2. Add review block if missing
      if (!assessment.review) {
        assessment.review = {
          state: assessment.status === 'scored' ? 'published' : 'draft',
          reviewed_by: null,
          reviewed_at: null,
        };
        changed = true;
      }

      // 3. Compute integrity hash
      const integrity = store.computeIntegrityHash(assessment);
      assessment.integrity = integrity;
      changed = true;

      if (changed) {
        store.writeJsonAtomic(filePath, assessment);
        migrated++;
        console.log(`Migrated: ${path.relative(ROOT, filePath)}`);

        // Update latest/ if this is the latest version for the system
        const latest = store.getLatestAssessment(sysDir);
        if (latest && latest.assessment_id === assessment.assessment_id) {
          const latestPath = path.join(store.latestDir(), `${sysDir}.json`);
          store.writeJsonAtomic(latestPath, assessment);
          console.log(`Updated latest: ${path.relative(ROOT, latestPath)}`);
        }
      }
    }
  }

  console.log(`\nMigration complete. ${migrated} file(s) migrated.`);
}

main();
