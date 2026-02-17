const fs = require('node:fs');
const path = require('node:path');

function loadJson(relPath) {
  const filePath = path.join(process.cwd(), relPath);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function loadJsonWithFallback(req, relPath) {
  try {
    return loadJson(relPath);
  } catch (fileError) {
    const origin = new URL(req.url, `https://${req.headers.host || 'www.autonomyindex.io'}`).origin;
    const response = await fetch(`${origin}/${relPath}`);
    if (!response.ok) {
      throw new Error(`fallback_fetch_failed:${response.status}`);
    }
    return response.json();
  }
}

function normalizeLimit(rawLimit, max) {
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1;
  return Math.min(parsed, max);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const briefsDoc = await loadJsonWithFallback(req, 'data/weekly-briefs.json');
    const briefs = Array.isArray(briefsDoc?.briefs) ? briefsDoc.briefs : [];
    const sorted = [...briefs].sort(
      (a, b) => Date.parse(b.published_at_utc) - Date.parse(a.published_at_utc)
    );
    const limit = normalizeLimit(req.query?.limit, sorted.length || 1);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      version: briefsDoc?.version || null,
      count: Math.min(limit, sorted.length),
      briefs: sorted.slice(0, limit)
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'weekly_briefs_unavailable',
      message: 'Failed to load weekly briefs data',
      briefs: []
    });
  }
};
