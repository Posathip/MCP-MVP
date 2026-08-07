const fs = require('fs');
const prisma = require('../lib/prisma');

class ContainerController {
  constructor({ dockerRunner }) {
    this.dockerRunner = dockerRunner;
  }

  async list(_req, res) {
    const containers = await prisma.containerDetail.findMany({
      include: { resourceServer: true },
      orderBy: { createdAt: 'desc' },
    });
    return res.json(containers);
  }

  async get(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;

    const withResourceServer = await prisma.containerDetail.findUnique({
      where: { containerName: container.containerName },
      include: { resourceServer: true },
    });
    return res.json(withResourceServer);
  }

  async logs(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;
    const { containerName } = container;

    const tailParam = Number(req.query.tail);
    // Bounded so a client can't ask for e.g. tail=999999999 and stall the request/response.
    const tail = Number.isInteger(tailParam) && tailParam > 0 ? Math.min(tailParam, 5000) : 200;

    let logs;
    try {
      logs = await this.dockerRunner.run('docker', ['logs', '--tail', String(tail), '--timestamps', containerName]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.json({ containerName, tail, logs });
  }

  async stop(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;
    const { containerName } = container;

    try {
      await this.dockerRunner.run('docker', ['stop', containerName]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    const updated = await prisma.containerDetail.update({
      where: { containerName },
      data: { status: 'stopped' },
      include: { resourceServer: true },
    });
    return res.json(updated);
  }

  async start(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;
    const { containerName } = container;

    try {
      await this.dockerRunner.run('docker', ['start', containerName]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    const updated = await prisma.containerDetail.update({
      where: { containerName },
      data: { status: 'running' },
      include: { resourceServer: true },
    });
    return res.json(updated);
  }

  async restart(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;
    const { containerName } = container;

    try {
      await this.dockerRunner.run('docker', ['restart', containerName]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }

    const updated = await prisma.containerDetail.update({
      where: { containerName },
      data: { status: 'running' },
      include: { resourceServer: true },
    });
    return res.json(updated);
  }

  async remove(req, res) {
    const container = await this.#find(req.params.id, res);
    if (!container) return;
    const { containerName } = container;

    try {
      await this.dockerRunner.run('docker', ['rm', '-f', containerName]);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
    // Best-effort: free the disk space too. Not fatal if the image is already gone or still tagged elsewhere.
    await this.dockerRunner.run('docker', ['rmi', '-f', containerName]).catch(() => {});

    await prisma.containerDetail.delete({ where: { containerName } });
    await prisma.resourceServer.update({
      where: { resourceServerId: container.resourceServerId },
      data: { status: 'available' },
    });

    if (container.workspaceDir) {
      fs.rmSync(container.workspaceDir, { recursive: true, force: true });
    }

    // 204 can't carry a body, so 200 + a message instead (matches OkResponse elsewhere in the app).
    return res.status(200).json({ status: 'ok', message: `Container "${containerName}" deleted successfully`, containerName });
  }

  // Accepts either containerName (the slugified owner-repo business key) or containerId
  // (the real Docker-assigned id) - whichever the caller happens to have on hand.
  async #find(idOrName, res) {
    let container = await prisma.containerDetail.findUnique({ where: { containerName: idOrName } });
    if (!container && idOrName) {
      container = await prisma.containerDetail.findFirst({ where: { containerId: idOrName } });
    }
    if (!container) {
      res.status(404).json({ error: 'Container not found' });
      return null;
    }
    return container;
  }
}

module.exports = ContainerController;
