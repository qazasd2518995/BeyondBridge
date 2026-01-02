/**
 * 聊天 WebSocket 事件處理
 * 處理即時訊息、打字提示、已讀回執等
 */

const db = require('../utils/db');

// 生成唯一 ID
const generateId = (prefix = 'msg') => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}_${timestamp}${random}`;
};

/**
 * 設置聊天事件處理器
 * @param {Server} io - Socket.io 伺服器
 * @param {Socket} socket - 用戶 Socket
 * @param {Object} context - 上下文（在線用戶追蹤）
 */
function setupChatEvents(io, socket, context) {
  const { userId, displayName, isAdmin } = socket.user;
  const { onlineAdmins } = context;

  // ========== 加入聊天室 ==========
  socket.on('chat:join', async (data) => {
    try {
      const { chatId } = data;

      if (!chatId) {
        return socket.emit('error', { message: '缺少聊天室 ID' });
      }

      // 驗證用戶有權限加入此聊天室
      const chatRoom = await db.getItem(`CHAT#${chatId}`, 'META');

      if (!chatRoom) {
        return socket.emit('error', { message: '聊天室不存在' });
      }

      // 檢查權限
      if (!isAdmin && chatRoom.userId !== userId) {
        return socket.emit('error', { message: '無權限加入此聊天室' });
      }

      // 加入 Socket 房間
      socket.join(`chat:${chatId}`);

      // 如果是管理員加入，更新聊天室狀態
      if (isAdmin) {
        // 檢查管理員是否已在 admins 列表中
        const admins = chatRoom.admins || [];
        const existingAdmin = admins.find(a => a.adminId === userId);

        if (!existingAdmin) {
          admins.push({
            adminId: userId,
            adminName: displayName,
            joinedAt: new Date().toISOString(),
            isActive: true
          });
        } else {
          existingAdmin.isActive = true;
        }

        // 更新聊天室
        await db.updateItem(`CHAT#${chatId}`, 'META', {
          admins,
          status: 'active',
          updatedAt: new Date().toISOString()
        });

        // 通知用戶管理員加入
        io.to(`chat:${chatId}`).emit('admin:joined', {
          chatId,
          admin: { adminId: userId, adminName: displayName }
        });

        // 通知所有管理員更新等候隊列
        io.to('admin:queue').emit('queue:update');
      }

      // 取得最近訊息
      const messages = await getRecentMessages(chatId, 50);

      // 發送加入成功
      socket.emit('chat:joined', {
        chatId,
        chatRoom: {
          ...chatRoom,
          PK: undefined,
          SK: undefined
        },
        messages
      });

      console.log(`[Chat] ${displayName} 加入聊天室 ${chatId}`);

    } catch (error) {
      console.error('[Chat] 加入聊天室錯誤:', error);
      socket.emit('error', { message: '加入聊天室失敗' });
    }
  });

  // ========== 離開聊天室 ==========
  socket.on('chat:leave', async (data) => {
    try {
      const { chatId } = data;

      socket.leave(`chat:${chatId}`);

      if (isAdmin) {
        // 更新管理員狀態
        const chatRoom = await db.getItem(`CHAT#${chatId}`, 'META');
        if (chatRoom) {
          const admins = (chatRoom.admins || []).map(a => {
            if (a.adminId === userId) {
              return { ...a, isActive: false };
            }
            return a;
          });

          await db.updateItem(`CHAT#${chatId}`, 'META', {
            admins,
            updatedAt: new Date().toISOString()
          });
        }

        // 通知用戶管理員離開
        io.to(`chat:${chatId}`).emit('admin:left', {
          chatId,
          adminId: userId,
          adminName: displayName
        });
      }

      console.log(`[Chat] ${displayName} 離開聊天室 ${chatId}`);

    } catch (error) {
      console.error('[Chat] 離開聊天室錯誤:', error);
    }
  });

  // ========== 發送訊息 ==========
  socket.on('message:send', async (data) => {
    try {
      const { chatId, content, messageType = 'text', imageUrl } = data;

      if (!chatId || (!content && messageType === 'text')) {
        return socket.emit('error', { message: '訊息內容不可為空' });
      }

      const messageId = generateId('msg');
      const now = new Date().toISOString();

      // 儲存訊息到 DynamoDB
      const message = {
        PK: `CHAT#${chatId}`,
        SK: `MSG#${now}#${messageId}`,
        entityType: 'CHAT_MESSAGE',
        chatId,
        messageId,
        senderId: userId,
        senderName: displayName,
        senderRole: isAdmin ? 'admin' : 'user',
        content: content || '',
        messageType,
        imageUrl: imageUrl || null,
        status: 'sent',
        createdAt: now
      };

      await db.putItem(message);

      // 更新聊天室最後訊息
      const updateData = {
        lastMessage: content ? content.substring(0, 100) : '[圖片]',
        lastMessageAt: now,
        updatedAt: now
      };

      // 如果是用戶發送，增加未讀數
      if (!isAdmin) {
        const chatRoom = await db.getItem(`CHAT#${chatId}`, 'META');
        updateData.unreadCount = (chatRoom?.unreadCount || 0) + 1;
        updateData.messageCount = (chatRoom?.messageCount || 0) + 1;
      }

      await db.updateItem(`CHAT#${chatId}`, 'META', updateData);

      // 清理敏感資料
      delete message.PK;
      delete message.SK;

      // 廣播訊息給房間內所有人
      io.to(`chat:${chatId}`).emit('message:new', message);

      // 通知管理員隊列有新訊息
      if (!isAdmin) {
        io.to('admin:queue').emit('queue:message', {
          chatId,
          message: content?.substring(0, 50) || '[圖片]',
          userName: displayName
        });
      }

      console.log(`[Chat] ${displayName} 發送訊息到 ${chatId}`);

    } catch (error) {
      console.error('[Chat] 發送訊息錯誤:', error);
      socket.emit('error', { message: '發送訊息失敗' });
    }
  });

  // ========== 標記已讀 ==========
  socket.on('message:read', async (data) => {
    try {
      const { chatId, messageIds } = data;

      if (!chatId) return;

      // 如果是管理員已讀，重置未讀數
      if (isAdmin) {
        await db.updateItem(`CHAT#${chatId}`, 'META', {
          unreadCount: 0,
          updatedAt: new Date().toISOString()
        });
      }

      // 通知對方訊息已讀
      io.to(`chat:${chatId}`).emit('message:read', {
        chatId,
        readBy: userId,
        readByName: displayName,
        messageIds,
        readAt: new Date().toISOString()
      });

    } catch (error) {
      console.error('[Chat] 標記已讀錯誤:', error);
    }
  });

  // ========== 打字提示 ==========
  socket.on('typing:start', (data) => {
    const { chatId } = data;
    if (chatId) {
      socket.to(`chat:${chatId}`).emit('typing:indicator', {
        chatId,
        userId,
        userName: displayName,
        isTyping: true
      });
    }
  });

  socket.on('typing:stop', (data) => {
    const { chatId } = data;
    if (chatId) {
      socket.to(`chat:${chatId}`).emit('typing:indicator', {
        chatId,
        userId,
        userName: displayName,
        isTyping: false
      });
    }
  });

  // ========== 關閉聊天 ==========
  socket.on('chat:close', async (data) => {
    try {
      const { chatId, rating } = data;

      if (!chatId) return;

      const now = new Date().toISOString();
      const updateData = {
        status: 'closed',
        closedAt: now,
        updatedAt: now
      };

      // 如果有評分
      if (rating && !isAdmin) {
        updateData.rating = {
          score: rating.score,
          comment: rating.comment || '',
          ratedAt: now,
          ratedBy: userId
        };
      }

      await db.updateItem(`CHAT#${chatId}`, 'META', updateData);

      // 新增系統訊息
      const systemMessage = {
        PK: `CHAT#${chatId}`,
        SK: `MSG#${now}#${generateId('sys')}`,
        entityType: 'CHAT_MESSAGE',
        chatId,
        messageId: generateId('sys'),
        senderId: 'system',
        senderName: '系統',
        senderRole: 'system',
        content: isAdmin ? '管理員已結束對話' : '用戶已結束對話',
        messageType: 'system',
        status: 'sent',
        createdAt: now
      };

      await db.putItem(systemMessage);

      // 通知房間內所有人
      io.to(`chat:${chatId}`).emit('chat:closed', {
        chatId,
        closedBy: userId,
        closedByName: displayName,
        rating: updateData.rating
      });

      // 更新管理員隊列
      io.to('admin:queue').emit('queue:update');

      console.log(`[Chat] 聊天室 ${chatId} 已關閉`);

    } catch (error) {
      console.error('[Chat] 關閉聊天錯誤:', error);
      socket.emit('error', { message: '關閉聊天失敗' });
    }
  });

  // ========== 管理員加入隊列監聽 ==========
  if (isAdmin) {
    socket.join('admin:queue');
    console.log(`[Chat] 管理員 ${displayName} 加入客服隊列監聽`);
  }
}

/**
 * 取得最近訊息
 * @param {string} chatId - 聊天室 ID
 * @param {number} limit - 訊息數量限制
 */
async function getRecentMessages(chatId, limit = 50) {
  try {
    // 使用正確的 db.query API 格式
    const result = await db.query(`CHAT#${chatId}`, {
      skPrefix: 'MSG#',
      limit: limit,
      scanIndexForward: false // 最新的在前
    });

    return (result || [])
      .map(item => {
        delete item.PK;
        delete item.SK;
        return item;
      })
      .reverse(); // 按時間順序排列
  } catch (error) {
    console.error('[Chat] 取得訊息錯誤:', error);
    return [];
  }
}

module.exports = {
  setupChatEvents,
  getRecentMessages
};
