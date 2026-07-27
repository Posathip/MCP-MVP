const express = require('express');

function createApiRouter({ healthController, workspaceController, buildController }) {
  const router = express.Router();

  router.get('/health', (req, res) => healthController.getHealth(req, res));
  router.post('/workspaces/clear', (req, res) => workspaceController.clear(req, res));
  router.post('/build', (req, res) => buildController.startBuild(req, res));

  return router;
}

module.exports = createApiRouter;
