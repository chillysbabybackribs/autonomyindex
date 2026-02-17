'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// AMI Notification Module — Email (Resend) + Telegram
//
// Fire-and-forget: failures never block the caller.
// Zero npm dependencies — uses built-in https module.
//
// Env vars:
//   RESEND_API_KEY   — Resend API key for email delivery
//   ADMIN_EMAIL      — Recipient for admin notifications
//   TELEGRAM_BOT_TOKEN  — Telegram Bot API token (optional)
//   TELEGRAM_CHAT_ID    — Telegram chat/group ID (optional)
// ─────────────────────────────────────────────────────────────────────────────

const https = require('node:https');

/**
 * POST JSON to an HTTPS endpoint. Returns a Promise that always resolves
 * (never rejects) so callers can safely fire-and-forget.
 */
function httpsPostJson(hostname, path, body, headers) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const opts = {
      hostname,
      path,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        ...headers,
      },
    };

    const req = https.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() });
      });
    });

    req.on('error', (err) => {
      resolve({ status: 0, error: err.message });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ status: 0, error: 'timeout' });
    });

    req.write(data);
    req.end();
  });
}

/**
 * Send admin notification email via Resend.
 * Returns silently on any failure.
 */
async function sendAdminEmail(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!apiKey || !adminEmail) return;

  const subject = `New AMI Submission: ${submission.submission_id}`;
  const html = [
    `<h2>New AMI Submission</h2>`,
    `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">ID</td><td>${submission.submission_id}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Type</td><td>${submission.type}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">System</td><td>${submission.system_id}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Status</td><td>${submission.status}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Submitted</td><td>${submission.submitted_at}</td></tr>`,
    submission.contact?.email
      ? `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Submitter</td><td>${submission.contact.email}</td></tr>`
      : '',
    `</table>`,
  ].join('\n');

  try {
    await httpsPostJson('api.resend.com', '/emails', {
      from: 'AMI <noreply@autonomyindex.io>',
      to: [adminEmail],
      subject,
      html,
    }, {
      Authorization: `Bearer ${apiKey}`,
    });
  } catch { /* swallow */ }
}

/**
 * Send confirmation email to the submitter.
 * Returns silently on any failure.
 */
async function sendSubmitterConfirmation(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const submitterEmail = submission.contact?.email;
  if (!apiKey || !submitterEmail) return;

  const subject = `AMI Submission Received: ${submission.submission_id}`;
  const html = [
    `<h2>Your AMI Submission Was Received</h2>`,
    `<p>Thank you for your submission to the Agent Maturity Index.</p>`,
    `<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Submission ID</td><td>${submission.submission_id}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Type</td><td>${submission.type}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">System</td><td>${submission.system_id}</td></tr>`,
    `<tr><td style="padding:4px 12px 4px 0;font-weight:bold">Status</td><td>received</td></tr>`,
    `</table>`,
    `<p style="margin-top:16px;color:#666;font-size:13px">An editor will review your submission. You will be notified of any status changes.</p>`,
  ].join('\n');

  try {
    await httpsPostJson('api.resend.com', '/emails', {
      from: 'AMI <noreply@autonomyindex.io>',
      to: [submitterEmail],
      subject,
      html,
    }, {
      Authorization: `Bearer ${apiKey}`,
    });
  } catch { /* swallow */ }
}

/**
 * Send Telegram notification.
 * Only fires if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
 * Returns silently on any failure.
 */
async function sendTelegramNotification(submission) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const chatId = (process.env.TELEGRAM_CHAT_ID || '').trim();
  if (!botToken || !chatId) return;

  const text = [
    `New AMI Submission`,
    `ID: ${submission.submission_id}`,
    `System: ${submission.system_id}`,
    `Type: ${submission.type}`,
    `Status: ${submission.status}`,
  ].join('\n');

  try {
    await httpsPostJson('api.telegram.org', `/bot${botToken}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });
  } catch { /* swallow */ }
}

/**
 * Main entry point: notify all channels about a new submission.
 * Fire-and-forget — never throws, never blocks caller.
 */
function notifyNewSubmission(submission) {
  // Fire all notifications in parallel, swallow all errors
  Promise.allSettled([
    sendAdminEmail(submission),
    sendSubmitterConfirmation(submission),
    sendTelegramNotification(submission),
  ]).catch(() => { /* swallow */ });
}

module.exports = {
  notifyNewSubmission,
  sendAdminEmail,
  sendSubmitterConfirmation,
  sendTelegramNotification,
  // Exposed for testing
  httpsPostJson,
};
