'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI API utilities — CORS, input validation, auth
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('node:crypto');

const VALID_SYSTEM_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/**
 * Set CORS headers and handle preflight.
 * Returns true if the request was a preflight (caller should return early).
 */
function handleCors(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-internal-token');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Validate and sanitize a system ID from route params.
 * Returns null and sends 400 if invalid.
 */
function validateSystemId(res, raw) {
  if (!raw || typeof raw !== 'string') {
    res.status(400).json({ error: 'missing_system_id' });
    return null;
  }
  if (!VALID_SYSTEM_ID.test(raw)) {
    res.status(400).json({ error: 'invalid_system_id', message: 'Must be lowercase alphanumeric with hyphens/underscores' });
    return null;
  }
  return raw;
}

/**
 * Timing-safe token comparison for POST auth.
 * Returns true if authorized, false (and sends 401) if not.
 */
function requireAuth(req, res) {
  const token = req.headers['x-internal-token'];
  const expected = process.env.INTERNAL_API_TOKEN;

  if (!expected) {
    // In development, allow if no token is configured
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({ error: 'server_misconfiguration', message: 'Internal API token not configured' });
      return false;
    }
    return true;
  }

  if (!token || typeof token !== 'string') {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  // Timing-safe comparison
  try {
    const bufA = Buffer.from(token, 'utf8');
    const bufB = Buffer.from(expected, 'utf8');
    if (bufA.length !== bufB.length || !crypto.timingSafeEqual(bufA, bufB)) {
      res.status(401).json({ error: 'unauthorized' });
      return false;
    }
  } catch {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }

  return true;
}

/**
 * Validate a query parameter against an allowed set.
 * Returns the value if valid, null if not provided, or sends 400 and returns undefined if invalid.
 */
function validateQueryEnum(res, value, paramName, allowed) {
  if (!value) return null;
  if (!allowed.includes(value)) {
    res.status(400).json({
      error: 'invalid_parameter',
      parameter: paramName,
      valid_values: allowed,
    });
    return undefined; // signals "error sent"
  }
  return value;
}

/**
 * Validate a numeric query parameter within bounds.
 * Returns the number if valid, null if not provided, or sends 400 and returns undefined.
 */
function validateQueryInt(res, value, paramName, min, max) {
  if (!value) return null;
  const num = Number.parseInt(value, 10);
  if (!Number.isFinite(num) || num < min || num > max) {
    res.status(400).json({
      error: 'invalid_parameter',
      parameter: paramName,
      message: `Must be integer ${min}-${max}`,
    });
    return undefined;
  }
  return num;
}

/**
 * Non-blocking auth check — returns true if valid token present, false otherwise.
 * Does NOT send a response (unlike requireAuth).
 */
function isAuthenticated(req) {
  const token = req.headers['x-internal-token'];
  const expected = process.env.INTERNAL_API_TOKEN;

  if (!expected) {
    // In development, treat as authenticated if no token configured
    return process.env.NODE_ENV !== 'production';
  }

  if (!token || typeof token !== 'string') return false;

  try {
    const bufA = Buffer.from(token, 'utf8');
    const bufB = Buffer.from(expected, 'utf8');
    return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

/**
 * Sanitize a string: strip control characters (except newline/tab), trim.
 * Returns the sanitized string, or null if input is not a string.
 */
function sanitizeString(value) {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
}

/**
 * Recursively sanitize all string values in an object/array.
 */
function sanitizeDeep(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return sanitizeString(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeDeep);
  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      out[sanitizeString(k) || k] = sanitizeDeep(v);
    }
    return out;
  }
  return obj;
}

module.exports = {
  handleCors,
  validateSystemId,
  requireAuth,
  isAuthenticated,
  validateQueryEnum,
  validateQueryInt,
  sanitizeString,
  sanitizeDeep,
  VALID_SYSTEM_ID,
};
