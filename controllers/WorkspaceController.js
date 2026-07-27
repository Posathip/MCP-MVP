const fs = require('fs');
const path = require('path');

class WorkspaceController {
  constructor(workspacesDir) {
    this.workspacesDir = workspacesDir;
  }

  clear(_req, res) {
    try {
      if (!fs.existsSync(this.workspacesDir)) {
        fs.mkdirSync(this.workspacesDir, { recursive: true });
      }

      const entries = fs.readdirSync(this.workspacesDir);
      for (const entry of entries) {
        fs.rmSync(path.join(this.workspacesDir, entry), { recursive: true, force: true });
      }

      res.json({ status: 'ok', message: 'Workspaces cleared successfully' });
    } catch (error) {
      res.status(500).json({ error: error.message || 'Failed to clear workspaces' });
    }
  }
}

module.exports = WorkspaceController;
