const express = require('express');
const swaggerUi = require('swagger-ui-express');
const openapiSpec = require('../docs/openapi.json');

function createApiRouter({ healthController, workspaceController, buildController }) {
  const router = express.Router();

  router.get('/health', (req, res) => healthController.getHealth(req, res));
  router.post('/workspaces/clear', (req, res) => workspaceController.clear(req, res));
  router.post('/build', (req, res) => buildController.startBuild(req, res));
  router.use('/swagger', swaggerUi.serve, swaggerUi.setup(openapiSpec));

  return router;
}

module.exports = createApiRouter;
