const fs = require('node:fs');
const path = require('node:path');

function loadJson(relPath) {
  const filePath = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeLimit(rawLimit, max) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 7;
  return Math.min(parsed, max);
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  const signalsDoc = loadJson('data/daily-signals.json');
  const sorted = [...signalsDoc.signals].sort(
    (a, b) => Date.parse(b.timestamp_utc) - Date.parse(a.timestamp_utc)
  );

  const limit = normalizeLimit(req.query?.limit, sorted.length);

  res.status(200).json({
    version: signalsDoc.version,
    count: Math.min(limit, sorted.length),
    signals: sorted.slice(0, limit)
  });
};
