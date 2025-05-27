const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // roomName -> { streamerId: string|null, sockets: Set }

io.on('connection', (socket) => {
  console.log('User connected', socket.id);

  socket.on('join-room', (roomName, cb) => {
    socket.join(roomName);

    if (!rooms[roomName]) {
      rooms[roomName] = { streamerId: null, sockets: new Set() };
    }
    rooms[roomName].sockets.add(socket.id);

    cb && cb({ 
      success: true, 
      streamerId: rooms[roomName].streamerId 
    });

    if (rooms[roomName].streamerId && rooms[roomName].streamerId !== socket.id) {
      io.to(rooms[roomName].streamerId).emit('new-peer', socket.id);
    }
  });

  socket.on('start-streaming', (roomName, cb) => {
    if (!rooms[roomName]) {
      cb && cb({ success: false, error: 'Room does not exist' });
      return;
    }
    if (rooms[roomName].streamerId) {
      // Someone already streaming, reject
      cb && cb({ success: false, error: 'Stream already in progress' });
      return;
    }

    rooms[roomName].streamerId = socket.id;
    console.log(`User ${socket.id} started streaming in room ${roomName}`);

    socket.to(roomName).emit('streamer-started', socket.id);

    // Notify all viewers & streamer to connect
    rooms[roomName].sockets.forEach(sid => {
      if (sid !== socket.id) {
        io.to(socket.id).emit('new-peer', sid); // streamer creates peer for each viewer
        io.to(sid).emit('new-peer', socket.id); // viewers create peer for streamer
      }
    });

    cb && cb({ success: true });
  });

  socket.on('stop-streaming', (roomName) => {
    if (!rooms[roomName]) return;
    if (rooms[roomName].streamerId === socket.id) {
      rooms[roomName].streamerId = null;
      console.log(`User ${socket.id} stopped streaming in room ${roomName}`);
      socket.to(roomName).emit('streaming-stopped');
    }
  });

  socket.on('signal', ({ to, data }) => {
    io.to(to).emit('signal', { from: socket.id, data });
  });

  socket.on('disconnect', () => {
    console.log('User disconnected', socket.id);
    for (const roomName in rooms) {
      rooms[roomName].sockets.delete(socket.id);
      if (rooms[roomName].streamerId === socket.id) {
        rooms[roomName].streamerId = null;
        socket.to(roomName).emit('streaming-stopped');
      }
      socket.to(roomName).emit('peer-left', socket.id);
    }
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
