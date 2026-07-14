require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', message: 'Deployment service is running' });
});

app.post('/api/workspaces/clear', (_req, res) => {
  const workspacesDir = path.join(__dirname, 'workspaces');
  try {
    if (!fs.existsSync(workspacesDir)) {
      fs.mkdirSync(workspacesDir, { recursive: true });
    }

    const entries = fs.readdirSync(workspacesDir);
    for (const entry of entries) {
      fs.rmSync(path.join(workspacesDir, entry), { recursive: true, force: true });
    }

    res.json({ status: 'ok', message: 'Workspaces cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to clear workspaces' });
  }
});

app.post('/api/build', (req, res) => {
  const repoUrl = req.body?.repoUrl?.trim();
  const socketId = req.body?.socketId;
  const envEntries = Array.isArray(req.body?.env) ? req.body.env : [];

  if (!repoUrl) {
    return res.status(400).json({ error: 'Please provide a GitHub repository URL' });
  }

  const match = repoUrl.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/)?(?:\.git)?$/i);
  if (!match) {
    return res.status(400).json({ error: 'Only GitHub repository URLs are supported right now' });
  }

  const owner = match[1];
  const repo = match[2];
  const targetDir = path.join(__dirname, 'workspaces', slugify(`${owner}-${repo}`));

  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(targetDir), { recursive: true });

  res.status(202).json({ status: 'accepted', workspace: targetDir });

  handleBuild({ repoUrl, targetDir, socketId, envEntries });
});

io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    // no-op
  });
});

async function handleBuild({ repoUrl, targetDir, socketId, envEntries = [] }) {
  const emit = (message, extra = {}) => {
    const payload = { message, ...extra };
    if (socketId) {
      io.to(socketId).emit('build-log', payload);
    } else {
      io.emit('build-log', payload);
    }
  };

  try {
    emit('Preparing workspace...', { stage: 'prepare' });
    emit(`Cloning ${repoUrl}...`, { stage: 'clone' });

    await runCommand('git', ['clone', '--depth', '1', repoUrl, targetDir], emit);

    const composeFile = findComposeFile(targetDir);
    if (!composeFile) {
      const dockerfile = findDockerfile(targetDir);
      if (!dockerfile) {
        emit('No Docker Compose file or Dockerfile was found in the repository.', { stage: 'error', ok: false });
        cleanupWorkspace(targetDir, emit);
        return;
      }

      emit(`No Docker Compose file found. Building from ${dockerfile} instead.`, { stage: 'build' });
      const imageName = slugify(path.basename(targetDir));
      const requestedPort = resolvePortFromEnvEntries(envEntries, emit);
      const dockerBuildArgs = ['build', '-t', imageName, '.'];
      emitDockerCommand(emit, 'docker', dockerBuildArgs);
      try {
        await runCommand('docker', dockerBuildArgs, emit, targetDir);
      } catch (buildError) {
        emit(`\n❌ Docker build failed: ${buildError.message}`, { stage: 'error', ok: false });
        cleanupWorkspace(targetDir, emit);
        return;
      }

      const dockerRunArgs = ['run', '--detach', '-i', '--name', imageName, '-p', `${requestedPort}:${requestedPort}`];
      let databaseUri = null;
      for (const entry of envEntries) {
        if (!entry?.key) continue;
        const normalizedValue = normalizeEnvValue(entry.value ?? '');
        dockerRunArgs.push('-e', `${entry.key}=${normalizedValue}`);
        if (entry.key.toUpperCase() === 'DATABASE_URI') {
          databaseUri = normalizedValue;
        }
      }
      dockerRunArgs.push('-e', `PORT=${requestedPort}`);
      dockerRunArgs.push(imageName);
      
      if (databaseUri) {
        dockerRunArgs.push(databaseUri);
      }
      emitDockerCommand(emit, 'docker', dockerRunArgs);

      emit(`Starting container from image ${imageName}...`, { stage: 'start', ok: true });
      await runCommand('docker', ['rm', '-f', imageName], emit, targetDir).catch(() => {});
      await runCommand('docker', dockerRunArgs, emit, targetDir);

      emit('Container started in background. Fetching startup logs...', { stage: 'logs' });
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await runCommand('docker', ['logs', imageName], emit, targetDir).catch(() => {});

      emit('Deployment finished successfully.', { stage: 'done', ok: true });
      return;
    }

    emit(`Using ${composeFile} to build the project.`, { stage: 'build' });
    const requestedPort = resolvePortFromEnvEntries(envEntries, emit);
    emitDockerCommand(emit, 'docker', ['compose', 'build']);
    try {
      await runCommand('docker', ['compose', 'build'], emit, targetDir);
    } catch (buildError) {
      emit(`\n❌ Docker compose build failed: ${buildError.message}`, { stage: 'error', ok: false });
      cleanupWorkspace(targetDir, emit);
      return;
    }

    const composeEnvArgs = [];
    for (const entry of envEntries) {
      if (!entry?.key) continue;
      const normalizedValue = normalizeEnvValue(entry.value ?? '');
      composeEnvArgs.push('-e', `${entry.key}=${normalizedValue}`);
    }

    composeEnvArgs.push('-e', `PORT=${requestedPort}`);

    emit('Build completed. Starting containers...', { stage: 'start', ok: true });
    const composeUpArgs = composeEnvArgs.length > 0 ? ['compose', 'up', '-d', ...composeEnvArgs] : ['compose', 'up', '-d'];
    emitDockerCommand(emit, 'docker', composeUpArgs);
    await runCommand('docker', composeUpArgs, emit, targetDir);

    emit('Deployment finished successfully.', { stage: 'done', ok: true });
  } catch (error) {
    emit(error.message || 'Build failed.', { stage: 'error', ok: false });
    cleanupWorkspace(targetDir, emit);
  }
}


