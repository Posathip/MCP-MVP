const crypto = require('crypto');

function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  // timingSafeEqual throws on length mismatch, so bail out first (this leaks length,
  // but not the key's content, which is the part that actually matters here).
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// Gate for every route that isn't part of the login flow itself (/api/auth/*).
// Distinct from JWT auth: this checks "is the caller a trusted client at all" via a single
// shared secret, not "which account is this". Admin-only routes still layer JWT + requireAdmin
// on top of this for that per-account identity/role check.
function apiKeyAuth(req, res, next) {
  const provided = req.headers['x-api-key'];
  const expected = process.env.API_KEY;

  if (!expected) {
    return res.status(500).json({ error: 'Server is missing API_KEY configuration' });
  }
  if (!provided || !safeCompare(provided, expected)) {
    return res.status(401).json({ error: 'Missing or invalid API key' });
  }
  next();
}

module.exports = apiKeyAuth;
