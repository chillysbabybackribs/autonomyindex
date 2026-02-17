'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI v1.0 Storage Layer — JSON files under data/ami/
// Pure JS (zero dependencies). Atomic writes via rename.
// ─────────────────────────────────────────────────────────────────────────────

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// ── Paths ────────────────────────────────────────────────────────────────────

function resolveRoot() {
  // Works from both repo root and from api/ functions (Vercel)
  return process.cwd();
}

function amiDir() {
  return path.join(resolveRoot(), 'data', 'ami');
}

function assessmentsDir(systemId) {
  if (systemId) return path.join(amiDir(), 'assessments', systemId);
  return path.join(amiDir(), 'assessments');
}

function latestDir() {
  return path.join(amiDir(), 'latest');
}

function templatesDir() {
  return path.join(amiDir(), 'templates');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonAtomic(filePath, data) {
  ensureDir(path.dirname(filePath));
  const tmp = `${filePath}.tmp.${Date.now()}.${process.pid}.${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try { fs.unlinkSync(tmp); } catch { /* ignore cleanup failure */ }
    throw err;
  }
}

// ── Integrity hashing ────────────────────────────────────────────────────────

/**
 * Recursively sort all object keys for deterministic JSON.
 */
function canonicalize(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(canonicalize);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalize(obj[key]);
  }
  return sorted;
}

/**
 * Compute SHA-256 integrity hash of an assessment.
 * Excludes the `integrity` block itself from the hash input.
 * Returns { assessment_hash, hash_algorithm, hashed_at }.
 */
function computeIntegrityHash(assessment) {
  const clone = JSON.parse(JSON.stringify(assessment));
  delete clone.integrity;
  const canonical = JSON.stringify(canonicalize(clone));
  const hash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  return {
    assessment_hash: hash,
    hash_algorithm: 'sha256',
    hashed_at: new Date().toISOString(),
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * List all system IDs that have assessments.
 */
function listSystemIds() {
  const dir = assessmentsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((entry) => {
    return fs.statSync(path.join(dir, entry)).isDirectory();
  });
}

/**
 * List all assessments for a given system. Returns parsed assessment objects
 * sorted by version descending (newest first).
 */
function listAssessments(systemId) {
  const dir = assessmentsDir(systemId);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  const assessments = files.map((f) => readJsonFile(path.join(dir, f)));

  return assessments.sort((a, b) => (b.version || 0) - (a.version || 0));
}

/**
 * Get a specific assessment by its assessment_id.
 * Scans all system directories (or uses index if available).
 */
function getAssessmentById(assessmentId) {
  const systemIds = listSystemIds();
  for (const sysId of systemIds) {
    const dir = assessmentsDir(sysId);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const filePath = path.join(dir, f);
      const data = readJsonFile(filePath);
      if (data.assessment_id === assessmentId) return data;
    }
  }
  return null;
}

/**
 * Get the latest (highest version) assessment for a system.
 * Prefers the latest/ materialized file; falls back to scanning.
 */
function getLatestAssessment(systemId) {
  // Try materialized latest
  const latestFile = path.join(latestDir(), `${systemId}.json`);
  if (fs.existsSync(latestFile)) {
    return readJsonFile(latestFile);
  }

  // Fall back to scanning
  const all = listAssessments(systemId);
  return all.length > 0 ? all[0] : null;
}

/**
 * Store an assessment. Writes to data/ami/assessments/<systemId>/<assessmentId>.json
 * and updates data/ami/latest/<systemId>.json.
 */
function upsertAssessment(assessment) {
  const { system_id, assessment_id } = assessment;
  if (!system_id || !assessment_id) {
    throw new Error('assessment must have system_id and assessment_id');
  }

  // Write assessment file
  const assessmentFile = path.join(assessmentsDir(system_id), `${assessment_id}.json`);
  writeJsonAtomic(assessmentFile, assessment);

  // Update latest if this is the newest version
  const current = getLatestAssessment(system_id);
  if (!current || assessment.version >= current.version) {
    const latestFile = path.join(latestDir(), `${system_id}.json`);
    writeJsonAtomic(latestFile, assessment);
  }

  return assessmentFile;
}

/**
 * Build an index mapping assessmentId -> { systemId, filePath, version }.
 * Useful for fast lookups.
 */
function buildAssessmentIndex() {
  const index = {};
  const systemIds = listSystemIds();

  for (const sysId of systemIds) {
    const dir = assessmentsDir(sysId);
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      const filePath = path.join(dir, f);
      const data = readJsonFile(filePath);
      index[data.assessment_id] = {
        system_id: sysId,
        file_path: filePath,
        version: data.version,
        assessed_at: data.assessed_at,
        status: data.status,
      };
    }
  }

  return index;
}

/**
 * Load all latest assessments across all systems.
 * Returns array of assessment objects.
 */
function loadAllLatest() {
  const systemIds = listSystemIds();
  const results = [];
  for (const sysId of systemIds) {
    const latest = getLatestAssessment(sysId);
    if (latest) results.push(latest);
  }
  return results;
}

/**
 * Load all assessment files across all systems.
 */
function loadAllAssessments() {
  const systemIds = listSystemIds();
  const results = [];
  for (const sysId of systemIds) {
    results.push(...listAssessments(sysId));
  }
  return results;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  // Path helpers (for tests/scripts)
  amiDir,
  assessmentsDir,
  latestDir,
  templatesDir,
  ensureDir,

  // Core API
  listSystemIds,
  listAssessments,
  getAssessmentById,
  getLatestAssessment,
  upsertAssessment,
  buildAssessmentIndex,
  loadAllLatest,
  loadAllAssessments,
  writeJsonAtomic,
  readJsonFile,
  canonicalize,
  computeIntegrityHash,
};
