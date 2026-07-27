require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const SocketManager = require('./lib/SocketManager');
const DockerRunner = require('./services/DockerRunner');
const BuildService = require('./services/BuildService');
const HealthController = require('./controllers/HealthController');
const WorkspaceController = require('./controllers/WorkspaceController');
const BuildController = require('./controllers/BuildController');
const createApiRouter = require('./routes/apiRouter');

const workspacesDir = path.join(__dirname, 'workspaces');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});
const socketManager = new SocketManager(io);

const dockerRunner = new DockerRunner();
const buildService = new BuildService(dockerRunner);

const healthController = new HealthController();
const workspaceController = new WorkspaceController(workspacesDir);
const buildController = new BuildController({ buildService, socketManager, workspacesDir });

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.use('/api', createApiRouter({ healthController, workspaceController, buildController }));

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`Deployment service listening on http://localhost:${port}`);
});
