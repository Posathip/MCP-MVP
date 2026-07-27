class HealthController {
  getHealth(_req, res) {
    res.json({ status: 'ok', message: 'Deployment service is running' });
  }
}

module.exports = HealthController;
