import { useState } from 'react';
import { useStore } from '../store/useStore';

export default function Sidebar() {
  const { chats, activeChat, setActiveChat, user, searchUsers, searchResults, showSearch, showNewChat, uploadAvatar } = useStore();
  const [searchQ, setSearchQ] = useState('');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'вчера';
    }
    return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
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

  const handleSearch = (q) => {
    setSearchQ(q);
    searchUsers(q);
  };

  const startChat = async (targetUser) => {
    const { createDirectChat } = useStore.getState();
    try {
      await createDirectChat(targetUser.id);
      setSearchQ('');
      showNewChat && useStore.setState({ showNewChat: false, searchResults: [] });
    } catch (e) {
      alert(e.message);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return;
    const { createGroupChat } = useStore.getState();
    try {
      await createGroupChat(groupName, groupMembers);
      setShowGroupModal(false);
      setGroupName('');
      setGroupMembers([]);
    } catch (e) {
      alert(e.message);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await uploadAvatar(reader.result);
      } catch (e) {
        alert(e.message);
      }
    };
    reader.readAsDataURL(file);
  };

  const currentChat = chats.find(c => c.id === activeChat);

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-title">💬 Чаты</div>
        <div className="sidebar-actions">
          <button className="icon-btn" onClick={() => useStore.setState({ showNewChat: true, showSearch: false })} title="Найти друга">👤</button>
          <button className="icon-btn" onClick={() => setShowGroupModal(true)} title="Создать группу">👥</button>
        </div>
      </div>

      {/* My info */}
      <div className="my-info">
        <label htmlFor="my-avatar-input" className="my-avatar-wrap">
          {user?.avatar ? (
            <img src={user.avatar} alt="me" className="my-avatar-img" />
          ) : (
            <div className="my-avatar">{user?.displayName?.[0]?.toUpperCase() || '?'}</div>
          )}
          <input id="my-avatar-input" type="file" accept="image/*" onChange={handleAvatarChange} hidden />
          <div className="my-avatar-edit">📷</div>
        </label>
        <div className="my-info-text">
          <div className="my-name">{user?.display_name}</div>
          <div className="my-username">@{user?.username}</div>
        </div>
      </div>

      {/* Поиск друга */}
      {showNewChat && (
        <div className="search-panel">
          <div className="search-panel-header">
            <span>👤 Найти друга</span>
            <button className="close-btn" onClick={() => { useStore.setState({ showNewChat: false }); setSearchQ(''); }}>✕</button>
          </div>
          <input
            type="text"
            placeholder="Введи юзернейм..."
            value={searchQ}
            onChange={e => handleSearch(e.target.value)}
            className="search-input"
            autoFocus
          />
          {searchResults.length > 0 && (
            <div className="search-results">
              {searchResults.map(u => (
                <div key={u.id} className="search-result" onClick={() => startChat(u)}>
                  {u.avatar ? (
                    <img src={u.avatar} alt="" className="search-avatar-img" />
                  ) : (
                    <div className={`status-dot ${u.status}`}></div>
                  )}
                  <div className="search-info">
                    <div className="search-name">{u.display_name}</div>
                    <div className="search-username">@{u.username}</div>
                  </div>
                  <button className="start-chat-btn">Написать</button>
                </div>
              ))}
            </div>
          )}
          {searchQ && searchResults.length === 0 && (
            <div className="search-empty">Никого не найдено 😔</div>
          )}
        </div>
      )}

      {/* Chat list */}
      <div className="chat-list">
        {chats.length === 0 && !showNewChat && (
          <div className="empty-chats">
            <p>Пока нет чатов</p>
            <p className="hint">Нажми 👤 чтобы найти друга</p>
          </div>
        )}
        {chats.map(chat => {
          const isDirect = chat.type === 'direct';
          const mate = chat.mate;
          const name = isDirect ? mate?.display_name : chat.name;
          const status = mate?.status || '';
          const lastSeen = mate?.last_seen || '';

          return (
            <div
              key={chat.id}
              className={`chat-item ${activeChat === chat.id ? 'active' : ''}`}
              onClick={() => setActiveChat(chat.id)}
            >
              <div className="chat-avatar-wrap">
                {isDirect && mate?.avatar ? (
                  <img src={mate.avatar} alt="" className="chat-avatar-img" />
                ) : (
                  <div className={`chat-avatar ${isDirect ? status : 'group'}`}>
                    {isDirect ? mate?.display_name?.[0]?.toUpperCase() : '👥'}
                  </div>
                )}
                {isDirect && status === 'online' && <div className="online-dot"></div>}
              </div>
              <div className="chat-info">
                <div className="chat-top">
                  <span className="chat-name">{name}</span>
                  <span className="chat-time">{formatTime(chat.last_message_time)}</span>
                </div>
                <div className="chat-bottom">
                  <span className="chat-last">{chat.last_message || 'Нет сообщений'}</span>
                  {isDirect && status === 'online' && <span className="online-badge">онлайн</span>}
                  {isDirect && status !== 'online' && lastSeen && <span className="last-seen">был(а) {formatLastSeen(lastSeen)}</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Group modal */}
      {showGroupModal && <GroupModal groupName={groupName} setGroupName={setGroupName} groupMembers={groupMembers} setGroupMembers={setGroupMembers} handleCreateGroup={handleCreateGroup} onClose={() => setShowGroupModal(false)} />}
    </div>
  );
}

function GroupModal({ groupName, setGroupName, groupMembers, setGroupMembers, handleCreateGroup, onClose }) {
  const [searchQ, setSearchQ] = useState('');
  const { searchResults, searchUsers } = useStore();

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Создать группу</h3>
        <input
          type="text"
          placeholder="Название группы"
          value={groupName}
          onChange={e => setGroupName(e.target.value)}
          className="modal-input"
        />
        <input
          type="text"
          placeholder="Поиск участников..."
          value={searchQ}
          onChange={e => { setSearchQ(e.target.value); searchUsers(e.target.value); }}
          className="modal-input"
        />
        <div className="modal-users">
          {searchResults.filter(u => !groupMembers.includes(u.id)).map(u => (
            <div key={u.id} className="modal-user" onClick={() => setGroupMembers([...groupMembers, u.id])}>
              <div className="status-dot online"></div>
              <span>{u.display_name}</span>
              <span className="add-hint">+ добавить</span>
            </div>
          ))}
        </div>
        {groupMembers.length > 0 && (
          <div className="selected-members">
            Выбрано: {groupMembers.length}
          </div>
        )}
        <div className="modal-buttons">
          <button className="modal-btn cancel" onClick={onClose}>Отмена</button>
          <button className="modal-btn create" onClick={handleCreateGroup}>Создать</button>
        </div>
      </div>
    </div>
  );
}
