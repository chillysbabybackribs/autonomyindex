const fs = require('node:fs');
const path = require('node:path');

function loadJson(relPath) {
  const filePath = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLimit(rawLimit, max) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, max);
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  const briefsDoc = loadJson('data/weekly-briefs.json');
  const sorted = [...briefsDoc.briefs].sort(
    (a, b) => Date.parse(b.published_at_utc) - Date.parse(a.published_at_utc)
  );

  const limit = normalizeLimit(req.query?.limit, sorted.length);

  res.status(200).json({
    version: briefsDoc.version,
    count: Math.min(limit, sorted.length),
    briefs: sorted.slice(0, limit)
  });
};
