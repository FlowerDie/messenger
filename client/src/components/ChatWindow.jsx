import { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';

const EMOJI_LIST = ['😀','😂','🥰','😎','🤔','👍','👎','❤️','🔥','🎉','😢','😡','🤣','😍','🥳','😴','🤗','😱','💀','👀','🙏','💪','🫡','😈','🤡','💩','👻','🎮','🎵','🌟'];

export default function ChatWindow() {
  const { activeChat, messages, user, sendMessage, setTyping, chats, typing } = useStore();
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef(null);
  const chatInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  const chatMessages = messages[activeChat] || [];
  const currentChat = chats.find(c => c.id === activeChat);
  const typingUserId = typing[activeChat];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleSend = () => {
    if (!text.trim()) return;
    sendMessage(text);
    setText('');
    setShowEmoji(false);
    setTyping(false);
  };

  const handleTyping = (e) => {
    setText(e.target.value);
    if (e.target.value.length > 0) {
      setTyping(true);
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => setTyping(false), 2000);
    }
  };

  const addEmoji = (emoji) => {
    setText(text + emoji);
    chatInputRef.current?.focus();
  };

  const getStatusIcon = (status) => {
    if (status === 'sent') return '✓';
    if (status === 'delivered') return '✓✓';
    if (status === 'read') return '<span class="msg-read">✓✓</span>';
    return '';
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
  };

  const formatLastSeen = (dateStr) => {
    if (!dateStr) return 'давно';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `в ${d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`;
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  if (!activeChat) {
    return (
      <div className="chat-window no-chat">
        <div className="no-chat-selected">
          <div className="big-emoji">💬</div>
          <h2>Выбери чат</h2>
          <p>Или найди кого-нибудь через 👤 Поиск</p>
        </div>
      </div>
    );
  }

  const mate = currentChat?.mate;
  const isDirect = currentChat?.type === 'direct';

  return (
    <div className="chat-window">
      {/* Chat header */}
      <div className="chat-header">
        <div className="header-avatar-wrap">
          {isDirect && mate?.avatar ? (
            <img src={mate.avatar} alt="" className="header-avatar-img" />
          ) : (
            <div className={`header-avatar ${isDirect ? (mate?.status || '') : 'group'}`}>
              {isDirect ? mate?.display_name?.[0]?.toUpperCase() : '👥'}
            </div>
          )}
          {isDirect && mate?.status === 'online' && <div className="header-online-dot"></div>}
        </div>
        <div className="header-info">
          <div className="header-name">
            {isDirect ? mate?.display_name : currentChat?.name}
          </div>
          {isDirect && (
            <div className={`header-status ${mate?.status}`}>
              {mate?.status === 'online' ? 'в сети' : `был(а) ${formatLastSeen(mate?.last_seen)}`}
            </div>
          )}
          {!isDirect && (
            <div className="header-status">группа</div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="messages-area">
        {chatMessages.length === 0 && (
          <div className="no-messages">Нет сообщений. Начни общение! 👋</div>
        )}
        {chatMessages.map((msg) => {
          const isMine = msg.sender_id === user?.id;
          return (
            <div key={msg.id} className={`message ${isMine ? 'mine' : 'theirs'}`}>
              {!isMine && currentChat?.type === 'direct' && msg.avatar && (
                <img src={msg.avatar} alt="" className="msg-avatar" />
              )}
              <div className="msg-content">
                {!isMine && currentChat?.type === 'group' && (
                  <div className="msg-sender">{msg.display_name}</div>
                )}
                <div className="msg-bubble">
                  <span className="msg-text">{msg.text}</span>
                  <span className="msg-time">{formatTime(msg.created_at)}</span>
                  {isMine && (
                    <span className="msg-status" dangerouslySetInnerHTML={{ __html: getStatusIcon(msg.status) }}></span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {typingUserId && (
          <div className="typing-indicator">
            <div className="typing-dots">
              <span></span><span></span><span></span>
            </div>
            <span className="typing-text">печатает...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="input-area">
        <div className="emoji-container">
          <button className="emoji-btn" onClick={() => setShowEmoji(!showEmoji)}>
            {showEmoji ? '✖' : '😊'}
          </button>
          {showEmoji && (
            <div className="emoji-picker">
              {EMOJI_LIST.map(e => (
                <span key={e} className="emoji-item" onClick={() => addEmoji(e)}>{e}</span>
              ))}
            </div>
          )}
        </div>
        <input
          ref={chatInputRef}
          type="text"
          placeholder="Написать сообщение..."
          value={text}
          onChange={handleTyping}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          className="msg-input"
        />
        <button className="send-btn" onClick={handleSend}>➤</button>
      </div>
    </div>
  );
}
