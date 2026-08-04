const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { signAccessToken, signRefreshToken, verifyRefreshToken } = require('../utils/jwt');

const SALT_ROUNDS = 10;

class AuthController {
  async register(req, res) {
    const username = req.body?.username?.trim();
    const password = req.body?.password;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    // role is always 'user' here - admin accounts are provisioned directly, not self-registered.
    const admin = await prisma.admin.create({ data: { username, passwordHash, role: 'user' } });

    const tokens = await this.#issueTokens(admin);
    return res.status(201).json({ admin: { id: admin.id, uuid: admin.uuid, username: admin.username, role: admin.role }, ...tokens });
  }

  async login(req, res) {
    const username = req.body?.username?.trim();
    const password = req.body?.password;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const tokens = await this.#issueTokens(admin);
    return res.status(200).json({ admin: { id: admin.id, uuid: admin.uuid, username: admin.username, role: admin.role }, ...tokens });
  }

  async refresh(req, res) {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: 'refreshToken is required' });
    }

    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const admin = await prisma.admin.findUnique({ where: { id: payload.sub } });
    if (!admin?.refreshTokenHash || !(await bcrypt.compare(refreshToken, admin.refreshTokenHash))) {
      return res.status(401).json({ error: 'Refresh token is no longer valid' });
    }

    const tokens = await this.#issueTokens(admin);
    return res.status(200).json(tokens);
  }

  async logout(req, res) {
    await prisma.admin.update({ where: { id: req.admin.id }, data: { refreshTokenHash: null } });
    return res.status(200).json({ status: 'ok' });
  }

  async #issueTokens(admin) {
    const accessToken = signAccessToken(admin);
    const refreshToken = signRefreshToken(admin);
    const refreshTokenHash = await bcrypt.hash(refreshToken, SALT_ROUNDS);

    await prisma.admin.update({ where: { id: admin.id }, data: { refreshTokenHash } });

    return { accessToken, refreshToken };
  }
}

module.exports = AuthController;
