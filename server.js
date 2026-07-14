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

app.post('/api/build', (req, res) => {
  const repoUrl = req.body?.repoUrl?.trim();
  const socketId = req.body?.socketId;

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

  handleBuild({ repoUrl, targetDir, socketId });
});

io.on('connection', (socket) => {
  socket.on('disconnect', () => {
    // no-op
  });
});

async function handleBuild({ repoUrl, targetDir, socketId }) {
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
      emit('No Docker Compose file was found in the repository.', { stage: 'error', ok: false });
      return;
    }

    emit(`Using ${composeFile} to build the project.`, { stage: 'build' });
    await runCommand('docker', ['compose', 'build'], emit, targetDir);

    emit('Build completed. Starting containers...', { stage: 'start', ok: true });
    await runCommand('docker', ['compose', 'up', '-d'], emit, targetDir);

    emit('Deployment finished successfully.', { stage: 'done', ok: true });
  } catch (error) {
    emit(error.message || 'Build failed.', { stage: 'error', ok: false });
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
