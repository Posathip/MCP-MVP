const fs = require('fs');
const path = require('path');
const { slugify } = require('../utils/slugify');

class BuildService {
  constructor(dockerRunner) {
    this.dockerRunner = dockerRunner;
  }

  async build({ repoUrl, targetDir, emit, envEntries = [], externalPort, internalPort, host }) {
    const containerName = slugify(path.basename(targetDir));

    try {
      emit('Preparing workspace...', { stage: 'prepare' });
      emit(`Cloning ${repoUrl}...`, { stage: 'clone' });

      await this.dockerRunner.run('git', ['clone', '--depth', '1', repoUrl, targetDir], emit);

      const dockerfile = this.#findDockerfile(targetDir);
      if (!dockerfile) {
        const message = 'No Dockerfile was found in the repository.';
        emit(message, { stage: 'error', ok: false });
        this.#cleanupWorkspace(targetDir, emit);
        return { ok: false, error: message, containerName };
      }

      const imageName = containerName;
      const { external, internal } = this.#resolvePorts({ externalPort, internalPort }, emit);
      const dockerBuildArgs = ['build', '-t', imageName, '.'];
      this.dockerRunner.announce(emit, 'docker', dockerBuildArgs);
      try {
        await this.dockerRunner.run('docker', dockerBuildArgs, emit, targetDir);
      } catch (buildError) {
        const message = `Docker build failed: ${buildError.message}`;
        emit(`\n❌ ${message}`, { stage: 'error', ok: false });
        this.#cleanupWorkspace(targetDir, emit);
        return { ok: false, error: message, containerName };
      }

      const dockerRunArgs = ['run', '--detach', '-i', '--name', imageName, '-p', `${external}:${internal}`];
      let databaseUri = null;
      for (const entry of envEntries) {
        if (!entry?.key) continue;
        const normalizedValue = this.#normalizeEnvValue(entry.value ?? '');
        dockerRunArgs.push('-e', `${entry.key}=${normalizedValue}`);
        if (entry.key.toUpperCase() === 'DATABASE_URI') {
          databaseUri = normalizedValue;
        }
      }
      dockerRunArgs.push('-e', `PORT=${internal}`);
      dockerRunArgs.push(imageName);

      if (databaseUri) {
        dockerRunArgs.push(databaseUri, '--transport', 'sse');
      }
      this.dockerRunner.announce(emit, 'docker', dockerRunArgs);

      emit(`Starting container from image ${imageName}...`, { stage: 'start', ok: true });
      await this.dockerRunner.run('docker', ['rm', '-f', imageName], emit, targetDir).catch(() => {});
      const runOutput = await this.dockerRunner.run('docker', dockerRunArgs, emit, targetDir);
      const containerId = runOutput.match(/\b[0-9a-f]{12,64}\b/i)?.[0] ?? null;

      emit('Container started in background. Fetching startup logs...', { stage: 'logs' });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await this.dockerRunner.run('docker', ['logs', imageName], emit, targetDir).catch(() => {});

      const url = this.#buildEndpointUrl(host, external);
      emit(`Deployment finished successfully. Connect at ${url}`, { stage: 'done', ok: true, url });
      return { ok: true, url, containerName, containerId, internalPort: internal, workspaceDir: targetDir };
    } catch (error) {
      const message = error.message || 'Build failed.';
      emit(message, { stage: 'error', ok: false });
      this.#cleanupWorkspace(targetDir, emit);
      return { ok: false, error: message, containerName };
    }
  }

  #buildEndpointUrl(host, port) {
    return `http://${host || 'localhost'}:${port}`;
  }

  #normalizeEnvValue(value) {
    if (typeof value !== 'string') {
      return value;
    }

    if (/^https?:\/\//i.test(value)) {
      return value;
    }

    if (/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)(?=[:/]|$)/i.test(value)) {
      return value.replace(/^(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i, 'host.docker.internal');
    }

    return value;
  }

  #resolvePorts({ externalPort, internalPort }, emit) {
    const parsePort = (value) => {
      const num = Number(value);
      return Number.isInteger(num) && num > 0 && num <= 65535 ? num : null;
    };

    const internal = parsePort(internalPort) ?? 3000;
    const external = parsePort(externalPort) ?? internal;

    emit(`Using external port ${external} -> internal port ${internal}.`, { stage: 'port', ok: true });
    return { external, internal };
  }

  #cleanupWorkspace(targetDir, emit) {
    try {
      emit('Removing cloned workspace...', { stage: 'cleanup' });
      fs.rmSync(targetDir, { recursive: true, force: true });
      emit('Workspace removed.', { stage: 'cleanup-done' });
    } catch (cleanupError) {
      emit(cleanupError.message || 'Failed to remove workspace.', { stage: 'cleanup-error' });
    }
  }

  #findDockerfile(rootDir) {
    const candidates = ['Dockerfile', 'dockerfile'];
    for (const candidate of candidates) {
      const fullPath = path.join(rootDir, candidate);
      if (fs.existsSync(fullPath)) {
        return candidate;
      }
    }
    return null;
  }
}

module.exports = BuildService;
