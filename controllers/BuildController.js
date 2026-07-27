const fs = require('fs');
const path = require('path');
const { slugify } = require('../utils/slugify');

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
    const externalPort = req.body?.externalPort;
    const internalPort = req.body?.internalPort;

    if (!repoUrl) {
      return res.status(400).json({ error: 'Please provide a GitHub repository URL' });
    }

    const match = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/)?(?:\.git)?$/i);
    if (!match) {
      return res.status(400).json({ error: 'Only GitHub repository URLs are supported right now' });
    }

    const owner = match[1];
    const repo = match[2];
    const targetDir = path.join(this.workspacesDir, slugify(`${owner}-${repo}`));

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.mkdirSync(path.dirname(targetDir), { recursive: true });

    const emit = this.socketManager.createEmitter(socketId);
    const host = req.hostname;
    const result = await this.buildService.build({ repoUrl, targetDir, emit, envEntries, externalPort, internalPort, host });

    if (result.ok) {
      return res.status(200).json({ status: 'done', url: result.url });
    }

    return res.status(500).json({ status: 'error', error: result.error });
  }
}

module.exports = BuildController;
