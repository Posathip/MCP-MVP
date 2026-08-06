const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('../docs/openapi.json');
const authenticate = require('../middleware/authenticate');
const { requireAdmin } = authenticate;
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

  router.get('/health', (req, res) => healthController.getHealth(req, res));
  router.post('/workspaces/clear', (req, res) => workspaceController.clear(req, res));
  router.post('/build', asyncHandler((req, res) => buildController.startBuild(req, res)));

  router.post('/auth/register', asyncHandler((req, res) => authController.register(req, res)));
  router.post('/auth/login', asyncHandler((req, res) => authController.login(req, res)));
  router.post('/auth/refresh', asyncHandler((req, res) => authController.refresh(req, res)));
  router.post('/auth/logout', authenticate, asyncHandler((req, res) => authController.logout(req, res)));

  router.get('/resource-servers', authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.list(req, res)));
  router.get('/resource-servers/:id', authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.get(req, res)));
  router.post('/resource-servers', authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.create(req, res)));
  router.put('/resource-servers/:id', authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.update(req, res)));
  router.delete('/resource-servers/:id', authenticate, requireAdmin, asyncHandler((req, res) => resourceServerController.remove(req, res)));

  router.get('/containers', authenticate, requireAdmin, asyncHandler((req, res) => containerController.list(req, res)));
  router.post('/containers/:id/stop', authenticate, requireAdmin, asyncHandler((req, res) => containerController.stop(req, res)));
  router.post('/containers/:id/start', authenticate, requireAdmin, asyncHandler((req, res) => containerController.start(req, res)));
  router.post('/containers/:id/restart', authenticate, requireAdmin, asyncHandler((req, res) => containerController.restart(req, res)));
  router.delete('/containers/:id', authenticate, requireAdmin, asyncHandler((req, res) => containerController.remove(req, res)));

  router.get('/admins', authenticate, requireAdmin, asyncHandler((req, res) => accountController.list(req, res)));
  router.get('/admins/:id', authenticate, requireAdmin, asyncHandler((req, res) => accountController.get(req, res)));
  router.post('/admins', authenticate, requireAdmin, asyncHandler((req, res) => accountController.create(req, res)));
  router.put('/admins/:id', authenticate, requireAdmin, asyncHandler((req, res) => accountController.update(req, res)));
  router.delete('/admins/:id', authenticate, requireAdmin, asyncHandler((req, res) => accountController.remove(req, res)));

  router.use('/swagger', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  return router;
}

module.exports = createApiRouter;
