const fs = require('fs');
const path = require('path');
const { slugify } = require('../utils/slugify');
const prisma = require('../lib/prisma');

class BuildController {
  constructor({ buildService, socketManager, workspacesDir }) {
    this.buildService = buildService;
    this.socketManager = socketManager;
    this.workspacesDir = workspacesDir;
  }

  async startBuild(req, res) {
    const repoUrl = req.body?.repoUrl?.trim();
    const socketId = req.body?.socketId;
    const envEntries = Array.isArray(req.body?.env) ? req.body.env : [];
    const internalPort = req.body?.internalPort;
    // /api/build takes no access token - anyone can call it. userId is just whatever the
    // caller says it is (e.g. an external service building on behalf of one of its own users),
    // and falls back to 'anonymous' when omitted entirely.
    const userId = req.body?.userId ? String(req.body.userId) : 'anonymous';

    if (!repoUrl) {
      return res.status(400).json({ error: 'Please provide a GitHub repository URL' });
    }

    const match = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/)?(?:\.git)?$/i);
    if (!match) {
      return res.status(400).json({ error: 'Only GitHub repository URLs are supported right now' });
    }

    const owner = match[1];
    const repo = match[2];
    const containerName = slugify(`${owner}-${repo}`);
    const targetDir = path.join(this.workspacesDir, containerName);

    // Rebuilding a repo that's already deployed reuses its existing port instead of claiming a new one.
    const existingContainer = await prisma.containerDetail.findUnique({ where: { containerName } });
    const resourceServer = existingContainer
      ? await prisma.resourceServer.findUnique({ where: { resourceServerId: existingContainer.resourceServerId } })
      : await this.#claimAvailableResourceServer();

    if (!resourceServer) {
      return res.status(409).json({ error: 'No available resource server (external port) found. Add one under Resource Servers first.' });
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });

    const emit = this.socketManager.createEmitter(socketId);
    const result = await this.buildService.build({
      repoUrl,
      targetDir,
      emit,
      envEntries,
      externalPort: resourceServer.port,
      internalPort,
      host: resourceServer.domainName,
    });

    await this.#saveContainerDetail({ result, userId, resourceServerId: resourceServer.resourceServerId, internalPort });

    if (!result.ok && !existingContainer) {
      // Freshly claimed but the build failed - release the port so it can be reused.
      await prisma.resourceServer.update({
        where: { resourceServerId: resourceServer.resourceServerId },
        data: { status: 'available' },
      });
    }

    if (result.ok) {
      return res.status(200).json({ status: 'done', url: result.url });
    }

    return res.status(500).json({ status: 'error', error: result.error });
  }

  async #claimAvailableResourceServer() {
    const candidates = await prisma.resourceServer.findMany({
      where: { status: 'available' },
      orderBy: { resourceServerId: 'asc' },
    });

    for (const candidate of candidates) {
      const { count } = await prisma.resourceServer.updateMany({
        where: { resourceServerId: candidate.resourceServerId, status: 'available' },
        data: { status: 'in_use' },
      });
      if (count === 1) {
        return { ...candidate, status: 'in_use' };
      }
    }

    return null;
  }

  async #saveContainerDetail({ result, userId, resourceServerId, internalPort }) {
    if (!result.containerName) return;

    const data = {
      containerId: result.containerId ?? null,
      userId,
      internalPort: result.internalPort ?? Number(internalPort) ?? 3000,
      resourceServerId,
      status: result.ok ? 'running' : 'error',
      deployType: result.deployType || 'dockerfile',
      workspaceDir: result.workspaceDir,
    };

    await prisma.containerDetail.upsert({
      where: { containerName: result.containerName },
      create: { containerName: result.containerName, ...data },
      update: data,
    });
  }
}

module.exports = BuildController;
