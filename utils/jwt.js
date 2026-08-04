const jwt = require('jsonwebtoken');

function signAccessToken(admin) {
  return jwt.sign(
    { sub: admin.id, uuid: admin.uuid, username: admin.username, role: admin.role },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m' },
  );
}

function signRefreshToken(admin) {
  return jwt.sign({ sub: admin.id }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET);
}

module.exports = { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken };
