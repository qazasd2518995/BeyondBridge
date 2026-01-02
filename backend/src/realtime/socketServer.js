/**
 * Socket.io 伺服器初始化
 * 處理 WebSocket 連線、JWT 認證、房間管理
 */

const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const { setupChatEvents } = require('./chatEvents');

// 在線用戶追蹤
const onlineUsers = new Map(); // userId -> { socketId, role, name }
const onlineAdmins = new Map(); // adminId -> { socketId, name, status }

/**
 * 初始化 Socket.io 伺服器
 * @param {http.Server} httpServer - HTTP 伺服器實例
 * @returns {Server} Socket.io 伺服器實例
 */
function initSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // JWT 認證中間件
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.query.token;

      if (!token) {
        return next(new Error('認證失敗：缺少 token'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 將用戶資訊附加到 socket
      socket.user = {
        userId: decoded.userId,
        email: decoded.email,
        displayName: decoded.displayName || decoded.email,
        isAdmin: decoded.isAdmin || false
      };

      next();
    } catch (error) {
      console.error('Socket 認證失敗:', error.message);
      next(new Error('認證失敗：無效的 token'));
    }
  });

  // 連線處理
  io.on('connection', (socket) => {
    const { userId, displayName, isAdmin } = socket.user;

    console.log(`[Socket] 用戶連線: ${displayName} (${userId}) - ${isAdmin ? '管理員' : '用戶'}`);

    // 追蹤在線狀態
    if (isAdmin) {
      onlineAdmins.set(userId, {
        socketId: socket.id,
        name: displayName,
        status: 'online'
      });
      // 廣播管理員上線
      io.emit('admin:status', {
        adminId: userId,
        status: 'online',
        onlineAdminCount: onlineAdmins.size
      });
    } else {
      onlineUsers.set(userId, {
        socketId: socket.id,
        name: displayName,
        role: 'user'
      });
    }

    // 加入個人房間（用於私訊）
    socket.join(`user:${userId}`);

    // 設置聊天事件處理
    setupChatEvents(io, socket, { onlineUsers, onlineAdmins });

    // 斷線處理
    socket.on('disconnect', (reason) => {
      console.log(`[Socket] 用戶斷線: ${displayName} (${userId}) - 原因: ${reason}`);

      if (isAdmin) {
        onlineAdmins.delete(userId);
        io.emit('admin:status', {
          adminId: userId,
          status: 'offline',
          onlineAdminCount: onlineAdmins.size
        });
      } else {
        onlineUsers.delete(userId);
      }
    });

    // 錯誤處理
    socket.on('error', (error) => {
      console.error(`[Socket] 錯誤 (${userId}):`, error);
    });

    // 發送連線成功訊息
    socket.emit('connected', {
      userId,
      displayName,
      isAdmin,
      onlineAdminCount: onlineAdmins.size
    });
  });

  // 全域錯誤處理
  io.engine.on('connection_error', (err) => {
    console.error('[Socket Engine] 連線錯誤:', err);
  });

  console.log('[Socket.io] WebSocket 伺服器已初始化');

  return io;
}

/**
 * 取得在線管理員數量
 */
function getOnlineAdminCount() {
  return onlineAdmins.size;
}

/**
 * 取得在線管理員列表
 */
function getOnlineAdmins() {
  return Array.from(onlineAdmins.entries()).map(([id, data]) => ({
    adminId: id,
    ...data
  }));
}

/**
 * 檢查是否有管理員在線
 */
function hasOnlineAdmin() {
  return onlineAdmins.size > 0;
}

/**
 * 取得用戶 Socket ID
 */
function getUserSocketId(userId) {
  const user = onlineUsers.get(userId) || onlineAdmins.get(userId);
  return user?.socketId || null;
}

module.exports = {
  initSocketServer,
  getOnlineAdminCount,
  getOnlineAdmins,
  hasOnlineAdmin,
  getUserSocketId,
  onlineUsers,
  onlineAdmins
};
