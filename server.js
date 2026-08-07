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
const AuthController = require('./controllers/AuthController');
const ResourceServerController = require('./controllers/ResourceServerController');
const ContainerController = require('./controllers/ContainerController');
const AccountController = require('./controllers/AccountController');
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
const authController = new AuthController();
const resourceServerController = new ResourceServerController();
const containerController = new ContainerController({ dockerRunner });
const accountController = new AccountController();

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json());
app.get('/', (req, res) => res.redirect('/admin/index.html'));
// Dynamic (not a static file) so the admin panel's JS can pick up API_KEY without it being
// baked into the repo. Same caveat as any browser-embedded secret: it's readable by anyone
// who loads the page, so this only makes sense as a shared secret for a trusted network,
// not as a real per-client credential.
app.get('/admin/config.js', (req, res) => {
  res.type('application/javascript');
  res.send(`window.API_KEY = ${JSON.stringify(process.env.API_KEY || '')};`);
});
app.use(
  '/admin',
  express.static(path.join(__dirname, 'admin')),
);
app.use(
  '/api',
  createApiRouter({
    healthController,
    workspaceController,
    buildController,
    authController,
    resourceServerController,
    containerController,
    accountController,
  }),
);

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => {
  console.log(`Deployment service listening on http://localhost:${port}`);
});
