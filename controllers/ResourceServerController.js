const prisma = require('../lib/prisma');

const VALID_STATUSES = ['available', 'in_use'];

class ResourceServerController {
  async list(_req, res) {
    const resourceServers = await prisma.resourceServer.findMany({ orderBy: { resourceServerId: 'asc' } });
    return res.json(resourceServers);
  }

  async get(req, res) {
    const resourceServer = await this.#find(req, res);
    if (!resourceServer) return;
    return res.json(resourceServer);
  }

  async create(req, res) {
    const { domainName, port, status } = this.#parseBody(req);
    if (!domainName || !port) {
      return res.status(400).json({ error: 'domainName and port are required' });
    }
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const resourceServer = await prisma.resourceServer.create({
      data: { domainName, port, ...(status ? { status } : {}) },
    });
    return res.status(201).json(resourceServer);
  }

  async update(req, res) {
    const existing = await this.#find(req, res);
    if (!existing) return;

    const { domainName, port, status } = this.#parseBody(req);
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const resourceServer = await prisma.resourceServer.update({
      where: { resourceServerId: existing.resourceServerId },
      data: {
        ...(domainName ? { domainName } : {}),
        ...(port ? { port } : {}),
        ...(status ? { status } : {}),
      },
    });
    return res.json(resourceServer);
  }

  async remove(req, res) {
    const existing = await this.#find(req, res);
    if (!existing) return;

    await prisma.resourceServer.delete({ where: { resourceServerId: existing.resourceServerId } });
    return res.status(204).send();
  }

  #parseBody(req) {
    const domainName = req.body?.domainName?.trim();
    const port = req.body?.port ? Number(req.body.port) : undefined;
    const status = req.body?.status?.trim();
    return { domainName, port, status };
  }

  async #find(req, res) {
    const resourceServerId = Number(req.params.id);
    if (!Number.isInteger(resourceServerId)) {
      res.status(400).json({ error: 'Invalid resource server id' });
      return null;
    }

    const resourceServer = await prisma.resourceServer.findUnique({ where: { resourceServerId } });
    if (!resourceServer) {
      res.status(404).json({ error: 'Resource server not found' });
      return null;
    }
    return resourceServer;
  }
}

module.exports = ResourceServerController;
