const messageService = require('../services/message.service');
const messageEvent = require('../events/message.event');
const { assertCanWriteInOrgChannel } = require('../utils/orgChannelPermissions');

const serverSocket = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.user?.id || socket.user?._id;
    console.log(`User ${userId} connected to server chat`);

    // Join room
    socket.on('join_room', async (data) => {
      try {
        const { roomId, organizationId } = data;

        if (!roomId) {
          return socket.emit('error', { message: 'roomId is required' });
        }

        socket.join(`room:${roomId}`);
        console.log(`User ${userId} joined room ${roomId}`);

        socket.emit('room_joined', { roomId });
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Leave room
    socket.on('leave_room', (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.leave(`room:${roomId}`);
        console.log(`User ${userId} left room ${roomId}`);
      }
    });

    // Gửi tin nhắn trong room
    socket.on('send_message', async (data) => {
      try {
        const { roomId, content, messageType, organizationId } = data;

        if (!roomId || !content) {
          return socket.emit('error', { message: 'roomId and content are required' });
        }

        if (organizationId) {
          try {
            await assertCanWriteInOrgChannel(organizationId, roomId, { user: socket.user, headers: {} });
          } catch (permErr) {
            return socket.emit('error', {
              message: permErr.message || 'Bạn không có quyền chat trong kênh này',
            });
          }
        }

        const message = await messageService.createMessage({
          senderId: userId,
          roomId,
          content,
          messageType: messageType || 'text',
          organizationId,
        });

        // Emit event
        messageEvent.emit('message.created', message);

        // Gửi tin nhắn đến tất cả người trong room
        io.to(`room:${roomId}`).emit('new_message', message);
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Đánh dấu tin nhắn đã đọc
    socket.on('mark_read', async (data) => {
      try {
        const { messageId } = data;
        const message = await messageService.markAsRead(messageId, userId);
        
        if (message) {
          socket.emit('message_read', message);
        }
      } catch (error) {
        socket.emit('error', { message: error.message });
      }
    });

    // Typing indicator
    socket.on('typing', (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.to(`room:${roomId}`).emit('user_typing', {
          userId,
          roomId,
          isTyping: true,
        });
      }
    });

    socket.on('stop_typing', (data) => {
      const { roomId } = data;
      if (roomId) {
        socket.to(`room:${roomId}`).emit('user_typing', {
          userId,
          roomId,
          isTyping: false,
        });
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      console.log(`User ${userId} disconnected from server chat`);
    });
  });
};

module.exports = serverSocket;




