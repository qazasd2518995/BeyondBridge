/**
 * BeyondBridge 即時客服 - WebSocket 客戶端
 */

(function() {
    'use strict';

    // 聊天狀態
    let socket = null;
    let currentChatId = null;
    let chatRooms = [];
    let isConnected = false;
    let typingTimeout = null;
    let currentRating = 0;

    // 檢查 token 是否有效
    function isValidToken() {
        // 注意：API 模組使用 'accessToken' 而不是 'token'
        const token = localStorage.getItem('accessToken');
        return token && token !== 'null' && token !== 'undefined' && token.length > 10;
    }

    // 初始化聊天系統
    function initChat() {
        // 檢查是否已登入
        if (!isValidToken()) {
            console.log('[Chat] 尚未登入，跳過 WebSocket 連線');
            return;
        }

        // 初始化 Socket.io 連線
        connectSocket();

        // 載入聊天室列表
        loadChatRooms();

        // 檢查客服狀態
        checkAdminStatus();
    }

    // 連接 WebSocket
    function connectSocket() {
        if (!isValidToken()) return;
        const token = localStorage.getItem('accessToken');

        try {
            socket = io({
                auth: { token },
                transports: ['websocket', 'polling']
            });

            // 連線成功
            socket.on('connected', (data) => {
                console.log('[Chat] WebSocket 連線成功:', data);
                isConnected = true;
                updateAdminStatusUI(data.onlineAdminCount > 0, data.onlineAdminCount);
            });

            // 管理員狀態變化
            socket.on('admin:status', (data) => {
                console.log('[Chat] 管理員狀態更新:', data);
                updateAdminStatusUI(data.onlineAdminCount > 0, data.onlineAdminCount);
            });

            // 加入聊天室成功
            socket.on('chat:joined', (data) => {
                console.log('[Chat] 已加入聊天室:', data);
                renderMessages(data.messages);
                updateChatWindowStatus(data.chatRoom);
            });

            // 新訊息
            socket.on('message:new', (message) => {
                console.log('[Chat] 收到新訊息:', message);
                if (message.chatId === currentChatId) {
                    appendMessage(message);
                    scrollToBottom();

                    // 標記已讀
                    socket.emit('message:read', { chatId: currentChatId });
                }

                // 更新聊天室列表
                updateRoomPreview(message.chatId, message.content, message.createdAt);

                // 瀏覽器通知
                if (message.senderRole === 'admin' && document.hidden) {
                    showNotification('客服回覆', message.content);
                }
            });

            // 打字提示
            socket.on('typing:indicator', (data) => {
                if (data.chatId === currentChatId && data.userId !== getUserId()) {
                    showTypingIndicator(data.isTyping, data.userName);
                }
            });

            // 管理員加入
            socket.on('admin:joined', (data) => {
                console.log('[Chat] 管理員加入:', data);
                if (data.chatId === currentChatId) {
                    appendSystemMessage(`${data.admin.adminName} 已加入對話`);
                    const statusEl = document.getElementById('chatWindowStatus');
                    if (statusEl) statusEl.textContent = `${data.admin.adminName} 正在服務您`;
                }
            });

            // 管理員離開
            socket.on('admin:left', (data) => {
                console.log('[Chat] 管理員離開:', data);
                if (data.chatId === currentChatId) {
                    appendSystemMessage(`${data.adminName} 已離開對話`);
                }
            });

            // 聊天已關閉
            socket.on('chat:closed', (data) => {
                console.log('[Chat] 聊天已關閉:', data);
                if (data.chatId === currentChatId) {
                    appendSystemMessage('對話已結束');
                    const inputArea = document.getElementById('chatInputArea');
                    const statusEl = document.getElementById('chatWindowStatus');
                    if (inputArea) inputArea.style.display = 'none';
                    if (statusEl) statusEl.textContent = '對話已結束';
                }
                loadChatRooms();
            });

            // 訊息已讀回執
            socket.on('message:read', (data) => {
                console.log('[Chat] 訊息已讀:', data);
            });

            // 錯誤處理
            socket.on('error', (error) => {
                console.error('[Chat] Socket 錯誤:', error);
                showToast(error.message || '連線錯誤', 'error');
            });

            // 斷線處理
            socket.on('disconnect', (reason) => {
                console.log('[Chat] WebSocket 斷線:', reason);
                isConnected = false;
                updateAdminStatusUI(false, 0);
            });

            // 重新連線
            socket.on('reconnect', () => {
                console.log('[Chat] WebSocket 重新連線');
                isConnected = true;
                if (currentChatId) {
                    socket.emit('chat:join', { chatId: currentChatId });
                }
            });

        } catch (error) {
            console.error('[Chat] WebSocket 初始化失敗:', error);
        }
    }

    // 檢查客服在線狀態
    async function checkAdminStatus() {
        try {
            const response = await fetch('/api/chat/status');
            const result = await response.json();
            if (result.success) {
                updateAdminStatusUI(result.data.online, result.data.adminCount);
            }
        } catch (error) {
            console.error('[Chat] 檢查客服狀態失敗:', error);
        }
    }

    // 更新客服狀態 UI
    function updateAdminStatusUI(online, count) {
        const dot = document.getElementById('chatStatusDot');
        const text = document.getElementById('chatStatusText');

        if (dot && text) {
            if (online) {
                dot.style.background = 'var(--success)';
                text.textContent = `客服在線 (${count})`;
            } else {
                dot.style.background = 'var(--gray-400)';
                text.textContent = '客服離線';
            }
        }
    }

    // 載入聊天室列表
    async function loadChatRooms() {
        if (!isValidToken()) return; // 未登入時不載入
        const token = localStorage.getItem('accessToken');

        try {
            const response = await fetch('/api/chat/rooms', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            // 處理非成功回應（包括 401 未授權）
            if (!response.ok) {
                if (response.status === 401) {
                    console.log('[Chat] 認證已過期，需重新登入');
                }
                return;
            }

            const result = await response.json();

            if (result.success) {
                chatRooms = result.data;
                renderChatRoomList();
            }
        } catch (error) {
            // 靜默處理網路錯誤
        }
    }

    // 渲染聊天室列表
    function renderChatRoomList() {
        const container = document.getElementById('chatRoomList');
        if (!container) return;

        if (chatRooms.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 2rem 1rem; color: var(--gray-400);">
                    <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1" style="margin-bottom: 0.5rem; opacity: 0.5;">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                    </svg>
                    <p style="font-size: 0.85rem;">尚無對話記錄</p>
                </div>
            `;
            return;
        }

        container.innerHTML = chatRooms.map(room => {
            const isActive = room.chatId === currentChatId;
            const statusClass = room.status;
            const time = formatTime(room.lastMessageAt || room.createdAt);

            return `
                <div class="chat-room-item ${isActive ? 'active' : ''}" onclick="window.ChatModule.openChat('${room.chatId}')">
                    <div class="room-title">
                        <span class="status-dot ${statusClass}"></span>
                        <span>${room.topic || '客服對話'}</span>
                    </div>
                    <div class="room-preview">${room.lastMessage || '尚無訊息'}</div>
                    <div class="room-time">${time}</div>
                </div>
            `;
        }).join('');
    }

    // 開始新對話
    window.startNewChat = async function() {
        // 請求通知權限（用戶點擊觸發）
        requestNotificationPermission();

        // 檢查是否有進行中的對話
        const activeRoom = chatRooms.find(r => r.status === 'waiting' || r.status === 'active');
        if (activeRoom) {
            openChat(activeRoom.chatId);
            showToast('您有進行中的對話');
            return;
        }

        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch('/api/chat/rooms', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    topic: '一般諮詢'
                })
            });

            const result = await response.json();

            if (result.success) {
                showToast(result.message);
                await loadChatRooms();
                openChat(result.data.chatId);
            } else {
                showToast(result.message || '建立對話失敗', 'error');
            }
        } catch (error) {
            console.error('[Chat] 建立對話失敗:', error);
            showToast('建立對話失敗', 'error');
        }
    };

    // 開啟聊天室
    function openChat(chatId) {
        // 離開之前的聊天室
        if (currentChatId && socket) {
            socket.emit('chat:leave', { chatId: currentChatId });
        }

        currentChatId = chatId;

        // 更新 UI（添加元素存在性檢查）
        const chatWelcome = document.getElementById('chatWelcome');
        const chatWindowHeader = document.getElementById('chatWindowHeader');
        const chatInputArea = document.getElementById('chatInputArea');
        const chatMessages = document.getElementById('chatMessages');

        if (chatWelcome) chatWelcome.style.display = 'none';
        if (chatWindowHeader) chatWindowHeader.style.display = 'block';
        if (chatInputArea) chatInputArea.style.display = 'block';
        if (chatMessages) chatMessages.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-400);">載入訊息中...</div>';

        // 更新列表選中狀態
        document.querySelectorAll('.chat-room-item').forEach(item => {
            item.classList.remove('active');
        });

        // 找到當前聊天室並更新 UI
        const room = chatRooms.find(r => r.chatId === chatId);
        const chatWindowTitle = document.getElementById('chatWindowTitle');
        const chatWindowStatus = document.getElementById('chatWindowStatus');

        if (room && chatWindowTitle) {
            chatWindowTitle.textContent = room.topic || '客服對話';

            if (room.status === 'closed') {
                if (chatWindowStatus) chatWindowStatus.textContent = '對話已結束';
                if (chatInputArea) chatInputArea.style.display = 'none';
            } else if (room.status === 'waiting') {
                if (chatWindowStatus) chatWindowStatus.textContent = '等待客服連線...';
            } else if (room.admins && room.admins.length > 0) {
                const activeAdmin = room.admins.find(a => a.isActive);
                if (chatWindowStatus) {
                    chatWindowStatus.textContent = activeAdmin
                        ? `${activeAdmin.adminName} 正在服務您`
                        : '客服服務中';
                }
            }
        }

        // 加入 WebSocket 房間
        if (socket && isConnected) {
            socket.emit('chat:join', { chatId });
        } else {
            // 直接載入訊息（fallback）
            loadMessages(chatId);
        }

        // 重新渲染列表以更新選中狀態
        renderChatRoomList();
    }

    // 載入訊息 (REST API fallback)
    async function loadMessages(chatId) {
        try {
            const token = localStorage.getItem('accessToken');
            const response = await fetch(`/api/chat/rooms/${chatId}/messages`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await response.json();

            if (result.success) {
                renderMessages(result.data);
            }
        } catch (error) {
            console.error('[Chat] 載入訊息失敗:', error);
        }
    }

    // 渲染訊息列表
    function renderMessages(messages) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        if (!messages || messages.length === 0) {
            container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--gray-400);">尚無訊息，開始對話吧！</div>';
            return;
        }

        container.innerHTML = messages.map(msg => createMessageHTML(msg)).join('');
        scrollToBottom();
    }

    // 創建訊息 HTML
    function createMessageHTML(msg) {
        const isUser = msg.senderRole === 'user';
        const isSystem = msg.senderRole === 'system' || msg.messageType === 'system';
        const time = formatTime(msg.createdAt);

        if (isSystem) {
            return `
                <div class="chat-message system">
                    <div class="chat-bubble">${escapeHtml(msg.content)}</div>
                </div>
            `;
        }

        return `
            <div class="chat-message ${isUser ? 'user' : 'admin'}">
                <div>
                    ${!isUser ? `<div class="chat-sender">${escapeHtml(msg.senderName)}</div>` : ''}
                    <div class="chat-bubble">${escapeHtml(msg.content)}</div>
                    <div class="chat-time">${time}</div>
                </div>
            </div>
        `;
    }

    // 附加新訊息
    function appendMessage(msg) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        // 移除空訊息提示
        const emptyHint = container.querySelector('div[style*="text-align: center"]');
        if (emptyHint) {
            emptyHint.remove();
        }

        container.insertAdjacentHTML('beforeend', createMessageHTML(msg));
    }

    // 附加系統訊息
    function appendSystemMessage(content) {
        const container = document.getElementById('chatMessages');
        if (!container) return;

        container.insertAdjacentHTML('beforeend', `
            <div class="chat-message system">
                <div class="chat-bubble">${escapeHtml(content)}</div>
            </div>
        `);
        scrollToBottom();
    }

    // 發送訊息
    window.sendChatMessage = function() {
        const input = document.getElementById('chatMessageInput');
        const content = input.value.trim();

        if (!content || !currentChatId) return;

        if (socket && isConnected) {
            socket.emit('message:send', {
                chatId: currentChatId,
                content: content,
                messageType: 'text'
            });

            // 停止打字提示
            socket.emit('typing:stop', { chatId: currentChatId });
        }

        input.value = '';
        input.style.height = 'auto';
    };

    // 處理輸入框按鍵
    window.handleChatKeyDown = function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    };

    // 處理輸入事件（打字提示 + 自動調整高度）
    window.handleChatInput = function(textarea) {
        // 自動調整高度
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';

        // 發送打字提示
        if (socket && isConnected && currentChatId) {
            socket.emit('typing:start', { chatId: currentChatId });

            // 停止打字提示延遲
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => {
                socket.emit('typing:stop', { chatId: currentChatId });
            }, 2000);
        }
    };

    // 顯示打字提示
    function showTypingIndicator(isTyping, userName) {
        const indicator = document.getElementById('typingIndicator');
        const userSpan = document.getElementById('typingUser');

        if (indicator && userSpan) {
            indicator.style.display = isTyping ? 'block' : 'none';
            userSpan.textContent = `${userName} 正在輸入...`;
        }
    }

    // 關閉聊天室
    window.closeChatRoom = function() {
        if (!currentChatId) return;

        if (confirm('確定要結束這個對話嗎？')) {
            if (socket && isConnected) {
                socket.emit('chat:close', { chatId: currentChatId });
            }

            // 顯示評分對話框
            const ratingModal = document.getElementById('chatRatingModal');
            if (ratingModal) ratingModal.style.display = 'flex';
        }
    };

    // 設定評分
    window.setRating = function(rating) {
        currentRating = rating;
        document.querySelectorAll('.rating-star').forEach(star => {
            const starRating = parseInt(star.dataset.rating);
            star.style.color = starRating <= rating ? 'var(--warning)' : 'var(--gray-300)';
        });
    };

    // 提交評分
    window.submitRating = async function() {
        if (currentRating === 0) {
            showToast('請選擇評分');
            return;
        }

        try {
            const token = localStorage.getItem('accessToken');
            const commentEl = document.getElementById('ratingComment');
            const comment = commentEl ? commentEl.value : '';

            await fetch(`/api/chat/rooms/${currentChatId}/close`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({
                    rating: {
                        score: currentRating,
                        comment: comment
                    }
                })
            });

            showToast('感謝您的評分！');
            closeChatRatingModal();
            loadChatRooms();
        } catch (error) {
            console.error('[Chat] 提交評分失敗:', error);
        }
    };

    // 關閉評分對話框
    window.closeChatRatingModal = function() {
        const ratingModal = document.getElementById('chatRatingModal');
        const ratingComment = document.getElementById('ratingComment');
        if (ratingModal) ratingModal.style.display = 'none';
        currentRating = 0;
        if (ratingComment) ratingComment.value = '';
        document.querySelectorAll('.rating-star').forEach(star => {
            star.style.color = 'var(--gray-300)';
        });
    };

    // 更新聊天室列表預覽
    function updateRoomPreview(chatId, message, time) {
        const room = chatRooms.find(r => r.chatId === chatId);
        if (room) {
            room.lastMessage = message;
            room.lastMessageAt = time;
            renderChatRoomList();
        }
    }

    // 更新聊天視窗狀態
    function updateChatWindowStatus(room) {
        const statusEl = document.getElementById('chatWindowStatus');
        const inputArea = document.getElementById('chatInputArea');

        if (room.status === 'closed') {
            if (statusEl) statusEl.textContent = '對話已結束';
            if (inputArea) inputArea.style.display = 'none';
        } else if (room.status === 'waiting') {
            if (statusEl) statusEl.textContent = '等待客服連線...';
        } else if (room.admins && room.admins.length > 0) {
            const activeAdmin = room.admins.find(a => a.isActive);
            if (statusEl) {
                statusEl.textContent = activeAdmin
                    ? `${activeAdmin.adminName} 正在服務您`
                    : '客服服務中';
            }
        }
    }

    // 捲動到底部
    function scrollToBottom() {
        const container = document.getElementById('chatMessages');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // 格式化時間
    function formatTime(isoString) {
        if (!isoString) return '';
        const date = new Date(isoString);
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();

        if (isToday) {
            return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' }) + ' ' +
                   date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
        }
    }

    // 瀏覽器通知
    function showNotification(title, body) {
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/platform/img/logo.png' });
        }
    }

    // 請求通知權限（需由用戶互動觸發）
    function requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }

    // 取得用戶 ID
    function getUserId() {
        try {
            const token = localStorage.getItem('accessToken');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                return payload.userId;
            }
        } catch (e) {}
        return null;
    }

    // 轉義 HTML
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 頁面載入時不自動初始化
    // 等待用戶確認登入後，由 showView 或手動調用 initChat()
    // 這樣可以避免在 token 尚未刷新時就調用 API
    document.addEventListener('DOMContentLoaded', () => {
        // 監聽登入成功事件
        window.addEventListener('userLoggedIn', () => initChat());
    });

    // 視圖切換時重新載入
    const originalShowView = window.showView;
    window.showView = function(viewName) {
        if (typeof originalShowView === 'function') {
            originalShowView(viewName);
        }

        // 只有登入後才載入聊天資料
        if (viewName === 'consultations' && isValidToken()) {
            loadChatRooms();
            checkAdminStatus();
        }
    };

    // 暴露公開方法
    window.ChatModule = {
        init: initChat,
        openChat: openChat,
        loadRooms: loadChatRooms,
        checkStatus: checkAdminStatus
    };

})();