function normalizeEnvValue(value) {
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

function emitDockerCommand(emit, command, args = []) {
  const rendered = [command, ...args]
    .map((arg) => {
      if (/\s|"/.test(arg)) {
        return `"${String(arg).replace(/"/g, '\\"')}"`;
      }
      return String(arg);
    })
    .join(' ');

  emit(`Docker command: ${rendered}`, { stage: 'docker-command', command: rendered });
}

function resolvePortFromEnvEntries(envEntries = [], emit) {
  const portEntry = Array.isArray(envEntries)
    ? envEntries.find((entry) => entry?.key?.toUpperCase() === 'PORT')
    : null;

  const rawPort = portEntry?.value?.toString().trim();
  const parsedPort = Number(rawPort);
  if (rawPort && Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
    emit(`Using user-provided PORT=${parsedPort}.`, { stage: 'port', ok: true });
    return String(parsedPort);
  }

  emit('No valid PORT was provided. Falling back to 3000.', { stage: 'port', ok: true });
  return '3000';
}

function cleanupWorkspace(targetDir, emit) {
  try {
    emit('Removing cloned workspace...', { stage: 'cleanup' });
    fs.rmSync(targetDir, { recursive: true, force: true });
    emit('Workspace removed.', { stage: 'cleanup-done' });
  } catch (cleanupError) {
    emit(cleanupError.message || 'Failed to remove workspace.', { stage: 'cleanup-error' });
  }
}

function runCommand(command, args, emit, cwd = undefined) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false });
    let output = '';

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      emit(text, { stage: 'stream' });
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      emit(text, { stage: 'stream' });
    });

    child.on('error', (error) => {
      reject(new Error(`Unable to run ${command}: ${error.message}`));
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${command} ${args.join(' ')}`));
      }
    });
  });
}

function findComposeFile(rootDir) {
  const candidates = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yaml', 'compose.yml'];
  for (const candidate of candidates) {
    const fullPath = path.join(rootDir, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate;
    }
  }
  return null;
}

function findDockerfile(rootDir) {
  const candidates = ['Dockerfile', 'dockerfile'];
  for (const candidate of candidates) {
    const fullPath = path.join(rootDir, candidate);
    if (fs.existsSync(fullPath)) {
      return candidate;
    }
  }
  return null;
}

function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`Deployment service listening on http://localhost:${port}`);
});
