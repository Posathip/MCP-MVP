const { verifyAccessToken } = require('../utils/jwt');

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const payload = verifyAccessToken(token);
    req.admin = { id: payload.sub, uuid: payload.uuid, username: payload.username, role: payload.role };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired access token' });
  }
}

function requireAdmin(req, res, next) {
  if (req.admin?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }
  next();
}

module.exports = authenticate;
module.exports.requireAdmin = requireAdmin;
