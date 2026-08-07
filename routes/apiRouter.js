const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('../docs/openapi.json');
const authenticate = require('../middleware/authenticate');
const { requireAdmin } = authenticate;
const apiKeyAuth = require('../middleware/apiKey');
const asyncHandler = require('../utils/asyncHandler');

function createApiRouter({
  healthController,
  workspaceController,
  buildController,
  authController,
  resourceServerController,
  containerController,
  accountController,
}) {
  const router = express.Router();

  // Every route below except /auth/* (the login flow itself) requires the shared X-API-Key
  // header. It's a coarse "is this a trusted caller" gate, separate from the per-account JWT
  // checks (authenticate/requireAdmin) still layered on top of it where those apply.
  router.get('/health', apiKeyAuth, (req, res) => healthController.getHealth(req, res));
  router.post('/workspaces/clear', apiKeyAuth, (req, res) => workspaceController.clear(req, res));
  router.post('/build', apiKeyAuth, asyncHandler((req, res) => buildController.startBuild(req, res)));

  router.post('/auth/register', asyncHandler((req, res) => authController.register(req, res)));
  router.post('/auth/login', asyncHandler((req, res) => authController.login(req, res)));
  router.post('/auth/refresh', asyncHandler((req, res) => authController.refresh(req, res)));
  router.post('/auth/logout', authenticate, asyncHandler((req, res) => authController.logout(req, res)));

  router.get('/resource-servers', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.list(req, res)));
  router.get('/resource-servers/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.get(req, res)));
  router.post('/resource-servers', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.create(req, res)));
  router.put('/resource-servers/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.update(req, res)));
  router.delete('/resource-servers/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.remove(req, res)));

  router.get('/containers', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => containerController.list(req, res)));
  
  // router.get('/containers/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => containerController.get(req, res)));
  router.get('/containers/:id', apiKeyAuth, asyncHandler((req, res) => containerController.get(req, res)));
  router.get('/containers/:id/logs', apiKeyAuth, asyncHandler((req, res) => containerController.logs(req, res)));
  router.post('/containers/:id/stop', apiKeyAuth, asyncHandler((req, res) => containerController.stop(req, res)));
  router.post('/containers/:id/start', apiKeyAuth,  asyncHandler((req, res) => containerController.start(req, res)));
  router.post('/containers/:id/restart', apiKeyAuth, asyncHandler((req, res) => containerController.restart(req, res)));
  // router.delete('/containers/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => containerController.remove(req, res)));
    router.delete('/containers/:id', apiKeyAuth, asyncHandler((req, res) => containerController.remove(req, res)));
  
    router.get('/admins', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => accountController.list(req, res)));
  router.get('/admins/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => accountController.get(req, res)));
  router.post('/admins', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => accountController.create(req, res)));
  router.put('/admins/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => accountController.update(req, res)));
  router.delete('/admins/:id', apiKeyAuth, authenticate, requireAdmin, asyncHandler((req, res) => accountController.remove(req, res)));

  router.use('/swagger', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  return router;
}

module.exports = createApiRouter;
