class SocketManager {
  constructor(io) {
    this.io = io;
    this.io.on('connection', (socket) => {
      socket.on('disconnect', () => {
        // no-op
      });
    });
  }

  createEmitter(socketId) {
    return (message, extra = {}) => {
      const payload = { message, ...extra };
      if (socketId) {
        this.io.to(socketId).emit('build-log', payload);
      } else {
        this.io.emit('build-log', payload);
      }
    };
  }
}

module.exports = SocketManager;
