const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');

const VALID_ROLES = ['admin', 'user'];
const SALT_ROUNDS = 10;
const SAFE_FIELDS = { id: true, uuid: true, username: true, role: true, createdAt: true };

class AccountController {
  async list(_req, res) {
    const accounts = await prisma.admin.findMany({ select: SAFE_FIELDS, orderBy: { id: 'asc' } });
    return res.json(accounts);
  }

  async get(req, res) {
    const account = await this.#find(req, res);
    if (!account) return;
    return res.json(account);
  }

  async create(req, res) {
    const { username, password, role } = this.#parseBody(req);
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }

    const existing = await prisma.admin.findUnique({ where: { username } });
    if (existing) {
      return res.status(409).json({ error: 'username is already taken' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const account = await prisma.admin.create({
      data: { username, passwordHash, role: role || 'user' },
      select: SAFE_FIELDS,
    });
    return res.status(201).json(account);
  }

  async update(req, res) {
    const existing = await this.#find(req, res);
    if (!existing) return;

    const { username, password, role } = this.#parseBody(req);
    if (role && !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
    }
    if (password && password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }
    if (role && role !== 'admin' && existing.role === 'admin') {
      const remainingAdmins = await prisma.admin.count({ where: { role: 'admin', id: { not: existing.id } } });
      if (remainingAdmins === 0) {
        return res.status(400).json({ error: 'Cannot demote the last remaining admin account' });
      }
    }

    const account = await prisma.admin.update({
      where: { id: existing.id },
      data: {
        ...(username ? { username } : {}),
        ...(role ? { role } : {}),
        ...(password ? { passwordHash: await bcrypt.hash(password, SALT_ROUNDS) } : {}),
      },
      select: SAFE_FIELDS,
    });
    return res.json(account);
  }

  async remove(req, res) {
    const existing = await this.#find(req, res);
    if (!existing) return;

    if (existing.id === req.admin.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    if (existing.role === 'admin') {
      const remainingAdmins = await prisma.admin.count({ where: { role: 'admin', id: { not: existing.id } } });
      if (remainingAdmins === 0) {
        return res.status(400).json({ error: 'Cannot delete the last remaining admin account' });
      }
    }

    await prisma.admin.delete({ where: { id: existing.id } });
    return res.status(204).send();
  }

  #parseBody(req) {
    const username = req.body?.username?.trim();
    const password = req.body?.password;
    const role = req.body?.role?.trim();
    return { username, password, role };
  }

  async #find(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid account id' });
      return null;
    }

    const account = await prisma.admin.findUnique({ where: { id }, select: SAFE_FIELDS });
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return null;
    }
    return account;
  }
}

module.exports = AccountController;
