class SocketManager {
  constructor(io) {
    this.io = io;
    this.io.on('connection', (socket) => {
      socket.on('disconnect', () => {
        // no-op
      });
    });
  }

  createEmitter() {
    return (message, extra = {}) => {
      this.io.emit('build-log', { message, ...extra });
    };
  }
}

module.exports = SocketManager;
