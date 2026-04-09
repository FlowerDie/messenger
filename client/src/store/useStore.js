import { create } from 'zustand';
import { io } from 'socket.io-client';

const API_URL = '';

// ===================== ЗВУК (base64, без внешних файлов) =====================
const notificationSound = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

function playSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    osc.type = 'sine';
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

// ===================== PUSH УВЕДОМЛЕНИЯ =====================
function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function sendNotification(title, body) {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body, icon: '💬' });
  }
}

export const useStore = create((set, get) => ({
  // Auth
  token: localStorage.getItem('token') || null,
  user: null,
  isLoggedIn: !!localStorage.getItem('token'),

  // Chats & messages
  chats: [],
  messages: {},
  activeChat: null,
  typing: {},

  // Socket
  socket: null,

  // UI
  showSearch: false,
  searchResults: [],
  showNewChat: false, // новая панель поиска друга

  // ===================== AUTH ACTIONS =====================
  setToken: (token) => {
    localStorage.setItem('token', token);
    set({ token, isLoggedIn: true });
    requestNotificationPermission();
  },

  logout: () => {
    localStorage.removeItem('token');
    const { socket } = get();
    if (socket) socket.disconnect();
    set({ token: null, user: null, isLoggedIn: false, chats: [], messages: {}, activeChat: null, socket: null, showSearch: false, showNewChat: false });
  },

  login: async (username, password) => {
    const res = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    get().setToken(data.token);
    set({ user: { id: data.userId, username: data.username, displayName: data.displayName, avatar: data.avatar || null } });
  },

  register: async (username, password, displayName) => {
    const res = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    get().setToken(data.token);
    set({ user: { id: data.userId, username: data.username, displayName: data.displayName, avatar: data.avatar || null } });
  },

  // ===================== AVATAR =====================
  uploadAvatar: async (base64) => {
    const { token } = get();
    const res = await fetch(`${API_URL}/api/users/avatar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ avatar: base64 }),
    });
    const data = await res.json();
    if (res.ok) {
      set({ user: { ...get().user, avatar: base64 } });
      return true;
    }
    throw new Error(data.error);
  },

  // ===================== SOCKET =====================
  connectSocket: () => {
    const { token } = get();
    if (!token) return;

    const socket = io(API_URL);
    set({ socket });

    socket.on('connect', () => {
      socket.emit('auth', token);
    });

    socket.on('auth-success', async () => {
      const meRes = await fetch(`${API_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (meRes.ok) {
        const me = await meRes.json();
        set({ user: me });
      }
      get().loadChats();
    });

    socket.on('new-message', (message) => {
      const { messages, activeChat, user } = get();
      const chatMessages = messages[message.chat_id] || [];

      // Дедупликация: ищем временное сообщение с таким же текстом от того же автора
      const tempIdx = chatMessages.findIndex(
        m => m.sender_id === message.sender_id
          && m.text === message.text
          && m.id >= Date.now() - 5000  // создано за последние 5 секунд
      );

      if (tempIdx !== -1) {
        // Заменяем временное на настоящее
        chatMessages[tempIdx] = message;
        if (message.chat_id === activeChat) {
          chatMessages[tempIdx].status = 'read';
        }
      } else {
        // Новое сообщение от другого
        if (message.chat_id === activeChat) {
          message.status = 'read';
        } else {
          const isMine = message.sender_id === user?.id;
          const chat = get().chats.find(c => c.id === message.chat_id);
          const mateName = chat?.mate?.display_name || chat?.name || '';
          if (!isMine) {
            playSound();
            sendNotification(`Новое сообщение`, `${mateName}: ${message.text.substring(0, 50)}`);
          }
        }
        chatMessages.push(message);
      }

      set({
        messages: {
          ...messages,
          [message.chat_id]: chatMessages,
        },
      });
    });

    socket.on('user-status', ({ userId, status }) => {
      const { chats } = get();
      const updated = chats.map(c => {
        if (c.mate && c.mate.id === userId) {
          return { ...c, mate: { ...c.mate, status } };
        }
        return c;
      });
      set({ chats: updated });
    });

    socket.on('user-typing', ({ userId, chatId }) => {
      const { typing } = get();
      set({ typing: { ...typing, [chatId]: userId } });
    });

    socket.on('user-stop-typing', ({ chatId }) => {
      const { typing } = get();
      const newTyping = { ...typing };
      delete newTyping[chatId];
      set({ typing: newTyping });
    });
  },

  // ===================== CHATS =====================
  loadChats: async () => {
    const { token } = get();
    const res = await fetch(`${API_URL}/api/chats`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const chats = await res.json();
      set({ chats });
    }
  },

  setActiveChat: (chatId) => {
    const { socket } = get();
    set({ activeChat: chatId });
    if (socket) {
      socket.emit('join-chat', chatId);
      get().loadMessages(chatId);
    }
  },

  createDirectChat: async (userId) => {
    const { token } = get();
    const res = await fetch(`${API_URL}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'direct', memberIds: [userId] }),
    });
    const data = await res.json();
    if (res.ok) {
      await get().loadChats();
      get().setActiveChat(data.chatId);
      return true;
    }
    throw new Error(data.error);
  },

  createGroupChat: async (name, memberIds) => {
    const { token, user } = get();
    const res = await fetch(`${API_URL}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type: 'group', name, memberIds: [...memberIds, user.id] }),
    });
    const data = await res.json();
    if (res.ok) {
      await get().loadChats();
      get().setActiveChat(data.chatId);
      return true;
    }
    throw new Error(data.error);
  },

  // ===================== MESSAGES =====================
  loadMessages: async (chatId) => {
    const { token, messages } = get();
    if (messages[chatId]) return;

    const res = await fetch(`${API_URL}/api/chats/${chatId}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const msgs = await res.json();
      set({
        messages: { ...messages, [chatId]: msgs },
      });
    }
  },

  sendMessage: (text) => {
    const { socket, activeChat, user, messages } = get();
    if (!activeChat || !text.trim()) return;

    const txt = text.trim();
    const now = new Date().toISOString();

    // Оптимистичное обновление — показываем мгновенно
    const tempMsg = {
      id: Date.now(),
      chat_id: activeChat,
      sender_id: user.id,
      text: txt,
      status: 'sent',
      created_at: now,
      username: user.username,
      display_name: user.displayName || user.display_name,
      avatar: user.avatar,
    };

    const chatMsgs = messages[activeChat] || [];
    set({
      messages: {
        ...messages,
        [activeChat]: [...chatMsgs, tempMsg],
      },
    });

    if (socket) {
      socket.emit('send-message', { chatId: activeChat, text: txt });
    }
  },

  setTyping: (isTyping) => {
    const { socket, activeChat } = get();
    if (socket && activeChat) {
      socket.emit(isTyping ? 'typing' : 'stop-typing', { chatId: activeChat });
    }
  },

  // ===================== SEARCH =====================
  searchUsers: async (q) => {
    const { token } = get();
    if (!q) {
      set({ searchResults: [] });
      return;
    }
    const res = await fetch(`${API_URL}/api/users/search?q=${encodeURIComponent(q)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const users = await res.json();
      set({ searchResults: users });
    }
  },
}));
