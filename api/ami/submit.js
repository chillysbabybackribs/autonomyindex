'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ami/submit — Submit an assessment request, correction, or challenge
// ─────────────────────────────────────────────────────────────────────────────

const path = require('node:path');
const { handleCors } = require(path.join(process.cwd(), 'lib', 'ami', 'api-util.js'));
const submissions = require(path.join(process.cwd(), 'lib', 'ami', 'submissions.js'));

function parseBody(req) {
  return new Promise((resolve, reject) => {
    if (req.body) { resolve(req.body); return; }
    const chunks = [];
    let size = 0;
    const MAX_BODY = 256 * 1024;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('payload_too_large')); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new Error('invalid_json')); }
    });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed', allowed: ['POST'] });
    return;
  }

  try {
    const body = await parseBody(req);

    // Validate submission
    const validation = submissions.validateSubmission(body);
    if (!validation.valid) {
      res.status(422).json({
        error: 'validation_failed',
        errors: validation.errors,
      });
      return;
    }

    // Create submission (auto-sets status=received)
    const submission = submissions.createSubmission(body);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json({
      submission_id: submission.submission_id,
      type: submission.type,
      system_id: submission.system_id,
      status: submission.status,
      submitted_at: submission.submitted_at,
    });
  } catch (error) {
    const status = error.message === 'invalid_json' ? 400 :
                   error.message === 'payload_too_large' ? 413 : 500;
    res.status(status).json({
      error: error.message === 'invalid_json' ? 'invalid_json' :
             error.message === 'payload_too_large' ? 'payload_too_large' :
             'submission_failed',
      message: status === 500 ? (error?.message || 'Failed to create submission') : undefined,
    });
  }
};
