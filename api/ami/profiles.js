'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ami/profiles — List available compliance profiles
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const { loadProfiles } = require(path.join(process.cwd(), 'lib', 'ami', 'profiles.js'));

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['GET'] });
    return;
  }

  try {
    const profiles = loadProfiles();

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({
      meta: {
        total: profiles.length,
      },
      profiles: profiles.map((p) => ({
        id: p.id,
        label: p.label,
        description: p.description,
        amiVersion: p.amiVersion,
        default: p.default || false,
        rules: p.rules,
      })),
    });
  } catch (error) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      error: 'profiles_unavailable',
      message: error?.message || 'Failed to load profiles',
    });
  }
};
