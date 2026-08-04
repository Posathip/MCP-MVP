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

  async stop(req, res) {
    const containerName = req.params.id;
    const container = await this.#find(containerName, res);
    if (!container) return;

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
    const containerName = req.params.id;
    const container = await this.#find(containerName, res);
    if (!container) return;

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
    const containerName = req.params.id;
    const container = await this.#find(containerName, res);
    if (!container) return;

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
    const containerName = req.params.id;
    const container = await this.#find(containerName, res);
    if (!container) return;

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

    return res.status(204).send();
  }

  async #find(containerName, res) {
    const container = await prisma.containerDetail.findUnique({ where: { containerName } });
    if (!container) {
      res.status(404).json({ error: 'Container not found' });
      return null;
    }
    return container;
  }
}

module.exports = ContainerController;
